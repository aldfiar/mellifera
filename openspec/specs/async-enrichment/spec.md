# async-enrichment Specification

## Purpose
The async enrichment capability decouples metadata enrichment from scanning: scan persists items at `pending`, hands off via a post-drain notify, and a process-lifetime worker pool drains a derived queue of `(item, plugin)` work under per-item leases — with in-memory retry/backoff, a durable `enrichment_failures` ledger for loop-safety, and `ready`/`stale` lifecycle states. There is no queue table; pending work is derived from `items`, document namespaces, and the ledger. Seeded from docs/async-enrichment (shipped as feat(async-enrichment) Phase B1).

## Requirements

### Requirement: Non-blocking scan handoff
The system SHALL persist each discovered item with `status='pending'` during scan, call `Deps.Notify(libraryID)` exactly once after the scanner stream drains, and return the scan response without awaiting enrichment. The `scan.Result` response shape SHALL be unchanged; only timing changes.

#### Scenario: Scan returns before enrichment completes
- **WHEN** `POST /api/v1/libraries/{id}/scan` is called on a library with items
- **THEN** the response returns promptly after discovery + identify + persist with items at `pending`, and workers drain those items to `ready` in the background

### Requirement: Derived pending work set
The queue SHALL derive pending `(item, plugin)` tasks from existing data — the item row, applicable enabled module bindings, absent `sources.<plugin>` document namespaces, and the ledger — with no queue, claim, or lease table. Derivation SHALL skip pairs whose ledger `next_eligible_at` is in the future, and a cleared ledger row SHALL make its pair derivable again.

#### Scenario: Done and cooling pairs are not re-derived
- **WHEN** derivation runs against an item whose `tv-parser` namespace exists and a pair whose ledger cooldown has not elapsed
- **THEN** neither pair is enqueued; only sources with absent namespaces and no active cooldown are derived as pending

### Requirement: Queueable-source rule (AuthMode)
The queue SHALL treat a source as queueable iff its binding `AuthMode != "CLIENT"`. Empty/local (e.g. `tv-parser`) and `SERVER` sources SHALL be queued; `CLIENT` sources SHALL be excluded from the background queue.

#### Scenario: CLIENT source excluded
- **WHEN** derivation considers a module binding with `AuthMode: CLIENT` (e.g. `kinopoisk`)
- **THEN** that source is not derived into pending work

### Requirement: Bounded worker pool
The queue SHALL feed derived items onto a bounded channel and drain it with a fixed pool of worker goroutines (default 4, env-overridable). A single source failure SHALL never abort the pool.

#### Scenario: Pool drains derived work
- **WHEN** a scan notifies the started queue of new pending items
- **THEN** pool workers claim and drain the items' queueable sources asynchronously to a terminal outcome

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

### Requirement: Per-source retry with backoff
The worker SHALL wrap each source run in a bounded retry loop: transient failures SHALL requeue in-memory with exponential backoff up to `MaxAttempts` (default 3). Success SHALL short-circuit the loop.

#### Scenario: Transient failure retries then recovers
- **WHEN** a source RPC fails transiently and succeeds on a later attempt
- **THEN** the source completes without a terminal outcome being recorded

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

### Requirement: Restart resume without lost or looping work
The queue's in-memory state (channel, leases, retry counters) SHALL be discarded on shutdown; pending work SHALL survive in `items` + namespaces + the ledger. On every `Start`, the pool SHALL re-derive pending work and SHALL NOT re-derive pairs within ledger cooldown. `Start` SHALL be re-entrant after `Stop`.

#### Scenario: Restart re-derives pending, skips cooling pairs
- **WHEN** the core restarts with items at `pending` and an exhausted pair within its cooldown
- **THEN** pending items are re-derived and drained, while the cooling pair stays skipped until its `next_eligible_at` elapses

### Requirement: Lifecycle states ready and stale
The lifecycle state machine SHALL accept `enriched --settled--> ready` (all of the item's queueable sources terminal), `* --stale--> stale`, `stale --rehydrate--> pending`, and SHALL exercise `failed --retry--> pending`. Illegal transitions (e.g. `ready --parsed-->`) SHALL be rejected; new statuses SHALL list via the unchanged `GET /api/v1/items?status=` passthrough.

#### Scenario: Item settles to ready after drain
- **WHEN** every queueable source of an enriched item reaches a terminal outcome (namespace written, in cooldown, or ran-but-produced-no-work)
- **THEN** the item advances to `ready` and is listable via `?status=ready`

#### Scenario: Changed file re-scan marks stale
- **WHEN** a re-scan detects a file's base identity changed since its last good scan
- **THEN** the item advances `stale → pending` for re-enrichment, while an unchanged re-scan preserves the prior status (a `ready` item is not regressed)

#### Scenario: Failed item retried
- **WHEN** an item is `failed` (e.g. cancelled context) and the next derive pass runs
- **THEN** the item transitions `failed → pending` and is re-enqueued

### Requirement: Pool-wide SQLite busy timeout
The store SHALL configure a pool-wide `busy_timeout` (5s) in its DSN so concurrent writers (scan `PutItem`, API reads, queue writes) do not fail on lock contention.

#### Scenario: Concurrent writers coexist
- **WHEN** the queue writes documents while scan persists items and the API serves reads
- **THEN** writers wait out brief locks instead of erroring

### Requirement: Env configuration with safe fallback
Queue knobs (workers, max attempts, lease TTL, backoff, exhausted/no-data cooldowns, cooldown cap) SHALL be env-overridable with arch defaults. A missing, empty, or malformed value SHALL fall back to the default and log a warning; startup SHALL NOT abort on an enrich knob.

#### Scenario: Malformed knob falls back
- **WHEN** an enrich env var is set to a malformed value at startup
- **THEN** the default is used, a warning is logged, and the queue starts normally

### Requirement: Additive refactor — contracts preserved
The async migration SHALL be dispatch-only: the plugin RPC contract, SDK surface, `plugins/tv-parser`, API endpoints, and `scan.Result` shape SHALL be unchanged, and the synchronous `enrich.Enrich` per-item entry SHALL be preserved (deprecate-don't-delete) as the worker-internal chain body.

#### Scenario: Plugin and API surface unbroken
- **WHEN** the B1 refactor is inspected at the wire level
- **THEN** no proto, SDK symbol, plugin, or API endpoint changed, and `func Enrich(` remains present in `internal/enrich`

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
