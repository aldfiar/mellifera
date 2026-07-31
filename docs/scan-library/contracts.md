# Contracts — scan-library

> **Scope.** This feature's contracts are grounded in `mellifera/docs/architecture.md`
> §2 (protos, AUTHORITATIVE — not duplicated here) and §9.1/§9.2 (schema). This
> file records the **signature-level Go contracts** the coder implements and the
> **import map** that enforces the downward-only dependency direction.

## 1. gRPC service contract (referenced, NOT duplicated)

The Scanner capability gRPC contract lives verbatim in
`proto/mellifera/scanner/v1/scanner.proto` (extracted from arch §2.1.2). The
generated Go bindings live in `proto/mellifera/scanner/v1/scanner.pb.go`.

**Service (arch §2.1.2):**
```proto
service Scanner {
  rpc Scan(ScanRequest) returns (stream DiscoveredFile);   // streaming
  rpc Identify(IdentifyRequest) returns (IdentifyResult);  // unary, pure
}
```

**Load-bearing fields (consult arch §2.1.2 for the full, authoritative list):**
- `ScanRequest`: `library_path`, `module_type`, `options` (Struct), `resume_cursor`.
- `DiscoveredFile`: `file_id`, `relative_path`, `size_bytes`, `mime_type`, `ffprobe_json` (**bytes**, not Struct — arch §2.1.2 "Why bytes ffprobe_json"), `resume_cursor`, `warnings`.
- `IdentifyRequest`: `file`, `module_type`.
- `IdentifyResult`: `file_id`, `media_type`, `parsed` (Struct — well-known keys: title/season/episode/episode_end/release_group/resolution/...), `confidence`, `parser_name`.

**Common types** (`proto/mellifera/common/v1/common.proto`, arch §2.1.1):
`MediaDocument`, `Provenance`, `ViewBinding`, `MergeConflict`, `AuthContext`.
Only `MediaDocument` is referenced this feature (the store persists it as TEXT JSON).

**Plugin handshake** (`proto/mellifera/plugin/v1/plugin.proto`, arch §2.2.2):
`Plugin` service (`Handshake`, `Health`, `Shutdown`) — served by every plugin
alongside its capability service. go-plugin substrate (magic cookie, stdout
handshake) per arch §2.2.1.

**Metadata** (`proto/mellifera/metadata/v1/metadata.proto`, arch §2.1.3):
generated for contract completeness; **NOT exercised this feature** (metadata
plugins are deferred). No code under `internal/` may import the metadata
service this feature.

> **Verbatim rule (R3).** The coder copies each proto block from arch §2
> character-for-character. No renamed fields, no added comments, no
> "improvements." AC-3 asserts fidelity.

> **buf lint note (P2).** The proto imports are kept verbatim from arch §2 per
> R3, so several cross-file imports (`scanner`↔`common`, `request_spec`↔`struct`,
> `plugin`↔`timestamp`) are present but unused within this slice's package scope.
> `buf` is **not installed** (the coder used the `protoc` fallback), so "buf lint
> clean" is not machine-verifiable; under buf DEFAULT lint these imports would
> warn (`IMPORT_USED`). The load-bearing parts hold — protoc type-checks all five
> `.proto` files and the generated packages compile. Surfacing/suppressing these
> cleanly is a follow-up once `buf` is adopted.

## 2. The `Principal` type (Q15/D18 grounding)

Lives in `internal/api` (the only package that resolves/authenticates it this
feature). Phase 2 moves it to a shared `internal/auth` when domain packages
need it; for MVP, domain functions are admin-scoped by default and take no
Principal.

```go
// package internal/api
type Principal struct {
    Admin bool // MVP: always true for a valid admin token. Phase 2 adds user_id/roles/library_acls.
}
```

The middleware resolves a Principal from `Authorization: Bearer <admin_token>`
and stuffs it in the request context. Handlers read it (via an unexported
helper) when they need to pass it downstream — for MVP no handler needs to,
because every call is admin-scoped. The type exists NOW so Phase 2 adds
resolvers, not handler-signature changes (arch §11.5).

## 3. Data-type boundaries crossing packages (structs, not interfaces)

Per ai-arch §2 corollary: **structs cross packages; interfaces only at the
plugin seam with ≥2 implementations.** Cross-package data crosses a struct
conversion — no shared mutable types.

| Struct | Owned by | Crosses to | Conversion |
|---|---|---|---|
| `store.Item` | `internal/store` | `internal/scan` (constructs it), `internal/api` (serializes) | scan builds `store.Item` from `scannerv1.DiscoveredFile` + `IdentifyResult`; api builds its unexported `itemDTO` from `store.Item` (no store.Item leaked over the wire). |
| `store.Library` | `internal/store` | `internal/scan` (reads root_path + module_id) | no conversion needed (read-only consumer). |
| `module.Module` | `internal/module` | `internal/scan` (reads scanner capability binding) | no conversion (read-only). |
| `scan.Result` | `internal/scan` | `internal/api` (serialized to scan response) | api builds unexported `scanResponseDTO`. |
| `api.Principal` | `internal/api` | (stays in api for MVP) | — |
| `sdk.Scanner` (interface) | `pkg/sdk` | `internal/plugin` (client wrapper impl), `internal/scan` (consumer), `plugins/base-scanner` (author impl) | The ONE interface in the feature — justified by ≥2 impls (real subprocess client + test fake). See R8. |
| proto messages | generated | cross-cutting | consumed via the generated types; never re-modeled as Go structs in core. |

## 4. Store interface (signature-level)

```go
// package internal/store
type Store struct { /* wraps *sql.DB */ }

type Item struct {
    ID            string          // ULID, minted by scan
    ModuleID      string
    LibraryID     int64
    FileID        string          // from scanner DiscoveredFile.file_id
    RelativePath  string
    MediaType     string          // denormalized from module for query speed (arch §9.1)
    Document      json.RawMessage // the §3.1 dynamic-JSON document (ffprobe + parsed + core-managed)
    SchemaVersion int
    CreatedAt     time.Time
    UpdatedAt     time.Time
}

type Library struct {
    ID          int64
    ModuleID    string
    RootPath    string
    DisplayName string
    CreatedAt   time.Time
}

func Open(ctx context.Context, dsn string) (*Store, error)        // opens SQLite, runs migrations (all §9.1 tables), sets PRAGMA journal_mode=WAL
func (s *Store) Close() error
func (s *Store) CreateLibrary(ctx context.Context, moduleID, rootPath, displayName string) (int64, error)
func (s *Store) GetLibrary(ctx context.Context, id int64) (Library, error)
func (s *Store) GetItem(ctx context.Context, id string) (Item, error)
func (s *Store) PutItem(ctx context.Context, it Item) error        // upsert keyed by file_id (idempotent re-scan — AC for future)
func (s *Store) QueryItems(ctx context.Context, libraryID int64, limit, offset int) ([]Item, error)
```

**Invariants / contracts:**
- **Parameterized SQL ONLY.** No string-built queries. Every value goes through `?`/`$N` placeholders. (golang-security; AC for reviewer.)
- **WAL mode** (`PRAGMA journal_mode=WAL`) set at Open; single-writer transactions (arch §9.3).
- **Migrations** create ALL §9.1 tables including reserved ones (`playback_progress`, `drafts`, `enrichment_failures`, `scan_jobs`) — additive, deprecate-don't-delete. Methods for the reserved tables are DEFERRED.
- **Generated columns** per arch §9.2 (`display_title`, `display_rating`, `tmdb_id`, `kinopoisk_id` + indexes) created at migration time.
- `PutItem` is an **upsert by `file_id`** so re-scanning a library doesn't duplicate rows (foundational for the "deprecate don't delete" + idempotent re-scan property).
- `Document` is opaque to the store — it does NOT parse the JSON body, only `json_extract`s the generated-column paths defined at migration time.

**Symbol count: 10 (3 types + 7 funcs).** WARN (>8 target) but under the 12
hard-fail ceiling. Justified: store owns multiple entities (items + libraries)
and is the sole SQLite owner. Splitting fragments schema ownership. Flagged in
architecture_review.md + conventions.md for specifier/coder review.

## 5. Plugin-manager interface (signature-level)

```go
// package internal/plugin
type Manager struct { /* holds go-plugin clients per pluginID, capability registry */ }

type Deps struct {
    MagicCookieKey   string   // "MELLIFERA_MAGIC_COOKIE" (arch §2.2.1)
    MagicCookieValue string   // agreed shared secret
    CoreVersion      string   // semver, for compat gating (arch §2.2.2 min_core_version)
}

type Health struct {
    State       string   // "serving" | "degraded" | "not_serving" | "failed" (arch §2.2.2 HealthResponse.Status)
    Message     string
    Restarts    int
    LastCheckedAt time.Time
}

func Open(deps Deps) *Manager
func (m *Manager) Load(pluginID, binaryPath string, caps []sdk.Capability) error  // register (no launch). dev mode: binaryPath is a filesystem path.
func (m *Manager) Start(ctx context.Context, pluginID string) error               // launch subprocess + Handshake + register capability stubs (arch §2.2.3)
func (m *Manager) Stop(ctx context.Context, pluginID string) error                // Shutdown RPC + SIGTERM grace 10s (arch §7.4)
func (m *Manager) Status(pluginID string) (Health, error)                          // current health (polled + restart state) — module map names this "Health"
func (m *Manager) Scanner(pluginID, capabilityID string) (sdk.Scanner, error)      // typed capability accessor — the module map's "Call" realized w/o reflect
```

**Invariants / contracts:**
- Minimal restart per arch §7.3: on unexpected subprocess exit → mark caps unavailable, exponential backoff (initial 1s, factor 2, cap 60s, jittered); 3 consecutive failed restarts → `failed` state, no further attempts without manual intervention.
- `Health` polling every 30s (configurable; arch §7.3). `DEGRADED` is a non-blocking warning; `NOT_SERVING` triggers the restart path.
- `Scanner(pluginID, capID)` returns a `sdk.Scanner` client wrapping the live gRPC connection to the subprocess. Returns error if the plugin is not loaded/started or the capability isn't registered.
- The Manager does NOT depend on `store` (module map: plugin → proto only). It depends on `pkg/sdk` (shared leaf) + generated protos.
- `sdk.Capability` (used by `Load`) is a small struct declaring `(type, id, proto_service)` — lives in `pkg/sdk`. (Adds one symbol to sdk; recounted below to keep sdk ≤8.)

**Symbol count: 9 (3 types + 1 func + 5 methods; `Load/Start/Stop/Status/Scanner`).**
WARN (>8). Adding `sdk.Capability` bumps sdk to 5 — still under 8. Justified.

## 6. Module-registry interface

```go
// package internal/module
type Registry struct { /* in-memory cache of module configs, loaded from store.modules table */ }

type Module struct {
    ID            string          // "tv"
    MediaType     string          // "tv" — arch §2.4 media_type is a string, not enum
    SchemaVersion int
    Scanner       ScannerBinding  // arch §2.4 scanner slot
    // metadata_sources DEFERRED this feature
}

type ScannerBinding struct {
    PluginID     string            // "base-scanner"
    CapabilityID string            // "default"
    Options      json.RawMessage   // verbatim from module config (filename_format, exclude_patterns, ...)
}

func Open(ctx context.Context, s *store.Store) (*Registry, error)   // loads enabled modules from the modules table
func (r *Registry) Get(moduleID string) (Module, error)
func (r *Registry) List() ([]Module, error)
```

**Invariants:**
- Depends on `internal/store` (module map). Loads `modules` rows; the module config JSON is parsed into the `Module` struct. Module config shape per arch §2.4.1 (TV example).
- The core never branches on `media_type` (arch §0 principle 1, §2.4.3). `Module` is a config entity, not a Go interface with per-type impls.

**Symbol count: 5.** Under 8.

## 7. Scan-orchestrator interface (NEW package)

```go
// package internal/scan
type Deps struct {
    Store   *store.Store
    Plugins *plugin.Manager
    Modules *module.Registry
}

type Result struct {
    LibraryID     int64
    Discovered    int     // files emitted by the scanner
    Persisted     int     // items written to the store
    Warnings      []string
    StartedAt     time.Time
    FinishedAt    time.Time
}

func Run(ctx context.Context, deps Deps, libraryID int64) (Result, error)
```

**Contract / flow (arch §4.1 steps 1–3 minus the metadata half):**
1. `store.GetLibrary(libraryID)` → root_path + module_id.
2. `modules.Get(module_id)` → scanner capability binding (`plugin_id`, `capability_id`, `options`).
3. `plugins.Scanner(plugin_id, capability_id)` → `sdk.Scanner` client.
4. `scanner.Scan(ctx, ScanRequest{library_path, module_type, options})` → stream of `DiscoveredFile`.
5. For each `DiscoveredFile`: `scanner.Identify(ctx, IdentifyRequest{file, module_type})` → `IdentifyResult`. Build `store.Item{Document: assembleDocument(file, identified)}`. `store.PutItem(...)`.
6. Aggregate counts + warnings into `Result`. Return.

**Why this package exists (not in the module map):** the scan handler in `api/`
must be pure-delegation (ONE domain call). The scan flow coordinates 3 packages
(store + module + plugin) — that orchestration cannot live in `api/`. The
module map lists `enrich` (the metadata-side orchestrator, deferred) but not
its scan-side analog. `internal/scan` IS that analog (same dependency level:
`scan → {module, plugin, store}`). The skill's "Adding a new module" step 6
says to add it to the module map + ai-arch §4 — a docs follow-up tracked in the
decision log.

**Symbol count: 3.** Under 8.

## 8. API interface

```go
// package internal/api
type Deps struct {
    Store   *store.Store
    Scan    func(ctx context.Context, libraryID int64) (scan.Result, error)  // scan.Run, injected
    // (Modules/Plugins not needed directly — scan.Run encapsulates them)
}

type Principal struct { Admin bool }   // §11.5 grounding

func New(deps Deps) http.Handler       // chi router, admin-token middleware, 3 routes
```

**Routes (arch §5 is the full Mode B surface; this feature ships a SUBSET):**
- `POST /api/v1/libraries` → parse `createLibraryRequest{module_id, root_path, display_name}` → `store.CreateLibrary(...)` → write `libraryResponse`. (ONE domain call.)
- `POST /api/v1/libraries/{id}/scan` → parse `{id}` → `deps.Scan(ctx, id)` → write `scanResponse`. (ONE domain call.)
- `GET /api/v1/items?library={id}` → parse `{id}` + pagination → `store.QueryItems(...)` → write `itemsResponse`. (ONE domain call.)

**Invariants:**
- Each handler: parse → ONE domain call → write. No branching, no orchestration (ai-arch §3; mellifera-build skill). funlen ≤60 lines, gocognit ≤15.
- Admin-token middleware: `Authorization: Bearer <token>` → `Principal{Admin:true}` in context. Missing/wrong → 401.
- DTOs (`createLibraryRequest`, `libraryResponse`, `scanResponse`, `itemsResponse`, `itemDTO`) are **unexported** and live in `internal/api`. Struct conversion at the store boundary (no `store.Item` over the wire).
- Error shape (arch §11.6): transport errors → HTTP status; the canonical body is `{"error":{"code","message","retryable"}}`. For MVP, the 3 handlers return simple 4xx/5xx + the canonical body; domain-error richness (Mode B) is deferred.

**Symbol count: 3.** Under 8.

## 9. pkg/sdk interface

```go
// package pkg/sdk
type HandshakeConfig struct {
    MagicCookieKey   string
    MagicCookieValue string
    CoreVersion      string
    PluginID         string
    PluginVersion    string
}

type Capability struct {
    Type         string   // "scanner" | "metadata_source" | ...
    ID           string   // "default"
    ProtoService string   // FQN, e.g. "mellifera.scanner.v1.Scanner"
}

type Scanner interface {
    Scan(ctx context.Context, req *scannerv1.ScanRequest) (<-chan *scannerv1.DiscoveredFile, error)
    Identify(ctx context.Context, req *scannerv1.IdentifyRequest) (*scannerv1.IdentifyResult, error)
}

type ScannerPlugin struct {
    Impl Scanner  // server side: author's impl. client side: zero-value (GRPCClient builds the wrapper).
}

func Serve(cfg HandshakeConfig, plugins ...plugin.GRPCPlugin)  // entrypoint: handshake + gRPC server + signal handling
```

**Invariants:**
- `ScannerPlugin` satisfies `plugin.GRPCPlugin` (GRPCServer + GRPCClient methods, provided by the SDK). Server side: registers `scannerv1.ScannerServer` adapting the author's channel-based `Scanner` to the gRPC stream. Client side: returns a `Scanner` wrapping the gRPC stub.
- `Scanner` has ≥2 implementations: (a) the real subprocess client built by `ScannerPlugin.GRPCClient`, (b) the in-process test fake used by `internal/scan` + `internal/plugin` tests. This justifies the interface (R8 — the kickoff's "interface-vs-struct conversation").
- `Serve` is the plugin author's one-line entrypoint. `plugins/base-scanner/main.go` is ~20 lines: build the Scanner impl, call `sdk.Serve(...)`.

**Symbol count: 5** (HandshakeConfig, Capability, Scanner, ScannerPlugin, Serve). Under 8.

## 10. Import map (enforces downward-only direction)

| Package | MAY import | MAY NOT import |
|---|---|---|
| `cmd/mellifera` | everything (read-only wiring) | nothing imports it |
| `internal/api` | `internal/store`, `internal/scan`, `pkg/sdk` (Principal only), stdlib + chi | `internal/plugin`, `internal/module` (api talks to them only via `scan.Run`) |
| `internal/scan` | `internal/store`, `internal/plugin`, `internal/module`, `pkg/sdk`, proto | `internal/api` |
| `internal/module` | `internal/store`, proto | `internal/plugin`, `internal/scan`, `internal/api` |
| `internal/plugin` | `pkg/sdk`, proto, stdlib + go-plugin + grpc | `internal/store`, `internal/module`, `internal/scan`, `internal/api` |
| `internal/store` | stdlib + `modernc.org/sqlite` (+ `database/sql`) | any `internal/*`, any proto, any pkg/sdk |
| `pkg/sdk` | proto, stdlib + go-plugin + grpc | any `internal/*` (it's a shared leaf importable by external plugins) |
| `plugins/base-scanner` | `pkg/sdk`, proto, stdlib + os/exec | any `internal/*` (it's a separate process) |
| proto packages | `google/protobuf/*` only | any project package |

**Cycle rule:** no package may import, directly or transitively, a package that imports it. The direction is strictly `api → scan → {module, plugin} → store` with `proto/` + `pkg/sdk` as shared leaves.

**Refactoring map:** none this feature (greenfield — no existing symbols to rename/move).
