# Spec Delta

## ADDED Requirements

### Requirement: Series-run episode-title routing

When a SERIES row's source run converts per-episode contributions, the worker
SHALL route each entry onto the series' episode documents: an episode
document whose parsed episode facts — any namespace carrying BOTH season and
episode as integers, the same namespace-agnostic read the display composer
uses — match the entry (the series' own season fact, the entry's episode
number) gains the entry's fields as `sources.<plugin_id>` plus the standard
`_provenance` and `_view` stamps naming the source. The write SHALL run under
that episode row's own lease (the workers' primitive, non-blocking); rows
whose lease is held SHALL be counted and re-attempted in one bounded retry
pass, and a row that stays held keeps its document intact. An episode
document with no matching entry SHALL be untouched. Routing SHALL be
best-effort: a series run with contributions but no matching episode
documents SHALL still succeed and settle exactly as before. Routing SHALL
NOT touch lifecycle states, the derivation predicates, or Match — episode
documents still never match series-level sources at Match, and their own
`<item, plugin>` pairs stay skipped stages (a routed namespace makes the
pair terminal through the unchanged has-namespace gate).

#### Scenario: Series-run routing writes matched episode titles

- **WHEN** a series row's anchored run converts episode-title entries and the
series' episode documents carry matching (season, episode) facts
- **THEN** each matched episode document gains `sources.shikimori` carrying
the entry's title with `_provenance` and `_view` entries naming shikimori,
and the series row settles unchanged

<!-- wf:probe id=217507cd10a37e00 -->
```bash
set -e
go test ./internal/enrich -run TestEpisodeTitleRouting -count=1
```
<!-- /wf:probe -->

#### Scenario: A season or number mismatch stays untouched

- **WHEN** an episode document's facts name a season or episode number no
entry matches
- **THEN** the document carries no shikimori namespace afterwards and the
run reports no failure

<!-- wf:probe id=afdda99a67ca59e7 -->
```bash
set -e
go test ./internal/enrich -run TestEpisodeTitleRouting -count=1
```
<!-- /wf:probe -->

#### Scenario: A lease-held episode row is deferred and retried once

- **WHEN** a worker holds an episode row's lease while the series run's
routing writes
- **THEN** the row is counted and re-attempted once after a short delay, and
a row that stays held keeps its document byte-identical

<!-- wf:probe id=34316033f7b252f0 -->
```bash
set -e
go test ./internal/enrich -run TestEpisodeTitleRouting -count=1
```
<!-- /wf:probe -->

#### Scenario: No routing without a series-run namespace

- **WHEN** a series run converts no per-episode entries (a search run, an
unfetched episodes extra, or a run that skipped)
- **THEN** no episode document changes and the run settles exactly as the
chain always has

<!-- wf:probe id=8144f0e26163002c -->
```bash
set -e
go test ./internal/enrich -run TestEpisodeTitleRouting -count=1
```
<!-- /wf:probe -->

## MODIFIED Requirements

### Requirement: Explicit source re-enrichment

The queue SHALL expose `ReenrichSource(ctx, libraryID, pluginID, rowIDs...)`
for an explicit, operator-triggered refresh of one plugin's namespace: for
each scoped row, acquired under that row's own lease (non-blocking, the
same primitive the workers use), it SHALL purge `doc.sources.<pluginID>`,
the `_provenance` entries with `plugin_id == pluginID`, and the `_view`
entries with `source == pluginID`, then persist. The purge SHALL NEVER
touch `doc.identifiers` (the id anchor) or any other plugin's namespace,
and SHALL be structurally unable to reach `title_overrides` (a separate
control table). Explicit rowIDs naming a SERIES row SHALL scope that row's
episode items as well — a routed `sources.<pluginID>` on an episode
document is the series run's side-output and refreshes with the series'
strip; a whole-library sweep already scopes every item and series row
carrying the plugin's namespace. It SHALL call `ClearFailure` for the swept
plugin on every stripped row (the cooldown bypass for explicit actions —
automatic paths never bypass). Rows skipped because a worker held the lease
SHALL be counted and re-attempted in one bounded retry pass (persist is
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

#### Scenario: A series strip cascades to its routed episode titles

- **WHEN** ReenrichSource names a series row for plugin `shikimori` while
that series' episode documents carry routed `sources.shikimori` titles
- **THEN** the episode documents' shikimori namespaces, `_provenance`, and
`_view` entries strip alongside the series row's, identifiers and other
plugins' namespaces survive on every stripped row, and the notified library
re-derives so the fresh series run rewrites the titles

<!-- wf:probe id=a8b4d13d3800d62a -->
```bash
set -e
go test ./internal/enrich -run TestReenrichSourceSeriesCascade -count=1
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
