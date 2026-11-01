# Spec Delta

## MODIFIED Requirements

### Requirement: Budget-capped artifacts

Stored packaging artifacts SHALL live under a storage budget (default 32 GB,
`0` disables the cap). Accounting SHALL read the artifact directories on disk
as the truth — including directories orphaned by moved or deleted library
files — and eviction SHALL be least-recently-watched first (by playback
progress recency), moving the artifact aside before deleting it, EXCEPT that
artifacts of currently-frontier items (the working set the frontier keeps
packing: pilots and next-after-watched episodes, pinned on every tick whether
or not the frontier emits a job for them — packaged and cooling frontier
positions stay in the working set) SHALL be evicted only after
every non-fronted artifact; frontier items SHALL fall to eviction in the same
least-recently-watched order when the budget cannot be met from non-fronted
artifacts alone. Eviction SHALL count in-flight builds (staged under their
`.tmp-` prefix) toward the budget but SHALL never select an in-flight build
for eviction; transient in-flight pressure SHALL be resolved from published
non-fronted artifacts, and if nothing evictable remains the budget SHALL be
allowed to run over until the build completes. A successful eviction of an item's published build (state
complete, matching nonce) SHALL reset the item's stored streams state to
`none` — eviction is a policy act, not corruption, so the integrity sweep
SHALL NOT see a complete build whose directory is gone. Originals SHALL
never be evicted.

#### Scenario: Over-budget eviction reaps least-recently-watched and orphans

- **WHEN** artifact directories on disk exceed the budget, including one orphaned by a moved library file, and the least-recently-watched item's artifact and the orphan are oldest by watch recency
- **THEN** eviction removes those artifact directories first and accounting afterwards reports within budget

#### Scenario: Frontier working set outlives stale watched artifacts

- **WHEN** artifact directories on disk exceed the budget, one belonging to a currently-frontier item (never watched — a pilot or next-after-watched episode) and one belonging to an item watched longer ago, and both are non-fronted-or-fronted respectively
- **THEN** eviction removes the stale watched artifact first, and the fronted build only if the budget still cannot be met after every non-fronted artifact is gone — and the sweep logs the fronted eviction as the operator signal that the budget sits below the working set

#### Scenario: Eviction unpublishes the build record

- **WHEN** a budget eviction removes an item's artifact directory that is the item's published build (stored streams state complete with a matching nonce)
- **THEN** the item's stored streams state is reset to `none` (the direct floor serves it; pack-on-play may re-pack on demand) and the integrity sweep does not enqueue a repack for it

#### Scenario: Working set holds through non-job ticks

- **WHEN** a fronted item's packaging has completed (or the item sits in failure cooldown) so the frontier emits no job for it on a tick, and the budget is exceeded on that same tick
- **THEN** the item still counts as fronted for eviction — its fresh, never-watched build is not evicted while any non-fronted artifact remains

#### Scenario: In-flight builds survive budget pressure

- **WHEN** the budget is exceeded while an item's build is still being written under its in-flight `.tmp-` staging directory
- **THEN** accounting counts the in-flight directory's bytes but eviction removes only published non-fronted artifacts, and if none remain the budget stays exceeded until the build completes rather than killing the in-flight build
