# Design

## Context

The shikimori plugin already enriches series rows with a RU-first title object
(`sources.shikimori.title = {romaji, russian}`), but the display composer never
reads it: `display.title_source_priority` and `display.language_preference` are
dead config keys consumed only by the SPA (internal/module/registry.go:226-231,
421-426). Enrichment machinery is complete — Match → BuildRequest → server
fetch → Convert → Merge under `sources.<plugin_id>` namespaces — and the async
queue derives work from a queueable predicate (`src.Enabled && src.AuthMode !=
"CLIENT"`, internal/enrich/queue.go:516-519) consumed at six sites:

1. `internal/enrich/chain.go:57-60` (runSource)
2. `internal/enrich/queue.go:429-430` (pendingSources)
3. `internal/enrich/queue.go:466-467` (pendingExtras — includes synthesized
   defaults, enrich.go:180-184)
4. `internal/enrich/worker.go:303` (driveSources drain)
5. `internal/enrich/worker.go:375-384` (allSourcesTerminal settle; skip at
   379-380)
6. `internal/scan/run.go:95` (prodEnricher seam → `enrich.Enrich`)

The scan serial seam is production-dead — `runScan` persists and notifies only
(internal/scan/run.go:111-115) — so site 6 is seam hardening, not a live bug.
Module config rewrites go through schema-guarded UPDATE migrations that replace
`config_json` WHOLESALE (internal/module/registry.go:35-56, executed at
287-327), which is why operator state must not live inside the config blob.
`ModulePresentation` is delivered through a Deps closure currently typed
`(ctx, moduleID string)` (internal/api/router.go:49) with test fakes at
display_patch_test.go:229-233 and libraries_test.go:559-563.

## Goals / Non-Goals

**Goals:**
- Composition consumes the plugin-title walk: config-ordered, gated,
  language-picked — series above the parser leg, items as a floor leg.
- Operators gate sources per module and per Collection; dormancy excludes a
  source from derivation AND composition while its namespace stays
  byte-identical; enable restores through the queue's existing wake.
- The six Enabled consumers keep their predicates unchanged — gates
  materialize as binding copies with `Enabled=false`.
- Admin Sources API + SPA surface, with a symmetric composition preview.
- One shared golden fixture pins the Go composer and the SPA mirror.

**Non-Goals:**
- Chain reorder / priority editing, selector mini-language (read-only chain
  display only).
- Runtime plugin load/stop; `Manager.List()` stays Phase-2 (inventory reuses
  the main.go:97 boot literal + `Deps.Status`).
- Write-time name seams, `Registry` mutation, mute state.
- `language_preference` editing (operator-immutable in v1).
- Purge-on-disable (purge remains the explicit Refresh action).

## Decisions

**D1 — Read-time composition, not write-time seams.** The walk lives in
`seriesName`/`itemName` (internal/api/display.go:115-131, 272-283), read per
request; nothing persists. Alternative (stamping `_view.title` at merge time)
was rejected: it entangles every plugin with composition policy and needs
migration/backfill.

**D2 — Gates outside the config blob.** New sparse table
`metadata_source_prefs(module_id, library_id DEFAULT 0, plugin_id, enabled,
updated_at, PK(module_id, library_id, plugin_id))` in the store's `schemaSQL`.
Absent row = inherit; module-scope row applies to every library without its
own row. Rationale: the guarded config migrations rewrite `config_json`
wholesale (registry.go:35-56) and would stomp operator gates on every schema
bump. Alternative (a `gates` key inside config) rejected for exactly that
stomp hazard.

**D3 — Binding-copy materialization (`ResolveGates`).** One exported symbol:
`ResolveGates(mod module.Module, prefs []store.MetadataSourcePref, libraryID
int64) []module.MetadataSourceBinding` returning copies with `Enabled=false`
written for gated sources. All six consumers keep their existing `src.Enabled`
predicates; per (pass, row) exactly one resolution is shared by drain
(worker.go:303) and settle (worker.go:375-384) so a mid-pass flip cannot
split the verdict. Extras' synthesized defaults (enrich.go:180-184) pass
through the same resolution. Alternative (a second gate-check predicate at
each site) rejected: six duplicated predicates, drift-prone.

**D4 — No position column.** Chain order remains the module config's
`title_source_priority`; prefs store enablement only. Reordering is settled
out of scope; storing position would imply an editing surface.

**D5 — Closure widening, additive DTO.** `ModulePresentation` closure becomes
`(ctx, moduleID string, libraryID int64)`; prefs arrive via one batched
per-module store read (`library_id IN (...) OR library_id = 0`). DTO gains
`TitleSources []{id, enabled}` (effective resolution) and
`LanguagePreference` — no existing field changes shape; the two test fakes
update mechanically.

**D6 — Inventory from the boot literal.** `GET /admin/sources` enumerates the
same plugin list `cmd/mellifera/main.go:97` boots, with health from
`Deps.Status`. `Manager.List()` would be the honest source but is Phase-2.

**D7 — Symmetric preview.** `POST /admin/sources/preview` runs the production
composer twice over the same rows — before (live gates) and after (request
vector) — returning both name sets with a `no_data` marker where the after
composition floors to nothing. No simulation code path: the preview cannot
drift from what serving does.

**Interfaces**

```go
// internal/enrich — the only new exported symbol in the chain path
func ResolveGates(mod module.Module, prefs []store.MetadataSourcePref,
    libraryID int64) []module.MetadataSourceBinding

// internal/store — prefs accessors (table in schemaSQL, additive migration)
type MetadataSourcePref struct {
    ModuleID  string
    LibraryID int64 // 0 = module scope
    PluginID  string
    Enabled   bool
    UpdatedAt string
}
func (s *Store) UpsertMetadataSourcePref(p MetadataSourcePref) error
func (s *Store) DeleteMetadataSourcePref(moduleID string, libraryID int64, pluginID string) error
func (s *Store) ListMetadataSourcePrefs(moduleID string) ([]MetadataSourcePref, error) // batched: library_id IN (...) OR library_id = 0
```

```text
DDL (schemaSQL, idempotent):
CREATE TABLE IF NOT EXISTS metadata_source_prefs (
  module_id  TEXT NOT NULL,
  library_id INTEGER NOT NULL DEFAULT 0,
  plugin_id  TEXT NOT NULL,
  enabled    INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (module_id, library_id, plugin_id)
);
```

```go
// internal/api — widened presentation closure (router.go:49) + additive DTO
type ModulePresentationFn func(ctx context.Context, moduleID string, libraryID int64) (ModulePresentation, error)
type ModulePresentation struct {              // existing fields unchanged, plus:
    TitleSources       []TitleSourceBinding
    LanguagePreference []string
}
type TitleSourceBinding struct {
    ID      string `json:"id"`
    Enabled bool   `json:"enabled"`
}
```

```text
Endpoints (Deps-closure pattern; api stays free of enrich/plugin imports):
GET    /api/v1/admin/sources                    → {sources: [{plugin_id, name, description,
                                                  health:{state,message,restarts,last_checked},
                                                  capabilities[], chains:[{module_id, position}],
                                                  effective:{modules:{...}, libraries:{...}},
                                                  title_counts?:{...}}]}
PATCH  /api/v1/admin/sources/{plugin_id}        {enabled} → {queued: N}   (404-free: 400 unknown)
PUT    /api/v1/libraries/{id}/sources/{pid}     {enabled} → 204           (404 unknown library, 400 unknown plugin)
DELETE /api/v1/libraries/{id}/sources/{pid}               → 204 (clear-to-inherit)
POST   /api/v1/admin/sources/preview            {library_id, gates:{plugin_id: bool}} →
                                                  {before:[{item_id, name, no_data}], after:[...]}
```

```text
Golden fixture (shared, committed): internal/api/testdata/golden/title_vectors.json
11 vectors: ru/en pick · empty-title floor · missing-namespace floor · override
precedence · dormant exclusion · item composition · mistyped title floor ·
language-miss floor · module∧library gate conjunction · raw-style walk skip ·
number-typed _view.title passthrough.
```

## Risks / Trade-offs

- [Resolution cost per (pass, row)] → one batched prefs read per module per
  pass; the map lookup per row is O(bindings).
- [Title counts are O(all-rows)] → computed on demand only when the admin
  request asks; never stored, never on hot paths.
- [Dormancy surprises ("where did my titles go?")] → preview endpoint shows
  the after-state before writing; the SPA renders queued counts on enable.
- [Config migrations keep stomping config keys] → gates live outside the blob
  (D2); the dead display keys become Go view inputs without a schema bump.
- [Scan seam resurrects ungated enrichment] → site 6 resolves gates per run
  even though production never calls it today.
- [SPA mirror drift from the Go composer] → one shared golden fixture fails
  either side on divergence; the mirror is allowed only for preview rendering.

## Migration Plan

Purely additive: the new prefs table rides the store's existing idempotent
`schemaSQL` open path (no backfill — absent rows mean inherit); no existing
table, proto, SDK, or plugin contract changes. OpenAPI and the embedded web
dist regenerate at LANDING (`make web-build`), never inside a box probe.
Rollback = revert; the table is inert when unread. GLOSSARY gains the
"Dormant source" entry in this change; architecture §2.4.2 #6 is amended to
promote the two display keys to Go view inputs.

## Open Questions

None — settled in the two review cycles recorded in the proposal.
