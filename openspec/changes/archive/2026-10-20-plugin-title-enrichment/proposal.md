# Proposal

## Why

Served titles ignore plugin metadata: the shikimori source already enriches series
rows with RU-first titles (`sources.shikimori.title`), but the display composer
never reads them — the module config's `title_source_priority` /
`language_preference` keys are dead letters the Go side never consumes. At the
same time there is no operator surface for the enrichment chain: plugins are a
hard-coded boot list, and enable/disable exists only as seed config with no API.

## What Changes

- The display composer gains a config-driven plugin-title leg: `seriesName`
  walks `display.title_source_priority` ∩ effectively-enabled sources above the
  serial-parser leg (string titles verbatim; object titles picked by
  `display.language_preference`, RU-first); `itemName` gains the same walk as a
  floor leg between the composed element name and `_view.title` (films and
  failed compositions included). Group style `raw` skips the walk.
- A sparse `metadata_source_prefs` control table (module / per-Collection scope,
  absent = inherit) stores operator gates OUTSIDE the module config blob, so the
  schema-guarded config migrations can never stomp them. Registry stays
  load-once pure; gates are read live.
- Gate threading across every Enabled consumer (chain, derivation chain +
  extras, drain, settle, scan seam): a dormant source derives nothing, composes
  nothing, retains its namespace byte-identical, and never purges; re-enable
  restores via the queue's existing wake with no rescan and no new lifecycle
  transitions.
- Admin Sources API (Deps-closure pattern): `GET /admin/sources` (aggregate with
  health chips, chain positions, effective-enabled, on-demand title counts),
  `PATCH /admin/sources/{plugin_id}` (module gate + per-library Notify, returns
  queued), `PUT|DELETE /libraries/{id}/sources/{plugin_id}` (gate /
  clear-to-inherit), `POST /admin/sources/preview` (production composer run
  twice, symmetric before/after, `no_data` marker).
- `ModulePresentation` widens (closure takes the library) and carries the
  RESOLVED title chain + language preference additively; the SPA gains a Sources
  admin surface and a golden-pinned `naming.ts` walk mirror fed by served
  inputs; ONE shared golden fixture pins Go composer and SPA mirror.
- Docs: GLOSSARY "Dormant source" entry, architecture §2.4.2 #6 amendment (two
  display keys become Go view inputs), parseModule contract comment.

Not in scope (settled in review): chain reorder/priority editing, runtime
plugin load/stop (`Manager.List()` stays Phase-2), write-time seams, Registry
mutation, a selector mini-language, language-preference editing, mute state.

## Capabilities

### New Capabilities

- `metadata-source-admin`: operator gates over metadata sources — preference
  storage with inherit semantics, dormant-source behavior, the admin aggregate /
  module-gate / library-gate / preview endpoints, and enable-wakes-derivation.

### Modified Capabilities

- `display-naming`: the series composition chain gains the plugin-title walk
  (config-ordered, effective-enabled, language-picked); the item composition
  gains the same walk as a floor leg; a shared composer–SPA golden fixture; the
  presentation block carries the resolved title chain.
- `async-enrichment`: derivation consumes gate-resolved (effectively-enabled)
  bindings; drain and settle share one resolution per pass; operator enable
  wakes derivation with no new lifecycle transitions.
- `shikimori-enrichment`: the romaji/russian object composition contract
  (RU-first) documented as the cross-module contract composition relies on.
- `web-ui`: the endpoint allowlist gains the five new routes; the Sources admin
  surface lands beside the collections panel; the title-chain requirement gains
  the single golden-pinned preview mirror exception.

## Impact

- `internal/store` — new `metadata_source_prefs` table (schemaSQL) + accessors
  incl. one batched per-module read; no existing table changes.
- `internal/module` — `parseModule` decodes `display.title_source_priority` +
  `display.language_preference` into exported `Module` fields; contract-comment
  amendments (config block remains otherwise SPA-consumed).
- `internal/enrich` — `ResolveGates` (+1 exported symbol) threaded at the six
  Enabled-consumer sites; derivation, drain, settle consume resolved bindings.
- `internal/scan` — seam hardening only (the serial enrich seam resolves gates
  per run; production enrichment flows exclusively through the queue notify).
- `internal/api` — composer legs, `ModulePresentation` closure signature widened
  to `(ctx, moduleID, libraryID)` + additive DTO fields, four admin endpoints
  (new `source_admin.go`), test-fake signature updates.
- `cmd/mellifera` — closure rewiring (presentation, source-admin closures,
  notify).
- `web/src` — `naming.ts` walk mirror + golden fixture consumption, new
  `pages/admin/Sources.tsx`, `lib/api.ts` clients.
- Docs: `GLOSSARY.md` (Dormant source entry), `docs/architecture.md` (§2.4.2
  #6), parseModule comment.
- **proto 0 · pkg/sdk 0 · plugins/ 0** — the plugin contract is untouched.
  OpenAPI + embedded web dist regenerate at LANDING (dev-time `make web-build`),
  never inside a box probe.
