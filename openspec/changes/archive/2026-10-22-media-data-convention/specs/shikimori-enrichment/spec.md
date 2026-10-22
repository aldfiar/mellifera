# Spec Delta

## ADDED Requirements

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
