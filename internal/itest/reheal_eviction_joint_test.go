package itest

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/mellifera/mellifera/internal/stream"
)

// The repro's two failure messages, verbatim from the incident record —
// concatenated literals so the wrapped source renders them byte-identically.
const (
	rehEvictedDirFmt = "superseded build directory %s was evicted by the re-heal (stat: %v) — " +
		"a live session holding its URLs 404s like the 20:52 incident"
	rehNoServeFmt = "superseded build %s no longer serves through the media surface: status %d, want 200 — " +
		"the active session's next loader request fails (body=%s)"
)

// TestRehealEvictionRetainsSupersededBuild is the RED reproduction for
// fix-reheal-eviction face (b), HEAL-DURING-PLAY (prod 2026-11-01 20:52): the
// lazy re-heal (legacyRepackOnPlay) publishes a fresh build for an item that
// already had a COMPLETE pack, and the AfterPackPersist wiring
// (cmd/mellifera/main.go: scanDeps.Enrich.AfterPackPersist =
// mediaSvc.EvictSuperseded) deletes the superseded nonce directory in the
// same breath — while a live session holds URLs into it. The active player's
// next loader request under the old nonce 404s into a fatal
// (networkError/audioTrackLoadError), and it would die anyway on buffer
// advance past the deleted segments.
//
// The contract under test: after a successful repack past a complete build,
// the superseded nonce directory remains ON DISK and still SERVES through
// the real media surface — eviction of a build a session may be reading is
// a retention decision, not a publish side effect.
//
// The eviction path under test is the REAL one the binary installs: pmaQueue
// wires deps.AfterPackPersist = media.EvictSuperseded — the exact function
// value cmd/mellifera/main.go assigns — behind the real enrich lane seam
// (internal/enrich/streams.go workStreams), driven through the real router's
// play closure (the mirrored legacy-repack decision arms the re-heal).
func TestRehealEvictionRetainsSupersededBuild(t *testing.T) {
	w := pbNewWorld(t) // skips without ffmpeg/ffprobe on PATH (harness precedent)

	// The production wiring in miniature: the real pack seam plus the REAL
	// EvictSuperseded publish replacement (pmaQueue's AfterPackPersist line).
	q := pmaQueue(t, w, w.media, nil)
	enqueue := w.pbEnqueue(q)
	baseURL := pmaServer(t, w, enqueue)

	// One item, already published at a LEGACY v1 build: hand-laid flat-root
	// build on disk, seeded namespace state=complete nonce=<old> master=true
	// (the stale-under-current-rule write the lazy re-heal gate arms on).
	const itemID = "reh_b"
	const oldNonce = "rehlegacy1"
	fixtures := t.TempDir()
	mkv := filepath.Join(fixtures, "Reheal Movie.mkv")
	pbMakeMKV(t, mkv, 5*time.Second, false)
	libID := pbCreateLibrary(t, w, "serial", t.TempDir(), "QA Reheal Eviction")
	pmaHandLegacyBuild(t, w.media.Root, itemID, oldNonce)
	pmaSeedItem(t, w, libID, itemID, "Reheal Movie.mkv", mkv, pmaH264Facts(), "",
		map[string]any{
			"state":    stream.StateComplete,
			"playlist": pmaMediaPrefix + itemID + "/" + oldNonce + "/index.m3u8",
			"nonce":    oldNonce,
			"master":   true, // the LEGACY v1 write — stale under the current rule
		})

	// Pre-condition: the live session's URL into the OLD build works — this
	// is exactly what the mid-playback TV holds when the re-heal lands.
	oldToken, _ := w.media.Issue(itemID, time.Now())
	oldURL := pmaMediaPrefix + itemID + "/" + oldNonce + "/index.m3u8"
	status, body, _ := pbDo(t, w.client, http.MethodGet, w.baseURL+oldURL+"?token="+oldToken, "", nil)
	if status != http.StatusOK {
		t.Fatalf("pre-condition: old build %s serves %d before the repack, want 200 (body=%s)", oldNonce, status, body)
	}

	// The play that arms the lazy re-heal: 202 queued — the legacy-repack
	// decision answered the play and enqueued exactly one repack.
	status, body, _ = pbDo(t, w.client, http.MethodPost,
		baseURL+"/api/v1/items/"+itemID+"/play", w.token, map[string]any{})
	if status != http.StatusAccepted {
		t.Fatalf("stale-build play: status %d, want 202 (body=%s)", status, body)
	}
	var pr struct {
		Queued bool `json:"queued"`
	}
	if err := json.Unmarshal(body, &pr); err != nil || !pr.Queued {
		t.Fatalf("stale-build play body = %s (decode %v), want queued:true", body, err)
	}

	// The repack lands: a fresh nonce at the current rule version.
	fresh := pmaAwaitFreshNonce(t, w.st, itemID, oldNonce, 60*time.Second)
	pbAwaitIdle(t, q, 30*time.Second)
	freshNonce, _ := fresh["nonce"].(string)
	if freshNonce == "" || freshNonce == oldNonce {
		t.Fatalf("repack did not publish a fresh nonce: %v", fresh)
	}

	// Sanity (never pass vacuously): the descriptor answers the fresh build
	// and the fresh build serves through the real surface.
	d := pmaDescriptor(t, baseURL, w, itemID)
	if !strings.HasPrefix(d.PlayURL, pmaMediaPrefix+itemID+"/"+freshNonce+"/index.m3u8?token=") {
		t.Fatalf("descriptor after the repack = %q, want the fresh nonce %s playlist", d.PlayURL, freshNonce)
	}
	freshToken, _ := w.media.Issue(itemID, time.Now())
	pmaGetMedia(t, w, d.PlayURL, freshToken)

	// THE DEFECT (face b): the superseded build must survive the repack. The
	// moment workStreams persists the success it fires AfterPackPersist and
	// EvictSuperseded RemoveAll's every non-current nonce directory — no
	// session, age, or grace awareness — so the old build (and every URL a
	// live session still holds into it) dies with the publish.
	if _, err := os.Stat(filepath.Join(w.media.Root, itemID, oldNonce)); err != nil {
		t.Fatalf(rehEvictedDirFmt, oldNonce, err)
	}
	status, body, _ = pbDo(t, w.client, http.MethodGet, w.baseURL+oldURL+"?token="+oldToken, "", nil)
	if status != http.StatusOK {
		t.Fatalf(rehNoServeFmt, oldNonce, status, body)
	}
}
