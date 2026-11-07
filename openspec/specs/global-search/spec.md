# global-search Specification

## Purpose
Let viewers find any title by typing — including Cyrillic and alternate names
— without walking collections, served from a composed-name index whose match
decision never changes the display bytes a row renders.

## Requirements

### Requirement: Global search endpoint

The API SHALL expose `GET /api/v1/search` (browse group, admin+client) with
optional `q`, `library`, and `limit` query params, returning grouped results
`{"series":[…], "items":[…]}` — each group bounded at 8 entries (server-ranked,
no pagination). An empty or absent `q` SHALL return 200 with both lists empty
(browsing is the facets' job). A query matching nothing SHALL return 200 with
empty lists, never an error. Search SHALL cover media libraries only — photo
libraries are excluded in v1. When `library` is present, results SHALL be
scoped to that library; when absent, all media libraries are searched.
Results SHALL be visibility-conjunct to the calling viewer — hits in
libraries outside the caller's visible set are never served, nor do they
leak existence through names or counts — and served names SHALL mute
through the caller's `ChainMutes` exactly as every other browse-group route
mutes.

#### Scenario: Cyrillic query matches across case and ё/е

- **WHEN** a series composes the served name «Ария» and the operator queries
  "ариЯ" or "ария"
- **THEN** the series is returned in the `series` group, matched through the
  shared Unicode fold plus the bidirectional ё→е fold applied identically at
  index-write and query-time

#### Scenario: Alternate-name recall

- **WHEN** a ru-preference module composes «Ария» from the russian title while
  the romaji title "Aria" went unpicked by the walk
- **THEN** querying "aria" still finds the series through its indexed
  alternate names, ranked below any composed-name match

#### Scenario: Empty query is an empty success

- **WHEN** `GET /api/v1/search` is called with no `q` (or an empty one)
- **THEN** the response is 200 with `series: []` and `items: []`

#### Scenario: Scoped search

- **WHEN** `GET /api/v1/search?q=<q>&library=N` is called and the only name
  match lives in library M
- **THEN** the response carries no entries from library M, and the same query
  without `library=` returns it

#### Scenario: No match is not an error

- **WHEN** the query matches no composed or alternate name in scope
- **THEN** the response is 200 with both groups empty — no 404, no error body

### Requirement: Composed-name matching tiers

Search SHALL match against the COMPOSED served names (override → title walk →
parser title → dir-name floor, exactly what display_name serves) plus the
title walk's unpicked alternates — never against the `display_title` generated
column, which misses overrides, template composition, and the walk. Matches
SHALL rank by tiers: composed-name prefix, then composed-name substring, then
alternate-name match; ties SHALL break alphabetically by served display_name
ascending, then id. The `s01e02` episode grammar SHALL be accepted in item
queries. A stale index MAY degrade recall; it MUST NOT change any served
display byte — the handler SHALL map matched ids to live rows and compose
names fresh at request time.

#### Scenario: Tiers rank prefix above substring above alternate

- **WHEN** one series' composed name starts with the query, another contains
  it mid-name, and a third only matches by an alternate name
- **THEN** the served order is prefix first, substring second, alternate
  third, alphabetical within a tier

#### Scenario: The override name is what matches

- **WHEN** an operator renames a series via a title override and then searches
  for the new name
- **THEN** the series matches under its composed (overridden) name, and the
  pre-override name no longer ranks as a composed-name match

#### Scenario: The backstop keeps display honest

- **WHEN** a row is served from a hit taken against a not-yet-reconciled index
- **THEN** the row still renders the LIVE composed display name and artwork —
  the stale index can only have missed or mis-ranked the hit, never falsified
  a name

### Requirement: Index freshness

The search index SHALL be built once at boot, synchronously before the server
accepts requests (the janitor boot-run). It SHALL be rebuilt or reconciled:
immediately on a title-override PUT or DELETE and on identify (a poke that
fires on DELETE too); within one rebuild after a scan completes; and within
60 s for enrichment merges, source-gate flips, and naming-config drift —
detected by a two-part scalar epoch (max updated_at + row count) so deletes
converge too. Recall lag after config-driven changes is bounded at one 60 s
tick by design; display bytes never lag.

#### Scenario: Rename reflects immediately

- **WHEN** a title override is PUT (or DELETEd) and the operator searches for
  the affected name right after
- **THEN** the search reflects the change without waiting for a tick

#### Scenario: A gate flip converges within one tick

- **WHEN** a source gate is disabled and 60 s elapse
- **THEN** names that source contributed have left the index's match surface,
  while rows already served during the window still displayed their live names

#### Scenario: A delete converges through the epoch

- **WHEN** series rows are deleted without any remaining updated_at bump
- **THEN** the row-count leg of the epoch trips and the index rebuilds within
  one 60 s tick, dropping the deleted entities from search
