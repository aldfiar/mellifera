# Spec Delta

## ADDED Requirements

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
