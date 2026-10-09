## ADDED Requirements

### Requirement: Packaging work rides the enrichment queue

Video packaging jobs SHALL dispatch through the async enrichment queue as a
dedicated lane keyed `__streams__` — plugin-id-like, implemented in its own
file, flowing through the same per-item leases, retries, and failure ledger
as metadata sources. The lane SHALL NOT participate in metadata-completion
semantics: derivation of metadata sources, item lifecycle states, and
metadata namespace completion are untouched by packaging work. Ledger rows
recorded under `__streams__` SHALL be exempt from any future
unregistered-plugin purge.

#### Scenario: Packaging job drains with lease and ledger semantics

- **WHEN** a packaging job is enqueued for an item and the queue drains it
- **THEN** the item's lease is held for the duration of the run, a terminal packaging failure records a ledger row under `__streams__`, and the item's metadata completion is unaffected

<!-- wf:probe id=05847a1e4d6f6b44 -->
```bash
set -e
go test ./internal/enrich -run TestStreamsLane
```
<!-- /wf:probe -->

#### Scenario: Packaging work never moves lifecycle states

- **WHEN** a packaging job runs to completion, and separately to terminal failure, on an item that is settled `ready`
- **THEN** the item's status and metadata namespaces are exactly as they were before each run

<!-- wf:probe id=dd9284dc315629b2 -->
```bash
set -e
go test ./internal/enrich -run TestStreamsLane
```
<!-- /wf:probe -->

#### Scenario: Lane joint round trip under failure, long runs, and re-scan

- **WHEN** the pipeline is exercised end to end with a packaging run that fails terminally, a packaging run injected to outlast the lease TTL, and a re-scan of a file whose base is unchanged and whose item carries packaged state
- **THEN** the failure cools down flat in the ledger, the long run's renewed lease blocks concurrent dispatch until the run ends, and the re-scan carries the packaged state forward

<!-- wf:probe id=4c95d3b2b0ed233c -->
```bash
set -e
command -v ffmpeg >/dev/null || { echo "ffmpeg is required to verify the pack lane"; exit 1; }
go test ./internal/itest -run TestStreamsJoint
```
<!-- /wf:probe -->

## MODIFIED Requirements

### Requirement: Per-item lease mutual exclusion

The queue SHALL hold at most one in-memory lease per `item_id` at a time,
serializing an item's sources in priority order while parallelizing across
items. Leases SHALL expire lazily (checked on dispatch/acquire probes) with
no sweeper goroutine and no lease writes to the database. A worker whose
source run outlasts the lease TTL SHALL renew the lease while the run
continues, so a live long run is never treated as dead mid-flight; renewal
ends when the run ends.

#### Scenario: Second worker blocked by held lease
- **WHEN** an item's lease is held by one worker and another dispatch considers the same item
- **THEN** the item is not dispatched again while the lease is held

<!-- wf:probe id=de7c950bedd00de7 -->
```bash
set -e
go test ./internal/enrich -run 'TestQueue_LeaseNoDouble|TestLeaseMap$'
```
<!-- /wf:probe -->

#### Scenario: Dead holder's lease reclaimed
- **WHEN** a lease's TTL has elapsed (e.g. its holder died) and a later dispatch probes it
- **THEN** the lease is treated as expired and the item is re-dispatchable

<!-- wf:probe id=eb2302f8cc5808e7 -->
```bash
set -e
go test ./internal/enrich -run 'TestQueue_LeaseNoDouble|TestLeaseMap$'
```
<!-- /wf:probe -->

#### Scenario: Long run renews its lease

- **WHEN** a source run lasts longer than the lease TTL and a concurrent dispatch considers the same item while the run is still going
- **THEN** the renewed lease blocks the concurrent dispatch for as long as the run lives, and the item becomes re-dispatchable only after the run ends

<!-- wf:probe id=4bf96963522b5ebc -->
```bash
set -e
go test ./internal/enrich -run TestLeaseMap
```
<!-- /wf:probe -->

### Requirement: Enrichment-failures ledger (loop-safety)

The store SHALL persist terminal source outcomes to the `enrichment_failures`
ledger via `RecordFailure` (upsert on `(item_id, plugin_id)`), `ClearFailure`,
and `ListFailures`. Writes SHALL occur only on terminal failure —
`exhausted` (retries spent, doubling cooldown capped at a max), `no_data`
(flat cooldown), or `pack_failed` (a failed packaging run on the
`__streams__` lane, flat cooldown with no doubling) — never per-claim or on
success.

#### Scenario: Exhausted source terminally fails to ledger
- **WHEN** a source fails through all `MaxAttempts` backoff rounds
- **THEN** an `exhausted` ledger row is recorded with a future `next_eligible_at`, derivation skips the pair until eligibility, and no infinite retry loop occurs

<!-- wf:probe id=4bcdfd9bb8cf9188 -->
```bash
set -e
go test ./internal/enrich -run TestQueue_RetryToLedger
```
<!-- /wf:probe -->

#### Scenario: Reset on success
- **WHEN** a `(item, plugin)` pair with an existing ledger row eventually succeeds
- **THEN** the row is deleted and the pair becomes derivable again

<!-- wf:probe id=c28a961b6d43b2c8 -->
```bash
set -e
go test ./internal/enrich -run TestQueue_ResetOnSuccess
```
<!-- /wf:probe -->

#### Scenario: Failed pack cools down flat

- **WHEN** a packaging run fails terminally, then fails again shortly after an explicit play-time retry
- **THEN** each failure records a `pack_failed` ledger row under `__streams__` with a flat 30-day cooldown — no doubling across repeated failures — and the item is not re-enqueued for packaging until the cooldown elapses or play requests retry again

<!-- wf:probe id=951501b58d2cba69 -->
```bash
set -e
go test ./internal/enrich -run TestStreamsLane
```
<!-- /wf:probe -->
