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

### Requirement: Title composition contract (RU-first)

The plugin's namespace title object SHALL remain the stable cross-module
contract that composition consumes: `sources.shikimori.title` carries exactly
the `romaji` and `russian` keys, and the core composer reads `russian` for the
preference code "ru" and `romaji` for "en" (the seeded serial preference is
RU-first). An empty or absent key SHALL floor to the next preference code or
the next title source — never an error, never a placeholder. The plugin SHALL
NOT be gate-aware: operator gating is a core-side concern, and the namespace
bytes are identical whether the source is enabled or dormant.

#### Scenario: The namespace title keys satisfy the preference codes

- **WHEN** the composer walks a shikimori namespace under the seeded RU-first preference and, separately, under an en-only preference
- **THEN** the russian key serves the first and the romaji key the second, and a namespace whose russian key is empty floors to romaji under the seeded preference

<!-- wf:probe id=77e893c0fa607ed6 -->
```bash
set -e
go test ./internal/api -run TestSeriesDisplayName -count=1
```
<!-- /wf:probe -->

### Requirement: Characters cast field (first convention conformer)
On an id-anchored match the `shikimori` plugin SHALL declare the anime roles
endpoint fetch as an extra request in its plan, and SHALL convert the roles
payload into a `cast` array in sources.shikimori per the media-data
convention: one entry per character — `name` the character (russian name
preferred), `role` the free-text voice-actor credit when the character has
one, `photo_url` the character portrait. A roles payload with no usable
entries, or a roles response that never arrived, SHALL leave `cast` absent
from the namespace. Search (unanchored) runs SHALL stay single-fetch
namespaces without cast — cast appears when the run is id-anchored (a stored
shikimori_id from a prior run or an identify override).

#### Scenario: Anchored runs attach the roles fetch

- **WHEN** BuildRequest runs for an id-anchored match and, separately, for a
title search
- **THEN** the anchored plan carries the primary anime fetch plus the roles
endpoint as an extra spec while the search plan carries the primary only

<!-- wf:probe id=6e7a220212cfa040 -->
```bash
set -e
go test ./plugins/shikimori -run TestBuildRequest
```
<!-- /wf:probe -->

#### Scenario: Roles convert into cast entries and absence stays honest

- **WHEN** Convert receives an anchored payload with a roles body carrying
characters and, separately, an anchored payload with no roles body
- **THEN** the first namespace gains the cast array in the convention shape
and the second gains no cast field

<!-- wf:probe id=80dd1e5b5e0c9e1f -->
```bash
set -e
go test ./plugins/shikimori -run TestConvert
```
<!-- /wf:probe -->

### Requirement: Episode titles from the episodes endpoint (ru-first, anchored runs)

On an id-anchored match the `shikimori` plugin SHALL declare the anime
episodes endpoint (`GET /api/animes/{id}/episodes`) as an additional extra
request in its plan — after the roles fetch, under the SAME anonymous-tier
contract as every other fetch (the application User-Agent, the declared
`min_interval_ms`, `{placeholder}` substitution only) — and SHALL convert the
episodes payload into per-episode contributions keyed by the source's episode
number: each usable entry contributes the convention episode `title` only —
the russian name when the entry serves one, else the entry's other served
name — and NEVER a description (the upstream serves none for episodes). An
unfetched extra, an unparsable payload, or an entry with no usable name SHALL
contribute nothing (honest absence — never an empty entry, never a
placeholder). Search runs SHALL stay single-fetch plans that declare no
episodes extra and carry no contributions. Match on episode documents remains
not-applicable: titles reach episode documents only through the core's
routing of the series run.

#### Scenario: Anchored runs attach the episodes fetch after roles

- **WHEN** BuildRequest runs for an id-anchored match and, separately, for a
title search
- **THEN** the anchored plan carries the primary anime fetch plus TWO extra
specs — the roles endpoint first, the episodes endpoint second, both with the
application User-Agent and the 700 ms pacing — while the search plan carries
the primary only

<!-- wf:probe id=c5a5d6505bb867da -->
```bash
set -e
go test ./plugins/shikimori -run TestBuildRequestEpisodeExtra -count=1
```
<!-- /wf:probe -->

#### Scenario: Entries convert into ru-first titles and absence stays honest

- **WHEN** Convert receives an anchored payload whose episodes extra carries
named entries and, separately, an anchored payload with no episodes body, an
unparsable one, or entries without usable names
- **THEN** the first result carries one contribution per usable entry keyed
by the entry's episode number with the russian name as the title, and the
others carry no contributions at all

<!-- wf:probe id=f8b73dab6bf14ee3 -->
```bash
set -e
go test ./plugins/shikimori -run TestConvertEpisodeTitles -count=1
```
<!-- /wf:probe -->

#### Scenario: Search runs stay without episodes or contributions

- **WHEN** Convert receives a search-list payload (no anchoring id)
- **THEN** the result carries no per-episode contributions and the series
namespace is exactly the single-fetch shape that exists today

<!-- wf:probe id=439778713f5390b2 -->
```bash
set -e
go test ./plugins/shikimori -run TestConvert -count=1
```
<!-- /wf:probe -->
