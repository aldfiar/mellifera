# Design: display-naming

## Context

Item and series names are composed client-side today, twice per surface:
`Home.tsx` `seriesDisplayTitle`/`continueTitle` and `Collection.tsx`
`serialTitle`/`episodeTitle` re-derive the same precedence chains, and no
non-SPA consumer sees a composed name at all. The api already owns a per-row
presentation seam — `storedTitle` stamps `title_override` inside
`itemDTOs`/`seriesDTOs` (handlers.go) — and the SPA's `matchSeries` shows the
join rule (RelativePath equality, tombstones skipped). Module presentation
declarations are config, not code (AC-4), reaching the api through the
nil-safe `Deps.ModulePresentation` closure; module config bumps ship as
guarded schema_version UPDATEs. See proposal.md — Why for motivation.

## Goals / Non-Goals

Goals: one server-side composer at the api DTO boundary; display-identical
migration (byte-for-byte the SPA's chains and separator); per-library naming
options; a module-default template; Cyrillic verbatim end-to-end.

Non-Goals (explicitly out of scope — do not build, do not spec): grouping /
hierarchy endpoints; search or sort by display_name (future path =
write-maintained materialized column — the read-time seam avoids precluding
it, does not pre-build it); the `{episode_end}` token; per-viewer locale; a
curated-collections entity. Collection = the library (glossary, pinned).

## Decisions

### D-1 Read-time composition at the api DTO boundary; no persisted state

A new unexported `internal/api/display.go` holds the `namer`; composition
happens per request inside the same seam that stamps `title_override`. No
persisted display column, therefore no invalidation triggers anywhere.
Alternatives rejected: a write-time materialized column (pre-builds the
future search path, needs invalidation on every document/override write) and
client-side composition kept as-is (three copies, no non-SPA consumers).

### D-2 Precedence is exact and byte-identical to the SPA

Item: title_override > composed element name (episode facts + resolved series
+ template) > `_view.title.value` verbatim > `""`. Series: title_override >
`sources["serial-parser"].title` > `parsed.dir_name_raw` > last
relative-path segment — byte-for-byte `Home.tsx` `seriesDisplayTitle` /
`Collection.tsx` `serialTitle`, so migration is display-identical. Join:
episode `parsed.series_relative_path` → the series map; rows with status
"deleted" skipped (QuerySeries returns tombstones; the SPA skips them too);
no-match or missing facts → floor, never fabricate.

### D-3 Episode facts: namespace-agnostic with fixed iteration order

Any `sources.*` namespace carrying BOTH season and episode as integers
qualifies; order is serial-parser, then tv-parser, then the sorted rest — Go
map order never leaks. Verified writers today: `plugins/serial-parser`
(Match writes season/episode int64; also episode_end — not consumed in v1)
and `plugins/tv-parser` (same shape); no writer emits strings;
shikimori/image-enricher write neither.

### D-4 Additive wire: display_name always present, naming fields flat

`itemDTO`/`seriesDTO` gain `display_name` ALWAYS on the wire (no omitempty —
mirrors title_override's always-on-wire ""=unset precedent);
`libraryDTO` + `updateLibraryRequest` gain `naming_group_style` and
`naming_element_name` (flat strings, "" = module default). Verified
non-breaking: no `DisallowUnknownFields` anywhere in the repo; optional TS
fields; progress/home-flow DTOs untouched.

### D-5 Storage: two flat nullable TEXT columns, value-agnostic store

`naming_group_style` / `naming_element_name` on `libraries` via the
PRAGMA-guarded `ensureColumn` ALTER; `UpdateLibrary` gains two `*string`
COALESCE params (the displayName/description pattern): nil = unchanged, ""
= reset to module default. PATCH validates before any write (parsers
precedent): group style enum `""|clean|raw`; element name's `{...}` groups
limited to `{title}/{season}/{episode}`. The store never parses the values.

### D-6 Template grammar: impoverished by design

Tokens exactly `{title} {season} {episode}` in v1 ({episode_end} deferred
until a template needs it); zero-padding composer-fixed %02d (JS
`padStart` semantics; 3+ digit episodes render in full); a token with no
value renders as the empty string — never a placeholder; no separator
grammar, no conditionals, no format specifiers.

### D-7 Module default: serial seed v3, one new exported field

The serial seed's display block gains `"item_name": "{title} · S{season}E{episode}"`
(U+00B7 — byte-matches today's SPA compose → display-identical default,
user-approved). `parseModule` gains ONE new exported field
`Module.ItemName string`; it reaches api through the existing nil-safe
`Deps.ModulePresentation` closure (+1 field on `api.ModulePresentation`),
wired in `cmd/mellifera/main.go`. Seed bump: schema_version 3 with a guarded
`UPDATE … WHERE id='serial' AND schema_version < 3` (the v1→v2 pattern). In
the same change, amend the two contract comments saying the display block is
never modeled in Go (serialConfigJSON header; parseModule's arch §2.4.2
note) so code and contract agree. RIDE-ALONG drift fix: seed literals
`display_title`→`title` (registry identity_fields + serial-parser
display_fields — serial-parser actually writes "title"); blast radius:
internal/module tests, `ItemDetail.test.tsx` (the SPA is already
drift-tolerant — `resolveIdentityValue(doc, "title")` is tried first), and
docs/architecture.md.

### D-8 SPA slice: consume the served name, retire the copies

The SPA consumes served `display_name`; DELETE the 4 triplicated helpers
(~60 lines): `seriesDisplayTitle`, `episodeLabel`, `continueTitle`'s compose
branch, `serialTitle` (plus any helper left unreferenced — dead code goes
with it). `episodeFacts` STAYS (exported, tested) — the Next-up chip keeps
rendering SxxEyy from raw facts, which remain on the wire in item documents;
the NextUpCard label/title split is preserved (chip from facts, title from
display_name). Rename affordances are untouched. `viewTitle` survives only
where still referenced outside the four naming call sites (e.g. ItemRow's
default title, the technical view) — on the floor it agrees with
display_name, so no behavior conflict.

### D-9 Accepted cost: whole-library read per composing request (bound, do not optimize)

Each composing request pays GetLibrary (1 PK read) + QuerySeries
whole-library WITH documents (~0.5 MB at 100 series) + per-series override
point-reads; worst ratio is getItem (whole map for one row). Accept at
personal-library scale; revisit on a real signal. Do NOT attach the namer to
routes that render no names.

## Interfaces

Cross-group contracts (signatures only — bodies are implementation):

```go
// internal/api/display.go (NEW, unexported surface)
type namer struct {
    groupStyle  string                  // "" | "clean" | "raw" (library option)
    elementTmpl string                  // module default or library option; "" = no template
    seriesByPath map[string]store.Series // library-wide, RelativePath-keyed (tombstones included, skipped at join)
}
func (a *app) namerFor(ctx context.Context, libraryID int64) (namer, error)
func (n namer) seriesName(sr store.Series, override string) string
func (n namer) itemName(it store.Item, override string) string

// internal/store — UpdateLibrary grows two params (nil = unchanged)
func (s *Store) UpdateLibrary(ctx context.Context, id int64,
    displayName, description *string, streamsEnabled *bool,
    namingGroupStyle, namingElementName *string) (Library, error)

// internal/module — one new exported field
type Module struct { /* …existing… */ ; ItemName string }

// internal/api — +1 field on the presentation block
type ModulePresentation struct { /* …existing… */ ; ItemName string }

// wire (additive, always present):
//   itemDTO.Display     json:"display_name"
//   seriesDTO.Display   json:"display_name"
//   libraryDTO / updateLibraryRequest: naming_group_style, naming_element_name ("" = module default)
```

Dependency direction is unchanged (web → api → scan → enrich → …): the namer
lives in api, reads store rows it already holds, and takes the module default
through the existing closure — api never imports module.

## Risks / Trade-offs

- [Whole-library read per composing request] → accepted and bounded (D-9);
  routes that render no names never build a namer.
- [Map iteration order leaking into names] → fixed namespace order (D-3),
  unit-tested.
- [Tombstoned series joining a name] → join skips status "deleted"
  (mirrors SPA matchSeries), tested.
- [Seed literal fix surprising a consumer] → blast radius enumerated in D-7;
  the SPA already resolves "title" first.
- [Itest CWD hermeticity (open backlog item)] → the qa joint itest anchors
  its datadir under `t.TempDir()` like the existing harness.

## Migration Plan

Additive end-to-end: columns appear via guarded ALTER; the seed bumps via
guarded UPDATE; the wire only gains always-present fields; the SPA switches
to the served name in the same change (no window where names disappear —
display-identical chains on both sides). Rollback = revert; no data
migration exists to undo. AT LANDING (not in box probes): OpenAPI regen
(swag) + web dist rebuild + docs source-map regen — the project lesson: box
probes never rebuild dist.

## Open Questions

None — all parameters were pinned by the approved /design loop.
