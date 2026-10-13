// SPDX-License-Identifier: Apache-2.0

package scan

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/mellifera/mellifera/internal/store"
)

// TestTruncatedStreamMustNotSweep is the reproduction test for the live
// failure of 2026-10-12 (collection page shows "151 items" but renders one
// series title). Production shape: the core's scanner client closes its Scan
// channel on ANY mid-stream Recv error — transport failure and normal
// end-of-stream are indistinguishable to the drain (pkg/sdk/scanner.go,
// scannerGRPC.Scan: "any mid-stream Recv error … closes the channel").
// runScan treats the early close as a clean drain and runs the post-drain
// sweep, which advances every series row the TRUNCATED pass never re-observed
// to "deleted" — 19 of 20 live series rows in the real incident — while the
// scan itself returns success. The next healthy scan does NOT heal the data:
// nextSeriesStatus preserves the prior status on an unchanged re-observe, so
// the wrongful tombstones survive indefinitely and the collection page
// renders one title.
//
// Box 1.6 / TestCancelledScanDoesNotSweep covers the ctx-cancellation escape;
// THIS test covers the uncovered escape: the stream ends early ON ITS OWN
// (no cancel, no error surfaced to the core). WANTED: a series row that the
// partial pass never observed keeps its ready status. ACTUAL while the bug is
// present: the sweep advances it to "deleted" and runScan returns nil.
func TestTruncatedStreamMustNotSweep(t *testing.T) {
	s, r, libID := setupSerialStore(t)
	ctx := context.Background()

	// Settled prior state: two ready series. "Show" is re-observed by the
	// truncated pass; "Ghost.Show" is on disk but its record never arrives
	// because the stream breaks first.
	scanSerial(t, s, r, libID, serialLibrary())
	show := seriesRow(t, s, libID, "Show")
	show.Status = "ready"
	if err := s.PutSeries(ctx, show); err != nil {
		t.Fatalf("promote Show: %v", err)
	}
	ghost := store.Series{
		ModuleID: "serial", LibraryID: libID, RelativePath: "Ghost.Show",
		Document:      json.RawMessage(`{"parsed":{"serial_record":true},"ffprobe":{}}`),
		SchemaVersion: 1, Status: "ready",
	}
	if err := s.PutSeries(ctx, ghost); err != nil {
		t.Fatalf("seed Ghost.Show: %v", err)
	}

	// The truncated pass: the fake emits Show's files and then closes its
	// channel on its own (the fake's normal end-of-canned-files close — the
	// exact drain-visible shape of a mid-stream Recv error: channel closed,
	// no ctx cancellation, no error). Ghost.Show's emission never happens.
	rr := &recordingResolver{scanner: serialLibrary()}
	res, err := runScan(context.Background(), s, r, rr.resolve, passthroughEnricher(), nil, libID)
	if err != nil {
		t.Fatalf("runScan: %v", err) // the scan reports success — matching production
	}
	if res.Persisted != 3 {
		t.Fatalf("partial pass persisted %d files, want 3 (Show record + 2 episodes)", res.Persisted)
	}

	// Show: re-observed, unchanged — stays ready.
	if got := seriesRow(t, s, libID, "Show").Status; got != "ready" {
		t.Errorf("re-observed series %q status = %q, want ready", "Show", got)
	}
	// Ghost.Show: NEVER observed by the truncated pass — a vanished-directory
	// tombstone requires a scan that actually drained its full stream. A
	// truncated stream is not evidence of vanishing; the row must keep its
	// prior status.
	if got := seriesRow(t, s, libID, "Ghost.Show").Status; got == "deleted" {
		t.Errorf("unobserved series %q advanced to deleted on a TRUNCATED stream — "+
			"the sweep ran on a partial pass (runScan cannot distinguish a mid-stream "+
			"Recv error from a clean end-of-stream)", "Ghost.Show")
	} else if got != "ready" {
		t.Errorf("unobserved series %q status = %q, want ready (untouched by the partial pass)", "Ghost.Show", got)
	}
}
