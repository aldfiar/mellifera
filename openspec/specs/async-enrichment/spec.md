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
The queue SHALL derive pending `(item, plugin)` tasks from existing data — the item row, the module bindings EFFECTIVELY ENABLED for the item's library (the binding's configured enabled flag AND the operator's module- and library-scope gates resolved per row), absent `sources.<plugin>` document namespaces, and the ledger — with no queue, claim, or lease table. Derivation SHALL skip pairs whose ledger `next_eligible_at` is in the future, and a cleared ledger row SHALL make its pair derivable again.

#### Scenario: Done and cooling pairs are not re-derived
- **WHEN** derivation runs against an item whose `tv-parser` namespace exists and a pair whose ledger cooldown has not elapsed
- **THEN** neither pair is enqueued; only sources with absent namespaces and no active cooldown are derived as pending

#### Scenario: A gated source is not derived

- **WHEN** derivation resolves the bindings for a row whose library carries a module-scope disable for one plugin and a library-scope disable for another
- **THEN** both gated sources are absent from the resolved set — no pair is enqueued for either, their document namespaces are untouched, and ungated sources derive exactly as before

<!-- wf:probe id=bae8da0f439049f0 -->
```bash
set -e
go test ./internal/enrich -run TestGateResolution -count=1
```
<!-- /wf:probe -->

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
The lifecycle state machine SHALL accept `enriched --settled--> ready` (all of the item's queueable sources terminal), `* --stale--> stale`, `stale --rehydrate--> pending`, and SHALL exercise `failed --retry--> pending`. A re-scan SHALL drive `* --stale--> stale` only when the row's parsed identity changed since its last good scan; a re-scan whose parsed identity is unchanged — ffprobe-only drift included — SHALL preserve the prior status and the row's derived namespaces, so an enriched library keeps its anchors across rescans and re-enriches only on real identity change (the streams lane still drops streams on ffprobe drift per packaged-playback). An explicit source re-enrichment SHALL additionally accept `ready --refresh--> pending` and `enriched --refresh--> pending`, applied to exactly the rows whose namespaces the sweep stripped, so `pending` stays a truthful will-fetch signal (today a refresh can never move a status). Illegal transitions (e.g. `ready --parsed-->`) SHALL be rejected; new statuses SHALL list via the unchanged `GET /api/v1/items?status=` passthrough.

#### Scenario: Item settles to ready after drain
- **WHEN** every queueable source of an enriched item reaches a terminal outcome (namespace written, in cooldown, or ran-but-produced-no-work)
- **THEN** the item advances to `ready` and is listable via `?status=ready`

#### Scenario: Changed file re-scan marks stale
- **WHEN** a re-scan detects a file's parsed identity changed since its last good scan
- **THEN** the item advances `stale → pending` for re-enrichment, while a re-scan whose parsed identity is unchanged — including ffprobe-only drift — preserves the prior status and the derived namespaces (a `ready` item is not regressed)

<!-- wf:probe id=940053d5086eaac8 -->
```bash
set -e
grep -q 'func TestFfprobeDriftKeepsEnrichmentDropsStreams(' internal/scan/carry_test.go
go test ./internal/scan -run 'TestRunScan_StaleOnRescan|TestFfprobeDriftKeepsEnrichmentDropsStreams' -count=1
```
<!-- /wf:probe -->

#### Scenario: Failed item retried
- **WHEN** an item is `failed` (e.g. cancelled context) and the next derive pass runs
- **THEN** the item transitions `failed → pending` and is re-enqueued

#### Scenario: Explicit re-enrich flips stripped rows to pending

- **WHEN** a re-enrichment sweep strips a `ready` (or `enriched`) row's `shikimori` namespace and the derivation re-runs for it
- **THEN** the stripped row's status is `pending` while its work drains, and rows the sweep did not strip keep their prior status

<!-- wf:probe id=a1bc96f6b9fef173 -->
```bash
set -e
go test ./internal/enrich -run TestReenrichStatusFlip
```
<!-- /wf:probe -->

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

### Requirement: Explicit source re-enrichment

The queue SHALL expose `ReenrichSource(ctx, libraryID, pluginID, rowIDs...)`
for an explicit, operator-triggered refresh of one plugin's namespace: for
each scoped row, acquired under that row's own lease (non-blocking, the
same primitive the workers use), it SHALL purge `doc.sources.<pluginID>`,
the `_provenance` entries with `plugin_id == pluginID`, and the `_view`
entries with `source == pluginID`, then persist. The purge SHALL NEVER
touch `doc.identifiers` (the id anchor) or any other plugin's namespace,
and SHALL be structurally unable to reach `title_overrides` (a separate
control table). It SHALL call `ClearFailure` for the swept plugin on every
stripped row (the cooldown bypass for explicit actions — automatic paths
never bypass). Rows skipped because a worker held the lease SHALL be
counted and re-attempted in one bounded retry pass (persist is
unconditional on the worker path, so an unleased strip can otherwise be
silently resurrected by an in-flight worker). It SHALL return the counts
{stripped, deferred} and then notify the library so the existing
derivation re-runs the stripped pairs through the unchanged namespace
gates — no predicate extension, no new trigger machinery.

#### Scenario: Re-enrich strips the plugin namespace and re-derives

- **WHEN** a row carries `sources.shikimori` with its `_provenance` and `_view` entries plus identifiers, and ReenrichSource runs for plugin `shikimori` followed by a derive pass
- **THEN** the shikimori namespace, its `_provenance` entries, and its `_view` entries are gone, `identifiers` and other plugins' namespaces survive, and the pair re-enriches (a fresh namespace lands)

<!-- wf:probe id=914b286412f19be1 -->
```bash
set -e
go test ./internal/enrich -run TestReenrichSource
```
<!-- /wf:probe -->

#### Scenario: Lease-held rows are retried once and counted, never silently stripped

- **WHEN** a worker holds a scoped row's lease while the sweep runs
- **THEN** the row is counted as deferred, one bounded retry pass re-attempts it, and a row that stays lease-held keeps its namespace intact

<!-- wf:probe id=5e2a4dc4f670dd6f -->
```bash
set -e
go test ./internal/enrich -run TestReenrichSource
```
<!-- /wf:probe -->

#### Scenario: Re-enrich clears the plugin's ledger cooldown

- **WHEN** a scoped pair sits in the failures ledger within its cooldown when the sweep strips it
- **THEN** the ledger row for that plugin is cleared so derivation re-derives the pair immediately, while other plugins' ledger rows keep their cooldowns

<!-- wf:probe id=3d8fea4521127fa9 -->
```bash
set -e
go test ./internal/enrich -run TestReenrichSource
```
<!-- /wf:probe -->

#### Scenario: Joint round trip — an enriched row re-enriches through the real chain

- **WHEN** a library item enriched by the shikimori plugin over a stub HTTP upstream (paced by the per-plugin fetch gate) is re-enriched via ReenrichSource and the running queue drains it
- **THEN** a fresh fetch runs against the stub upstream, a fresh namespace lands, and a prior failure ledger row for the pair is gone

<!-- wf:probe id=c15847567fe4d92a -->
```bash
set -e
go test ./internal/itest -run TestShikimoriJoint
```
<!-- /wf:probe -->

#### Scenario: A failed explicit re-run cools down flat

- **WHEN** a pair re-enriched by an explicit refresh fails terminally, then fails terminally again after a further explicit refresh
- **THEN** each failure records a fresh ledger cooldown at the flat schedule — no doubling across explicit retries — after a full in-memory retry budget, while automatically-triggered failures keep the standard doubling schedule

<!-- wf:probe id=1773ffc2a915df71 -->
```bash
set -e
go test ./internal/enrich -run TestReenrichFlatCooldown
```
<!-- /wf:probe -->

### Requirement: Fresh-boot library registration

On `Start`, the queue SHALL seed its known-library registry from the
store's library list when the in-memory registry is empty, so the initial
derivation sweep covers libraries whose items were persisted by a previous
process (today the sweep only sees libraries registered in this process by
a scan, which makes the restart sweep vacuous on a fresh boot).

#### Scenario: Boot sweep covers libraries persisted before the process started

- **WHEN** the core starts against a store holding items at `pending` from a previous run, with no scan having run in this process
- **THEN** the initial sweep derives and drains those items' pending work

<!-- wf:probe id=8d88afe40e771705 -->
```bash
set -e
go test ./internal/enrich -run TestBootSweep
```
<!-- /wf:probe -->

### Requirement: Parser changes wake derivation

After a successful item-parser attachment or clearing, the api SHALL
invoke a nil-safe `Deps.OnParsersChanged` closure for the affected
library, and the process wiring SHALL connect it to the queue's library
notification, so attached (or removed) parser sources join or leave
derivation without a rescan.

#### Scenario: Attaching parsers enqueues newly-applicable sources without a rescan

- **WHEN** parsers are attached to a library's items through the parser API and the queue is running
- **THEN** the newly-applicable sources are derived and drained without any scan call

<!-- wf:probe id=c307d6069013f76b -->
```bash
set -e
go test ./internal/api -run ParsersChanged
```
<!-- /wf:probe -->

### Requirement: Re-enrichment admin API

The admin API SHALL expose re-enrichment as Deps-closure endpoints
(nil-safe, cmd-wired — the api package stays free of enrich/plugin
imports): `POST /api/v1/libraries/{id}/refresh` with body `{plugin_id`
required, `row_ids?}` returns `202 {queued, stripped, deferred}` on
acceptance; `409` with a `refresh_in_flight` error when a whole-library
sweep for that library is already in flight (per-row refreshes bypass the
guard); `400` for an unknown plugin; `404` for unknown rows. Omitting
`row_ids` means a whole-library sweep. `GET
/api/v1/libraries/{id}/enrich/preview?plugin_id=…` returns `{matches,
pending, cooling, versions}` computed on demand from the stored documents
and the ledger — the consent surface where `versions` is a histogram over
`_provenance` plugin versions (drift is computed, never stored). `GET
/api/v1/enrich/failures` returns the ledger rows with best-effort
`row_kind`/`title` resolved handler-side; rows whose entity is gone from
both tables render `row_kind: "gone"` and are never filtered
(loop-safety rows must stay visible). A plugin version change alone SHALL
trigger nothing automatic — no sweep on any automatic path — so the
preview histogram is the only drift surface until an operator opts in.

#### Scenario: Whole-library refresh returns 202 with counts

- **WHEN** POST /libraries/{id}/refresh names a loaded plugin on a library with enriched rows and no sweep in flight
- **THEN** the response is 202 carrying the strip counts, the stripped rows re-derive, and their statuses move to `pending` while the work drains

<!-- wf:probe id=14f57c1338b8878b -->
```bash
set -e
go test ./internal/api -run LibraryRefresh
```
<!-- /wf:probe -->

#### Scenario: A refresh while a library sweep is in flight returns 409

- **WHEN** a second whole-library refresh arrives while the first sweep for that library is still in flight
- **THEN** the second request gets 409 with a `refresh_in_flight` error, while a per-row refresh (explicit `row_ids`) is not blocked by the guard

<!-- wf:probe id=882854f018329a8b -->
```bash
set -e
go test ./internal/api -run LibraryRefresh
```
<!-- /wf:probe -->

#### Scenario: Unknown plugin or unknown rows are rejected 400/404

- **WHEN** a refresh names a plugin that is not loaded, or `row_ids` naming rows that do not exist in the library
- **THEN** the unknown plugin request gets 400 and the unknown-rows request gets 404, with neither triggering a strip

<!-- wf:probe id=68c80bb605095f04 -->
```bash
set -e
go test ./internal/api -run LibraryRefresh
```
<!-- /wf:probe -->

#### Scenario: Preview reports the consent state for a plugin

- **WHEN** GET /libraries/{id}/enrich/preview?plugin_id=shikimori runs on a library where some rows carry the namespace at mixed plugin versions and one pair sits in the ledger
- **THEN** the response counts matches (namespaced rows), pending (derivable rows), cooling (ledger-held rows), and a `versions` histogram over the `_provenance` plugin versions

<!-- wf:probe id=3d01781627b5cdf6 -->
```bash
set -e
go test ./internal/api -run EnrichPreview
```
<!-- /wf:probe -->

#### Scenario: Version bump alone triggers nothing automatic

- **WHEN** the shikimori plugin binary is replaced with a higher plugin version and the core restarts, with scan, boot, and derivation paths all running
- **THEN** no stored document changes and no sweep starts on any automatic path — the only observable drift is the preview's versions histogram, until an operator explicitly refreshes

UNPROBEABLE — absence of behavior across all automatic paths is a
judgment call confirmed by inspection at the gate, not a single
mechanical probe.

#### Scenario: Failures endpoint lists ledger rows including gone rows

- **WHEN** GET /api/v1/enrich/failures runs with the ledger holding rows for a live item, a live series, and an entity deleted from both tables
- **THEN** all three render — the live rows with their best-effort title and row kind, and the deleted entity as `row_kind: "gone"` — and none is filtered out

<!-- wf:probe id=db7696a0a33a97ab -->
```bash
set -e
go test ./internal/api -run EnrichFailures
```
<!-- /wf:probe -->

#### Scenario: The re-enrichment closures are process-wired nil-safe

- **WHEN** the cmd wiring constructs the pacing gate, the refresh closure (owning the per-library whole-sweep in-flight guard), the preview closure, and the parser-changed hook, and `make build && go vet ./cmd/...` runs from the repo root
- **THEN** the gate exits 0 node-free with the closures wired and no api→enrich/plugin import introduced

<!-- wf:probe id=2e87e40f064499a3 -->
```bash
set -e
make build && go vet ./cmd/...
```
<!-- /wf:probe -->

### Requirement: Operator source gating wakes derivation

Setting a gate (module scope or library scope) to enabled SHALL wake derivation
for the affected libraries through the queue's existing `Notify` — no rescan,
no new lifecycle transitions, no stored-state rewrite; rows already carrying
the source's namespace SHALL derive nothing. Disabling a source SHALL wake
nothing. Drain and settle SHALL consume ONE gate resolution per (pass, row): a
gate flip landing mid-drain SHALL NOT flip the settle verdict until the next
pass, and the extras' synthesized default bindings SHALL pass through the same
resolution as configured ones.

#### Scenario: Enable wakes derivation without a rescan

- **WHEN** a disabled source is re-enabled and the queue wake runs
- **THEN** rows lacking the source's namespace derive it through the normal chain with no scan call, and rows already carrying the namespace derive nothing for that source

<!-- wf:probe id=de17e2ba196a1bbf -->
```bash
set -e
go test ./internal/enrich -run TestGateDerivation -count=1
```
<!-- /wf:probe -->

#### Scenario: Drain and settle share one resolution per pass

- **WHEN** a gate disable lands between a row's drain decision and its settle check within the same pass
- **THEN** the pass settles on the resolution taken at drain — the row is not re-queued for the source mid-pass — and the flip takes effect on the next pass

<!-- wf:probe id=2ba564501bad907f -->
```bash
set -e
go test ./internal/enrich -run TestSettleGateParity -count=1
```
<!-- /wf:probe -->

#### Scenario: Disable wakes nothing

- **WHEN** a source's gate flips to disabled
- **THEN** no derivation wake is scheduled by that write and no pair for that source enters the queue; the source becomes dormant on the next wake some other event causes

UNPROBEABLE — negative wake-absence over async timing is a judgment call, not
machine-checkable in a probe; accepted at review inspection.
