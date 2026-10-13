# Design: fix-truncated-scan-sweep

## Context

Three facts pin the solution space (all verified in live source this session;
the wf index carries no Go defs — regex floor):

- `scannerGRPC.Scan` (`pkg/sdk/scanner.go`) closes its channel on ANY mid-stream
  `Recv` error, so the drain (`internal/scan/run.go`) cannot distinguish a
  completed scan from a broken one — the channel surface has no room for a
  terminal error.
- `runScan` runs `sweepSeries` + the queue handoff in the `!ok` branch
  unconditionally; only the per-row `ctx.Err()` check inside the sweep (and the
  ctx-select branch) protects the cancel path. A self-terminated stream gets
  the full tombstone pass — the 2026-10-12 incident shape.
- `nextSeriesStatus` preserves the prior status on an unchanged re-observe, so
  a wrongful `deleted` is permanent — proven live (the 19:27Z healthy rescan
  kept all 19 tombstones).

The binding constraint: the repro `internal/scan/sweep_truncated_stream_test.go`
is FROZEN (the fix must not edit it) and it hands `runScan` a fully-drained,
error-free fake stream — a bare channel close — while demanding NO sweep and a
nil error. Therefore the gate cannot be "an error was reported"; it must be
POSITIVE: a sweep may run only when the stream CONFIRMED a clean completion.
See proposal.md — Why for the incident detail; the spec deltas pin the
corrected behavior.

## Goals / Non-Goals

Goals:

- A tombstone sweep runs only after a provably clean drain; a truncated pass
  is visible (warning) and destructive to nothing.
- The 19 wrongful tombstones heal without migration: any rescan that
  re-observes the directories lifts them.
- The frozen repro passes unmodified; the cancel-path protection
  (`TestCancelledScanDoesNotSweep`) holds unchanged.

Non-Goals:

- No per-library scan concurrency guard (wf-debugger handoff finding — the
  18:48 pass overlapped an in-flight scan; user-scoped out 2026-10-12).
- No root-cause of the transport truncation (SMB mount candidates; unrecoverable
  from the DB; user-scoped out).
- No proto/wire change, no `internal/enrich` change (the lifecycle state
  machine keeps `deleted` terminal; the heal is scan-side), no item-level
  rescan semantic change (`nextScanState` untouched).

## Decisions

### D1 — The stream surface carries an explicit terminal state, defaulting to unconfirmed

`Scanner.Scan` returns `*ScanStream` instead of a bare channel
(`pkg/sdk/scanner.go`):

```go
var ErrScanUnconfirmed = errors.New("scanner stream closed without a terminal confirmation")

func NewScanStream(files <-chan *scannerv1.DiscoveredFile) *ScanStream
func (s *ScanStream) End(err error) // producer: nil = confirmed clean completion; call BEFORE closing Files
func (s *ScanStream) Err() error    // consumer, after Files closed: nil = provably clean; ErrScanUnconfirmed = nothing reported
```

`scannerGRPC.Scan` classifies its Recv loop: `io.EOF` → `End(nil)`; any other
Recv error → `End(err)`; the ctx-cancel send-race branch → `End(ctx.Err())` —
always before the deferred channel close, so the consumer's read after the
close is ordered by the channel happens-before (no locks needed). Memory model:
the producer writes the terminal state, THEN closes `Files`; the consumer reads
`Err()` only after `Files` closed.

The unconfirmed default is the load-bearing half: an implementation that closes
its channel without reporting is NEVER clean — which is exactly the frozen
repro's shape and the permanent regression floor against any future
error-swallowing client.

Alternatives rejected: a second error channel (a three-value Scan that every
caller must drain in the right order); a sentinel final `DiscoveredFile`
(forges scanner-emitted data with a core-side marker — a contract breach); an
optional `ScanErr() error` interface asserted by `runScan` (a backward-compat
shim around an interface with exactly four in-tree implementations — the struct
is the honest evolution; **BREAKING** and fully rippled in the same change).
The proto contracts are untouched: this is the client-side Go adapter only.

### D2 — The sweep gate is positive confirmation: `Err() == nil` AND a live context

`runScan`'s `!ok` branch becomes: if `ctx.Err() != nil` return it; else if
`stream.Err() != nil` append the warning
`"scan: stream ended before completing: <err>"` and return `finish(res), nil`
— no sweep, no notify (the B7 analog: a half-drained pass never signals the
queue). Only the nil-Err-with-live-context path runs the existing sweep+notify
body. The double check inside `!ok` closes the Go select race where a
cancel-closed channel and `ctx.Done()` are both ready: both branches return the
context error, so `TestCancelledScanDoesNotSweep` holds regardless of which
fires.

Why nil error on truncation (not a hard failure): the frozen repro asserts
`runScan` returns nil; operationally the partial pass's persisted items are
ordinary idempotent upserts, the warning surfaces the truncation in the API
scan response, and the next clean rescan completes the picture — the scan's
job (persist what arrived) succeeded; the sweep's precondition (a full
observation) provably did not hold, and that is the thing being withheld.

### D3 — Self-heal lands `ready`

`nextSeriesStatus` order: `baseChanged` → `stale` (existing rule, fires first);
prior status `deleted` → `ready` (new); otherwise preserve (existing). A
`deleted` row the pass does not re-observe keeps `deleted`
(`sweepSeries`'s existing skip — no `updated_at` churn).

`ready` is the only landing that terminates well:

- The derivation predicate is status-blind (`internal/enrich/queue.go`
  `deriveLibrary` loads ALL statuses; `pendingSources` keys on
  queueable + namespace-absence + no-cooldown). A healed row whose namespaces
  survived the tombstone (they did — the sweep flips the status column only)
  is genuinely settled: `ready` is truthful, and no queue machinery needs to
  run.
- A healed row whose namespaces are incomplete still re-derives its missing
  sources — status-blind derivation picks them up under ANY status, so a
  premature `ready` self-corrects.
- Landing `pending` instead would strand the row forever: with all namespaces
  present nothing derives, and only the worker advances status — the exact
  regression the preserve-ready rule exists for (`TestRunScan_StaleOnRescan`'s
  "would otherwise strand it" comment). `stale` would misuse the changed-facts
  meaning.

Boundary note: `scan` gains a second preserve-override and now emits the
`ready` literal — the const-block comment ("scan never produces … ready")
is rewritten accordingly. INV-status-owner is intact: enrich owns the state
machine; scan keeps emitting literals, as it already does for
pending/stale/deleted. The queue never sees an illegal transition (scan's
writes bypass `nextState` by the existing INV).

### D4 — The test fake models the terminal state; its DEFAULT close is unconfirmed

`run_test.go`'s `fakeScanner.Scan` wraps its channel in a `ScanStream` and, on
its normal end-of-canned-files close, reports NOTHING (the frozen repro's
shape) unless the new opt-in field is set: `endClean: true` → `End(nil)` after
the emission; the ctx.Done path → `End(ctx.Err())` (mirroring the production
client). This is forced by the frozen repro: `serialLibrary()` is constructed
bare by BOTH the repro (must not sweep) and tests that need the clean path —
so the clean path must be the explicit opt-in, and the core's gate must treat
a bare close as unproven. Opt-in where the test's meaning is a clean pass:
`TestRunScan_AsyncEnqueue` (the notify assertion) and
`TestSeriesRenameNewIdentity` (the tombstone assertion). Production semantics
are unaffected by the fake's default — `scannerGRPC` always reports.

### D5 — Coverage ladder: classification → orchestrator → joint

Unit: `pkg/sdk`'s existing in-process gRPC harness (`serveInProcess`) gains
terminal-state cases (clean EOF, mid-stream server failure, ctx cancel,
unconfirmed close). Orchestrator: the frozen repro (gate), the new warning
test, the new self-heal test, and the existing sweep tests. Joint (group 3):
a REAL `scannerGRPC` client against an in-process gRPC server that breaks the
stream mid-flight, wired through `runScan` over a real store — the only test
that exercises the production client's classification inside the production
drain, closing the one gap the fakes cannot.

## Interfaces

The cross-group contract (group 1 produces it; groups 2–3 consume it) is the
`Scanner` surface in D1. Consumer contract in `runScan` (group 2):

```go
stream, err := sc.Scan(ctx, req) // open error unchanged
...
case f, ok := <-stream.Files:
    if !ok {
        if ctx.Err() != nil { return finish(res), ctx.Err() }
        if terr := stream.Err(); terr != nil {
            res.Warnings = append(res.Warnings,
                fmt.Sprintf("scan: stream ended before completing: %v", terr))
            return finish(res), nil // no sweep, no notify
        }
        // provably clean drain: existing sweepSeries + notify body
    }
```

Full compile-site ripple (grounded by grep this session — every
implementation/consumer of the surface):

- `pkg/sdk/scanner.go` — `Scanner`, `ScanStream`, `scannerGRPC.Scan`.
- `pkg/sdk/sdk_test.go` — server-side `fakeScanner`, `oneThenBlockScanner`,
  drain helpers, new terminal cases.
- `plugins/base-scanner/scanner.go`, `plugins/serial-scanner/scanner.go` —
  `scannerImpl.Scan` reports the walk's terminal state.
- `internal/plugin/testdata/fakeplugin/main.go` — server-side `fakeScanner`.
- `internal/plugin/manager_test.go`, `plugins/base-scanner/smoke_test.go` —
  mechanical consumer updates.
- `internal/scan/run.go` — drain loop, gate, warning, `nextSeriesStatus`,
  `scanStatusReady`.
- `internal/scan/run_test.go` — fake terminal modeling + clean-pass opt-ins;
  `internal/scan/series_test.go` — opt-ins + new self-heal test.
- NOT touched: `internal/scan/sweep_truncated_stream_test.go` (frozen repro),
  the proto tree, `internal/enrich`, `web/vite.config.ts` +
  `web/devproxy.test.ts` (unarchived unrelated change).

## Risks / Trade-offs

- [A future Scanner implementation forgets to End] → sweeps never run — the
  fail-safe direction: data is preserved, tombstones stop accumulating, and
  the unconfirmed warning names the stream in every scan response. The sdk
  tests and the joint test pin the real client's reporting.
- [A truncated scan returns success] → deliberate and pinned by the frozen
  repro; the warning surfaces in the API response, and withholding the sweep
  is the entire point.
- [Self-heal lands `ready` for a row whose enrichment never completed] →
  self-correcting: status-blind derivation re-derives any missing namespace
  under any status; nothing strands.
- [Select race: cancel vs closed channel] → both `!ok`-branch arms return
  `ctx.Err()` when the context is dead; the cancel test holds either way.
- [Group 1's tick leaves the repro failing] → by design: box 1.1's probe
  compile-checks `internal/scan` (`go test -run '^$'`) without running the
  repro; group 2 gates the tick on it.

## Migration Plan

Deploy → the next scan of library 2 (any healthy rescan) re-observes the 19
directories → `nextSeriesStatus` lifts the tombstones to `ready` → the
collection page renders the library again. Truncated passes in the interim
surface their warning and tombstone nothing. Rollback: revert the deploy — no
schema, wire, or format change; healed rows are ordinary `ready` rows.

## Open Questions

None — the surface shape, the gate, the heal target, and the fake's default
are each forced by a pinned constraint (the frozen repro; the status-blind
derivation predicate) rather than preference; everything else is normative in
the spec deltas.
