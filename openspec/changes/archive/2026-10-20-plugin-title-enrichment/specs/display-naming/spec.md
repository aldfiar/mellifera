# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
