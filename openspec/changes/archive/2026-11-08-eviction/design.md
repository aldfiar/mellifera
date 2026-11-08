# Design

## Context

The architecture splits cleanly along an existing seam: pure POLICY in
`internal/orchestrator` (never touches disk, documents, or a clock) and a
thin composition SHELL in `cmd/mellifera/playback.go` (reads the store + the
artifact root into narrow snapshots, executes the decisions, owns the
clocks). The enrich queue is a derived-work dispatcher with one bounded FIFO
channel (`laneTask{rowID, streams}`, cap = workers×16) shared by metadata
and streams lanes; `EnqueuePack` is a non-blocking drop-on-full send. The
production incident (see proposal Why) is a POLICY bug — the frontier
working set is unbounded, so the pin that exists to break the evict→repack
churn instead guarantees it — plus a BACKPRESSURE bug — the play path shares
one FIFO with a backlog that has been full since boot, and its drop is
silent end to end. See proposal.md — Why; the deltas own the behavioral
contracts.

## Goals / Non-Goals

**Goals:**

- The pinned + proactively-packed set converges inside the existing budget
  (footprint SHRINKS; the budget knob stays 60).
- Cleanup is fast and prioritized: fully-watched serials' builds die on the
  next tick regardless of budget; never-watched pilots stop being pinned for
  weeks.
- The evict→repack churn loop dies: a policy-evicted build stays dead until
  a real play revives it.
- A play's pack jumps the background queue, and a refused enqueue is honest
  end to end (server error value → wire `queued:false` → retryable SPA
  state).

**Non-Goals:**

- No change to `MELLIFERA_ORCH_BUDGET_GB` (stays 60 in production) and no
  new env knob — the pin cap fraction and the urgent lane capacity are
  locked constants (the repo's locked-default precedent: `sweepInterval`,
  `retentionGrace`, `watchScanLimit`).
- No change to the retention sweep, the `.trash` eviction vocabulary, the
  stale-first precedence, or the integrity judge itself.
- No queue widening and no persistence for the suppression set (in-memory,
  process-lifetime — see D3).
- No change to the API wire shapes or status codes; the honest surface is
  the already-answered `queued` field, read at last.
- No scheduler/priority work for metadata lanes; the bounded pin set
  removes the backlog's source, which is what starved everything.

## Decisions

**D1 — Bounded working set lives in the pure policy, bytes from disk truth.**
`FrontierIn` gains `Recency map[string]time.Time` (per-item playback-progress
stamps — `watchState` already reads them), `BuildBytes map[string]int64`
(the position item's current build size, `dirSize` at the shell), and
`PinCapBytes int64` (`budgetBytes × 3/5`, locked — an unbounded set was the
incident). `Frontier` orders gated serials by serial recency — the most
recent stamp among the serial's episodes, a stampless serial oldest, input
order breaking ties — and takes the PREFIX of frontier positions whose
accumulated build bytes fit the cap; the prefix IS the working set (pinned
AND the only source of jobs). A position that would overflow ends the walk.
Alternatives rejected: (a) enqueue-everything/pin-only-K — every unpinned
build gets written once then evicted once: a 60G write storm per deploy,
the opposite of "use less size"; (b) a fixed serial count — ignores byte
reality (one 4K serial ≠ one 200MB serial); (c) judging bytes inside the
policy — the policy stays disk-free by construction; (d) an env knob for
the fraction — a second knob next to the budget invites raising the wrong
one.

**D2 — Demotion is an unconditional executor pass, before budget
accounting.** `Frontier` additionally returns the fully-watched serials'
episode ids (the judgment is the policy's — it already computes the skip);
the shell evicts each returned item's artifact directories via the existing
`evictDir`, unpublishes the named build via `resetStreamsState` extended to
reset a PARTIAL named build to `none` as well (today complete-only — a
demoted partial must replay-repack through pack-on-play, which requires
`none`), and runs BEFORE `sweepBudget` so the freed bytes count in the same
pass. Demotion is never budget-gated: it is the "clean it fast" half of the
request. Demotion sites also mark the suppression (one uniform marking rule
— D3), belt-and-braces against a failed unpublish leaving a
complete-state pointer at a gone directory.

**D3 — Suppression is a process-lifetime in-memory set at the composition
root.** Any policy eviction of a document-named build (budget sweep or
demotion) marks the item; the frontier consults it (a suppressed position
emits no job, joins no pin, contributes no bytes), the integrity sweep
consults it (no repack — one INFO line, the gate-refusal pattern), and
the `main.go` `Deps.Play` closure clears the mark on a real play before
it delegates to the pack decision — never inside `packOnPlay`/
`retryFailedPack` (their signatures untouched; their nine
`playback_gate_test.go` call sites stay green). A mutex-guarded map in `cmd/mellifera` — the policies stay
pure (suppression arrives as a `FrontierIn` field). Alternatives rejected:
(a) persisting in the document namespace — the streams namespace is a
state machine (`none`/`partial`/`complete`/`failed`); a policy-transient
mark inside it needs lifecycle rules for every writer for a state that
dies with the process anyway; (b) NOT gating the integrity sweep — a
failed unpublish write (best-effort by contract) would leave
complete-state-at-gone-dir, and the integrity judge would repack straight
into the churn the suppression exists to kill.

**D4 — Play-priority is a second small lane the workers prefer, not a
re-priority of the shared buffer.** `Queue` gains `urgent chan laneTask`
(locked capacity 16) and `EnqueuePackUrgent` with the same drop-on-full
error contract; the worker loop selects over BOTH lanes in ONE blocking
select with the urgent lane preferred (the urgent case first, the shared
case second — no `default:` fallthrough), so a worker parked in the
select wakes on urgent arrival. The idle-queue invariant demands the
blocking form: on an idle queue every worker parks on the shared
receive, and a bare shared receive is never woken by an urgent send —
the old non-blocking pre-check left a play's pack undispatched until
unrelated shared work arrived (the joint 5.1 finding). Drop-on-full,
lane ownership, and `Stop` closing both under `sendMu` are unchanged.
The composition
passes `EnqueuePackUrgent` to the play verb's closures (`packOnPlay`,
`retryFailedPack` — `legacyRepackOnPlay` inherits through the former);
`newSweep`, the integrity repack, and the descriptor's lazy re-heal keep
`EnqueuePack` — the requirement names plays, and a GET-triggered heal has
its own lease-absorbed path. Alternatives rejected: (a) reordering the
shared buffer on insert — O(n) churn on a channel Go cannot re_index;
(b) widening the shared buffer — treats the symptom; the bounded pin set
removes the backlog's source; (c) a fixed worker dedicated to urgent —
one fewer worker for background work forever, to protect against a state
the bounded pin set makes rare.

**D5 — Honest backpressure changes no wire shape; the SPA reads
`queued` at last.** On the preparing-POST path a `queued:false` answer is
unambiguous (the descriptor says `preparing` ⇒ packable and unpackaged ⇒
the enqueue was attempted ⇒ `false` means deferred), so the play response
shape and 200/202 statuses stay byte-identical. The page renders the
not-queued preparing state — names the queue-busy deferral, carries a
retry control re-firing `POST /play {retry:false}` — and never promises
the auto-update; `queued:true` keeps today's bounded poll and stall state.
Alternative rejected: a new error status/code — an additive field nobody
needs when the honest datum has been in the body since tv-playback-unblock.

**D6 — A fresh serial fronts its pilot only while the cap has room.**
Under the recency-ordered prefix a never-watched pilot joins the pin set
only after every more-recent serial's position fits; on a library with
watch history the stale pilots fall out of the set by construction, and on
a virgin library the byte cap (not a count) bounds how much the frontier
may proactively write. This is the sentence of the existing spec ("a
serial with no watch progress packages its first episode") made bounded —
the delta says so explicitly.

## Interfaces (cross-group)

1. **`orchestrator.FrontierIn` / `Frontier`** (group 1 → 2): `Recency`,
   `BuildBytes`, `PinCapBytes` arrive in group 1; `Suppressed map[string]bool`
   joins in group 2; the return becomes `(jobs []Job, pinned map[string]bool,
   demote []string)`. `cmd/mellifera` is the only production caller.
2. **The suppression set** (group 2): an unexported cmd-side type threaded
   through `newSweep` into `sweepFrontier` / `sweepBudget` /
   `sweepIntegrity`; the re-arm on play lives in the `Deps.Play` closure
   in `main.go`, placed BEFORE it delegates to the pack decisions — never
   inside `packOnPlay` / `retryFailedPack` (their signatures untouched).
3. **`enrich.Queue.EnqueuePackUrgent`** (group 3): same signature as
   `EnqueuePack` (`func(string) error` — the existing seam type), so the
   play closures' signatures do not change; only `main.go`'s wiring swaps
   which method the closures close over.
4. **Play wire contract** (group 4): unchanged (`{queued}` + 200/202);
   `queued:false` on a preparing POST gains its documented meaning
   (honest deferral), consumed by `web/src/pages/browse/ItemDetail.tsx`.

## Risks / Trade-offs

- [Pin cap too tight starves an actively-watched serial's proactive pack]
  → recency ordering puts exactly-being-watched serials first (watching an
  episode stamps its recency and jumps the serial to the front); the
  play-priority lane covers anything the cap defers — the pack lands while
  the viewer watches, not after.
- [A restart clears the suppression and re-fronts evicted items once]
  → in-memory by design; the wave is bounded by the pin cap (only
  pinned-worthy positions re-front), and the loud budget WARN still names
  the pathology. A persisted mark would add namespace lifecycle rules for
  a transient policy state.
- [Demotion evicts a directory a just-landed repack is about to name]
  → the same best-effort exposure the budget sweep has always had
  (`.tmp-` staging is never a candidate; a raced eviction retries next
  tick); demotion only fires on the fully-watched judgment, which a live
  serial's repack rarely intersects.
- [`queued:false` honesty on a TV remote] → the retry control is a
  focusable button on the existing PreparingSurface (the stalled state
  precedent is already remote-operable); no new navigation.
- [Demotion deletes builds a user re-watches] → re-watch is a play:
  pack-on-play re-packs through the urgent lane; the direct floor serves
  every item meanwhile.

## Migration Plan

Deploy-forward compatible: no schema, no wire change, no env change. On
the first post-deploy ticks the sweep demotes fully-watched serials'
builds, the budget pass evicts unpinned overflow (never-watched pilots
sort oldest), and the suppression set stops the historical re-front —
the 62.7G footprint converges downward toward ≤ budget with no re-pack
storm (that is D1's rejected alternative). Rollback is a revert: the
suppression set is in-memory, so nothing persists to clean.

## Open Questions

None — the cap fraction (60%), the urgent lane capacity (16), the
suppression's in-memory lifetime, and the urgent lane's play-only scope
are decided above with alternatives; the deltas fix the observable
contracts.
