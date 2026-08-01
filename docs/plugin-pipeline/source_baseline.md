# Source Baseline — plugin-pipeline

> Grounding artifact (G1/G2). Transcribes what EXISTS today (the shipped
> `scan-library` slice, commit `7bcc6c9`) versus what this feature CREATEs vs
> MODIFYs. Every MODIFY target is verified to exist on disk now; every claim
> cites `evidence: <file>:<line>` ( gathered via direct source reads + the
> project's own `docs/.project_context.json` src_layout). No `.source_map.json`
> exists in this repo, so grounding is from direct source reads.
> **No `UNVERIFIED:` token remains in this file.**

## Greenfield-vs-additive posture

This feature is **ADDITIVE** (arch §0 principle 6, deprecate-don't-delete). It
realizes the `enrich` engine that `scan-library` + `architecture.md` DEFERRED
(`architecture.md:1534`, `ai-architecture.md:57`). It does NOT rewrite any
shipped package; it extracts `parseTV` out of `base-scanner`, realizes the
deferred `internal/enrich`, and adds a lifecycle `status` column to `items`.

## What EXISTS now (scan-library, shipped) — the MODIFY targets

Module map (exported-symbol counts; `WARN` = >8 <12, pre-justified R10). Source:
`docs/.project_context.json` `src_layout` + direct reads.

| Package | Exported symbols (shipped) | Count | Evidence |
|---|---|---|---|
| `pkg/sdk` | `Serve`, `ScannerPlugin`, `Scanner`, `HandshakeConfig`, `Capability` | 5 | `pkg/sdk/doc.go:12-18`, `scanner.go:23,35,49`, `serve.go:20,45` |
| `internal/store` | `Store`, `Item`, `Library`, `Open`, `Close`, `DB`, `CreateLibrary`, `GetLibrary`, `GetItem`, `PutItem`, `QueryItems` | **11 WARN** | `internal/store/doc.go:17-29`, `open.go:21,130,149,157`, `items.go:15,32,59,70`, `libraries.go:13,24,41` |
| `internal/plugin` | `Manager`, `Deps`, `Health`, `Open`, `Load`, `Start`, `Stop`, `Status`, `Scanner` | **9 WARN** | `internal/plugin/doc.go:20-31`, `manager.go:56,64,74,132,149,175`, `lifecycle.go:25,53,102` |
| `internal/module` | `Registry`, `Module`, `ScannerBinding`, `Open`, `Get`, `List` | 6 | `internal/module/doc.go:14-21`, `registry.go:77,84,94,103,142,152` |
| `internal/scan` | `Deps`, `Result`, `Run` | 3 | `internal/scan/doc.go:14-19`, `run.go:22,31,51` |
| `internal/api` | `Deps`, `Principal`, `New` | 3 | `internal/api/doc.go:16-20`, `router.go:21,30,37` |
| `plugins/base-scanner` | (package main — 0 exported) | 0 | `plugins/base-scanner/doc.go:22` |
| `cmd/mellifera` | (package main — 0 exported) | 0 | `cmd/mellifera/main.go:56` |

`internal/enrich`, `internal/stream`, `internal/janitor` are **DEFERRED** (not
built by scan-library) — `ai-architecture.md:57`, `architecture.md:1534`.

### MODIFY targets (verified to exist now — G2)

| Target | Exists? | What changes (this feature) | Evidence (current) |
|---|---|---|---|
| `internal/store/items.go` (`Item`, `PutItem`, `GetItem`, `QueryItems`, `scanItem`) | YES | `Item` gains `Status` field; `PutItem` writes `status` column; `QueryItems` gains a `status` filter param; `scanItem`/SELECT read status | `items.go:15-26,32,59,70,102,109` |
| `internal/store/open.go` (`schemaSQL`) | YES | ADDITIVE migration: `items.status TEXT NOT NULL DEFAULT 'new'` + `items_status` index | `open.go:33,61-76,117-123` |
| `internal/module/registry.go` (`Module`, `parseModule`) | YES | `Module` gains `MetadataSources` field; new `MetadataSourceBinding` type; `parseModule` models the `metadata_sources` slot (currently dropped) | `registry.go:84-89,162`, seeded TV config at `registry.go:42-74` already carries `metadata_sources` |
| `internal/scan/run.go` (`Run`, `runScan`, `persist`, `newItem`, `assembleDocument`) | YES | scan flow integrates enrichment + state: identify → enrich(stage chain) → assemble document (`sources`/`_provenance`/`_view`/`_stages`) + set `Status` → PutItem | `run.go:51,65,116,133,188` |
| `internal/plugin/manager.go` (`Manager`) | YES | ADD a typed `MetadataSource(pluginID, capabilityID string) (sdk.MetadataSource, error)` accessor (mirrors `Scanner` at `manager.go:175`) | `manager.go:175` (Scanner accessor) |
| `pkg/sdk/scanner.go` / new `pkg/sdk/metadata.go` | YES (pkg) | ADD `MetadataSource` interface + `MetadataSourcePlugin` dual-side adapter (mirrors `Scanner`/`ScannerPlugin`) | `scanner.go:35,49` (the pattern to mirror) |
| `plugins/base-scanner/scanner.go` (`scannerImpl.Identify`) | YES | REMOVE the `parseTV(...)` call; `Identify` returns media-type-agnostic base fields only (extraction) | `scanner.go:45-47` (the single `parseTV` call site) |
| `cmd/mellifera/main.go` (`main`) | YES | wire `internal/enrich`; Load+Start `tv-parser` plugin (mirrors base-scanner wiring) | `main.go:56-113` (wiring order), `:75-78` (base-scanner Load/Start) |
| `internal/api/handlers.go` (`listItems`, `itemDTO`) + `router.go` | YES | `itemDTO` gains `status`; `GET /items` gains optional `?status=` filter (additive); pass status into `QueryItems` | `handlers.go:117,152`, `router.go:40-45` |

### CREATE targets (new paths — no existence check needed)

| Target | Role |
|---|---|
| `internal/enrich/doc.go` + impl | the deferred enrich engine: inline serial `Match→BuildRequest→Convert→Merge` orchestrator + state-transition function + namespace enforcement + provenance stamping |
| `plugins/tv-parser/` (`main.go`, `parser.go`, `pluginsvc.go`, `tvparse.go`) | new subprocess binary implementing `metadata_source` capability; `tvparse.go` is the verbatim move of `plugins/base-scanner/tvparse.go` |
| `internal/enrich/*_test.go`, `plugins/tv-parser/*_test.go`, `integration_pipeline_test.go` | table tests per exported symbol + AC-1 golden e2e |

## Key shipped contracts (verbatim, load-bearing)

### The enrichment pipeline is ALREADY designed + generated (forward contract)

`proto/mellifera/metadata/v1/metadata.proto` defines the `MetadataSource`
service — the 4-RPC enrichment chain this feature orchestrates. **It is already
generated and committed by scan-library** but imported by NO Go source yet.

```proto
service MetadataSource {
  rpc Match(MatchRequest) returns (MatchResult);
  rpc BuildRequest(BuildRequestRequest) returns (BuildRequestResponse);
  rpc Convert(ConvertRequest) returns (ConvertResult);
  rpc Merge(MergeRequest) returns (MergeResult);
}
// BuildRequestRequest.auth  carries mellifera.common.v1.AuthContext   (metadata.proto:73-78)
// ConvertResult.provenance  is map<string, common.v1.Provenance>       (metadata.proto:101-119)
```
Evidence: `proto/mellifera/metadata/v1/metadata.proto:12-31` (service),
`:35-169` (messages). `internal/enrich` is the designated orchestrator
(`architecture.md:1534`). **This is why this feature needs NO new proto service
for Phase A** — `metadata.v1` already exists; we only START importing it.

### Provenance schema is ALREADY designed

`common.v1.Provenance` (`proto/mellifera/common/v1/common.proto:26-32`) with the
comment **"Stored under document[`_provenance`][field_path]"** (`common.proto`).
The document model (arch §3.1, `architecture.md:772-839`) has three tiers:
`identifiers`, `sources.<plugin_id>` (lossless), `_view` (recomputable), plus
`_provenance`. The store ALREADY has generated columns projecting these paths:

```sql
display_title TEXT GENERATED ALWAYS AS (json_extract(document,'$._view.title.value')) VIRTUAL
display_rating REAL  ... '$._view.rating.value'
tmdb_id       INTEGER ... '$.identifiers.tmdb_id'
kinopoisk_id  INTEGER ... '$.identifiers.kinopoisk_id'
```
Evidence: `internal/store/open.go:72-75`. → Provenance is **document JSON**, not
a store API change — critical given `internal/store` is at 11 WARN.

### AuthContext / required_secrets ALREADY exist (for Phase B external enrichers)

- `common.v1.AuthContext{Mode, server_secrets}` — `common.proto:52-65`,
  `architecture.md:153-168`.
- `plugin.v1.CapabilityDeclaration.required_secrets` (field 6) — `plugin.proto`,
  `architecture.md:606-609`. Drives `AuthContext` at `BuildRequest`.

### The extraction boundary (parseTV) is surgically clean

`parseTV` has **exactly one call site** (`plugins/base-scanner/scanner.go:47`
inside `Identify`) and **zero I/O dependencies** — it takes a `string`, returns
`(*structpb.Struct, float64, string)`. Its entire surface (`tvparse.go`): 4
compiled regexes (`seasonEpisodeRe`, `resolutionRe`, `releaseGroupRe`, `yearRe`)
+ `parseTV`/`cleanTitle`/`parentDir`/`atoi`. Output contract:
`scanner.v1.IdentifyResult.{parsed, confidence, parser_name}`. Evidence:
`plugins/base-scanner/tvparse.go:22-28,38,88,98,108`, `scanner.go:45-47`.

## Test inventory (shipped) — patterns this feature inherits

- One `<pkg>/<symbol>_test.go` per exported symbol, table-driven, in-package
  (`docs/scan-library/source_baseline.md:51-65`).
- `store` tests use a temp SQLite DB; `plugin` tests use an in-process fake via
  `sdk.Serve` (`internal/plugin/testdata/fakeplugin/main.go`); `scan` tests
  inject an unexported `scannerResolver` (`internal/scan/run.go:60`).
- `integration_test.go` — AC-1 golden end-to-end scan (stdlib black-box).
- `check.sh` FAILS on any exported symbol without a co-located table test
  (`.claude/skills/mellifera-build/scripts/check.sh:21-53`).

## Cross-module dependency table (shipped; the seams this feature extends)

| Symbol | Defined in | Imported by | Evidence |
|---|---|---|---|
| `sdk.Scanner` | `pkg/sdk/scanner.go:35` | `internal/scan/run.go`, `internal/plugin/manager.go`, `plugins/base-scanner/scanner.go` | `scanner.go:35` |
| `plugin.Manager.Scanner` | `internal/plugin/manager.go:175` | `internal/scan/run.go` (the typed accessor) | `manager.go:175` |
| `module.Registry.Get` | `internal/module/registry.go:142` | `internal/scan/run.go:72` | `registry.go:142` |
| `store.PutItem` / `GetItem` / `QueryItems` | `internal/store/items.go:32,59,70` | `internal/scan/run.go`, `internal/api/handlers.go` | `items.go:32` |
| `store.DB()` | `internal/store/open.go:157` | `internal/module/registry.go` (seam S10) | `open.go:157` |
| `scan.Run` | `internal/scan/run.go:51` | `cmd/mellifera/main.go:81` (closure), `internal/api/router.go` | `run.go:51` |
| `sdk.Serve` | `pkg/sdk/serve.go:45` | `plugins/base-scanner/main.go:31`, `internal/plugin/testdata/fakeplugin/main.go` | `serve.go:45` |

Dependency direction (downward only, no cycles): `api → scan → {module, plugin}
→ store`; `proto/` + `pkg/sdk` are shared leaves (`ai-architecture.md:63-65`).
This feature inserts `enrich` between `scan` and `{module, plugin}`:
`api → scan → enrich → {module, plugin} → store` (still downward).

## Architectural invariants this feature MUST hold (inherited from scan-library)

1. Plugins are stateless subprocesses (arch §0 #2).
2. Core is an orchestrator — no media-type strings (`"tv"`, `"tmdb"`) in core
   code; they live in config (arch §0 #1). **State names are pipeline-stage
   names, not media names** — `new/parsed/enriched/...` are media-type-agnostic.
3. Dynamic JSON documents, not typed DTOs (arch §0 #3, D2).
4. `api/` is pure delegation — pipeline orchestration lives in `enrich/`, not
   `api/` (`ai-architecture.md:30-38`).
5. Downward-only dependency direction; no cycles.
6. Deprecate, don't delete (arch §0 #6) — the `status` column is an additive
   nullable/defaulted addition; scan-library items get the default.
