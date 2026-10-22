# Spec Delta

## Purpose

The unified media-data field convention: every metadata_source plugin writes
the same human-readable field names into its own `sources.<plugin_id>`
namespace, convention groups merge whole by the module's gate-resolved chain
priority (never stitched across sources), and an absent field means an absent
UI block — never fabricated data. This is the contract every current and
future source (shikimori, TMDB, Kinopoisk, TVDB…) obeys so the UI reads
fields, never sources, and any new source connects with zero UI edits.

## ADDED Requirements

### Requirement: Unified media-data field convention
Every metadata_source plugin SHALL write its human-readable media data into
its own `sources.<plugin_id>` namespace using the convention field names,
identical across sources. Series/film documents SHALL use: `title` (object
carrying optional `romaji` and `russian`), `description`, `genres` (array),
`score`, `kind`, `status`, `episodes`, `aired_on`, `poster`, `url`. Episode
documents SHALL use `title` (the episode's own name) and `description` (the
episode's own summary) — the episode's own data only; show-level metadata
stays on the series document (the serial-library rule is unchanged). Every
source that provides people data SHALL use `cast` — an array of entries each
carrying `name` (string, required), optional `role` (free text), and optional
`photo_url` — one entry per displayed person-or-character row: a
character-led source puts the character in `name` and its voice actor in
`role`; an actor-led source puts the actor in `name` and the character in
`role`. A field the upstream does not provide SHALL be absent from the
namespace — never an empty string, zero, or placeholder.

#### Scenario: A conforming namespace carries the convention fields

- **WHEN** the shikimori plugin converts an anime payload into its namespace
- **THEN** the namespace carries title (romaji and russian), description,
genres, score, kind, status, episodes, aired_on, poster, and url under
sources.shikimori, and an upstream value that is missing leaves its field
absent rather than empty

<!-- wf:probe id=45686cc316939b34 -->
```bash
set -e
go test ./plugins/shikimori -run TestConvert
```
<!-- /wf:probe -->

#### Scenario: cast entries carry name with optional role and portrait

- **WHEN** the roles payload pairs characters with their voice actors
- **THEN** the namespace cast array carries one entry per character — name
the character, role the free-text voice actor credit, photo_url the character
portrait — and a character with no voice actor carries name alone

<!-- wf:probe id=14fcc2325ac68199 -->
```bash
set -e
go test ./plugins/shikimori -run TestConvert
```
<!-- /wf:probe -->

#### Scenario: An episode document's own fields surface as the episode block

- **WHEN** an episode document carries sources.<plugin_id> title or
description and the element is served
- **THEN** the served element exposes them as the episode block taken whole
from that namespace, and an episode document carrying neither serves no
episode block

<!-- wf:probe id=3d32e54aab6446f0 -->
```bash
set -e
go test ./internal/api -run TestMetadataProjection
```
<!-- /wf:probe -->

### Requirement: Group-integrity merge by chain priority
Convention groups — the synopsis group (a `description` with its `genres`,
`score`, `kind`, `status`, `episodes`, and `aired_on` facts), the cast group
(`cast`), and the episode group (`title` with `description` on an episode
document) — SHALL resolve WHOLE from the FIRST effectively-enabled source in
the module's gate-resolved chain whose namespace carries the group; consumers
SHALL never combine members of one group from different sources. The library
surfaces SHALL carry the gate-resolved chain as an additive `source_chain`
list (`{id, enabled}` pairs in chain order, the same priority machine as
title_sources) so resolution order is served data, never document key order.
A group its winning namespace carries only partially SHALL serve with just
the members that namespace has.

#### Scenario: The first chain source carrying the group wins whole

- **WHEN** two effectively-enabled namespaces both carry a description and
the chain orders the first before the second
- **THEN** the served synopsis group is the first namespace's description
with ITS facts riding along, and no member of the second namespace appears
in the served group

<!-- wf:probe id=b138c9d1b7c48bee -->
```bash
set -e
go test ./internal/api -run TestMetadataProjection
```
<!-- /wf:probe -->

#### Scenario: The served chain is the gate-resolved order

- **WHEN** the library surfaces answer for a library whose module binds its
sources in a known order with one source gate-muted
- **THEN** the presentation's source_chain lists every bound source in chain
order and the muted one carries enabled false

<!-- wf:probe id=8dd8ab3215581b83 -->
```bash
set -e
go test ./internal/api -run TestSourceChainPresentation
```
<!-- /wf:probe -->

#### Scenario: A gate-disabled source never wins a group

- **WHEN** the chain's first source is gate-disabled and a later
effectively-enabled namespace carries the group
- **THEN** the later enabled namespace wins the group

<!-- wf:probe id=f905406dccf9b5b4 -->
```bash
set -e
go test ./internal/api -run TestMetadataProjection
```
<!-- /wf:probe -->

#### Scenario: A group serves with only the members its winner carries

- **WHEN** the winning synopsis namespace carries a description but no
genres while a later namespace in the chain carries genres
- **THEN** the served synopsis group carries no genres rather than the later
namespace's

<!-- wf:probe id=071722692df7dc5b -->
```bash
set -e
go test ./internal/api -run TestMetadataProjection
```
<!-- /wf:probe -->

### Requirement: Honest absence
When no effectively-enabled source namespace carries a convention group, the
served element SHALL omit that group entirely — the served metadata block
carries no empty about object, no empty cast array, and no empty episode
object. Provenance for served convention fields SHALL stay readable from the
stored document's existing per-field `_provenance` (no new provenance
machine); the served block names the winning namespace so the footer's
who-wrote-what stays traceable.

#### Scenario: No carrier means no block

- **WHEN** an element's document carries no description, cast, or episode
fields in any effectively-enabled namespace
- **THEN** the served element carries none of the about, cast, or episode
blocks

<!-- wf:probe id=36bd6a49704920f7 -->
```bash
set -e
go test ./internal/api -run TestMetadataProjection
```
<!-- /wf:probe -->

### Requirement: Consumers resolve convention groups through the served projection
The SPA's convention-group consumers SHALL read the served metadata blocks
instead of walking `sources` namespaces client-side: the About panel renders
the served about block — an episode renders its series', any other element
its own — and the client-side group-walk derivation retires from those
surfaces.

#### Scenario: The About panel consumes the served projection

- **WHEN** the element page and the collection page render their About
panels
- **THEN** both consume the served about block and the client-side
description-walking derivation no longer exists in the component

<!-- wf:probe id=aa0a7a63c5580d45 -->
```bash
set -e
grep -q "about" web/src/components/metadata/Synopsis.tsx
if grep -qE "sourcesOf|synopsisOf" web/src/components/metadata/Synopsis.tsx; then exit 1; fi
```
<!-- /wf:probe -->

### Requirement: The convention holds across the pipeline
End to end — a source run through the core onto a stored document, served
back through the element surfaces — the served blocks SHALL match the stored
namespaces: a conforming run's synopsis and cast surface as about and cast
naming the winning source, an episode fixture's fields surface as the
episode block, and an element with no carriers serves none.

#### Scenario: The joint enrich-to-serve path carries the convention

- **WHEN** a series enriches through the conforming source against a stub
upstream and the stored document, plus an episode fixture document, are
served through the element surfaces
- **THEN** the series serves its about and cast blocks naming the source,
the episode serves its episode block, and an element document with no
convention carriers serves none of them

<!-- wf:probe id=fb9511dbf7bcf5e2 -->
```bash
set -e
go test ./internal/itest -run TestQAMediaDataJoint
```
<!-- /wf:probe -->
