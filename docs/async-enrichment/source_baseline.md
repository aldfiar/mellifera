# Source Baseline — async-enrichment (Phase B1)

> Snapshot of the code this feature refactors/extends. All facts are G2-verified
> against live source on `feature/async-enrichment` (off `main` @ `6507277`,
> scan-library + plugin-pipeline Phase A). No `.source_map.json` exists in-repo;
> every fact below was transcribed from a direct source Read. Paths are
> repo-relative (`mellifera/…` elided to `…/`) — see evidence anchors for the
> absolute canonical path under `mellifera/`.

## What EXISTS now (Phase A) vs what this feature does

- **EXISTS (reuse, extend):** `internal/enrich` (serial inline orchestrator),
  `internal/scan` (drives enrich inline), `internal/store` (items.status +
  `enrichment_failures` table **already created**), `internal/module`
  (`MetadataSourceBinding.AuthMode` already modeled), `internal/plugin`
  (caps-driven launch + typed accessors), `pkg/sdk` (`MetadataSource`),
  `plugins/{base-scanner,tv-parser}`, `cmd/mellifera`, `internal/api`.
- **THIS PLAN (Phase B1 — async substrate):** refactor `internal/enrich`'s
  dispatch from serial-inline to a **derived async queue + worker pool +
  per-item leases + in-memory retry/backoff + `enrichment_failures` ledger**
  (loop-safety). `scan` stops enriching inline — it persists items `pending` and
  returns; workers drain. `failed→pending` retry is exercised; `ready`/`stale`
  lifecycle states added. Uses the EXISTING `tv-parser` (local, no auth) to prove
  the async path end-to-end with **no new plugin, no external HTTP, no new dep**.
- **DEFERRED (outlined, not this plan):** B2 image media type + EXIF enricher;
  B3 external TMDB enricher + AuthContext/secrets. Both consume the B1 queue.

## Module: `internal/enrich` — the serial orchestrator (3 exported)

`evidence: internal/enrich/doc.go:1-47` (package contract), `enrich.go:1-199`,
`state.go:1-81`, `chain.go:1-146`, `provenance.go:1-67`.

- **`Enrich(ctx, deps Deps, mod module.Module, doc map[string]any, base *scannerv1.IdentifyResult) (map[string]any, string, Result, error)`** — `enrich.go:56`. The serial-inline entry. Runs the configured `metadata_source` chain for ONE item in module-priority order, mutating the document (`sources`/`_provenance`/`_view`/`_stages`), returning the advanced status. **THIS becomes the per-item WORK a queue worker performs** (the dispatch wrapper is new; the chain body is reused).
- **`type Deps struct { Store *store.Store; Plugins *plugin.Manager; Modules *module.Registry }`** — `enrich.go:34-38`. Collaborators. Carries Store for Phase B persistence/retry (`enrich.go:33`).
- **`type Result struct { Stages, Succeeded int; Warnings []string }`** — `enrich.go:42-46`.
- `metadataResolver func(pluginID, capabilityID string) (sdk.MetadataSource, error)` — `enrich.go:29`. Unexported test seam (R8); production = `plugin.Manager.MetadataSource`.
- `enrichDoc(...)` — `enrich.go:63`. Orchestrator body: iterates `orderedSources(mod.MetadataSources)` (`enrich.go:74`), calls `runSource` per binding, advances status via `advance()`/`nextState`, applies contributions (`applyContribution` `:148`), appends `_stages` (`appendStage` `:129`).
- `nextState(current string, event enrichEvent) (string, error)` — `state.go:74`. PURE table-driven state machine. **Extended here:** add `stale`/`ready` states + transitions; `retry` (failed→pending) is defined (`state.go:65`) but NOT exercised in Phase A — this plan exercises it.
- `runSource(ctx, resolve, src, mod, base) sourceResult` — `chain.go:49`. The full 4-RPC chain: Match→BuildRequest→Convert→Merge (`chain.go:58-90`). Fetch between BuildRequest and Convert is a no-op stub in Phase A (`chain.go:65-69` comment) — Phase B3 swaps in a real fetcher with no signature change. **Per-source retry/backoff wraps this in B1.**
- `validateNamespace(doc, pluginID)` — `chain.go:104`. Enforces §3.3: plugin writes ONLY `sources.<its_own_id>`.
- Status literals — `state.go:11-18`: `new,pending,parsed,enriched,failed,deleted`. **B1 adds `stale,ready`.**

**Patterns:** soft-fail (AC-6) — one bad source never aborts the item (`enrich.go:52`, `doc.go:42`); per-source isolation — a failing source commits nothing (`chain.go:30`, `applyContribution` only on success); package clock `var now = time.Now` (`enrich.go:21`) for deterministic timestamps.

## Module: `internal/scan` — the driver that becomes the enqueue point (3 exported)

`evidence: internal/scan/run.go:1-257`.

- **`Run(ctx, deps Deps, libraryID int64) (Result, error)`** — `run.go:57`. Pure-delegation entry (the ONLY func api calls). Delegates to `runScan`.
- **`type Deps struct { Store; Plugins; Modules; Enrich enrich.Deps }`** — `run.go:26-31`. `Enrich` is a field, not a symbol.
- **`type Result struct { LibraryID; Discovered; Persisted; Warnings; StartedAt; FinishedAt }`** — `run.go:36-43`.
- `runScan(...)` — `run.go:88`. GetLibrary → module.Get → resolve scanner → `sc.Scan(ctx, req)` stream (`run.go:109`) → drain loop (`run.go:117-131`) → `persist` per file.
- **`persist(ctx, st, sc, f, mod, libraryID, enrich, res)` — `run.go:141`. THE MIGRATION POINT.** Today: `Identify` (`:142`) → `enrich(...)` INLINE (`:147`, blocking) → `PutItem` with the returned status (`:153`). **B1: remove the inline enrich call; write the item with status `pending` (or `new`→queue derives `pending`); return immediately. The enrich work moves to the worker.**
- `enricher func(ctx, mod, doc, base) (doc, status, enrich.Result, error)` — `run.go:74`. Unexported test seam; production = `prodEnricher(deps.Enrich)` (`run.go:78`). Seam S6.
- `assembleBaseDoc(f, id, moduleType, schemaVersion)` — `run.go:221`. Builds the base §3.1 doc (`file_id`,`module_type`,`schema_version`,`parsed`,`ffprobe`). **The worker must reconstruct the per-item base (IdentifyResult or its components) to drive Match — either from the persisted document or by re-Identify. Design seam (see integration_map S-base).**
- `itemID(libraryID, fileID)` — `run.go:183`. Deterministic `itm_<lib>_<fileid>` (PutItem upserts by file_id, preserves id on conflict).

**Pattern:** scan streaming + soft per-file fail (`run.go:140`, AC-6 philosophy).

## Module: `internal/store` — queue substrate (4 exported; methods don't count)

`evidence: internal/store/open.go:1-218`, `items.go:1-164`, `libraries.go`, `doc.go`.

- **`type Store struct { db *sql.DB }`** — `open.go:21`. Sole owner of the `*sql.DB` handle.
- **`func Open(ctx, dsn) (*Store, error)`** — `open.go:131`. Idempotent migrations (CREATE…IF NOT EXISTS), WAL, `ensureItemsStatus` (`:161`).
- **`type Item struct { ID; ModuleID; LibraryID; FileID; RelativePath; MediaType; Document json.RawMessage; SchemaVersion; Status; CreatedAt; UpdatedAt }`** — `items.go:16-28`. `Status` persisted (`items.go:25`).
- **`type Library struct {...}`** — `libraries.go:13`.
- **`(s *Store) PutItem(ctx, it Item) error`** — `items.go:42`. Upsert by `file_id` (`ON CONFLICT(file_id) DO UPDATE`, `:51-63`); preserves `id`+`created_at`, refreshes mutable fields + `status` + `updated_at`. **The queue derivation reads `items` (status, document namespaces via the row).**
- **`(s *Store) GetItem(ctx, id) (Item, error)`** — `items.go:74`.
- **`(s *Store) QueryItems(ctx, libraryID, status, limit, offset) ([]Item, error)`** — `items.go:88`. `status` is a `WHERE status = ?` filter (NEVER interpolated — `items.go:87,99-108`); empty status = all. **Extended trivially for `pending`/`ready`/`stale` (new status values; no SQL change).**
- **`enrichment_failures` table ALREADY EXISTS** — `open.go:98-107`:
  `(item_id TEXT, plugin_id TEXT, status TEXT, reason TEXT, attempts INTEGER, failed_at TEXT, next_eligible_at TEXT, PRIMARY KEY(item_id,plugin_id))`. Matches arch §9.1 (`architecture.md:1456-1465`) verbatim. **B1 only adds store METHODS (RecordFailure/ClearFailure/ListFailures/eligibility) — no DDL change.**
- `ensureItemsStatus` — `open.go:161`. PRAGMA-guarded additive `status` column migration + `items_status` index (`:194`). **Model for any additive column migration.**
- Driver: `modernc.org/sqlite` (pure-Go, no CGO) — `open.go:13`. Parameterized SQL everywhere (`?` placeholders) — `items.go:54,101,107`.
- `Store.DB() *sql.DB` — `open.go:210`. Accessor sharing the handle with trusted `internal/module` (seam S10).

## Module: `internal/module` — config model (5 exported)

`evidence: internal/module/registry.go:50-130,192-225`, `doc.go`.

- **`type Module struct { ID; MediaType; SchemaVersion; Scanner; MetadataSources []MetadataSourceBinding }`** — `registry.go:91-97`.
- **`type MetadataSourceBinding struct { PluginID; CapabilityID; Priority; Enabled; AuthMode; Options json.RawMessage }`** — `registry.go:113-120`. **`AuthMode` already modeled** (`:118`); "opaque config string; Phase B interprets SERVER/CLIENT" (`:110-111`).
- **`type ScannerBinding struct { PluginID; CapabilityID; Options }`** — `registry.go:102-106`.
- Seeded TV config (`registry.go:46-81`): scanner=base-scanner; metadata_sources = tv-parser (pri 1, **no auth_mode** = local) + kinopoisk (pri 2, `CLIENT`) + tmdb (pri 3, `SERVER`).
- `Open(ctx, *store.Store) (*Registry, error)` — `registry.go:125`. Seeds built-in module, loads enabled modules into in-memory cache; `Get`/`List` are pure (no DB) (`:122-124`).
- `parseModule` decodes `metadata_sources[].auth_mode` (`registry.go:196-225`).

**RECONCILIATION (load-bearing, decision D-Q1):** arch §4.4 (`architecture.md:1011`) says a source is queueable iff `auth_mode==SERVER`. But tv-parser (the primary enricher) has **empty** `AuthMode` (local parser, no fetch). The enhanced objective mandates "async queue for EVERY enrichment." **Decision: queueable iff `AuthMode != "CLIENT"`** (empty/local and SERVER are both server-runnable; only CLIENT needs user credentials → Mode B). Justified by seeded config + objective. Surfaced at plan-review.

## Module: `internal/plugin` — caps-driven launch + accessors (4 exported)

`evidence: internal/plugin/manager.go`, `lifecycle.go`, `doc.go` (full signatures pending Explore agent; key facts):
- `Manager` type with typed accessors `Scanner(pluginID,capID)` and `MetadataSource(pluginID,capID)` — mirror pattern (`plugin-pipeline plan step 2`; `MetadataSource` added in Phase A). **The worker resolves per-source clients via `Manager.MetadataSource`.**
- `Load(id, path, caps)` + `Start()` / `Stop()` — caps-driven subprocess launch (go-plugin gRPC). Plugin crash isolation (arch §0 #2) holds in B1 — a crashing enricher is a failed RPC, the worker requeues.
- Constructor wired in `cmd/mellifera/main.go`.

## Module: `pkg/sdk` — capability clients (7 exported, WARN at 8)

`evidence: pkg/sdk/metadata.go:1-101`, `scanner.go`.
- **`type MetadataSource interface { Match; BuildRequest; Convert; Merge }`** — `metadata.go` (4-RPC chain, arch §2.1.3 / `metadata.proto:284-303`).
- **`MetadataSourcePlugin`** — dual-side go-plugin adapter (mirror `ScannerPlugin`).
- `Scanner` interface + adapter (`scanner.go`).
- **No edit for B1** (the contract is unchanged; only B3 touches BuildRequest's real fetch).

## Module: `cmd/mellifera` — composition root (0 exported; package main)

`evidence: cmd/mellifera/main.go:1-191` (full wiring pending Explore).
- Constructs `store.Open` → `module.Open` → `plugin.Manager` (Load+Start base-scanner + tv-parser) → `scan.Deps{Enrich: enrich.Deps{...}}` → API.
- **B1 adds:** construct the async `enrich.Queue` over `(store, plugins, modules)`; `queue.Start()` a bounded worker pool; scan persists `pending` and signals the queue; `queue.Stop()` on shutdown. Env vars for pool size / retry caps.

## Module: `internal/api` — handlers (3 exported)

`evidence: internal/api/handlers.go:1-195` (full signatures pending Explore).
- `POST /libraries/{id}/scan` → `scan.Run` (today: **blocking** until enriched; B1: returns once items are persisted `pending` — enrichment is async).
- `GET /api/v1/items?status=` → `store.QueryItems(ctx,libID,status,...)` (`items.go:88`). `?status=` already supports any status value (`handlers.go` DTO carries `status`). **Trivially lists `pending`/`ready`/`stale` once those values are produced — no API contract change.**

## Plugins (package main — 0 exported each)

`evidence: plugins/base-scanner/`, `plugins/tv-parser/` (signatures pending Explore).
- `base-scanner` = `scanner` capability (walk + ffprobe + base identify).
- `tv-parser` = `metadata_source` capability (Match/BuildRequest/Convert/Merge; writes `sources.tv-parser`). **The queueable source B1 exercises (local, no auth).**
- Pattern for B2's image enricher + B3's TMDB enricher (mirror `pluginsvc.go` handshake + `parser.go` impl).

## Protos (generated — exempt from budget; NO edits for B1)

`evidence: proto/mellifera/metadata/v1/metadata.proto:284-372`, `common/v1/common.proto:155-160`.
- `MetadataSource` 4-RPC service (`metadata.proto:284-303`). `BuildRequestRequest.auth` = `common.v1.AuthContext` (`metadata.proto:348`) — **B3 injects SERVER secrets; B1 passes empty (unchanged from Phase A).**
- `AuthContext` message (`architecture.md:155`) with `auth_mode`; `required_secrets` (`architecture.md:606-609`). **B3 only.**

## Cross-Module Dependencies (the seams this feature opens)

| Symbol / data | Defined in | Imported/Used by | B1 change |
|---|---|---|---|
| `enrich.Enrich` (per-item chain) | `internal/enrich/enrich.go:56` | `internal/scan/run.go:80` (`prodEnricher`) | called by the WORKER instead of inline by scan; signature unchanged |
| `enrich.nextState` (state machine) | `internal/enrich/state.go:74` | `internal/enrich/enrich.go:121` | add `stale`/`ready`; exercise `retry` |
| `enrich.runSource` (4-RPC + retry target) | `internal/enrich/chain.go:49` | `internal/enrich/enrich.go:78` | wrapped by per-source retry/backoff loop |
| `store.PutItem` (upsert) | `internal/store/items.go:42` | `internal/scan/run.go:153` | scan writes `pending`; worker writes advanced status |
| `store.QueryItems` (?status=) | `internal/store/items.go:88` | `internal/api/handlers.go` | new status values pass through (no SQL change) |
| `enrichment_failures` table | `internal/store/open.go:98` | (none yet) | NEW store methods read/write it (derivation + ledger) |
| `module.MetadataSourceBinding.AuthMode` | `internal/module/registry.go:118` | `internal/enrich` (derivation) | derivation reads it (queueable iff != CLIENT) |
| `plugin.Manager.MetadataSource` | `internal/plugin/manager.go` | `internal/enrich/enrich.go:29` | worker resolves clients via it (unchanged) |
| `sdk.MetadataSource` | `pkg/sdk/metadata.go` | `internal/enrich/chain.go:54` | unchanged (B3 only) |

## Test Inventory

`evidence: internal/enrich/enrich_test.go` (372 lines), `internal/store/store_test.go` (366), `internal/plugin/manager_test.go` (439), `internal/module/parse_test.go`, `internal/scan/*_test.go`.
- **Framework:** Go `testing` (table-driven), in-package fakes via the unexported resolver seams (`enrich.metadataResolver`, `scan.scannerResolver`/`scan.enricher`) — R8 "second implementation" pattern. No external mock framework.
- `internal/enrich/enrich_test.go` — `nextState` table test (every legal+illegal transition), `Enrich` soft-fail/namespace-enforcement/provenance. **B1 extends nextState table for `stale`/`ready`; adds queue/lease/ledger/retry tests.**
- `internal/store/store_test.go` — `TestStore_StatusColumn_*` (default, round-trip, migration). **B1 adds `enrichment_failures` method tests.**
- Integration: `integration_pipeline_test.go` (AC-1 golden, plugin-pipeline). **B1 adds an async golden (scan→enqueue→drain→ready; lease no-double; failing-source→ledger).**

## Git State

- Branch `feature/async-enrichment`, off `main` @ `6507277` (`feat(plugin-pipeline): Phase A — multi-stage plugin pipeline + Item lifecycle state`). Phase A shipped. `git status` shows pre-existing unrelated `backend/` deletions in the parent repo (NOT in scope — mellifera is the project_scope). **No `backend/` files are touched by this plan.**
