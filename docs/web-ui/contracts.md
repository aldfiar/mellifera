# Contracts — web-ui (Phase 1)

> Shared types/interfaces for the Go-side foundation. SPA data shapes included
> (the React app consumes them in Phase 2). api stays pure-delegation; `web/`
> owns embedding. api MUST NOT import `internal/plugin`/`internal/enrich`
> (INV2, `internal/api/doc.go:26`) — admin status reaches api via a closure.

## Target: mellifera (internal/api — MODIFY)

### Roles model (open-question 4 resolution)

```go
// Role is the authorization role resolved from the credential. MVP issues only
// RoleAdmin (the admin token); RoleClient is gated but not yet minted (Phase 2
// resolver). Values are lower-snake to match existing status literals.
type Role string
const (
    RoleAdmin  Role = "admin"
    RoleClient Role = "client"
)

// Principal widens from {Admin bool} to {Role Role} (arch §11.5 anticipated
// Phase-2 widening). Admin is retained as a deprecated computed convenience so
// the lone existing reader (middleware_test.go:55) can update gradually; new
// code uses IsAdmin()/Role.
type Principal struct {
    Role Role
}
// Deprecated: use IsAdmin(). Admin mirrors Role==RoleAdmin for transition.
func (p Principal) Admin() bool { return p.Role == RoleAdmin }
func (p Principal) IsAdmin() bool { return p.Role == RoleAdmin }
```
- **Refactoring map**: `Principal.Admin` (field, `router.go:30`) → `Principal.Role` (field) + `Principal.IsAdmin()`/`Admin()` (methods). Writer: `middleware.go:38`. Reader: `middleware_test.go:55` (→ `.IsAdmin()`). No production handler read it. **Additive at the system level** (middleware behavior unchanged); one struct field renamed — see integration_map S-roles.

### api.Deps (additive field)

```go
type Deps struct {
    AdminToken string
    Store      *store.Store
    Scan       func(ctx context.Context, libraryID int64) (scan.Result, error)
    // NEW: admin panel liveness snapshot. Built in cmd/mellifera over
    // plugin.Manager.Status + enrich.Queue.Stats. Nil-safe (a nil Status
    // yields 503 from the handler) — keeps api free of plugin/enrich imports.
    Status func(ctx context.Context) (AdminStatus, error)
}
```

### New endpoints (Phase 1) — all pure-delegation (parse → one call → write)

| Method+Path | Role | Handler | One domain call | DTO out |
|---|---|---|---|---|
| `GET /api/v1/libraries` | admin+client | `listLibraries` | `store.ListLibraries(ctx)` | `librariesResponse{Items []libraryDTO}` |
| `GET /api/v1/items/{id}` | admin+client | `getItem` | `store.GetItem(ctx, id)` | `itemResponse{Item itemDTO}` (reuses `itemDTO`) |
| `GET /api/v1/admin/status` | **admin only** | `adminStatus` | `deps.Status(ctx)` | `statusResponse{Plugins []PluginHealth, Enrich EnrichStats}` |

Existing routes unchanged in shape, only re-classified by role:
| `POST /api/v1/libraries` | admin only | (existing `createLibrary`) |
| `POST /api/v1/libraries/{id}/scan` | admin only | (existing `scanLibrary`) |
| `GET /api/v1/items` | admin+client | (existing `listItems`) |

### DTOs (unexported, api-package-local; INV4 — no store.Item over the wire)

```go
type libraryDTO struct {              // boundary conversion of store.Library
    ID          int64  `json:"id"`
    ModuleID    string `json:"module_id"`
    RootPath    string `json:"root_path"`
    DisplayName string `json:"display_name"`
}
type librariesResponse struct{ Items []libraryDTO `json:"items"` }
type itemResponse      struct{ Item itemDTO `json:"item"` } // reuses existing itemDTO
type pluginHealthDTO  // REMOVED — subsumed by the exported PluginHealth seam type (BLK-T13-1 fix below)
type enrichStatsDTO   // REMOVED — subsumed by the exported EnrichStats seam type (BLK-T13-1 fix below)
```

**Exported seam-input types (BLK-T13-1 fix — Option A).** The
`Deps.Status` closure is built in `cmd/mellifera` (package main, external to
`api`) and consumed by the external integration test, so `AdminStatus` must be
constructible cross-package. The wire shape is unchanged; the unexported DTOs
were subsumed by exported seam-input types (which carry the JSON tags). INV4
holds: these are plain api-local structs (no `plugin.Health`/`enrich.Stats` over
the wire); the wire envelope `statusResponse` stays unexported. `api` exported
symbols go 5 → 7 (≤8 budget held).

```go
// PluginHealth: one plugin's liveness (closure-built from plugin.Health).
type PluginHealth struct {
    ID        string `json:"id"`
    State     string `json:"state"`      // serving|degraded|not_serving|failed
    Restarts  int    `json:"restarts"`
    CheckedAt string `json:"checked_at"` // RFC3339; closure formats LastCheckedAt
}
// EnrichStats: the enrich-queue snapshot (closure-built from enrich.Stats).
type EnrichStats struct {
    Pending  int `json:"pending"`
    InFlight int `json:"in_flight"`
    Done     int `json:"done"`
    Failed   int `json:"failed"`
}
// AdminStatus is the api-local aggregate the Deps.Status closure returns.
type AdminStatus struct {
    Plugins []PluginHealth
    Enrich  EnrichStats
}
// statusResponse is the wire envelope for GET /admin/status (unexported).
type statusResponse struct {
    Plugins []PluginHealth `json:"plugins"`
    Enrich  EnrichStats    `json:"enrich"`
}
```
- **Error mapping** (reuse existing `writeError`, `handlers.go:193`): malformed `{id}`/missing row → 404 `not_found`; nil `Deps.Status` → 503 `unavailable`; otherwise 500 `internal_error`. Canonical `{error:{code,message,retryable}}` (arch §11.6).

### Interface contracts (pre/postconditions)

#### `store.(*Store).ListLibraries(ctx) ([]Library, error)` — NEW
- Purpose: list all libraries, `id ASC`.
- Precondition: store open.
- Postcondition: returns one row per library; empty slice (not nil) when none.
- Errors: wraps `sql.ErrNoRows`-equivalent? No — list never returns ErrNoRows; only a DB error.

#### `api` handler `adminStatus`
- Precondition: `Principal{Role: RoleAdmin}` in context (enforced by `requireRole(RoleAdmin)`).
- Postcondition: 200 + `statusResponse`; 503 if `Deps.Status == nil`; 500 on closure error.

#### `api` handler `getItem`
- Precondition: `{id}` URL param present.
- Postcondition: 200 + `itemResponse{Item: itemDTO}` with the full document; 404 if `store.GetItem` returns a wrapped `sql.ErrNoRows`.

## Target: mellifera (internal/web — CREATE)

### Public API (target ≤3 symbols)

```go
// Handler composes the API router with the embedded SPA + Swagger UI + spec.
// apiHandler is mounted at /api/* ; /openapi.{yaml,json} + /docs serve Swagger;
// everything else serves the SPA with client-route fallback.
// Nil apiHandler ⇒ the SPA+Swagger are served alone (used in tests).
func Handler(apiHandler http.Handler, opts Options) http.Handler
type Options struct {
    // DevMode true ⇒ sends index.html with no-cache + disables immutable asset
    // cache headers (Vite dev). Default false (production embedded dist).
    DevMode bool
}
```
- Cache headers: `/assets/*` (hashed) → `Cache-Control: public, max-age=31536000, immutable`; `index.html` → `Cache-Control: no-cache`; SPA fallback → any non-`/api`/`/openapi`/`/docs` path serves `index.html` (200).
- **go:embed**: `//go:embed all:dist` over `internal/web/dist` (a copy-step or a fixed `web/dist` location — see implementation_plan §Foundational Setup). The generated OpenAPI bytes are embedded alongside (`//go:embed openapi.yaml`).
- Swagger UI: bundled static assets (Apache-2.0 Swagger UI dist) embedded via `go:embed`; `/docs/` serves `index.html` pointed at `/openapi.json`.

## Consumed from: internal/store, internal/enrich, internal/plugin (no edits)

- `store.Library` (`libraries.go:13`), `store.GetItem` (`items.go:74`) — consumed by new handlers, signature-unchanged.
- `enrich.Stats` (`queue.go:80`) + `Queue.Stats()` (`queue.go:189`) — read inside the `cmd/mellifera` `Deps.Status` closure.
- `plugin.Health` (`manager.go:68`) + `Manager.Status(pluginID)` (`lifecycle.go:102`) — read inside the same closure.

## Consumed from: external dev tools (NOT runtime Go deps)

- `swaggo/swag` (CLI) — reads `@Router/@Summary/@Param/@Success` annotations on chi handlers + a general-info block in `internal/api/doc.go`; emits `openapi.json`/`openapi.yaml` to `internal/web/api/` (swag `-o`, avoiding the design `docs/`). **Like `protoc`: a build/dev tool, not a `go.mod` entry.** Annotations are comment metadata — they do NOT alter the parse→call→write body (INV1 preserved).
- Swagger UI static dist — vendored once under `internal/web/swagger-ui/` (Apache-2.0; recorded in `NOTICE`), embedded via `go:embed`.

## Exported to: cmd/mellifera (composition root) + the Phase-2 React SPA

- `cmd/mellifera/main.go` calls `web.Handler(api.New(deps), opts)` and constructs the `Deps.Status` closure over `mgr` + `enrichQueue`. This is the **only** consumer of `web.Handler`.
- **SPA data shape (Phase 2 client contract — fixed now):** the SPA consumes `/api/v1/libraries` (`librariesResponse`), `/api/v1/items?library=&status=` (`itemsResponse`), `/api/v1/items/{id}` (`itemResponse` — full `document` incl. `sources.<plugin>`/`_view`/`_provenance`/`_stages`), `/api/v1/admin/status` (`statusResponse`). Auth = `Authorization: Bearer <token>` on every `/api` call; the SPA shell + `/docs` + `/openapi.*` are unauthenticated.

## Constants / env

| Name | Default | Purpose |
|---|---|---|
| `MELLIFERA_ADMIN_TOKEN` | (required) | existing — resolves to `RoleAdmin` |
| `MELLIFERA_WEB_DEV` | `false` | NEW — when `true`, `web.Options.DevMode` (loose cache headers; for running the Go server alongside the Vite dev proxy) |

## Refactoring map (summary)
- `Principal.Admin` field → `Principal.Role` field + `IsAdmin()`/`Admin()` methods. Writer `middleware.go:38`; reader `middleware_test.go:55`.
- `adminMiddleware` → splits into `authMiddleware` (resolves Principal from token, always `RoleAdmin` today) + `requireRole(roles ...Role)` (per-route gate). `adminMiddleware` name kept as a thin alias if it keeps tests stable; else rename + update `router.go:40`.
