## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Lifecycle states ready and stale
The lifecycle state machine SHALL accept `enriched --settled--> ready` (all of the item's queueable sources terminal), `* --stale--> stale`, `stale --rehydrate--> pending`, and SHALL exercise `failed --retry--> pending`. An explicit source re-enrichment SHALL additionally accept `ready --refresh--> pending` and `enriched --refresh--> pending`, applied to exactly the rows whose namespaces the sweep stripped, so `pending` stays a truthful will-fetch signal (today a refresh can never move a status). Illegal transitions (e.g. `ready --parsed-->`) SHALL be rejected; new statuses SHALL list via the unchanged `GET /api/v1/items?status=` passthrough.

#### Scenario: Item settles to ready after drain
- **WHEN** every queueable source of an enriched item reaches a terminal outcome (namespace written, in cooldown, or ran-but-produced-no-work)
- **THEN** the item advances to `ready` and is listable via `?status=ready`

#### Scenario: Changed file re-scan marks stale
- **WHEN** a re-scan detects a file's base identity changed since its last good scan
- **THEN** the item advances `stale → pending` for re-enrichment, while an unchanged re-scan preserves the prior status (a `ready` item is not regressed)

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
