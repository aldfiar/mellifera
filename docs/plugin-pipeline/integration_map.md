# Integration Map — plugin-pipeline (Phase A)

> The completeness artifact: every seam where new/changed code meets the existing
> system, with before/after behavior. Grounding makes claims *correct*; this map
> makes sure none are *dropped*. Format mirrors `docs/scan-library/integration_map.md`.
> **Every MODIFY/CREATE file in the File Map appears in ≥1 seam; every seam has
> non-empty `After` + `Contract` + `evidence:`.** The Coverage Matrix is a
> template — the specifier fills owner task + joint test.

## Seams

| ID | Owner | Existing (before) | New / Changed | After (behavior at the seam) | Contract (invariant held) | Joint test | Evidence |
|---|---|---|---|---|---|---|---|
| **S1** | store | `items` table has no status column (`open.go:61-76`); `Item` has no `Status` (`items.go:15-26`) | `items` gains `status TEXT NOT NULL DEFAULT 'new'` + `items_status` index; `Item.Status` field; migration idempotent | Items carry a queryable lifecycle status; existing scan-library rows default to `new`; schema change is additive (AC-3) | Store is sole SQL owner; parameterized DDL; migrations idempotent (`open.go:33`); status is core-managed (never media-typed) | T04 store_test | `internal/store/open.go:33,61-76,117-123`, `items.go:15` |
| **S2** | enrich↔plugin | `Manager.Scanner(pluginID,capID)` is the only typed capability accessor (`manager.go:175`); no metadata_source routing | NEW `Manager.MetadataSource(pluginID,capID) (sdk.MetadataSource,error)` (mirrors `Scanner`) | enrich resolves a `metadata_source` capability to a typed `sdk.MetadataSource` client — no reflect, no `protobuf.Any` | Typed-accessor-per-capability (INV1, `internal/plugin/doc.go:14-19`); plugin 9→10 WARN (R10) | T02 manager_test | `internal/plugin/manager.go:175`, `internal/plugin/doc.go:14-19` |
| **S3** | enrich↔tv-parser | (none — tv-parser is new) | NEW `plugins/tv-parser` subprocess serving `metadata.v1.MetadataSource` + `plugin.v1.Plugin`; tvparse logic moved verbatim from base-scanner | enrich drives the 4-RPC chain (Match→BuildRequest→Convert→Merge) over gRPC to a crash-isolated subprocess; tv-parser parses filenames, writes `sources.tv-parser` | Plugins are stateless subprocesses (arch §0 #2); crash never aborts scan (soft-fail AC-6); go-plugin magic-cookie handshake | T05 enrich_test + T11 integration | `plugins/base-scanner/pluginsvc.go:22-72` (pattern), `proto/mellifera/metadata/v1/metadata.proto:12-31` |
| **S4** | enrich↔module | `Module` has only `Scanner`; `parseModule` DROPS `metadata_sources` (`registry.go:162`); the seeded TV config already carries it (`registry.go:56-73`) | `Module.MetadataSources []MetadataSourceBinding`; `parseModule` models the slot | enrich reads the ordered `metadata_sources[]` to decide which plugins run per library — selection is CONFIG-driven, never media-type-branched | Core is media-type-agnostic (arch §0 #1, AC-4); module is a config entity not code (`architecture.md:673`) | T05 enrich_test (priority chain) | `internal/module/registry.go:84-89,162,56-73` |
| **S5** | enrich↔document | scan assembles `{file_id,module_type,schema_version,parsed,ffprobe}` (`run.go:188`); no sources/provenance/view/stages | enrich mutates the document: writes `sources.<plugin>`, stamps `_provenance.<field>`, recomputes `_view`, appends `_stages[]`, sets `_error` on hard fail | Every enriched field is source-tagged + losslessly namespaced; the view is recomputable; namespace violations are rejected+reverted (arch §3.3) | Precision over collapse (arch §0 #4, D3); plugin writes ONLY `sources.<own_id>` or core rejects (arch §3.3 `:883-890`); `_view` always recomputable | T05 enrich_test + T11 json_extract | `internal/scan/run.go:188`, `architecture.md:772-839,883-890`, `common.proto:26-32` |
| **S6** | scan↔enrich | scan flow: GetLibrary→module→scanner→Scan→Identify→PutItem (`run.go:65-108`); no enrichment | scan calls `enrich.Enrich(...)` per item BETWEEN `Identify` and `PutItem`; scan gains an `internal/enrich` import | After discovery+identify, each item is enriched by the configured chain before persistence; scan stays the single entry `api` calls | `api→scan→enrich→{module,plugin}→store` downward-only, no cycle (AC-4); enrich is called by scan, never calls back | T08 run_test + T11 | `internal/scan/run.go:51,65,116`, `internal/api/router.go` (scan is the ONE domain call) |
| **S7** | scan↔store | `persist` does `Identify` then `PutItem` (`run.go:116-128`); `PutItem` upserts by `file_id` (`items.go:32`) | scan sets `Item.Status` (advanced state) + writes the enriched document before `PutItem` | The persisted Item reflects the furthest pipeline stage reached; upsert idempotency preserved (`id`+`created_at` kept) | `PutItem` upsert ON CONFLICT(file_id) (`items.go:32`); status is advanced by orchestrator, persisted by store; ctx-err precedence (AC-6) | T08 run_test + T11 | `internal/scan/run.go:116,133`, `internal/store/items.go:32` |
| **S8** | base-scanner | `Identify` calls `parseTV(relPath)` and returns TV fields (`scanner.go:45-47`) | `parseTV` REMOVED from base-scanner; `Identify` returns media-type-agnostic base fields only; tvparse.go moves to tv-parser | base-scanner is discovery+base-info only; TV-specific parsing lives in the tv-parser plugin (extraction, AC-1) | `scanner.v1.IdentifyResult` wire shape UNCHANGED (deprecate-don't-delete, AC-3); base-scanner stays media-type-agnostic | T07 scanner_test + T11 grep | `plugins/base-scanner/scanner.go:45-47`, `tvparse.go:22-108` |
| **S9** | pkg/sdk↔go-plugin | `ScannerPlugin` dual-side adapter (`scanner.go:49-63`); no metadata adapter | NEW `MetadataSource` interface + `MetadataSourcePlugin` adapter in `pkg/sdk/metadata.go` | A metadata_source plugin is servable via `sdk.Serve` and callable via a typed client — identical substrate to scanner | sdk imports only proto+go-plugin+grpc (INV2); ≥2 impls (gRPC client + test fake, R8); sdk 5→7 | T01 metadata_test + T02 manager_test | `pkg/sdk/scanner.go:35-63`, `serve.go:45` |
| **S10** | cmd wiring | main wires store→module→plugin(base-scanner)→scan→api (`main.go:56-113`); loads ONE plugin | main also constructs `enrich.Deps`, injects enrich into scan, and Load+Starts `tv-parser` (mirrors `:75-78`); reads `MELLIFERA_TV_PARSER` env | Two subprocess plugins run; enrich is part of the app graph; flat wiring readable in one file | Flat main.go, no DI/reflect (ai-arch §5); dev-mode filesystem plugin load (D11/Q20 extraction deferred) | T11 integration (full boot) | `cmd/mellifera/main.go:56-113,75-78` |
| **S11** | api↔store | `GET /items` → `QueryItems(ctx,libID,limit,offset)` (`handlers.go:117`); `itemDTO` omits status (`handlers.go:152`) | `QueryItems(ctx,libID,status,limit,offset)`; `?status=` query param (additive); `itemDTO.status` in response | Operators can list/filter items by lifecycle state over HTTP — pure delegation, no logic | `api/` pure delegation (ai-arch §3): parse→ONE call→write; `?status=` additive (AC-3); status filter optional (empty=all) | T09 handlers_test + T11 HTTP probe | `internal/api/handlers.go:117,152`, `router.go:40-45` |
| **S-proto** | proto | `metadata.v1`/`common.v1` generated but imported by NO Go source | Phase A begins importing `metadatav1`/`commonv1` into `pkg/sdk`,`internal/enrich`,`internal/plugin` | The already-designed enrichment contract becomes live; NO proto edit | Protos verbatim from arch §2 (R3, AC-3); additive; `.pb.go` exempt from symbol budget (`check.sh:36`) | T01 build + T11 | `proto/mellifera/metadata/v1/metadata.proto:12`, `common/v1/common.proto:26` |
| **S-integration** | e2e | scan-library `integration_test.go` scans a fixture dir | NEW `integration_pipeline_test.go`: discovery→tv-parser→provenance→state golden (AC-1) | A TV library scans end-to-end with per-plugin provenance + lifecycle status, listable via API | AC-1 golden; reviewer re-derives expected fields from fixture filenames | T11 golden + T12 re-derive | `integration_test.go` (scan-library pattern) |

`no_seam` entries: none — every File Map entry has a behavioral seam above.

## External boundary changes

| Boundary | Caller | Call | Timeout | Retry | Idempotency | evidence |
|---|---|---|---|---|---|---|
| tv-parser gRPC subprocess | internal/enrich (via plugin.Manager) | `MetadataSource.Match/BuildRequest/Convert/Merge` | handshake 15s (`manager.go:41`); per-RPC ctx deadline | go-plugin restart backoff 1s/2×/cap60s, 3 fails→failed (`manager.go:48-50`) | Match/Convert are pure; Merge upsert into own namespace is idempotent | `internal/plugin/manager.go:37-50`, `lifecycle.go:146` |
| base-scanner gRPC subprocess | internal/scan (unchanged) | `Scanner.Scan/Identify` | as scan-library | as scan-library (restart) | Identify pure; Scan stream resumable via `resume_cursor` | `internal/plugin/manager.go:37-50` |
| ffprobe subprocess | base-scanner | `exec.CommandContext("ffprobe", arg-slice...)` | 30s (`ffprobe.go:16`) | none (soft-fail) | read-only probe; all failures soft (AC-6) | `plugins/base-scanner/ffprobe.go:15-16,29` |
| SQLite | internal/store | parameterized SQL | none (WAL) | none | `PutItem` upsert by `file_id`; migration idempotent | `internal/store/open.go:33`, `items.go:32` |
| HTTP fetch (external enricher) | — | **Phase B — NOT in Phase A** | (Phase B: `RequestSpec.timeout_seconds`) | (Phase B) | (Phase B) | `metadata/v1/request_spec.proto:9-42` |

## Behavior-change impact on existing flows

| Flow | Before (scan-library) | After (Phase A) | Risk |
|---|---|---|---|
| `POST /libraries/{id}/scan` | discovery→identify→put (one plugin) | discovery→identify→ENRICH(chain)→put + status | scan latency +N RPCs/item; soft-fail keeps it correct (AC-6); returns existing `{discovered,persisted,warnings}` (+ status counts) — additive |
| `GET /items` response | itemDTO without status | itemDTO **+ `status`** (additive field); optional `?status=` filter | additive only; existing clients unaffected (AC-3) |
| `items` table | 6 generated columns, no status | + `status` column + index | additive DEFAULT 'new'; existing rows readable (AC-3) |
| `base-scanner` Identify | returns TV fields | returns base fields only (TV via tv-parser) | **behavior change** — downstream that relied on base-scanner emitting `season`/`episode` now gets them from the enrich stage (AC-1); wire shape unchanged |
| Module config `metadata_sources` | seeded but ignored (`registry.go:162`) | modeled + drives enrich | additive; existing config still parses |

## Coverage Matrix (specifier-filled: owner task + joint test per seam)

| Seam | Owner task | Joint test | Verified By |
|---|---|---|---|
| S1 store status | T04 | T04 store_test (column default + filter + re-Open idempotency) | reviewer |
| S2 enrich↔plugin accessor | T02 | T02 manager_test (MetadataSource accessor round-trip; base-scanner path intact) | reviewer |
| S3 enrich↔tv-parser gRPC | T06 | T05 enrich_test (in-process fake chain) + T11 integration (real subprocess) | reviewer |
| S4 enrich↔module bindings | T03 | T05 enrich_test (priority-ordered chain reads MetadataSources) | reviewer |
| S5 enrich↔document provenance | T05 | T05 enrich_test (sources/_provenance/_view/_stages shape) + T11 (json_extract probe) | reviewer |
| S6 scan↔enrich | T08 | T08 run_test (fake enricher) + T11 integration | reviewer |
| S7 scan↔store status | T08 | T08 run_test (Item.Status persisted; upsert idempotent) + T11 | reviewer |
| S8 base-scanner extraction | T07 | T07 scanner_test (base fields only) + T11 (extraction grep probe) | reviewer |
| S9 pkg/sdk metadata adapter | T01 | T01 metadata_test (round-trip) + T02 manager_test | reviewer |
| S10 cmd wiring | T10 | T11 integration (full boot, both plugins serving) | reviewer |
| S11 api↔store status filter | T09 | T09 handlers_test (?status= filter) + T11 (HTTP probe) | reviewer |
| S-proto import | T01 | T01 build (metadatav1/commonv1 compile when imported) + T11 | reviewer |
| S-integration e2e | T11 | T11 integration_pipeline_test.go (AC-1 golden) + T12 (independent re-derive) | reviewer |
