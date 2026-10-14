# Proposal: fix-truncated-scan-sweep — a tombstone sweep only a clean drain may run, and tombstones a rescan may lift

## Why

Library 2 renders 1 of 20 series: 19 series rows are wrongly at status
`deleted` (updated_at cluster 2026-10-12T18:48:57Z). The root cause chain,
verified live by wf-debugger (handoff 2026-10-12T19:44:17Z):

1. `scannerGRPC.Scan` (`pkg/sdk/scanner.go`) treats ANY mid-stream gRPC
   `Recv` error as a clean end-of-stream — it closes the channel silently and
   no error surfaces to the core.
2. `runScan` (`internal/scan/run.go`) takes that early close as a clean drain
   and unconditionally runs the post-drain `sweepSeries`, which advances every
   series row the pass did not re-observe to `deleted` — on the partial pass
   that was 19 of 20.
3. `nextSeriesStatus` preserves the prior status on an unchanged re-observe, so
   a healthy rescan re-observes all 20 series and preserves all 19 wrongful
   tombstones forever (proven live by the 19:27Z rescan). The damage never
   self-heals and the collection page renders one title.

The ctx-cancel escape is already protected (`TestCancelledScanDoesNotSweep`);
the hole is self-terminated streams only. The repro test
`internal/scan/sweep_truncated_stream_test.go` (`TestTruncatedStreamMustNotSweep`)
is on disk and FAILING while the bug is live.

## What Changes

- **Scanner stream surface (`pkg/sdk`) — BREAKING (in-repo Go surface).**
  `Scanner.Scan` returns a `*sdk.ScanStream` — the `Files` channel plus an
  explicit terminal state the producer reports before closing (`End(nil)` =
  confirmed clean completion, `End(err)` = ended before completing). The
  `scannerGRPC` client classifies its `Recv` loop: `io.EOF` → clean, any other
  error → the stream's terminal error, ctx cancellation → the context error. A
  stream whose producer confirmed nothing is *unconfirmed* and is never
  treated as clean — a bare channel close alone can no longer pass for a
  completed scan. The gRPC/proto wire contract is unchanged (server side,
  `.proto`, and `Identify` untouched); every in-repo `Scanner` implementation
  and test fake is updated in the same change.
- **Sweep gate (`internal/scan`).** The post-drain sweep and the
  enrichment-queue handoff run ONLY after a provably clean drain: the stream
  reported a confirmed clean completion AND the context is still live. A
  stream that ends before completing surfaces a warning in the scan Result
  ("stream ended before completing"), the scan still reports success (the
  pinned repro requires it), and nothing the partial pass failed to observe is
  tombstoned or handed to the queue. The frozen repro test passes UNCHANGED.
- **Self-heal (`internal/scan`).** A series row at `deleted` that a scan
  re-observes leaves `deleted`: to `ready` when its serial scanned facts are
  unchanged, to `stale` when they changed (the existing stale rule fires
  first). A `deleted` row the pass did not re-observe keeps `deleted` (no
  churn). This is the data recovery for library 2: no migration — the next
  healthy rescan re-observes the 19 directories and the rows return to
  `ready`.

Explicitly out of scope (wf-debugger handoff findings, user-scoped out
2026-10-12): a per-library scan concurrency guard
(`internal/api/handlers.go` — the 18:48 fatal pass overlapped an in-flight
scan); root-causing the transport-level truncation itself (`/media/kofe` is
an SMB mount — candidates: plugin process death, volume hiccup, concurrent
scan interference). Also unchanged: the proto contracts, the enrich lifecycle
state machine (`deleted` stays terminal for the queue — the heal is scan-side,
writing a status literal like scan already does for pending/stale), and
item-level rescan semantics (`nextScanState` untouched).

## Capabilities

### New Capabilities

None — every delta amends an existing capability.

### Modified Capabilities

- **`scan-library`** — the **Scan orchestrates store, module registry, and
  plugin manager** requirement gains the drain-classification rule: the core
  distinguishes a confirmed clean completion from a stream that ended before
  completing; the latter surfaces as a scan warning (never a scan error) and
  never runs the post-drain pass. New scenarios: the warning-not-silent-drain
  behavior, the client-side clean-vs-truncated classification, and the joint
  gRPC-break proof.
- **`serial-library`** — the **Series identity and re-scan semantics**
  requirement is amended: the no-sweep rule broadens from "cancelled context"
  to any stream end without a confirmed clean completion (and no queue handoff
  on such a pass), and the self-heal rule is added: a re-observed `deleted`
  series leaves `deleted` (`ready` on unchanged facts, `stale` on changed
  facts) while an unre-observed `deleted` row keeps its status. The existing
  clean-drain tombstone floor (vanished/renamed directories still sweep to
  `deleted` on a confirmed-clean pass) and the unchanged-rescan preserve rule
  are carried verbatim as the regression floor.

## Impact

- `pkg/sdk/scanner.go` — `ScanStream` type (+ `ErrScanUnconfirmed`),
  `Scanner.Scan` signature, `scannerGRPC` Recv-loop classification.
- `pkg/sdk/sdk_test.go` — server-side fakes and drain helpers to the new
  surface; new terminal-state cases (clean EOF, mid-stream failure, ctx
  cancel, unconfirmed close) over the existing in-process gRPC harness.
- `plugins/base-scanner/scanner.go`, `plugins/serial-scanner/scanner.go` —
  each `scannerImpl.Scan` reports its walk's terminal state through
  `ScanStream`.
- `internal/plugin/testdata/fakeplugin/main.go`,
  `internal/plugin/manager_test.go`, `plugins/base-scanner/smoke_test.go` —
  mechanical surface ripple.
- `internal/scan/run.go` — the drain loop reads the stream's terminal state;
  sweep + notify gated on a provably clean drain; truncation warning;
  `nextSeriesStatus` self-heal (+ the `ready` literal with an updated
  ownership comment).
- `internal/scan/run_test.go` — the fake scanner models the terminal state
  (default: unconfirmed close; explicit opt-in for clean passes); tests whose
  meaning is a clean pass opt in.
- `internal/scan/series_test.go` — clean-pass tests opt in; new self-heal
  test. `internal/scan/sweep_truncated_stream_test.go` — the repro anchor,
  committed UNCHANGED and passing after the fix.
- New tests: `TestTruncatedStreamWarnsIncomplete`,
  `TestSeriesReobservedDeletedSelfHeals` (`internal/scan`),
  `TestJointTruncatedGRPStreamDoesNotSweep` (in-process gRPC joint, group 3).
- No API/wire changes, no new dependencies, no data migration, no proto
  change, no enrich-package change.
