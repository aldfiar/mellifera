# shikimori-enrichment Specification

## Purpose
Adds shikimori.io (the Russian anime database) as an anonymous metadata
source for anime films and series: a `shikimori` plugin implements the
four-RPC MetadataSource chain over the core-executed fetch, the serial
module seed gains the shikimori binding and its first display block, and
re-enrichment of the plugin's namespace happens only on explicit operator
opt-in.

## Requirements

### Requirement: Document-shape match dispatch

The `shikimori` plugin SHALL decide applicability from the parsed document
shape alone (no media-type literal inside the plugin's decision): a serial
record (a parsed series row carrying a display title and a season, without
an episode number) SHALL apply via an anime search on the display title,
with the season carried in the query for disambiguation; a film-parsed
document (a title with no season and no episode keys) SHALL apply via a
movie-kind search; an episode document (season + episode keys) SHALL NOT
apply. When the document identifiers carry a `shikimori_id`, the plugin
SHALL re-match anchored on that id (id lookup) instead of a fuzzy search.

#### Scenario: Serial row matches by display title

- **WHEN** Match receives a serial-record document carrying a display title and a season, with no episode key and no stored shikimori identifier
- **THEN** the result applies with a query built from the display title plus the season (for candidate disambiguation), and it does not use the movie-kind search path

<!-- wf:probe id=e4d64331393b8a32 -->
```bash
set -e
go test ./plugins/shikimori -run TestMatch
```
<!-- /wf:probe -->

#### Scenario: Episode documents never match

- **WHEN** Match receives a document carrying both season and episode keys
- **THEN** the result does not apply and no query is built

<!-- wf:probe id=8eea069323a792a1 -->
```bash
set -e
go test ./plugins/shikimori -run TestMatch
```
<!-- /wf:probe -->

#### Scenario: A stored shikimori id anchors the re-match

- **WHEN** Match receives a document whose identifiers carry `shikimori_id: 12345`
- **THEN** the plugin prepares an id-anchored lookup of anime 12345 instead of a title search, and the result reason records the anchor (e.g. "matched by shikimori_id 12345")

<!-- wf:probe id=4d58cf2661db3504 -->
```bash
set -e
go test ./plugins/shikimori -run TestMatch
```
<!-- /wf:probe -->

### Requirement: Anonymous API request contract

The `shikimori` plugin SHALL run on the anonymous API tier: every request
spec it builds SHALL carry a User-Agent header naming the application
(shikimori.io bans default or library User-Agents), SHALL declare
`min_interval_ms = 700` (the 90-requests-per-minute anonymous cap), and
SHALL carry no secret material (`required_secrets` empty — server-side
anonymous fetch). An anchored match SHALL build `GET /api/animes/{id}`; a
non-anchored match SHALL build the anime search request with the title and
a bounded result page.

#### Scenario: BuildRequest carries the app User-Agent and the 700 ms interval

- **WHEN** BuildRequest produces the request spec for any shikimori fetch
- **THEN** the spec carries a User-Agent header naming the application (never a default or library User-Agent), declares `min_interval_ms` 700, and references no secret variables

<!-- wf:probe id=f4a7aefbf5037d8b -->
```bash
set -e
go test ./plugins/shikimori -run TestBuildRequest
```
<!-- /wf:probe -->

#### Scenario: Anchored and search fetches target the anime endpoints

- **WHEN** BuildRequest runs for an id-anchored match and, separately, for a title search
- **THEN** the anchored spec targets `GET /api/animes/{id}` and the search spec targets the anime search endpoint with the title and a bounded page size — both via {placeholder} substitution only

<!-- wf:probe id=0a165a454b262a64 -->
```bash
set -e
go test ./plugins/shikimori -run TestBuildRequest
```
<!-- /wf:probe -->

### Requirement: RU-first conversion namespace

The `shikimori` plugin SHALL convert a raw anime payload into a RU-first
namespace under `sources.shikimori` carrying: `title` (romaji and russian),
`kind`, `status`, `episodes`, `aired_on`, `description`, `genres`, `score`,
`url`, `poster`; it SHALL report `resolved_ids: {shikimori_id}` on the
selected candidate and carry `plugin_version` + `source_url` provenance
hints (the core stamps provenance authoritatively). Candidate selection
SHALL prefer the candidate agreeing with the parsed year, the
movie/series kind, and the episode count; missing signals degrade the
selection instead of erroring.

#### Scenario: Convert maps the shikimori payload into the RU-first namespace

- **WHEN** Convert receives a raw shikimori anime payload and the query it answered
- **THEN** the result's metadata carries the RU-first namespace fields listed above, `resolved_ids` names `shikimori_id`, and the provenance hints carry `plugin_version` and `source_url`

<!-- wf:probe id=2f6be9881ac2a6ff -->
```bash
set -e
go test ./plugins/shikimori -run TestConvert
```
<!-- /wf:probe -->

#### Scenario: Candidate selection prefers year, kind, and episode-count agreement

- **WHEN** the search payload holds several anime candidates for one query
- **THEN** the selected candidate is the one agreeing with the parsed year, the movie/series kind, and the episode count, and a payload with no agreeing candidate still yields a deterministic, non-erroring selection

<!-- wf:probe id=398215deb9166383 -->
```bash
set -e
go test ./plugins/shikimori -run TestConvert
```
<!-- /wf:probe -->

### Requirement: Serial module seed v2

The core SHALL promote the serial module config to `schema_version` 2 by a
guarded, idempotent `UPDATE … WHERE id='serial' AND schema_version < 2`
run after the `INSERT OR IGNORE` seed (the ignore alone never rewrites an
existing row), adding the `shikimori` metadata-source binding (capability
`default`, priority 3, enabled, no `auth_mode` — queueable) after
serial-parser (1) and frame-grabber (2), and the serial module's first
display block: RU-first language preference with shikimori in the title
and rating source priorities. The promotion SHALL touch no other module
row, and the display block SHALL be consumed by the existing SPA config
path with no Go renderer change.

#### Scenario: Fresh install seeds the v2 serial chain with shikimori and a display block

- **WHEN** a fresh store opens and the serial module's config is resolved
- **THEN** the config binds the ordered metadata chain serial-parser, frame-grabber, shikimori at priorities 1–3 with shikimori enabled and carrying no auth_mode, and carries a display block with RU-first language preference and shikimori present in both the title and rating source priorities

<!-- wf:probe id=eb6f83a0598b609d -->
```bash
set -e
go test ./internal/module -run TestSerialModuleSeedV2
```
<!-- /wf:probe -->

#### Scenario: A v1 serial row upgrades to v2 idempotently

- **WHEN** the registry opens against a store pre-seeded with the v1 serial module row, and then opens again
- **THEN** the first open rewrites the row to the v2 config with `schema_version` 2, the second open changes nothing further, and no other module row is touched

<!-- wf:probe id=9dd0e093aa9688c7 -->
```bash
set -e
go test ./internal/module -run TestSerialModuleV1Upgrade
```
<!-- /wf:probe -->

#### Scenario: The change's full Go gate stays green

- **WHEN** the change's Go gate runs from the repo root — `make build check test lint`
- **THEN** it exits 0 node-free

<!-- wf:probe id=ebd254ceacffd32c -->
```bash
set -e
make build check test lint
```
<!-- /wf:probe -->
