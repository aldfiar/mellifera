# Conventions — plugin-pipeline (Phase A)

> INHERITS all of `docs/scan-library/conventions.md` (12 hard rules, naming,
> anti-patterns, complexity budget, error/logging/deprecation/Russian-first-class,
> coder skill load order `mellifera-build → golang-security → grounding → contracts`).
> This file adds ONLY the conventions specific to the plugin pipeline. Where this
> file is silent, scan-library's conventions govern.

## Inherited (non-negotiable, repeated for density)
- ≤8 exported symbols/pkg (12 hard fail); `*.pb.go`/`*.gen.go` exempt (`check.sh:36`).
- `doc.go` per package, contract-first; table test per exported symbol.
- `api/` pure delegation (parse → ONE domain call → write); pipeline logic lives in `enrich/`, never `api/`.
- No DI framework, no `reflect` (depguard); data-type boundaries; no shared mutable types cross-package.
- Parameterized SQL only; `exec.Command` arg-slice only; Apache-2.0 headers.
- Downward-only deps: `api → scan → enrich → {module, plugin} → store`. No cycles.

## Plugin-pipeline-specific conventions

### Additive-only (deprecate-don't-delete — arch §0 #6)
- NEVER edit `scanner.v1`/`plugin.v1`/`common.v1`/`metadata.v1` protos in Phase A
  (they already exist; AC-3). Proto evolution is additive within a major.
- The `items` table change is a **defaulted nullable-style addition**
  (`status TEXT NOT NULL DEFAULT 'new'`) + an index — never a drop/rename.
- `store.QueryItems` signature change is an **internal refactor** (MODIFY, not a
  new symbol); the wire `GET /items?status=` is **additive** (existing clients
  unaffected). `?status=` empty = all.
- Removing `parseTV` from base-scanner is an **extraction** (move, not delete);
  the wire `IdentifyResult` shape is unchanged.

### Capability / accessor pattern (the plugin seam)
- One **typed accessor per capability** on `plugin.Manager` (`Scanner`, now
  `MetadataSource`). NO generic `Call`, NO `reflect`, NO `protobuf.Any`
  (`internal/plugin/doc.go:14-19`).
- One **dual-side go-plugin adapter per capability** in `pkg/sdk`
  (`ScannerPlugin`, now `MetadataSourcePlugin`) with `GRPCServer`+`GRPCClient`.
- Interfaces exist ONLY at the plugin seam with **≥2 implementations** (subprocess
  gRPC client + in-process test fake — R8 justification; never single-impl).

### Enrichment chain (the 4-RPC contract)
- `internal/enrich` drives `Match → BuildRequest → Convert → Merge` **in module
  `metadata_sources[].priority` order**, **serial within an item** (D8), no hybrid
  mode (D14). Phase A: the fetch between BuildRequest and Convert is a **no-op
  stub** (empty `raw_response`); Phase B fills the real fetch.
- A capability plugin MUST be **stateless** (arch §0 #2): all state lives in the
  core document; a plugin crash never loses in-flight work (core replays).

### Provenance / namespace writes (precision — arch §0 #4, §3.3)
- A plugin writes **ONLY** `sources.<its_own_plugin_id>`. Touching any other
  `sources.<x>` ⇒ core **rejects + reverts + records** the violation and marks the
  stage `failed` (arch §3.3 `:883-890`). NOT a scan abort (soft-fail, AC-6).
- Per-field source: `_provenance.<field_path>` = `common.v1.Provenance`
  `{plugin_id, plugin_version, fetched_at, confidence, source_url}`.
- `_view.<field>` is **always recomputable** from `sources.*` + the module display
  policy; it is a cache, never authoritative.
- `_stages[]` records per-stage progress `{stage, plugin_id, status, advanced_to,
  started_at, finished_at, error}` — distinct from `_provenance` (per-field).

### Lifecycle state (mid-planning requirement)
- `status` is a **core-managed column** (like `file_id`/`created_at`), NOT a
  media-type — state names (`new/pending/parsed/enriched/failed/deleted`) are
  pipeline-stage names. NO media strings.
- The **orchestrator** advances state (pure `nextState(current,event)` transition
  fn in `internal/enrich`); the **store** persists it. Illegal transitions are
  rejected (return error, do not persist).
- Statuses are **unexported string constants** in `internal/store` (used via
  `Item.Status`), to avoid inflating the exported-symbol count (store is at 11
  WARN). The wire/API exposes them as plain strings.
- On hard stage failure: `status=failed` + `_error{stage,code,message,retryable}`;
  retryable → `failed→pending` on re-scan (Phase B async; Phase A records).

### Config-driven selection (core media-type-agnostic — arch §0 #1)
- Plugin selection reads `module.MetadataSources[]` from config. NEVER branch on
  `if mediaType == "tv"`. The strings `"tv"`/`"tmdb"`/`"kinopoisk"` appear ONLY in
  `internal/module` seed config (`registry.go` tvConfig) and tests/fixtures (AC-4).

## Anti-patterns specific to this feature (reject in review)
- Inventing a new proto service / capability type when an existing one fits.
- A generic/plugin-untyped accessor (`Call`, reflect, `protobuf.Any`).
- A plugin writing outside its own `sources.<id>` namespace.
- Storing provenance/state as new store METHODS (use the document + the `status`
  column; the store API stays at 11).
- Making statuses exported Go identifiers (inflates the symbol count).
- Putting pipeline orchestration in `api/` or `scan/` beyond the per-item call.
- A real HTTP fetch in Phase A (it is Phase B; Phase A's fetch is a stub).
- Single-implementation interfaces anywhere except the plugin seam.
