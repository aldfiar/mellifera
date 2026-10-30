# tasks - frontier-pinned-eviction

<!-- hand-authored on the fix/opt-in-codecs-knob branch; wf verbs take over from here -->

## pin - orchestrator policy

- [ ] 1.1 internal/orchestrator: `Evictions(dirs, watched, fronted, budgetBytes)` — fronted items evicted last (non-fronted, then recency, then orphan-first, then path); nil fronted behaves exactly as before (budget_test table: churn break, orphan shield, budget-unreachable fall-through)

## plumb - sweep wiring

- [ ] 2.1 cmd/mellifera: `sweepFrontier` returns the fronted item-ID set (enqueue-deferred items included); `newSweep` passes it to `sweepBudget`; `sweepBudget` WARNs on every fronted eviction ("budget below frontier working set")

## ops - operator surface

- [ ] 3.1 docs/operator-runbook.md: `MELLIFERA_ORCH_BUDGET_GB` note — the frontier working set is pinned; the WARN means the budget sits below it, raise it

## unpublish - eviction is policy, not corruption

- [ ] 4.1 cmd/mellifera: `evictDir` reports success; on success `sweepBudget` resets the item's stored streams namespace to `state=none` when the evicted directory is the published build (fresh row reload, replace only `doc["streams"]`, PutItem — the persistStreams pattern; stale-nonce directories and partial/failed states are left alone)

## working set - every tick, not just job ticks

- [ ] 5.1 internal/orchestrator: `Frontier(in)` returns `(jobs, fronted)` — the fronted set is the frontier-position item of every gated, not-fully-watched serial, set before the eligibility check, so packaged and cooling positions stay pinned on non-job ticks; callers updated (frontier_test, itest qa harness)

## in-flight - never an eviction candidate

- [ ] 6.1 internal/orchestrator: `Evictions` skips directories whose base name starts with `.tmp-` (in-flight pack staging) — bytes still counted toward the budget; over-budget with only in-flight dirs evicts nothing (budget_test: TestBudgetInFlightNeverEvicted)

## diagnostics - failure reasons keep the stderr tail

- [ ] 7.1 internal/stream: ffmpeg failure reason stores the stderr tail (truncateTail, 512) — the real error is at the end, the version banner at the head; head-truncate kept
