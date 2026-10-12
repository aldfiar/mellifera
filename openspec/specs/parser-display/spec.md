# parser-display Specification

## Purpose

Makes parser output presentation config-driven and per-element controllable:
module config declares each parser's ordered `display_fields` and each
module's `identity_fields`, and the element page renders an identity block
plus a metadata footer grouped in the collection's parser-chain order.
Operators may reorder a collection's parser chain (footer group order and
enrichment queue priority follow it) and attach extra parsers to individual
elements without touching siblings; attached sources join the enrichment
queue under the same D-Q1 rule as chain sources. The core never hardcodes
field, provider, or media-type literals — display is declared, not coded
(AC-4). Archived from change element-pages.

## Requirements

### Requirement: Parser display-field declaration

Module config SHALL carry an ordered `display_fields` declaration per parser
binding (scanner and `metadata_source` alike), and each module SHALL carry
`identity_fields` — the mandatory fields that identify an element of that
type. The core SHALL NOT hardcode field names, provider names, or media-type
literals outside module seed config (AC-4). Seeds SHALL ship for the loaded
modules: `base-scanner` (container, duration, video, audio, size),
`tv-parser` (title, year, resolution, parsed_from),
`serial-parser` (display_title, season_episode, parsed_from), `frame-grabber`
(thumbnail, grabbed_at), `image-enricher` (date_taken, camera, dimensions,
gps) — where `camera` renders as make + model, `dimensions` as width×height,
`season_episode` renders as "Season N · Episode M" from the season and
episode facts (the season part alone as "Season N" when the episode fact is
absent), and `thumbnail`/`grabbed_at` resolve from the frame-grabber
namespace;
`identity_fields`: tv = title, year; serial = display_title, season,
episode; image = date_taken.

#### Scenario: The footer order is the parser's declared order

- **WHEN** a film's `sources["tv-parser"]` carries title, year, resolution, and parsed_from in any JSON key order
- **THEN** the element page footer renders that group's pairs exactly in the declared order title → year → resolution → parsed_from

<!-- wf:probe id=285e0cf7ae7d58d6 -->
```bash
set -e
grep -q "display_fields" internal/module/registry.go
grep -q "tv-parser" internal/module/registry.go
grep -q "resolution" internal/module/registry.go
go build ./...
```
<!-- /wf:probe -->

#### Scenario: Composite labels resolve from namespace facts

- **WHEN** an image document carries make, model, width, and height in `sources["image-enricher"]`
- **THEN** the footer's camera pair renders make + model joined and the dimensions pair renders width×height, values verbatim from the namespace

<!-- wf:probe id=c91674ddc94d4640 -->
```bash
set -e
test -f web/src/components/metadata/ParserFooter.tsx
grep -qE "make|model" web/src/components/metadata/ParserFooter.tsx
grep -qE "width|height" web/src/components/metadata/ParserFooter.tsx
```
<!-- /wf:probe -->

#### Scenario: Season and episode render as the human episode badge

- **WHEN** a serial episode document carries season 2 and episode 1 in `sources["serial-parser"]`, and a series document in the same collection carries only a season
- **THEN** the serial-parser footer group renders the `season_episode` pair as "Season 2 · Episode 1" on the episode and "Season 2" on the series, while the identity badges and the SxxEyy eyebrow render unchanged

<!-- wf:probe id=efa169055d999c81 -->
```bash
set -e
grep -q "season_episode" internal/module/registry.go
grep -q "season_episode" web/src/components/metadata/ParserFooter.tsx
go test ./internal/module -run TestSerialModuleSeed
```
<!-- /wf:probe -->

### Requirement: Identity block per module

The element page SHALL render the element's name as the primary identity and
the module's `identity_fields` as the mandatory identity badges, resolved
`_view`-first then across `sources` namespaces with per-field provenance.
An identity field with no value in the document SHALL render an explicit
slot state naming the missing field and its remedy — never a blank, never a
fabricated value.

#### Scenario: Film identity renders title and year

- **WHEN** the operator opens a film whose `_view` carries title and year
- **THEN** the identity block shows the element name as the heading with title's value and year rendered as the mandatory badges beside the core facts

<!-- wf:probe id=1cc4bb449c22a0e1 -->
```bash
set -e
grep -q "identity_fields" web/src/lib/api.ts
grep -q "identity" web/src/pages/browse/ItemDetail.tsx
```
<!-- /wf:probe -->

#### Scenario: Missing mandatory field renders a slot

- **WHEN** the operator opens a serial episode whose document carries season and episode facts but no episode-name source
- **THEN** the identity block renders the series and SxxEyy eyebrow, stands in the derived episode number as the heading, and shows a slot naming the missing episode name instead of a blank

<!-- wf:probe id=afad16ae58c19414 -->
```bash
set -e
grep -q "slot" web/src/components/metadata/ParserFooter.tsx
grep -qiE "episode.?name|naming" web/src/pages/browse/ItemDetail.tsx
```
<!-- /wf:probe -->

### Requirement: Metadata footer rendering

The element page SHALL render a metadata footer below the identity block:
one group per attached parser in **chain priority order**, each group
carrying the parser pill and rendering that parser's `display_fields` order
as label/value pairs resolved verbatim from that parser's
`sources.<plugin_id>` namespace. Pairs whose field is absent SHALL be
skipped silently (soft-fail posture). A parser with no displayable fields
renders its pill only. Seeded-but-unloaded providers SHALL render as empty
slot groups in their chain position. Element-only parsers (see the
element-only attachment requirement) render groups after the chain,
pill-marked as element-only. Namespaces are never merged and values are
never reshaped; per-field provenance stays available in Technical details.

#### Scenario: Groups render in chain order with element-only last

- **WHEN** the operator opens a series in a collection chaining serial-parser, with tmdb seeded-but-unloaded, and anitomy attached element-only
- **THEN** the footer renders the serial-parser group, an empty tmdb slot group at its chain position, and the anitomy group after the chain marked element-only

<!-- wf:probe id=a01c342b67758ff2 -->
```bash
set -e
grep -q "extra_parsers" web/src/lib/api.ts
grep -q "ParserFooter" web/src/pages/browse/ItemDetail.tsx
grep -qiE "element.only" web/src/components/metadata/ParserFooter.tsx
```
<!-- /wf:probe -->

#### Scenario: Absent fields are skipped, not zeroed

- **WHEN** the operator opens a scanned 1989 photo whose `sources["image-enricher"]` carries only width, height, and format
- **THEN** the image-enricher footer group renders the dimensions pair alone while taken, camera, and gps pairs are absent, and the identity slot shows the year

<!-- wf:probe id=8fc084d8ee58d4aa -->
```bash
set -e
grep -qE "hidden|skip" web/src/components/metadata/ParserFooter.tsx
grep -q "ParserFooter" web/src/pages/browse/ItemDetail.test.tsx
```
<!-- /wf:probe -->

### Requirement: Collection parser chain editing

`PATCH /api/v1/libraries/{id}` SHALL accept an optional ordered `parsers`
array (plugin ids) that replaces the collection's parser chain — the module
seed's chain being the default when the field is absent. The parser order
SHALL define both the footer group order and the enrichment queue priority
for collection-common sources. The endpoint SHALL reject with 400 an unknown
plugin id, a plugin not serving a capability the module binds, an empty
array, and — unchanged — `root_path`/`module_id`; an absent `parsers` field
SHALL change nothing; identity fields stay immutable.

#### Scenario: Reordering the chain reorders the footer

- **WHEN** the admin PATCHes a photo collection's parsers to a new order and opens one of its photos
- **THEN** the footer groups render in the new order and the queue drains the collection's sources at the new priority

<!-- wf:probe id=b3d338bc6e3874c4 -->
```bash
set -e
grep -q "parsers" internal/api/handlers.go
grep -q "parsers" internal/api/router.go
go build ./...
```
<!-- /wf:probe -->

#### Scenario: Chain validation rejects what cannot run

- **WHEN** the admin PATCHes parsers containing an unknown plugin id, a capability the module does not bind, or an empty array
- **THEN** the API answers 400 with a canonical error body and the stored chain is unchanged

<!-- wf:probe id=f4e6e8eda34ef919 -->
```bash
set -e
grep -q "400" internal/api/handlers.go
grep -q "parsers" internal/api/libraries_test.go
```
<!-- /wf:probe -->

### Requirement: Element-only parser attachment

The API SHALL accept `PUT /api/v1/items/{id}/parsers` with an ordered
`parsers` array (full replacement) and `DELETE /api/v1/items/{id}/parsers`
in the admin role group, storing attachments in an `item_parsers` control
table keyed by `(item_id, plugin_id)`. Attachments SHALL survive re-scans
(they die only with the item's identity on re-identify), SHALL never apply
to sibling items, and SHALL be surfaced additively as `extra_parsers` on
`GET /api/v1/items/{id}`. Unknown item → 404; unknown or capability-
mismatched plugin → 400.

#### Scenario: The anime exception

- **WHEN** the admin attaches anitomy to one series of the anime collection via `PUT /items/{id}/parsers` and opens it, then opens a sibling series
- **THEN** the attached series' footer gains the anitomy group after the chain marked element-only while the sibling's footer is unchanged

<!-- wf:probe id=d9da15ad9ea78699 -->
```bash
set -e
grep -q "items/{id}/parsers" internal/api/router.go
test -f internal/store/item_parsers.go
go build ./...
```
<!-- /wf:probe -->

#### Scenario: Attachments survive re-scans and die with identity

- **WHEN** the collection is re-scanned (same root), and separately when a different item's attachment is inspected after a root move re-identifies it
- **THEN** the re-scanned item keeps its element-only parser and its footer group, while re-identification removes attachments together with the old item rows

<!-- wf:probe id=1d262fc42ed96151 -->
```bash
set -e
grep -q "SetItemParsers" internal/store/item_parsers.go
grep -qiE "rescan|re.?scan" internal/itest/*parser* internal/itest/*element* 2>/dev/null || grep -rqiE "rescan|re.?scan" internal/itest
```
<!-- /wf:probe -->

### Requirement: Element-attached sources join the enrichment queue

The async queue derivation SHALL include `(item, element-attached plugin)`
work for every attached source whose `auth_mode != "CLIENT"` (the D-Q1
rule), flowing through the same leases, retries, ledger, and cooldowns as
chain sources; the sync `Enrich` chain SHALL honor extras identically. A
CLIENT-locked source attached to an item SHALL NOT be queued (Mode-B only).
Writes land as the source's own namespace (`sources.<plugin_id>`) with the
standard `_provenance`/`_stages` trail — element attachment changes who is
queued, not how a source writes.

#### Scenario: An element-attached local parser enriches asynchronously

- **WHEN** anitomy (local, empty auth_mode) is attached to one series and the scan completes
- **THEN** the queue drains `(item, anitomy)`, `sources["anitomy"]` appears in the document with provenance, and the item settles ready

<!-- wf:probe id=5fb5840b18489272 -->
```bash
set -e
grep -q "item_parsers\|ListItemParsers" internal/enrich/queue.go
go build ./...
```
<!-- /wf:probe -->

#### Scenario: A CLIENT source stays out of the queue even when attached

- **WHEN** a CLIENT-locked metadata source is attached to an item
- **THEN** no `(item, source)` queue work is derived for it and the attachment renders its group from whatever the document already carries

<!-- wf:probe id=3f2bac60767f478b -->
```bash
set -e
grep -q "CLIENT" internal/enrich/queue.go
```
<!-- /wf:probe -->

#### Scenario: The hermetic attachment E2E joins the itest harness

- **WHEN** the element-attachment E2E runs against the existing itest harness
  (real store, real queue: attach → drain → namespace + provenance written;
  sibling untouched; re-scan keeps the attachment)
- **THEN** it passes node-free as part of the element-parser itest suite

<!-- wf:probe id=9a958b55c9e001fb -->
```bash
set -e
out=$(go test ./internal/itest -run 'TestElement_Parsers_HermeticE2E' -count=1 -v 2>&1)
echo "$out" | grep -q "^=== RUN   TestElement_Parsers_HermeticE2E$"
echo "$out" | grep -q "^--- PASS: TestElement_Parsers_HermeticE2E"
```
<!-- /wf:probe -->

#### Scenario: The collection chain persists per library

- **WHEN** a library's parser chain is stored and read back through a fresh
  store handle (replacement write, then read)
- **THEN** the read returns the written order exactly — the chain is durable
  per-library state, and the footer and queue priority derive from it

<!-- wf:probe id=49fa25a53ecde01e -->
```bash
set -e
grep -q "SetLibraryChain" internal/store/libraries.go
grep -q "GetLibraryChain" internal/store/libraries.go
go test ./internal/store -run 'TestLibraryChain' -count=1 -v 2>&1 | grep -q "^--- PASS: TestLibraryChain"
go build ./...
```
<!-- /wf:probe -->
