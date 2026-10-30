# Spec Delta

## MODIFIED Requirements

### Requirement: Budget-capped artifacts

Stored packaging artifacts SHALL live under a storage budget (default 32 GB,
`0` disables the cap). Accounting SHALL read the artifact directories on disk
as the truth — including directories orphaned by moved or deleted library
files — and eviction SHALL be least-recently-watched first (by playback
progress recency), moving the artifact aside before deleting it, EXCEPT that
artifacts of currently-frontier items (the working set the frontier keeps
packing: pilots and next-after-watched episodes) SHALL be evicted only after
every non-fronted artifact; frontier items SHALL fall to eviction in the same
least-recently-watched order when the budget cannot be met from non-fronted
artifacts alone. Originals SHALL never be evicted.

#### Scenario: Over-budget eviction reaps least-recently-watched and orphans

- **WHEN** artifact directories on disk exceed the budget, including one orphaned by a moved library file, and the least-recently-watched item's artifact and the orphan are oldest by watch recency
- **THEN** eviction removes those artifact directories first and accounting afterwards reports within budget

#### Scenario: Frontier working set outlives stale watched artifacts

- **WHEN** artifact directories on disk exceed the budget, one belonging to a currently-frontier item (never watched — a pilot or next-after-watched episode) and one belonging to an item watched longer ago, and both are non-fronted-or-fronted respectively
- **THEN** eviction removes the stale watched artifact first, and the fronted build only if the budget still cannot be met after every non-fronted artifact is gone — and the sweep logs the fronted eviction as the operator signal that the budget sits below the working set
