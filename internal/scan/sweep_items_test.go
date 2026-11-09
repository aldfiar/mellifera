// SPDX-License-Identifier: Apache-2.0

package scan

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/mellifera/mellifera/internal/access"
	"github.com/mellifera/mellifera/internal/module"
	"github.com/mellifera/mellifera/internal/store"
	scannerv1 "github.com/mellifera/mellifera/proto/mellifera/scanner/v1"
)

// setupItemSweepStore mirrors setupStore but roots the library at a fresh temp
// directory, so the item sweep's os.Stat truth is controllable per test: the
// test creates and deletes real files under root and every stamped
// absolute_path resolves inside it.
func setupItemSweepStore(t *testing.T) (*store.Store, *module.Registry, int64, string) {
	t.Helper()
	ctx := context.Background()
	root := t.TempDir()
	s, err := store.Open(ctx, filepath.Join(t.TempDir(), "scan.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })
	r, err := module.Open(ctx, s)
	if err != nil {
		t.Fatalf("module.Open: %v", err)
	}
	libID, err := s.CreateLibrary(ctx, "tv", root, "TV Series")
	if err != nil {
		t.Fatalf("CreateLibrary: %v", err)
	}
	return s, r, libID, root
}

// sweepItemFile creates a real file under the library root (the disk truth the
// sweep stats).
func sweepItemFile(t *testing.T, root, rel string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(filepath.Join(root, rel)), 0o755); err != nil {
		t.Fatalf("mkdir for %q: %v", rel, err)
	}
	if err := os.WriteFile(filepath.Join(root, rel), []byte("payload"), 0o644); err != nil {
		t.Fatalf("write %q: %v", rel, err)
	}
}

// stampedSweepDoc builds a §3.1-shaped document carrying the parsed.absolute_path
// stamp the sweep reads, plus any extra (derived) namespaces.
func stampedSweepDoc(t *testing.T, root, rel string, extra map[string]any) json.RawMessage {
	t.Helper()
	doc := map[string]any{
		"parsed": map[string]any{
			"title":         "Ep",
			"absolute_path": filepath.Join(root, rel),
		},
	}
	for k, v := range extra {
		doc[k] = v
	}
	b, err := json.Marshal(doc)
	if err != nil {
		t.Fatalf("marshal sweep doc: %v", err)
	}
	return json.RawMessage(b)
}

// seedSweepItem persists one hand-built item row (the sweep tests seed prior
// state directly — the sweep judges whatever the store holds).
func seedSweepItem(
	t *testing.T, ctx context.Context, s *store.Store,
	libID int64, root, rel, fileID, status string, doc json.RawMessage,
) store.Item {
	t.Helper()
	it := store.Item{
		ID:            itemID(libID, fileID),
		ModuleID:      "tv",
		LibraryID:     libID,
		FileID:        fileID,
		RelativePath:  rel,
		MediaType:     "tv",
		Document:      doc,
		SchemaVersion: 1,
		Status:        status,
	}
	if err := s.PutItem(ctx, it); err != nil {
		t.Fatalf("seed item %q: %v", rel, err)
	}
	return it
}

// sweepItemRow fetches one item row by file id (test helper).
func sweepItemRow(t *testing.T, s *store.Store, libID int64, fileID string) store.Item {
	t.Helper()
	it, err := s.GetItem(context.Background(), itemID(libID, fileID), access.System())
	if err != nil {
		t.Fatalf("GetItem(%q): %v", fileID, err)
	}
	return it
}

// epSpec is one emitted file for the sweep tests' fake scanner.
type epSpec struct {
	fileID     string
	rel        string
	probe      []byte
	parsedJSON string
}

// epScanner builds the fake emission for item files, opting in to a confirmed
// clean end (D4) when endClean — the sweep and the heal are both clean-pass
// behaviors.
func epScanner(endClean bool, specs ...epSpec) *fakeScanner {
	files := make([]*scannerv1.DiscoveredFile, 0, len(specs))
	identify := make(map[string]*scannerv1.IdentifyResult, len(specs))
	for _, sp := range specs {
		files = append(files, mkFile(sp.fileID, sp.rel, sp.probe, nil))
		identify[sp.fileID] = mkIdentified(sp.fileID, sp.parsedJSON)
	}
	return &fakeScanner{files: files, identify: identify, endClean: endClean}
}

// runSweepScan runs one scan pass with the given fake over the sweep library.
func runSweepScan(t *testing.T, s *store.Store, r *module.Registry, libID int64, sc *fakeScanner) Result {
	t.Helper()
	rr := &recordingResolver{scanner: sc}
	res, err := runScan(context.Background(), s, r, rr.resolve, passthroughEnricher(), nil, libID)
	if err != nil {
		t.Fatalf("runScan: %v", err)
	}
	return res
}

// epParsed is the fixed parsed identity the self-heal test rescans against:
// byte-identical parsed across passes unless a leg deliberately drifts it.
const epParsed = `{"title":"Ep"}`

// TestItemSweepTombsVanishedFiles covers tombstone-lifecycle 2.2 / D1: on a
// CONFIRMED clean drain, the item whose source file vanished tombstones
// exactly — status "deleted", document bytes untouched, dependent rows
// preserved — while the item whose file is present is silently untouched.
func TestItemSweepTombsVanishedFiles(t *testing.T) {
	s, r, libID, root := setupItemSweepStore(t)
	ctx := context.Background()
	sweepItemFile(t, root, "Present.mkv")
	sweepItemFile(t, root, "Gone.mkv")

	// Scan #1: both files exist — two rows land pending with stamped docs.
	res := runSweepScan(t, s, r, libID, epScanner(true,
		epSpec{fileID: "a", rel: "Present.mkv", parsedJSON: epParsed},
		epSpec{fileID: "b", rel: "Gone.mkv", parsedJSON: epParsed},
	))
	if res.Persisted != 2 {
		t.Fatalf("scan 1 Persisted = %d, want 2", res.Persisted)
	}

	// Dependent state on the soon-to-vanish item: a playback position and a
	// watched-ledger row — the tombstone is soft, both must survive it.
	goneID := itemID(libID, "b")
	if _, err := s.PutProgress(ctx, goneID, 88, access.System()); err != nil {
		t.Fatalf("PutProgress: %v", err)
	}
	if err := s.InsertWatched(ctx, goneID, libID, "", time.Now().UTC(), access.System()); err != nil {
		t.Fatalf("InsertWatched: %v", err)
	}

	priorGone := sweepItemRow(t, s, libID, "b")
	priorPresent := sweepItemRow(t, s, libID, "a")
	assertVanishTombstone(t, s, r, libID, root, goneID, priorGone, priorPresent)
}

// assertVanishTombstone runs the post-vanish pass and asserts the tombstone
// law end to end: the vanished item is status "deleted" with its document
// bytes untouched, the present item is silently untouched, and the
// watched-ledger row keyed to the vanished id survives the soft tombstone.
func assertVanishTombstone(
	t *testing.T, s *store.Store, r *module.Registry, libID int64,
	root, goneID string, priorGone, priorPresent store.Item,
) {
	t.Helper()
	ctx := context.Background()

	// The file vanishes; the next clean pass re-emits only the present file.
	if err := os.Remove(filepath.Join(root, "Gone.mkv")); err != nil {
		t.Fatalf("remove Gone.mkv: %v", err)
	}
	res := runSweepScan(t, s, r, libID, epScanner(true,
		epSpec{fileID: "a", rel: "Present.mkv", parsedJSON: epParsed},
	))
	if res.Persisted != 1 {
		t.Fatalf("scan 2 Persisted = %d, want 1", res.Persisted)
	}

	// Gone.mkv: tombstoned, document bytes untouched.
	gone := sweepItemRow(t, s, libID, "b")
	if gone.Status != "deleted" {
		t.Errorf("vanished item status = %q, want deleted (item sweep)", gone.Status)
	}
	if !bytes.Equal(priorGone.Document, gone.Document) {
		t.Errorf("tombstoned document changed:\n prior=%s\n after=%s",
			priorGone.Document, gone.Document)
	}

	// Present.mkv: silently untouched — status and document identical.
	present := sweepItemRow(t, s, libID, "a")
	if present.Status != priorPresent.Status {
		t.Errorf("present item status = %q, want %q (the sweep never touches a present file)",
			present.Status, priorPresent.Status)
	}
	if !bytes.Equal(priorPresent.Document, present.Document) {
		t.Errorf("present item document changed:\n prior=%s\n after=%s",
			priorPresent.Document, present.Document)
	}

	// The tombstone is soft: the watched-ledger row survives (the raw
	// ListWatchedSlots read sees deleted rows by design — adoption's candidate
	// store). The progress row likewise survives on disk; every JOINED read
	// hides it (shipped serve law), which is 3.2/2.3 territory, not the
	// sweep's.
	_, itemIDs, err := s.ListWatchedSlots(ctx)
	if err != nil {
		t.Fatalf("ListWatchedSlots: %v", err)
	}
	found := false
	for _, id := range itemIDs {
		if id == goneID {
			found = true
		}
	}
	if !found {
		t.Errorf("watched-ledger row for %q missing after tombstone — the tombstone must be soft", goneID)
	}
}

// TestItemSweepSkipsPresentFiles pins the sweep's silent-on-success law: every
// item whose stamped file is present keeps its status, document, and
// updated_at byte-identical, and the sweep emits no warnings.
func TestItemSweepSkipsPresentFiles(t *testing.T) {
	s, _, libID, root := setupItemSweepStore(t)
	ctx := context.Background()
	sweepItemFile(t, root, "One.mkv")
	sweepItemFile(t, root, "Two.mkv")

	seedSweepItem(t, ctx, s, libID, root, "One.mkv", "one", "ready",
		stampedSweepDoc(t, root, "One.mkv", nil))
	seedSweepItem(t, ctx, s, libID, root, "Two.mkv", "two", "pending",
		stampedSweepDoc(t, root, "Two.mkv", nil))
	// stored timestamps, not the seed struct
	priorOne := sweepItemRow(t, s, libID, "one")
	priorTwo := sweepItemRow(t, s, libID, "two")

	res := Result{}
	if err := sweepItems(ctx, s, libID, &res); err != nil {
		t.Fatalf("sweepItems: %v", err)
	}

	for _, tc := range []struct {
		rel   string
		prior store.Item
	}{
		{"One.mkv", priorOne},
		{"Two.mkv", priorTwo},
	} {
		got := sweepItemRow(t, s, libID, tc.prior.FileID)
		if got.Status != tc.prior.Status {
			t.Errorf("%s status = %q, want %q (present file never tombstones)", tc.rel, got.Status, tc.prior.Status)
		}
		if !got.UpdatedAt.Equal(tc.prior.UpdatedAt) {
			t.Errorf("%s updated_at churned (%v -> %v) on a no-op sweep", tc.rel, tc.prior.UpdatedAt, got.UpdatedAt)
		}
		if !bytes.Equal(tc.prior.Document, got.Document) {
			t.Errorf("%s document changed on a no-op sweep", tc.rel)
		}
	}
	if len(res.Warnings) != 0 {
		t.Errorf("sweep warned on present files: %v (silent on success)", res.Warnings)
	}
}

// TestItemSweepSkipsAbsentStamp pins the stamp guard: an item whose document
// carries no readable parsed.absolute_path (stamp absent from parsed, or the
// document unparseable) skips with a warning and keeps its status — a missing
// stamp is an assembly anomaly, never evidence of vanishing.
func TestItemSweepSkipsAbsentStamp(t *testing.T) {
	s, _, libID, root := setupItemSweepStore(t)
	ctx := context.Background()
	sweepItemFile(t, root, "NoStamp.mkv")
	sweepItemFile(t, root, "Bare.mkv")

	// Parsed present, stamp absent: the assembly-anomaly shape.
	noStamp := seedSweepItem(t, ctx, s, libID, root, "NoStamp.mkv", "nst", "ready",
		marshalDoc(map[string]any{"parsed": map[string]any{"title": "NoStamp"}}))
	// No parsed object at all: the unparseable-document shape.
	bare := seedSweepItem(t, ctx, s, libID, root, "Bare.mkv", "bare", "pending",
		json.RawMessage(`{}`))

	res := Result{}
	if err := sweepItems(ctx, s, libID, &res); err != nil {
		t.Fatalf("sweepItems: %v", err)
	}

	if len(res.Warnings) < 2 {
		t.Errorf("sweep emitted %d warning(s), want >= 2 (one per stamp-less row): %v", len(res.Warnings), res.Warnings)
	}
	if got := sweepItemRow(t, s, libID, noStamp.FileID); got.Status != "ready" {
		t.Errorf("stamp-less item status = %q, want ready (untouched — a missing stamp never tombstones)", got.Status)
	}
	if got := sweepItemRow(t, s, libID, bare.FileID); got.Status != "pending" {
		t.Errorf("bare-document item status = %q, want pending (untouched)", got.Status)
	}
}

// TestTruncatedStreamSkipsItemSweep is the item analog of
// TestTruncatedStreamMustNotSweep: the item sweep runs in the SAME
// confirmed-clean-drain branch as the series sweep, so a stream that ends
// before completing sweeps neither — a vanished item whose row the partial
// pass never re-checked keeps its prior status, and the truncation warning
// records why.
func TestTruncatedStreamSkipsItemSweep(t *testing.T) {
	s, r, libID, root := setupItemSweepStore(t)
	sweepItemFile(t, root, "Present.mkv")
	sweepItemFile(t, root, "Gone.mkv")

	// Prior state: both items persisted by confirmed clean passes.
	runSweepScan(t, s, r, libID, epScanner(true,
		epSpec{fileID: "a", rel: "Present.mkv", parsedJSON: epParsed}))
	runSweepScan(t, s, r, libID, epScanner(true,
		epSpec{fileID: "b", rel: "Gone.mkv", parsedJSON: epParsed}))

	// The file vanishes; the next pass is TRUNCATED: emits the present file
	// only and closes its channel without the End(nil) confirmation (the fake's
	// default — the drain-visible shape of a mid-stream Recv error).
	if err := os.Remove(filepath.Join(root, "Gone.mkv")); err != nil {
		t.Fatalf("remove Gone.mkv: %v", err)
	}
	res := runSweepScan(t, s, r, libID, epScanner(false,
		epSpec{fileID: "a", rel: "Present.mkv", parsedJSON: epParsed}))
	truncated := false
	for _, w := range res.Warnings {
		if bytes.Contains([]byte(w), []byte("stream ended before completing")) {
			truncated = true
		}
	}
	if !truncated {
		t.Errorf("truncated pass recorded no truncation warning (warnings=%v)", res.Warnings)
	}

	// The vanished item keeps its prior status — a truncated stream is not
	// evidence of vanishing.
	gone := sweepItemRow(t, s, libID, "b")
	if gone.Status == "deleted" {
		t.Errorf("vanished item reached deleted on a TRUNCATED stream — " +
			"the item sweep ran outside the confirmed-clean branch")
	}
	if gone.Status != "pending" {
		t.Errorf("vanished item status = %q, want pending (untouched by the partial pass)", gone.Status)
	}
}

// healLeg is one re-observation leg of TestReobservedDeletedItemSelfHeals:
// the pass's probe/parsed seeds plus the expected outcome for the healed row.
type healLeg struct {
	name        string
	retombstone bool     // flip the row back to deleted before the pass
	probe       []byte   // the pass's ffprobe bytes
	parsedJSON  string   // the pass's parsed identity
	wantStatus  string   // the row's status after the pass
	wantPresent []string // derived namespaces the healed document must carry
	wantAbsent  []string // derived namespaces the heal must drop
}

// runHealLeg runs one re-observation leg and asserts its outcome on the
// healed row: the status plus which derived namespaces carry and drop.
func runHealLeg(t *testing.T, s *store.Store, r *module.Registry, libID int64, leg healLeg) {
	t.Helper()
	ctx := context.Background()
	if leg.retombstone {
		row := sweepItemRow(t, s, libID, "ep")
		row.Status = "deleted"
		if err := s.PutItem(ctx, row); err != nil {
			t.Fatalf("re-tombstone ep: %v", err)
		}
	}
	runSweepScan(t, s, r, libID, epScanner(true,
		epSpec{fileID: "ep", rel: "Ep.mkv", probe: leg.probe, parsedJSON: leg.parsedJSON}))
	healed := sweepItemRow(t, s, libID, "ep")
	if healed.Status != leg.wantStatus {
		t.Errorf("heal leg %q: status = %q, want %q", leg.name, healed.Status, leg.wantStatus)
	}
	// fresh decode per leg — Unmarshal into a non-nil map MERGES
	var doc map[string]any
	if err := json.Unmarshal(healed.Document, &doc); err != nil {
		t.Fatalf("decode healed document: %v", err)
	}
	for _, k := range leg.wantPresent {
		if _, ok := doc[k]; !ok {
			t.Errorf("heal leg %q: document lost derived namespace %q (carry)", leg.name, k)
		}
	}
	for _, k := range leg.wantAbsent {
		if _, ok := doc[k]; ok {
			t.Errorf("heal leg %q: document kept derived namespace %q (drop)", leg.name, k)
		}
	}
}

// TestReobservedDeletedItemSelfHeals covers tombstone-lifecycle 2.2 / D3 (the
// series self-heal's mirror): on a confirmed clean pass a "deleted" item whose
// re-observed parsed identity is unchanged heals to "ready" with its derived
// namespaces carried forward; under ffprobe-only drift it heals to "ready"
// with `streams` dropped per the tier-B carry contract; a changed parsed
// identity lands "stale" (baseChanged fires before the heal); and a "deleted"
// item the pass never re-observes keeps "deleted" with no updated_at churn.
// seedWrongfulTombstone builds the wrongful-tombstone shape the heal legs
// rescan against: the ghost row (tombstoned, its file gone, never re-observed
// by any pass below) plus "ep" — persisted pending by a confirmed clean pass
// with the given probe, then re-tombstoned with its derived namespaces
// (sources/_view/_provenance — what enrich stamps — plus a `streams`
// namespace, what packaging stamps) riding the document.
func seedWrongfulTombstone(t *testing.T, probeA []byte) (*store.Store, *module.Registry, int64, string, store.Item) {
	t.Helper()
	s, r, libID, root := setupItemSweepStore(t)
	ctx := context.Background()
	sweepItemFile(t, root, "Ep.mkv")

	// The ghost item: tombstoned, its file gone, never re-observed by any pass
	// below — the sweep's already-deleted skip leg.
	sweepItemFile(t, root, "Ghost.mkv")
	seedSweepItem(t, context.Background(), s, libID, root, "Ghost.mkv", "ghost", "deleted",
		stampedSweepDoc(t, root, "Ghost.mkv", nil))
	ghostBefore := sweepItemRow(t, s, libID, "ghost")
	if err := os.Remove(filepath.Join(root, "Ghost.mkv")); err != nil {
		t.Fatalf("remove Ghost.mkv: %v", err)
	}

	// Scan #1: the item lands pending with a stamped document.
	runSweepScan(t, s, r, libID, epScanner(true,
		epSpec{fileID: "ep", rel: "Ep.mkv", probe: probeA, parsedJSON: epParsed}))

	// Tombstone the enriched shape: derived namespaces (sources/_view/
	// _provenance — what enrich stamps) plus a `streams` namespace (what
	// packaging stamps) ride the document, status flipped to deleted — the
	// wrongful-tombstone shape.
	row := sweepItemRow(t, s, libID, "ep")
	var doc map[string]any
	if err := json.Unmarshal(row.Document, &doc); err != nil {
		t.Fatalf("decode row document: %v", err)
	}
	for k, v := range map[string]any{
		"sources":     map[string]any{"tv-parser": map[string]any{"title": "Ep"}},
		"_view":       map[string]any{"poster": "/posters/ep.jpg"},
		"streams":     map[string]any{"hls": "/packs/ep/master.m3u8"},
		"_provenance": map[string]any{"tv-parser": "tv-parser@1.0.0"},
	} {
		doc[k] = v
	}
	row.Document = marshalDoc(doc)
	row.Status = "deleted"
	if err := s.PutItem(ctx, row); err != nil {
		t.Fatalf("tombstone ep: %v", err)
	}
	return s, r, libID, root, ghostBefore
}

func TestReobservedDeletedItemSelfHeals(t *testing.T) {
	probeA := []byte(`{"format":{"duration":"100.0"}}`)
	probeB := []byte(`{"format":{"duration":"110.0"}}`)
	s, r, libID, _, ghostBefore := seedWrongfulTombstone(t, probeA)

	// The three heal legs, in order: unchanged identity (tier A carry),
	// ffprobe-only drift (tier B drops streams alone), changed parsed
	// identity (baseChanged fires before the heal — a stale row must not
	// mask a changed identity).
	for _, leg := range []healLeg{
		{
			name:        "leg1 unchanged identity carries every derived namespace",
			probe:       probeA,
			parsedJSON:  epParsed,
			wantStatus:  "ready",
			wantPresent: []string{"sources", "_view", "_provenance", "streams"},
		},
		{
			name:        "leg2 ffprobe-only drift drops streams alone",
			retombstone: true,
			probe:       probeB,
			parsedJSON:  epParsed,
			wantStatus:  "ready",
			wantPresent: []string{"sources"},
			wantAbsent:  []string{"streams"},
		},
		{
			name:       "leg3 changed parsed identity lands stale",
			probe:      probeB,
			parsedJSON: `{"title":"Ep REPACK"}`,
			wantStatus: "stale",
		},
	} {
		t.Run(leg.name, func(t *testing.T) {
			runHealLeg(t, s, r, libID, leg)
		})
	}

	// The ghost keeps "deleted" through every pass — never re-observed, never
	// touched, no updated_at churn.
	ghost := sweepItemRow(t, s, libID, "ghost")
	if ghost.Status != "deleted" {
		t.Errorf("un-re-observed deleted item status = %q, want deleted (sweep skip)", ghost.Status)
	}
	if !ghost.UpdatedAt.Equal(ghostBefore.UpdatedAt) {
		t.Errorf("un-re-observed deleted item updated_at churned (%v -> %v) — already-deleted rows must skip without a write",
			ghostBefore.UpdatedAt, ghost.UpdatedAt)
	}
}
