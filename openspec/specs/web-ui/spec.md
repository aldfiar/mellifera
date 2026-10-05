# web-ui Specification

## Purpose

Mellifera's embedded UI capability: a single static Go binary serving a React SPA (built by Vite, embedded via `go:embed`), a code-generated OpenAPI contract (`/openapi.{yaml,json}`), Swagger UI (`/docs/`), and a role-gated `/api/v1/*` API — with a token-entry SPA shell and an admin panel for library management, scan triggering, and system status.

Seeded from `docs/web-ui` (Phase 1: Go UI foundation) + `docs/web-ui-phase-2` (Phase 2a: React SPA, on `feature/web-ui-phase-2`).

## Requirements

### Requirement: Role-gated API authentication

The API SHALL resolve a valid `MELLIFERA_ADMIN_TOKEN` bearer credential to `Principal{Role: RoleAdmin}`; a missing or wrong token SHALL be rejected with 401 unauthorized. Routes SHALL be gated by per-group role checks: browse routes (`GET /libraries`, `GET /items`, `GET /items/{id}`) accept admin+client read-only; admin routes (`POST /libraries`, `POST /libraries/{id}/scan`, `GET /admin/status`) accept admin only. Handlers SHALL NOT fork on role; `RoleClient` is gated but no resolver mints it.

#### Scenario: Admin token reaches both route groups
- **WHEN** the admin token calls a browse route and an admin-only route
- **THEN** every call succeeds

#### Scenario: Client role denied admin routes
- **WHEN** a client-role principal calls `GET /api/v1/admin/status` (or another admin-only route)
- **THEN** the request is rejected with 403

### Requirement: Single-binary embedded web surface

`internal/web.Handler` SHALL compose one top-level handler: `/api/*` to the API router, `/openapi.{yaml,json}` + `/docs/` to the embedded Swagger serving, and every other path to the SPA embedded via `//go:embed all:dist`. The binary SHALL serve all of this as a single static Go binary with no Node runtime at serve time.

#### Scenario: One binary serves API, contract, and UI
- **WHEN** the built binary (CGO disabled, no node/npm in the build path) serves requests to `/api/v1/*`, `/openapi.yaml`, `/docs/`, and `/`
- **THEN** each surface is served from the one binary; the SPA shell, `/openapi.*`, and `/docs/` are public (no auth); only `/api/v1/*` carries data behind role-gating

### Requirement: SPA static delivery and caching

The embedded SPA delivery SHALL serve hashed `/assets/*` with `Cache-Control: public, max-age=31536000, immutable`, serve `index.html` with `Cache-Control: no-cache`, and fall back to `index.html` (200) for any non-`/api`/`/openapi`/`/docs`/`/assets` path so client-side routes work. A request for a missing asset SHALL return 404. `MELLIFERA_WEB_DEV=true` SHALL disable the immutable cache headers (no-cache everywhere) for the Vite dev-proxy workflow.

#### Scenario: Client-side route fallback and cache headers
- **WHEN** a browser requests `/` (or a client route like `/admin`), a hashed `/assets/*` file, and an unknown asset path
- **THEN** `/` and the client route return index.html (200, `no-cache`), the hashed asset returns `immutable`, and the missing asset returns 404

### Requirement: Code-generated OpenAPI contract and Swagger UI

The OpenAPI spec SHALL be code-generated from handler annotations (swag) — never hand-written — embedded, and served at `/openapi.yaml` and `/openapi.json` listing every actual endpoint. Swagger UI SHALL be served at `/docs/` (bundled via `swaggo/http-swagger`), unauthenticated.

#### Scenario: Served spec matches the real routes
- **WHEN** `GET /openapi.yaml` and `GET /docs/` are requested with no auth
- **THEN** the spec returns listing `/libraries`, `/items`, `/items/{id}`, `/libraries/{id}/scan`, and `/admin/status`, and `/docs/` returns 200 HTML (Swagger UI loads)

### Requirement: Library list endpoint

The API SHALL expose `GET /api/v1/libraries` (admin+client) returning every library via `store.ListLibraries` as `{items:[{id, module_id, root_path, display_name}]}`.

#### Scenario: Listing created libraries
- **WHEN** libraries exist and `GET /api/v1/libraries` is called
- **THEN** the response is 200 with one entry per library

### Requirement: Item detail endpoint

The API SHALL expose `GET /api/v1/items/{id}` (admin+client) returning the item's full document — `sources.<plugin>`, `_view`, `_provenance`, `_stages`, precision preserved — via `store.GetItem`.

#### Scenario: Full-document detail and not-found
- **WHEN** `GET /api/v1/items/{id}` is called for an existing item and for a non-existent id
- **THEN** the existing item returns 200 with the full document; the missing id returns the canonical 404 error body

### Requirement: Admin status endpoint via closure seam

The API SHALL expose `GET /api/v1/admin/status` (admin-only) returning plugin health and enrich-queue stats through a `Deps.Status` closure built in `cmd/mellifera` — `internal/api` SHALL NOT import `internal/plugin` or `internal/enrich`. A nil closure SHALL yield 503 `unavailable`; a closure error SHALL yield 500 `internal_error`.

#### Scenario: Status snapshot
- **WHEN** the admin token calls `GET /api/v1/admin/status` with the closure wired
- **THEN** the response is 200 with per-plugin health (state, restarts, checked_at) and enrich-queue stats (pending, in_flight, done, failed); with a nil closure it is 503

### Requirement: Node-free Go build gate

The Go build gate (`make build`/`check`/`lint`/`test`) SHALL stay green on a host without node by embedding committed artifacts only. `make web-build` (the swag + npm regen) SHALL be a dev-time target and SHALL NOT be a prerequisite of the gate. Changes SHALL be additive: no proto/sdk/scan/enrich contract changes.

#### Scenario: Gate green without node
- **WHEN** `make build && make check` runs on a node-less host
- **THEN** it exits 0 with no node/npm/swag invoked

### Requirement: SPA token authentication

The SPA SHALL store the admin token in localStorage under `mellifera.token`; `<RequireAuth>` SHALL guard protected routes by token presence, redirecting to `/login` when absent. Every `/api/v1/*` request SHALL carry `Authorization: Bearer <token>` via the fetch wrapper. A 401 from any API call SHALL clear the token and redirect to `/login`.

#### Scenario: Login flow and 401 rotation
- **WHEN** an operator without a token opens a protected route and submits the token on `/login`, and later an API call returns 401
- **THEN** the token is stored and the operator reaches the requested route; the 401 clears the token and redirects back to `/login`

### Requirement: Admin library management panel

The admin panel SHALL list libraries (`GET /libraries`) and add a library by POSTing `{module_id ∈ {tv, image}, root_path, display_name}` to `POST /api/v1/libraries`, documenting in-form that network paths must be OS-mounted (NFS). On success the list SHALL re-fetch (query invalidation); errors SHALL surface the canonical `{error:{code, message, retryable}}` inline.

#### Scenario: Add a library
- **WHEN** the operator submits the add-library form with a tv or image module and an absolute path
- **THEN** the new library appears in the list; a 400/500 instead shows the canonical error inline

### Requirement: Scan triggering from the admin panel

The admin panel SHALL offer a per-library scan trigger POSTing to `POST /api/v1/libraries/{id}/scan` and SHALL render the result `{library_id, discovered, persisted, warnings?}` inline, without auto-retry. The status view SHALL reflect the async enrich queue draining (pending → in_flight → done) as scanned items progress.

#### Scenario: Trigger a scan
- **WHEN** the operator clicks Scan on a library row
- **THEN** the scan response (discovered/persisted/warnings) is shown inline and the status page's enrich stats move toward `done`

### Requirement: Admin status panel

The admin Status page SHALL render a per-plugin health table (`id`, `state`, `restarts`, `checked_at`) and an enrich-stats block (`pending`, `in_flight`, `done`, `failed`), polling on a TanStack Query refetch interval (~5s). A 503 (nil status closure) SHALL render as a clear "Status unavailable" state, not a crash.

#### Scenario: Status page renders liveness
- **WHEN** the operator opens the admin Status page
- **THEN** plugin health and enrich stats render from `GET /admin/status` and refresh on the poll interval; a 503 shows "Status unavailable"

### Requirement: SPA consumes only pre-existing endpoints

The SPA SHALL be a pure HTTP client over the Phase-1 API — zero new endpoints — calling only `GET /api/v1/libraries`, `POST /api/v1/libraries`, `POST /api/v1/libraries/{id}/scan`, and `GET /api/v1/admin/status`, with the Go side byte-identical except the regenerated embedded `internal/web/dist/`.

#### Scenario: No off-contract calls
- **WHEN** the SPA's network calls are audited
- **THEN** every call targets a pre-existing `/api/v1` route and no new Go endpoint or package import was added
