# tasks - frontier-pinned-eviction

<!-- hand-authored on the fix/opt-in-codecs-knob branch; wf verbs take over from here -->

## pin - orchestrator policy

- [ ] 1.1 internal/orchestrator: `Evictions(dirs, watched, fronted, budgetBytes)` — fronted items evicted last (non-fronted, then recency, then orphan-first, then path); nil fronted behaves exactly as before (budget_test table: churn break, orphan shield, budget-unreachable fall-through)

## plumb - sweep wiring

- [ ] 2.1 cmd/mellifera: `sweepFrontier` returns the fronted item-ID set (enqueue-deferred items included); `newSweep` passes it to `sweepBudget`; `sweepBudget` WARNs on every fronted eviction ("budget below frontier working set")

## ops - operator surface

- [ ] 3.1 docs/operator-runbook.md: `MELLIFERA_ORCH_BUDGET_GB` note — the frontier working set is pinned; the WARN means the budget sits below it, raise it
