# Contracts — plugin-pipeline (Phase A)

> Shared types, interfaces, import map, and the refactoring map. Phase A scope.
> All signatures are GROUNDED in shipped code (cited) or are NEW additive types
> (clearly marked `[NEW]`). No proto service is invented — `metadata.v1` already
> exists (`proto/mellifera/metadata/v1/metadata.proto:12-31`); Phase A only STARTS
> importing it.

## 1. Module boundaries + dependency map (Phase A)

Dependency direction stays **downward only** (`ai-architecture.md:63-65`). This
feature INSERTS `internal/enrich` between `internal/scan` and `{module, plugin}`:

```
api ─► scan ─► enrich ─► {module, plugin} ─► store
                       └─► (proto metadatav1/commonv1 via pkg/sdk)
```

`internal/enrich` sits at the same level as `internal/scan` (the metadata-side
analog — `architecture.md:1534`, `ai-architecture.md:61-62`). `scan` calls
`enrich` per-item between `Identify` and `PutItem`. No cycle: enrich imports
module+plugin (like scan), scan imports enrich.

## 2. The plugin-category interfaces (≥2 implementations)

### 2a. `sdk.MetadataSource` `[NEW]` — the enrichment capability client interface

Mirrors `sdk.Scanner` (`pkg/sdk/scanner.go:35`). Lives in a new
`pkg/sdk/metadata.go` (keeps `scanner.go` untouched — additive).

```go
// pkg/sdk/metadata.go  [NEW]
type MetadataSource interface {
    Match(ctx context.Context, req *metadatav1.MatchRequest) (*metadatav1.MatchResult, error)
    BuildRequest(ctx context.Context, req *metadatav1.BuildRequestRequest) (*metadatav1.BuildRequestResponse, error)
    Convert(ctx context.Context, req *metadatav1.ConvertRequest) (*metadatav1.ConvertResult, error)
    Merge(ctx context.Context, req *metadatav1.MergeRequest) (*metadatav1.MergeResult, error)
}

// MetadataSourcePlugin [NEW] — dual-side go-plugin adapter, mirrors ScannerPlugin (pkg/sdk/scanner.go:49).
type MetadataSourcePlugin struct {
    plugin.NetRPCUnsupportedPlugin
    Impl MetadataSource
}
// GRPCServer registers metadatav1.MetadataSourceServer; GRPCClient returns the gRPC client impl.
```
- **≥2 implementations** (R8 justification, same as `sdk.Scanner`): (1) the
  subprocess gRPC client returned by `MetadataSourcePlugin.GRPCClient`; (2) an
  in-process test fake (in `internal/enrich` tests, mirroring scan's
  `scannerResolver` seam at `internal/scan/run.go:60`). NOT a single-impl interface.
- **Symbol budget**: `pkg/sdk` 5 → 7 (`MetadataSource`, `MetadataSourcePlugin`). Under 8. Evidence current: `pkg/sdk/doc.go:12-18`.

### 2b. `plugin.Manager.MetadataSource` `[NEW]` — typed capability accessor

Mirrors `Manager.Scanner(pluginID, capabilityID)` (`internal/plugin/manager.go:175`).
The architecture FORBIDS generic `Call`/reflect/`protobuf.Any`
(`internal/plugin/doc.go:14-19`); each capability gets a typed accessor.

```go
// internal/plugin/manager.go  [MODIFY — additive method]
func (m *Manager) MetadataSource(pluginID, capabilityID string) (sdk.MetadataSource, error)
```
- **Symbol budget**: `internal/plugin` 9 → **10 WARN** (R10-justified, <12 fail). Evidence current: `internal/plugin/doc.go:20-31`.

## 3. Shared types

### 3a. Lifecycle status `[NEW field on existing type + new column]`

```go
// internal/store/items.go  [MODIFY — additive field]
type Item struct {
    // ... existing fields (items.go:16-26) unchanged ...
    Status string // [NEW] core-managed lifecycle state; one of Status* constants
}

// internal/store/items.go  [NEW constants] — exported (counted, but 1 const-block = grouped)
const (
    StatusNew      = "new"
    StatusPending  = "pending"
    StatusParsed   = "parsed"
    StatusEnriched = "enriched"
    StatusFailed   = "failed"
    StatusDeleted  = "deleted"
)
```
- **Symbol-budget note**: a single parenthesized `const (…)` block is ONE
  top-level decl for the human reader but `check.sh` counts each `const [A-Z]`
  line. To stay safe, declare the status set as a **single unexported map or a
  doc.go enum comment + exported string literals inlined** — see
  `conventions.md`. **Decision: keep statuses UNEXPORTED string constants**
  (`statusNew`, …) used only via the `Item.Status` field; the wire/API exposes
  them as plain strings. This keeps `internal/store` at 11 (no new exported
  symbols). The state set is documented in `doc.go` + `acceptance.md`, not as
  exported Go identifiers. (Revisit if a typed enum is needed.)

### 3b. Module enrichment bindings `[NEW field + type]`

```go
// internal/module/registry.go  [MODIFY — additive field; models the already-seeded metadata_sources slot]
type Module struct {
    ID, MediaType string
    SchemaVersion int
    Scanner         ScannerBinding          // existing (registry.go:87)
    MetadataSources []MetadataSourceBinding // [NEW] ordered by priority
}
type MetadataSourceBinding struct { // [NEW type] — +1 symbol → internal/module 6 → 7
    PluginID, CapabilityID string
    Priority               int
    Enabled                bool
    AuthMode               string // "server" | "client" (arch §2.4 #4)
    Options                json.RawMessage
}
```
- Evidence the slot already exists in CONFIG: the seeded TV module carries
  `metadata_sources` (`internal/module/registry.go:56-73`) but `parseModule`
  (`registry.go:162`) currently DROPS it. This feature models it. `internal/module` 6 → 7. Under 8.

### 3c. Document provenance / progress schema (dynamic-JSON — NO new Go types)

The `Item.Document` (`json.RawMessage`, opaque to store — `internal/store/items.go:21`)
gains these sub-objects, assembled by `internal/enrich`/`internal/scan`. They are
**JSON shapes**, not Go types (arch §0 #3, D2):

```jsonc
{
  "file_id": "...", "module_type": "tv", "schema_version": 1,   // core-managed (existing)
  "parsed":   { /* base identify fields — media-type-agnostic */ }, // existing (run.go:188)
  "ffprobe":  { /* verbatim blob */ },                             // existing (run.go:188)
  "sources":  { "tv-parser": { "title":"…","season":1,"episode":2 } }, // [NEW-ish] lossless per-source (arch §3.1)
  "_provenance": { "title":   {"plugin_id":"tv-parser","plugin_version":"0.1.0","fetched_at":"…","confidence":1.0} },
  "_view":      { "title": {"value":"…","source":"tv-parser"} },   // recomputable; store projects $._view.title.value (open.go:72)
  "_stages":    [ {"stage":"parse","plugin_id":"tv-parser","status":"ok","advanced_to":"parsed","started_at":"…","finished_at":"…"} ],
  "_error":     { "stage":"…","code":"…","message":"…","retryable":true } // present only on hard failure
}
```
- `sources.<plugin_id>` — lossless per-source namespace (arch §0 #4, D3).
- `_provenance.<field_path>` — per-FIELD source (`common.v1.Provenance`, `common.proto:26-32`).
- `_view.<field>` — recomputable view; EXISTING generated columns project it (`open.go:72-75`).
- `_stages[]` — per-STAGE pipeline progress (the V5-hybrid progress map; records ran/when/result/error + `advanced_to`). Distinct from `_provenance` (per-field).
- The `status` COLUMN (§3a) = the authoritative current state = the latest `_stages[].advanced_to`.

### 3d. `internal/enrich` public API `[NEW package]` — mirrors `internal/scan`

```go
// internal/enrich/doc.go + enrich.go  [NEW]
type Deps struct {                       // [NEW]
    Store   *store.Store
    Plugins *plugin.Manager
    Modules *module.Registry
}
type Result struct {                     // [NEW]
    Stages    int      // stages attempted
    Succeeded int      // stages that advanced state
    Warnings  []string // per-source soft-fails
}
// Enrich runs the configured metadata_source chain for one item, in module priority order,
// mutating the document (sources/_provenance/_view/_stages) and returning the advanced status.
func Enrich(ctx context.Context, deps Deps, mod module.Module, doc map[string]any, base *scannerv1.IdentifyResult) (map[string]any, string, Result, error)
```
- **Symbol budget**: `internal/enrich` = 3 (`Enrich`, `Deps`, `Result`). Under 8.
- The 4-RPC dispatch (`Match→BuildRequest→Convert→Merge`), namespace enforcement
  (arch §3.3), view recomputation, provenance stamping, and the state-transition
  function are **unexported helpers** (not counted).
- **Phase A fetch semantics**: `BuildRequest` is called; the fetch between
  `BuildRequest` and `Convert` is a **no-op stub returning empty `raw_response`**
  (Phase A has no external fetcher — tv-parser needs none). Phase B implements
  the real HTTP fetch + `AuthContext`/`required_secrets`. The 4-RPC contract is
  preserved; only the fetch step is stubbed. (tv-parser's `Convert` produces
  metadata from the `Match.query`, ignoring empty `raw_response`.)

## 4. Import map (current + planned)

| Package | MAY import (current) | MAY import (Phase A adds) | MAY NOT import |
|---|---|---|---|
| `internal/enrich` `[NEW]` | — | `store`, `plugin`, `module`, `pkg/sdk`, `scannerv1`, `metadatav1`, `commonv1` | `api`, `scan` (called BY scan, never calls back) |
| `internal/scan` | `store`,`plugin`,`module`,`sdk`,`scannerv1` (`run.go` imports) | **`internal/enrich`** | `api` |
| `internal/module` | `store`, stdlib (`registry.go`) | (no change) | `plugin`,`scan`,`api`,`enrich` |
| `internal/plugin` | `sdk`, `pluginv1`, go-plugin, grpc (`manager.go`) | `metadatav1` (the new accessor returns `sdk.MetadataSource`) | `store`,`module`,`scan`,`api`,`enrich` |
| `pkg/sdk` | proto, go-plugin, grpc (`scanner.go`) | **`metadatav1`** (new `metadata.go`) | any `internal/*` |
| `internal/store` | stdlib + `modernc.org/sqlite` (`open.go`) | (no change — status is a column, provenance is JSON) | any `internal/*`, proto, sdk |
| `internal/api` | `store`,`scan`, chi (`router.go`) | (no change) | `plugin`,`module`,`enrich` |
| `plugins/tv-parser` `[NEW]` | — | `pkg/sdk`, `metadatav1`, `pluginv1`, stdlib | any `internal/*` |
| `plugins/base-scanner` | `sdk`,`scannerv1`,`pluginv1`, stdlib (`scanner.go`) | (no change; parseTV REMOVED) | any `internal/*` |
| `cmd/mellifera` | everything read-only (`main.go`) | **`internal/enrich`**, (loads tv-parser) | nothing imports it |

Cycle rule (enforced): `api → scan → enrich → {module, plugin} → store`. No cycle.

## 5. Proto additions

**NONE for Phase A.** `metadata.v1.MetadataSource` + all its messages
(`MatchRequest`/`Result`, `BuildRequestRequest`/`Response` + `RequestSpec`,
`ConvertRequest`/`Result` + `Error`, `MergeRequest`/`Result` + `MergePolicy`)
already exist, generated and committed (`proto/mellifera/metadata/v1/metadata.proto`,
`request_spec.proto`). `common.v1.{MediaDocument,Provenance,ViewBinding,MergeConflict,AuthContext}`
already exist. `scanner.v1`/`plugin.v1` are UNCHANGED on the wire (additive /
deprecate-don't-delete — AC-3). Phase A only begins importing the already-generated
`metadatav1`/`commonv1` packages into Go source.

## 6. Refactoring map (deprecate-don't-delete)

| Old | New | Nature | Evidence |
|---|---|---|---|
| `parseTV`/`cleanTitle`/`parentDir`/`atoi` + 4 regexes in `plugins/base-scanner/tvparse.go` | verbatim MOVE to `plugins/tv-parser/tvparse.go` | extraction (not deletion) | `plugins/base-scanner/tvparse.go:22-108`, single call site `scanner.go:47` |
| `base-scanner` `Identify` calling `parseTV` (`scanner.go:47`) | `Identify` returns media-type-agnostic base fields only; TV fields come from `tv-parser` via enrich | behavior split (deprecate-don't-delete: `scanner.v1.Identify` wire shape unchanged; just fewer `parsed` keys) | `scanner.go:45-47` |
| `module.parseModule` dropping `metadata_sources` (`registry.go:162`) | `parseModule` models `MetadataSources` | additive modeling of an already-seeded config slot | `registry.go:162` |
| `store.QueryItems(ctx, libID, limit, offset)` (`items.go:70`) | `store.QueryItems(ctx, libID, status string, limit, offset)` — empty `status` = all | signature MODIFY (internal; wire `GET /items?status=` is additive) | `items.go:70`; callers `internal/api/handlers.go:117`, scan tests |
| `items` table (no status) | `items` + `status TEXT NOT NULL DEFAULT 'new'` + `items_status` index | additive migration (AC-3) | `internal/store/open.go:61-76,117-123` |

## 7. Error handling (inherits scan-library conventions)

- **Hard errors** (return error, partial `Result`): module/plugin cannot be
  resolved; ctx cancelled. Mirrors scan's hard-set (`internal/scan/run.go:69-89`).
- **Soft errors** (append `Result.Warnings`, continue, AC-6): a single
  `metadata_source` `Match`/`Convert`/`Merge` error; namespace-violation rejection
  (arch §3.3 — plugin touched a foreign `sources.<other>` ⇒ reject+revert+record,
  mark item/stage `failed`, NOT abort the scan).
- **State on failure**: a hard stage error advances the item to `status=failed`
  with `_error{stage,code,message,retryable}`; retryable → `failed→pending` on
  re-scan (Phase B async retry; Phase A records `failed` + last_error).
- Transport errors stay gRPC codes; domain errors use the canonical
  `{"error":{code,message,retryable}}` (`docs/scan-library/conventions.md:116-128`,
  D17). `metadata.v1.Error{code,message,retryable}` is the per-source domain error
  (`metadata.proto:121-125`).
