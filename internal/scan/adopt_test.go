// SPDX-License-Identifier: Apache-2.0

package scan

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"path/filepath"
	"slices"
	"testing"
	"time"

	"github.com/mellifera/mellifera/internal/access"
	"github.com/mellifera/mellifera/internal/store"
)

// setupAdoptStore opens a fresh store and one library — adoption needs no
// disk truth (unlike the sweeps): its candidates are store rows and its
// identity reads are document-only.
func setupAdoptStore(t *testing.T) (*store.Store, int64) {
	t.Helper()
	ctx := context.Background()
	s, err := store.Open(ctx, filepath.Join(t.TempDir(), "adopt.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })
	libID, err := s.CreateLibrary(ctx, "tv", "/media/adopt", "TV Series")
	if err != nil {
		t.Fatalf("CreateLibrary: %v", err)
	}
	return s, libID
}

// episodeDoc builds a served-identity document: the _view title floor (the
// film shape's title leg — episode pairs decide on the series bridge instead)
// plus, when season is non-nil, the tv-parser episode namespace EpisodeFacts
// reads and the parsed series anchor the bridge resolves through.
func episodeDoc(t *testing.T, title, seriesPath string, season, episode *int64) json.RawMessage {
	t.Helper()
	doc := map[string]any{
		"_view": map[string]any{"title": map[string]any{"value": title}},
	}
	if season != nil {
		doc["sources"] = map[string]any{
			"tv-parser": map[string]any{"season": *season, "episode": *episode},
		}
		doc["parsed"] = map[string]any{"series_relative_path": seriesPath}
	}
	b, err := json.Marshal(doc)
	if err != nil {
		t.Fatalf("marshal adopt doc: %v", err)
	}
	return json.RawMessage(b)
}

// seedAdoptSeries persists one series row whose doc carries the
// parser-composed title the identity bridge reads
// (sources["serial-parser"].title — SeriesName's one parser leg). An empty
// parserTitle seeds a doc WITHOUT the parser namespace — the empty-floor
// shape. Status is seeded as given: the dead side's series row is itself
// tombstoned, and the bridge reads it through status-unfiltered
// GetSeriesByPath.
func seedAdoptSeries(t *testing.T, ctx context.Context, s *store.Store, libID int64, path, status, parserTitle string) {
	t.Helper()
	doc := map[string]any{}
	if parserTitle != "" {
		doc["sources"] = map[string]any{
			"serial-parser": map[string]any{"title": parserTitle},
		}
	}
	b, err := json.Marshal(doc)
	if err != nil {
		t.Fatalf("marshal adopt series doc: %v", err)
	}
	if err := s.PutSeries(ctx, store.Series{
		ModuleID:      "tv",
		LibraryID:     libID,
		RelativePath:  path,
		Document:      b,
		SchemaVersion: 1,
		Status:        status,
	}); err != nil {
		t.Fatalf("seed series %q: %v", path, err)
	}
}

// seedAdoptItem persists one hand-built item row (prior state seeded directly,
// the sweep-test convention) and returns its id.
func seedAdoptItem(
	t *testing.T, ctx context.Context, s *store.Store,
	libID int64, fileID, status string, doc json.RawMessage,
) string {
	t.Helper()
	it := store.Item{
		ID:            itemID(libID, fileID),
		ModuleID:      "tv",
		LibraryID:     libID,
		FileID:        fileID,
		RelativePath:  fileID,
		MediaType:     "tv",
		Document:      doc,
		SchemaVersion: 1,
		Status:        status,
	}
	if err := s.PutItem(ctx, it); err != nil {
		t.Fatalf("seed item %q: %v", fileID, err)
	}
	return it.ID
}

// seedAdoptProgress writes one progress row through the real write path
// (CHECK-guarded, the store adopt tests' convention).
func seedAdoptProgress(t *testing.T, ctx context.Context, s *store.Store, itemID string, pos int64, v access.Viewer) {
	t.Helper()
	if _, err := s.PutProgress(ctx, itemID, pos, v); err != nil {
		t.Fatalf("PutProgress %s: %v", itemID, err)
	}
}

// seedAdoptWatched writes one ledger row through the real write path.
func seedAdoptWatched(
	t *testing.T, ctx context.Context, s *store.Store, itemID string, libID int64, seriesPath string,
) {
	t.Helper()
	if err := s.InsertWatched(ctx, itemID, libID, seriesPath, time.Now(), access.System()); err != nil {
		t.Fatalf("InsertWatched %s: %v", itemID, err)
	}
}

// wantAdoptProgress asserts one viewer's progress slot on itemID holds want.
func wantAdoptProgress(t *testing.T, s *store.Store, itemID string, v access.Viewer, want int64) {
	t.Helper()
	p, err := s.GetProgress(context.Background(), itemID, v)
	if err != nil {
		t.Fatalf("GetProgress(%s): %v", itemID, err)
	}
	if p.PositionSeconds != want {
		t.Fatalf("progress on %s = %d, want %d", itemID, p.PositionSeconds, want)
	}
}

// wantNoAdoptProgress asserts itemID carries no progress row for v (a live
// item with no row — the read joins non-deleted, so this only reads live).
func wantNoAdoptProgress(t *testing.T, s *store.Store, itemID string, v access.Viewer) {
	t.Helper()
	if _, err := s.GetProgress(context.Background(), itemID, v); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("progress on %s: err = %v, want no rows", itemID, err)
	}
}

// wantAdoptWatched asserts the raw ledger keys present and NOT absent (the
// raw ListWatched read — the only ledger read that sees deleted rows).
func wantAdoptWatched(t *testing.T, s *store.Store, present, absent string) {
	t.Helper()
	watched, err := s.ListWatched(context.Background(), access.System())
	if err != nil {
		t.Fatalf("ListWatched: %v", err)
	}
	if !slices.Contains(watched, present) || slices.Contains(watched, absent) {
		t.Fatalf("watched slots %v: want %s keyed, %s not", watched, present, absent)
	}
}

// TestAdoptStrandedMovesToIdentityMatch covers the amended D4 carry: a
// tombstoned sibling whose served identity matches the live item's — episode
// pairs through the series bridge (equal, non-empty parser-composed series
// titles) plus equal (season, episode) legs; film pairs on equal non-empty
// item title floors — has its stranded progress and ledger rows re-keyed
// onto the live item within the call, while a non-matching tombstone is
// untouched.
func TestAdoptStrandedMovesToIdentityMatch(t *testing.T) {
	ctx := context.Background()
	season, episode := int64(1), int64(3)

	t.Run("episode identity moves progress and ledger per viewer", func(t *testing.T) {
		s, libID := setupAdoptStore(t)
		seedAdoptSeries(t, ctx, s, libID, "series/jojo", "ready", "JoJo's Bizarre Adventure")
		live := seedAdoptItem(t, ctx, s, libID, "live.mkv", "ready",
			episodeDoc(t, "JoJo E03", "series/jojo", &season, &episode))
		dead := seedAdoptItem(t, ctx, s, libID, "dead.mkv", "deleted",
			episodeDoc(t, "JoJo E03", "series/jojo", &season, &episode))
		seedAdoptProgress(t, ctx, s, dead, 600, access.System())
		user5 := access.User(5, []int64{libID}, nil)
		seedAdoptProgress(t, ctx, s, dead, 300, user5)
		seedAdoptWatched(t, ctx, s, dead, libID, "series/old")

		if err := AdoptStranded(ctx, s, live); err != nil {
			t.Fatalf("AdoptStranded: %v", err)
		}
		wantAdoptProgress(t, s, live, access.System(), 600)
		wantAdoptProgress(t, s, live, user5, 300)
		wantAdoptWatched(t, s, live, dead)
	})

	t.Run("films match title-only (absent legs match absent legs)", func(t *testing.T) {
		s, libID := setupAdoptStore(t)
		live := seedAdoptItem(t, ctx, s, libID, "film.mkv", "ready",
			episodeDoc(t, "Some Film", "", nil, nil))
		dead := seedAdoptItem(t, ctx, s, libID, "old-film.mkv", "deleted",
			episodeDoc(t, "Some Film", "", nil, nil))
		seedAdoptProgress(t, ctx, s, dead, 1200, access.System())

		if err := AdoptStranded(ctx, s, live); err != nil {
			t.Fatalf("AdoptStranded: %v", err)
		}
		wantAdoptProgress(t, s, live, access.System(), 1200)
	})

	t.Run("a non-matching tombstone is untouched", func(t *testing.T) {
		s, libID := setupAdoptStore(t)
		seedAdoptSeries(t, ctx, s, libID, "series/jojo", "ready", "JoJo's Bizarre Adventure")
		seedAdoptSeries(t, ctx, s, libID, "series/other", "deleted", "Other Show")
		live := seedAdoptItem(t, ctx, s, libID, "live.mkv", "ready",
			episodeDoc(t, "JoJo E03", "series/jojo", &season, &episode))
		other := seedAdoptItem(t, ctx, s, libID, "other.mkv", "deleted",
			episodeDoc(t, "Other Show E03", "series/other", &season, &episode))
		seedAdoptProgress(t, ctx, s, other, 60, access.System())
		seedAdoptWatched(t, ctx, s, other, libID, "series/other")

		if err := AdoptStranded(ctx, s, live); err != nil {
			t.Fatalf("AdoptStranded: %v", err)
		}
		wantNoAdoptProgress(t, s, live, access.System())
		wantAdoptWatched(t, s, other, live)
	})
}

// TestAdoptStrandedNoMatchIsNoOp covers the no-op side of D4, film shape: no
// candidate's identity matches (unequal non-empty title floors), so nothing
// fires — the live item gains no rows and the dead id's stranded stock stays
// exactly where it was (a visible no-op, never a fuzzy move).
func TestAdoptStrandedNoMatchIsNoOp(t *testing.T) {
	ctx := context.Background()
	s, libID := setupAdoptStore(t)
	live := seedAdoptItem(t, ctx, s, libID, "live.mkv", "ready",
		episodeDoc(t, "Fresh File", "", nil, nil))
	dead := seedAdoptItem(t, ctx, s, libID, "dead.mkv", "deleted",
		episodeDoc(t, "Unrelated Title", "series/x", nil, nil))
	seedAdoptProgress(t, ctx, s, dead, 480, access.System())
	seedAdoptWatched(t, ctx, s, dead, libID, "series/x")

	if err := AdoptStranded(ctx, s, live); err != nil {
		t.Fatalf("AdoptStranded: %v", err)
	}
	wantNoAdoptProgress(t, s, live, access.System())
	wantAdoptWatched(t, s, dead, live)
}

// TestAdoptStrandedLiveRowWins covers the D5 target-wins law through the
// adoption hook: where the live item already holds a viewer's progress row —
// any row — the dead id's row for that viewer is suppressed (deleted, never
// moved) while the viewer's still-absent slots carry.
func TestAdoptStrandedLiveRowWins(t *testing.T) {
	ctx := context.Background()
	season, episode := int64(2), int64(5)
	s, libID := setupAdoptStore(t)
	seedAdoptSeries(t, ctx, s, libID, "series/show", "ready", "Show")
	live := seedAdoptItem(t, ctx, s, libID, "live.mkv", "ready",
		episodeDoc(t, "Show E05", "series/show", &season, &episode))
	dead := seedAdoptItem(t, ctx, s, libID, "dead.mkv", "deleted",
		episodeDoc(t, "Show E05", "series/show", &season, &episode))
	seedAdoptProgress(t, ctx, s, dead, 42, access.System())
	seedAdoptProgress(t, ctx, s, live, 999, access.System())
	user5 := access.User(5, []int64{libID}, nil)
	seedAdoptProgress(t, ctx, s, dead, 300, user5)
	seedAdoptWatched(t, ctx, s, dead, libID, "series/show")

	if err := AdoptStranded(ctx, s, live); err != nil {
		t.Fatalf("AdoptStranded: %v", err)
	}
	wantAdoptProgress(t, s, live, access.System(), 999) // the live row wins its slot
	wantAdoptProgress(t, s, live, user5, 300)           // the absent slot still carries
	wantAdoptWatched(t, s, live, dead)
}

// TestAdoptStrandedMissingLiveItemErrors pins the one error the hook can
// return (the live-item read failing): the wiring logs-and-skips it, so the
// contract is the error surfaces — never a panic, never an adoption from a
// phantom identity.
func TestAdoptStrandedMissingLiveItemErrors(t *testing.T) {
	s, _ := setupAdoptStore(t)
	if err := AdoptStranded(context.Background(), s, "itm_missing"); err == nil {
		t.Fatal("AdoptStranded on a missing live item: err = nil, want an error (log-and-skip upstream)")
	}
}

// TestAdoptStrandedSeriesBridgeCarriesAcrossRename covers the bridge's
// rename-shaped carry: the dead and live items anchor DIFFERENT series paths
// (the directory was renamed) whose series rows carry the SAME
// parser-composed title — rename-stable by the serial-parser grammar — so
// the bridge matches and the stranded stock re-keys; the dead side's series
// row is itself tombstoned and must still read (GetSeriesByPath is
// status-unfiltered). The series path is never compared.
func TestAdoptStrandedSeriesBridgeCarriesAcrossRename(t *testing.T) {
	ctx := context.Background()
	season, episode := int64(1), int64(3)
	s, libID := setupAdoptStore(t)
	seedAdoptSeries(t, ctx, s, libID, "series/jojo-old", "deleted", "JoJo's Bizarre Adventure")
	seedAdoptSeries(t, ctx, s, libID, "series/jojo-new", "ready", "JoJo's Bizarre Adventure")
	live := seedAdoptItem(t, ctx, s, libID, "jojo-new/e03.mkv", "ready",
		episodeDoc(t, "JoJo E03", "series/jojo-new", &season, &episode))
	dead := seedAdoptItem(t, ctx, s, libID, "jojo-old/e03.mkv", "deleted",
		episodeDoc(t, "JoJo E03", "series/jojo-old", &season, &episode))
	seedAdoptProgress(t, ctx, s, dead, 600, access.System())
	seedAdoptWatched(t, ctx, s, dead, libID, "series/jojo-old")

	if err := AdoptStranded(ctx, s, live); err != nil {
		t.Fatalf("AdoptStranded: %v", err)
	}
	wantAdoptProgress(t, s, live, access.System(), 600)
	wantAdoptWatched(t, s, live, dead)
}

// TestAdoptStrandedCrossSeriesNeverCarries covers the cross-series no-carry
// the bridge exists for (2.4's falsified-assumption evidence): two series'
// episodes with EQUAL (season, episode) legs and — production reality —
// EMPTY item title floors on both sides. Only the differing parser-composed
// series titles discriminate: nothing moves and the dead id's stranded stock
// is retained in full.
func TestAdoptStrandedCrossSeriesNeverCarries(t *testing.T) {
	ctx := context.Background()
	season, episode := int64(1), int64(1)
	s, libID := setupAdoptStore(t)
	seedAdoptSeries(t, ctx, s, libID, "series/jojo", "deleted", "JoJo's Bizarre Adventure")
	seedAdoptSeries(t, ctx, s, libID, "series/starik", "ready", "The Old Man")
	live := seedAdoptItem(t, ctx, s, libID, "starik/e01.mkv", "ready",
		episodeDoc(t, "", "series/starik", &season, &episode))
	dead := seedAdoptItem(t, ctx, s, libID, "jojo/e01.mkv", "deleted",
		episodeDoc(t, "", "series/jojo", &season, &episode))
	seedAdoptProgress(t, ctx, s, dead, 600, access.System())
	seedAdoptWatched(t, ctx, s, dead, libID, "series/jojo")

	if err := AdoptStranded(ctx, s, live); err != nil {
		t.Fatalf("AdoptStranded: %v", err)
	}
	wantNoAdoptProgress(t, s, live, access.System())
	wantAdoptWatched(t, s, dead, live)
}

// TestAdoptStrandedEmptyFloorsNeverMatch covers the anti-degenerate law on
// BOTH shapes: an empty identity floor on either side never matches — the
// film pair whose title floors are both "" ("" == "" is legs-less identity,
// never a match) and the episode pair whose series docs both lack the
// parser-composed title (no parser title, no bridge). The stranded stock
// stays keyed to the dead id — join-dropped, harmless.
func TestAdoptStrandedEmptyFloorsNeverMatch(t *testing.T) {
	ctx := context.Background()
	season, episode := int64(1), int64(1)

	t.Run("film pair with both title floors empty", func(t *testing.T) {
		s, libID := setupAdoptStore(t)
		live := seedAdoptItem(t, ctx, s, libID, "film.mkv", "ready",
			episodeDoc(t, "", "", nil, nil))
		dead := seedAdoptItem(t, ctx, s, libID, "old-film.mkv", "deleted",
			episodeDoc(t, "", "", nil, nil))
		seedAdoptProgress(t, ctx, s, dead, 1200, access.System())
		seedAdoptWatched(t, ctx, s, dead, libID, "")

		if err := AdoptStranded(ctx, s, live); err != nil {
			t.Fatalf("AdoptStranded: %v", err)
		}
		wantNoAdoptProgress(t, s, live, access.System())
		wantAdoptWatched(t, s, dead, live)
	})

	t.Run("episode pair with both series parser titles empty", func(t *testing.T) {
		s, libID := setupAdoptStore(t)
		seedAdoptSeries(t, ctx, s, libID, "series/one", "ready", "")
		seedAdoptSeries(t, ctx, s, libID, "series/two", "deleted", "")
		live := seedAdoptItem(t, ctx, s, libID, "one/e01.mkv", "ready",
			episodeDoc(t, "E01", "series/one", &season, &episode))
		dead := seedAdoptItem(t, ctx, s, libID, "two/e01.mkv", "deleted",
			episodeDoc(t, "E01", "series/two", &season, &episode))
		seedAdoptProgress(t, ctx, s, dead, 300, access.System())
		seedAdoptWatched(t, ctx, s, dead, libID, "series/two")

		if err := AdoptStranded(ctx, s, live); err != nil {
			t.Fatalf("AdoptStranded: %v", err)
		}
		wantNoAdoptProgress(t, s, live, access.System())
		wantAdoptWatched(t, s, dead, live)
	})
}
