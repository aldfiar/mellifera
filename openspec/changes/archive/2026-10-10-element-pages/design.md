# Design: element-pages

Ground truth for the visual design: `.tmp/webui-mockup.html` (v8 media-first
element pages + v8.1 prev/next and slideshow), decisions logged in the
`mellifera-webui` skill (`references/design-decisions.md`). The mock's
real-vs-mock rule carries over: plugin namespace fields quoted verbatim
(tv-parser → `title year season episode resolution release_group`;
image-enricher → `width height format make model date_taken orientation
gps_lat gps_lon`; serial-parser → `display_title season parsed_from
original_dir_name`; frame-grabber → `thumbnail_path`).

## D-1 — Presentation declarations are config, not capability types

`display_fields` (per parser binding) and `identity_fields` (per module) live
in the module seed config JSON — the same place `metadata_sources` already
lives. ZERO new protos, ZERO new capability types, ZERO `go.mod` deltas; the
core never learns a field name (AC-4: provider/media literals stay in
config). Seeds:

```jsonc
// module tv (movies) — parser bindings gain display order
{ "id": "tv-parser", "capability": "metadata_source", "priority": 1,
  "display_fields": ["title", "year", "resolution", "parsed_from"] }
// base-scanner binding (probe facts, already in sources["parsed"])
{ "id": "base-scanner", "capability": "scanner",
  "display_fields": ["container", "duration", "video", "audio", "size"] }

// module image
{ "id": "image-enricher", "capability": "metadata_source", "priority": 1,
  "display_fields": ["date_taken", "camera", "dimensions", "gps"] }
// "camera" = make + model joined by the renderer; "dimensions" = width×height

// module serial
{ "id": "serial-parser", "display_fields": ["display_title", "season", "parsed_from"] }
{ "id": "frame-grabber", "display_fields": ["thumbnail", "grabbed_at"] }
```

`identity_fields` per module (fields the element page renders as the
mandatory identity block, resolved `_view`-first then across namespaces):

```jsonc
// tv:        ["title", "year"]
// serial:    ["display_title", "season", "episode"]   // episode on episode items
// image:     ["date_taken"]                            // the name is the core relative_path h1
```

A missing identity field renders the slot state (dashed note), never blank
and never fabricated — the episode-name case until B3/NFO lands.

## D-2 — Collection-common chain: `PATCH /libraries/{id}` parsers list

The ordered parser list moves from fixed seed to editable state with the
seed as default. `PATCH /api/v1/libraries/{id}` gains an optional `parsers`
array (ordered plugin ids, full replacement — PUT semantics inside PATCH,
matching the existing pointers-decode pattern: absent field = no change).
Validation: every id must exist in the loaded plugin set AND serve a
capability the module binds (`scanner`/`metadata_source`); unknown id or
capability mismatch → 400; empty array → rejected (a collection with zero
parsers cannot enrich; removal of the last parser is a module-config
decision, not a per-collection one). `module_id` and `root_path` stay
unrepresentable (server 400s them regardless). Order IS the footer order and
the queue priority for collection-common sources. The existing
"identity fields immutable" invariant is untouched.

## D-3 — Element-only attachment: `item_parsers` control table

Attachment is real control state that must survive re-scans → a control
table, the `playback_progress` pattern (relational, hot, not folded into the
JSON document):

```sql
CREATE TABLE IF NOT EXISTS item_parsers (
  item_id   TEXT NOT NULL,
  plugin_id TEXT NOT NULL,
  position  INTEGER NOT NULL,
  PRIMARY KEY (item_id, plugin_id)
);
```

- `PUT /api/v1/items/{id}/parsers` `{"parsers": ["anitomy"]}` — full
  replacement, admin role group; `DELETE` (or `PUT {"parsers": []}`) clears.
  404 unknown item; 400 unknown/mismatched plugin (same validation as D-2).
- **Re-scan survival:** the scanner upserts by `(library_id, relative_path)`;
  the item row (and its id) persists, so the attachment persists. Re-identify
  (root move) deletes the old rows — attachments die with the identity, same
  as every other per-item fact (documented in the overlay warning family).
- **Sibling isolation:** rows are keyed by item; nothing propagates.
- **Wire shape:** `GET /items/{id}` gains an additive `extra_parsers:
  ["anitomy"]` field so the SPA renders element-only footer groups and the
  manage affordance reflects state without a second fetch.
- Store methods: `SetItemParsers(ctx, itemID, pluginIDs)` /
  `ListItemParsers(ctx, itemID)` — parameterized SQL only.

## D-4 — Queue derivation includes element-only sources

The B1 queue derives `(item, plugin)` work from `items` + document
namespaces + the ledger (nothing stored). The derivation gains one input:
`item_parsers` rows for the item — an attached source is queueable iff its
`auth_mode != "CLIENT"` (D-Q1 unchanged); `anitomy` (local, empty
auth_mode) qualifies, a CLIENT-locked source attached to an item stays
Mode-B-only and renders its group from whatever exists. Terminal-failure
ledger, cooldowns, and `retry.go` semantics apply to element-attached
sources identically. `Enrich` (sync chain) also honors extras so a manual
enrich matches the queue.

## D-5 — Footer renderer (SPA)

New `ParserFooter` component under `web/src/components/metadata/` (beside
SourceCard — it reads the same namespaces):

- one `mgroup` per parser in order: collection chain (module config served
  additively on `GET /api/v1/libraries/{id}` as
  `module: { identity_fields, parsers: [{id, display_fields}] }`) followed by
  element-only parsers (from `extra_parsers`), each pill-marked
  "this element only";
- within a group: the parser's `display_fields` order — label/value pairs,
  joined names (`camera` = make + model, `dimensions` = width×height,
  `thumbnail`/`grabbed_at` from the frame-grabber namespace) resolved
  per-field with provenance in the `title` attribute; absent → pair skipped;
- namespaces never merged; values verbatim; `_view` arbitration untouched
  (the footer is presentational, the document stays the record);
- seeded-but-unloaded providers render as empty slot groups in chain
  position (the tmdb case);
- field labels are humanized (`parsed_from` → "parsed from"); Russian data
  passes through untouched.

## D-6 — Browsing and slideshow resolve in the SPA's loaded view

MVP: prev/next resolves within the ordered item list the user navigated
from (the grid/masonry page's loaded view; entry point = the tile/card/row's
position; wrap-around at the edges; counter `n / N`). No new endpoint; the
deferred server-side neighbors route (lazy paging beyond the loaded window)
goes to backlog. Slideshow = a client timer over the same view: ~2.5s
tick, `S`/button toggles, manual `←/→` resets the tick, `Esc` stops first
and navigates back second, unmount/leave always stops. Real-implementation
notes: cross-fade between photos and neighbor preloading are polish, not
contract; the authenticated object-URL media channel is reused (revoked on
item change).

## D-7 — Additivity posture

proto/ tree, `pkg/sdk`, plugin subprocesses: byte-identical. `go.mod`:
unchanged. `internal/api`: +3 route behaviors (PATCH parsers field, PUT/DELETE
items parsers, GET library presentation fields) — handlers stay pure
delegation; swag annotations regenerate the committed OpenAPI. The QA gate
stays node-free; SPA tests extend the existing Vitest suites. The complexity
budget rules as always: a fail means redesign, not relax.
