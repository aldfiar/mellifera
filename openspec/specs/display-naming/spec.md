# display-naming Specification

## Purpose
Server-composed display names for collections and their contents: the api
composes each item's and series' `display_name` at read time — the operator's
override first, then parser facts rendered through the module's naming
template, then the document's own title — never persisting the composed value
and never rendering a raw filename when anything better resolves. Per-library
naming options (group style, element template) and the module-default template
govern the composition; the SPA consumes the served name and retires its
triplicated client helpers. Glossary (pinned): collection = library;
subcollection = series (serial libraries) / album (image libraries); element =
item; naming option = the per-library flat columns; `display_name` is
server-composed — never persisted, never the raw filename when a better name
resolves.

## Requirements

### Requirement: Item display name composition

Every API response serving items SHALL carry an always-present `display_name`
string on each item DTO, composed at read time per request — never persisted,
with no invalidation step. The precedence SHALL be exactly: the item's stored
`title_override`; else the composed element name — the item's episode facts
joined to the series its `parsed.series_relative_path` resolves in the same
library, rendered through the active element template (the module default, or
the library's naming option when set); else the first non-empty title fact
walking the module's `display.title_source_priority` over the item's OWN
document namespaces under the same effective-enabled, string/object, and
language-preference rules as the series composition (a film whose document
carries a movie-kind source namespace is named by this leg); else the item
document's `_view.title.value` verbatim; else `""` (the SPA renders its
existing em-dash placeholder for the empty string). A series row whose status
is `deleted` SHALL be skipped; a missing match SHALL fall through the chain —
the composition MUST NOT fabricate a name. Cyrillic and any non-ASCII text
SHALL pass through the whole chain verbatim — no normalization, no
transliteration, anywhere.

#### Scenario: Item display names follow the precedence chain

- **WHEN** one episode carries a stored title_override, a sibling episode of the same series carries season 2 and episode 6 facts with the series titled "Секретные материалы" under the default template, and a third item carries neither facts nor any `_view.title`
- **THEN** the three served display_names are the override, the composed `Секретные материалы · S02E06` (Cyrillic verbatim, two-digit zero-padding), and `""` respectively

<!-- wf:probe id=34a4da9aa17f35ba -->
```bash
set -e
go test ./internal/api -run TestItemDisplayNamePrecedence -count=1
```
<!-- /wf:probe -->

#### Scenario: Unresolved or deleted series floor instead of fabricating

- **WHEN** an episode carries season and episode facts but its `parsed.series_relative_path` matches no series row of its library, and a second episode's path matches only a series row whose status is `deleted`
- **THEN** both served display_names fall through to the plugin-title walk and then `_view.title.value` when present, else `""` — no series title is invented and no deleted row is joined

<!-- wf:probe id=417cb17153e23aab -->
```bash
set -e
go test ./internal/api -run TestItemDisplayNamePrecedence -count=1
```
<!-- /wf:probe -->

#### Scenario: Every served item and series carries display_name

- **WHEN** the item list, item detail, series list, and series detail endpoints answer for a library whose items carry no overrides, no facts, and no `_view.title`
- **THEN** every item and series DTO still carries `display_name` on the wire (empty string, never an absent field), progress and home-flow DTOs stay untouched, and the library DTO always carries both naming fields (empty string = module default)

<!-- wf:probe id=d703ce0b8053a422 -->
```bash
set -e
go test ./internal/api -run TestDisplayNameWire -count=1
```
<!-- /wf:probe -->

#### Scenario: A film floors to its plugin title

- **WHEN** a film-parsed item carries a `sources.shikimori.title` object from a movie-kind match, no episode facts, and no override
- **THEN** the served display_name is the language-picked shikimori title — the walk leg, ahead of the `_view.title` floor

<!-- wf:probe id=d2181f925f401011 -->
```bash
set -e
go test ./internal/api -run TestItemDisplayNamePrecedence -count=1
```
<!-- /wf:probe -->

#### Scenario: A number-typed view title still passes through

- **WHEN** an item with no override, no composition, and no enabled-source namespace carries `_view.title.value` as a JSON number
- **THEN** the served display_name is the number's literal bytes — the floor leg is unchanged by the new walk

<!-- wf:probe id=162b923230e42769 -->
```bash
set -e
go test ./internal/api -run TestItemDisplayNamePrecedence -count=1
```
<!-- /wf:probe -->

### Requirement: Series display name composition

Every API response serving series SHALL carry an always-present `display_name`
string composed in this exact precedence: the series' stored `title_override`;
else the first non-empty title fact walking the module's configured
`display.title_source_priority` over the document's `sources.*` namespaces,
restricted to sources EFFECTIVELY ENABLED for the row's library (the binding's
configured enabled flag AND the operator's module- and library-scope gates): a
namespace `title` that is a string is used verbatim when non-empty; a `title`
object is read by the module's `display.language_preference` — the first
preference code with a non-empty matching key (the seeded serial chain is
RU-first: "ru" reads the russian title, "en" the romaji); an absent, empty, or
wrongly-typed title floors to the next source; else the title fact from
`sources["serial-parser"]`; else `parsed.dir_name_raw` verbatim; else the last
segment of its relative path. No plugin id SHALL appear in the composer — the
walk is driven entirely by the config list. The library's `naming_group_style`
option SHALL select the style: `clean` (the default — the chain above) or
`raw` — under `raw` the stored override still wins, then the raw directory
name (`parsed.dir_name_raw`, else the last relative-path segment); the
plugin-title walk does not apply under `raw`.

#### Scenario: Series display names follow the chain and the group style

- **WHEN** a clean-style library serves four series — one with an override, one whose document carries the parser title "Атланта", one carrying only `dir_name_raw` "Атланта (2016)", and one carrying neither fact — and the library's group style then switches to `raw` and the same rows are served again
- **THEN** the clean read returns the override, "Атланта", "Атланта (2016)", and the last path segment respectively, and the raw read returns the override and the raw directory names — identical bytes to today's client-side rendering

<!-- wf:probe id=aa402c4300195af6 -->
```bash
set -e
go test ./internal/api -run TestSeriesDisplayName -count=1
```
<!-- /wf:probe -->

#### Scenario: Plugin title precedes the parser title by config order

- **WHEN** a series carries both a `serial-parser` title and a shikimori title, and the module's `title_source_priority` lists shikimori
- **THEN** the served display_name is the shikimori title (the russian one under the seeded RU-first preference), not the parser title

<!-- wf:probe id=5308c71133a6c9d8 -->
```bash
set -e
go test ./internal/api -run TestSeriesDisplayName -count=1
```
<!-- /wf:probe -->

#### Scenario: Language preference selects the namespace title

- **WHEN** one series' shikimori namespace carries both a russian and a romaji title, and a second series' namespace carries an empty russian key but a non-empty romaji
- **THEN** the first series serves the russian title and the second serves the romaji; a preference code with no matching key floors to the next source instead of erroring

<!-- wf:probe id=a9c5703d70c3a202 -->
```bash
set -e
go test ./internal/api -run TestSeriesDisplayName -count=1
```
<!-- /wf:probe -->

#### Scenario: A mistyped title floors

- **WHEN** a namespace `title` is neither a string nor an object (e.g. a number)
- **THEN** the walk floors to the next source honestly and the read never errors

<!-- wf:probe id=f1ab9604fd072c03 -->
```bash
set -e
go test ./internal/api -run 'TestSeriesDisplayName|TestGoldenTitleVectors' -count=1
```
<!-- /wf:probe -->

### Requirement: Namespace-agnostic episode facts in a fixed order

Episode facts (season and episode) SHALL be read namespace-agnostically: any
`sources.*` namespace carrying BOTH season and episode as integers qualifies.
When several namespaces qualify, the read order SHALL be fixed —
`serial-parser`, then `tv-parser`, then the remaining namespaces sorted — so
map iteration order never leaks into the composed name. A namespace carrying
only one of the two facts SHALL NOT qualify. `episode_end` facts are not
consumed by naming in v1.

#### Scenario: Episode facts read in a fixed namespace order

- **WHEN** one episode's document carries season and episode only in `sources["tv-parser"]`, and a second episode carries them in both `sources["serial-parser"]` (season 1, episode 2) and a third namespace (season 9, episode 9)
- **THEN** the first episode composes from the tv-parser facts and the second from the serial-parser facts — the same values on every read, never map-order-dependent

<!-- wf:probe id=6e7f39766060b3a0 -->
```bash
set -e
go test ./internal/api -run TestEpisodeFactsOrder -count=1
```
<!-- /wf:probe -->

### Requirement: Per-library naming options

The libraries table SHALL carry two flat nullable TEXT columns,
`naming_group_style` and `naming_element_name`, added by the store's guarded
idempotent column migration; the store SHALL treat both as opaque strings (no
parsing in the store). `PATCH /api/v1/libraries/{id}` SHALL accept optional
`naming_group_style` and `naming_element_name` beside the existing fields: an
absent (nil) field SHALL change nothing; a non-nil empty string SHALL reset
the column to the module default; `naming_group_style` MUST be `""`, `clean`,
or `raw` — anything else is 400; `naming_element_name` MUST be free text whose
only `{...}` groups are exactly `{title}`, `{season}`, `{episode}` — any other
group is 400. Validation SHALL run before any write; the served library DTO
SHALL always carry both fields (empty string = module default). A changed
option SHALL re-compose display_names on the NEXT read — no rebuild, rescan,
or invalidation step exists.

#### Scenario: Naming columns persist and reset

- **WHEN** the store applies a partial library update setting both naming columns, then an update carrying nil for both, then an empty-string write for both
- **THEN** the first write persists both values verbatim, the nil update leaves both unchanged, the empty-string write stores `""` (the module-default marker), and the columns stay plain TEXT the store never parses

<!-- wf:probe id=61670ac6e9650781 -->
```bash
set -e
go test ./internal/store -run TestLibraryNamingOptions -count=1
```
<!-- /wf:probe -->

#### Scenario: PATCH validates naming values before any write

- **WHEN** the admin PATCHes `{"naming_group_style": "pretty"}` and separately `{"naming_element_name": "{title} {unknown}"}`
- **THEN** both PATCHes answer 400 with the canonical error body and the stored columns are unchanged

<!-- wf:probe id=94070d69661dddee -->
```bash
set -e
go test ./internal/api -run TestLibraryPatchNaming -count=1
```
<!-- /wf:probe -->

#### Scenario: Options re-compose on the next read without a rebuild

- **WHEN** a scanned and enriched serial library serves an episode, the admin PATCHes a naming option, and the same episode is served again — through the joint itest harness with real plugin subprocesses
- **THEN** the second read carries the re-composed name with no rebuild or rescan in between, and the served precedence holds end-to-end: override beats the option-composed name, which beats the module-default composition

<!-- wf:probe id=f326178bb969546e -->
```bash
set -e
go test ./internal/itest -run TestDisplayNamingJointE2E -count=1
```
<!-- /wf:probe -->

### Requirement: Module default element template

The serial module's seeded display block SHALL declare `item_name` — the
default element template `{title} · S{season}E{episode}` whose separator
byte-matches the SPA's current compose, making the default display-identical
to today — and the module config `schema_version` SHALL bump to 3 with a
guarded UPDATE upgrading pre-v3 stores on Open (the INSERT OR IGNORE alone
never rewrites an existing row). The parsed module SHALL expose the template
as an exported field, delivered to the api through the existing
module-presentation closure; wherever code now models the display block, the
contract comments claiming it is never modeled SHALL be amended so code and
contract agree. The template grammar is impoverished by design: the only
tokens are `{title}`, `{season}`, `{episode}` — no separator grammar, no
conditionals, no format specifiers; the composer zero-pads season and episode
to two digits (an episode number of three or more digits renders in full); a
token whose value is absent SHALL render as the empty string — never a
placeholder, never the raw token.

#### Scenario: Serial seed ships the display-identical default and pre-v3 stores upgrade on Open

- **WHEN** a fresh store opens (seed v3) and separately a store pre-seeded with the v2 serial row opens
- **THEN** both end with the serial module at schema_version 3 carrying the `{title} · S{season}E{episode}` default, identity and display fields naming `title` (what serial-parser actually writes), and the exposed template reaching the api closure

<!-- wf:probe id=53a786b810841c99 -->
```bash
set -e
go test ./internal/module -run TestSerialModule -count=1
```
<!-- /wf:probe -->

#### Scenario: Template grammar renders padding and empty tokens

- **WHEN** the element template `S{season}E{episode} — {title}` renders an episode with season 2 and episode 6 whose resolved series contributes no title, and separately an episode numbered 146
- **THEN** the first renders `S02E06 — ` (absent token empty, two-digit padding kept) and the second renders the episode number in full — no truncation, no placeholder

<!-- wf:probe id=31555e6a2e13ff67 -->
```bash
set -e
go test ./internal/api -run TestItemNameTemplate -count=1
```
<!-- /wf:probe -->

#### Scenario: The module default reaches the served composition

- **WHEN** the server runs with the wired module-presentation closure and serves an episode whose library carries no naming option
- **THEN** the served display_name is composed through the module default — the same bytes the SPA renders today (`<series title> · S02E06` for season 2, episode 6)

<!-- wf:probe id=c95a68d8defb9e64 -->
```bash
set -e
grep -q "ItemName" cmd/mellifera/main.go
go test ./internal/api -run TestModuleDefaultItemName -count=1
```
<!-- /wf:probe -->

### Requirement: Node-free build gate

The Go build gate (`make build check test lint`) SHALL stay green node-free —
committed artifacts embedded, no node/npm/swag in the gate; the OpenAPI and
web dist regeneration SHALL happen at landing, never inside a box probe. The
web checks (`vitest run`, `tsc --noEmit`) SHALL stay green after the SPA
slice.

#### Scenario: Gate green without node

- **WHEN** `make build check test lint` runs from the repo root on a node-less host
- **THEN** it exits 0 with no node/npm/swag invoked

<!-- wf:probe id=c77c8bdbd58314fb -->
```bash
set -e
make build check test lint
```
<!-- /wf:probe -->

#### Scenario: Web checks stay green after the slice

- **WHEN** the SPA slice lands and `cd web && npx vitest run && npx tsc --noEmit` runs
- **THEN** both exit 0, with the deleted helpers' tests replaced by display_name-consumption tests

<!-- wf:probe id=6bb071a4149e765f -->
```bash
set -e
cd web && npx vitest run && npx tsc --noEmit
```
<!-- /wf:probe -->

### Requirement: Composer–SPA parity fixture

The Go composer and the SPA's client mirror SHALL be pinned by ONE shared
golden fixture — a committed JSON testdata file — covering, at minimum: the
russian/romaji pick, an empty namespace-title floor, a missing-namespace
floor, override precedence, dormant-source exclusion, item composition, a
mistyped title floor, a language-preference miss floor, the module∧library
gate conjunction, the raw-style walk skip, and the number-typed `_view.title`
passthrough. Both sides SHALL consume the same file; a vector changed on one
side without the other SHALL fail that side's suite.

#### Scenario: The shared fixture pins both composers

- **WHEN** the Go golden test and the SPA mirror test run over the same fixture file
- **THEN** both exit 0 with identical composed names per vector, and mutating any vector breaks the run

<!-- wf:probe id=341a94e9c2975995 -->
```bash
set -e
go test ./internal/api -run TestGoldenTitleVectors -count=1
cd web && npx vitest run src/lib/naming.test.ts
```
<!-- /wf:probe -->

### Requirement: Module presentation carries the resolved title chain

The module presentation block on the library surfaces SHALL carry, ADDITIVELY:
`title_sources` — the module's configured title chain as `{id, enabled}` pairs
where `enabled` is the EFFECTIVE resolution for the requested library (operator
gates applied) — and `language_preference` verbatim from the module config. The
list surface SHALL resolve gates for every listed library; the detail surface
for its one library. No existing presentation field SHALL change shape.

#### Scenario: The presentation block reflects per-library gates

- **WHEN** the library list answers for two libraries of the same module, one carrying a library-scope disable, and the detail endpoint answers for each
- **THEN** every response's title_sources shows the source enabled for the ungated library and disabled for the gated one, and language_preference is identical on all of them

<!-- wf:probe id=f7b4602d79a89eda -->
```bash
set -e
go test ./internal/api -run 'TestLibraryDetailPresentation|TestLibraryListPresentation' -count=1
```
<!-- /wf:probe -->

### Requirement: The web checks stay green after the SPA slice

The web checks (`vitest run`, `tsc --noEmit`) SHALL stay green after the SPA
slice — the deleted-helper tests already replaced by display_name consumers,
the new suites added.

#### Scenario: Web checks stay green after the slice

- **WHEN** the SPA slice lands and `cd web && npx vitest run && npx tsc --noEmit` runs
- **THEN** both exit 0, with the deleted helpers' tests replaced by display_name-consumption tests

<!-- wf:probe id=6bb071a4149e765f -->
```bash
cd web && npx vitest run && npx tsc --noEmit
```
<!-- /wf:probe -->
