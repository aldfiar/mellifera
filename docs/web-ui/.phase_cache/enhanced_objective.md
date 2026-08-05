# Enhanced Objective — web-ui

> Pre-approved by user (2026-08-04). Builds on `main` @ `58a1130` (scan-library +
> plugin-pipeline Phase A + async-enrichment Phase B1 + image-enrichment B2). Planner
> uses this as the approved objective. This is the **UI/SPA + Swagger** layer.

## Intent

Give Mellifera a UI: a **React SPA** served **from the Go binary** (single-binary
preserved at runtime via `go:embed`), backed by a **Swagger/OpenAPI** contract, with
**library management** (add libraries from local disk / NFS-mounted paths) and
**client + admin panels** (client browses entities/items with their plugin metadata;
admin manages libraries + scans + config).

## USER-CONFIRMED foundational decisions (do not re-litigate)

1. **Frontend = React SPA, embedded.** Built with a modern toolchain (Vite recommended:
   fast, emits hashed cacheable assets), `dist/` embedded into the Go binary via
   `go:embed` (served as static files with immutable cache headers for hashed assets).
   Single-binary DELIVERY preserved; the JS/npm toolchain is **dev-time only** (node not
   required at runtime). The SPA calls the existing chi REST API at `/api/v1/*`
   (same-origin → no CORS needed).
2. **Auth = role-aware, MVP uses the admin token.** Build a **roles abstraction**
   (extend the existing `Principal`/admin middleware to a role-based model: e.g.
   `Principal{Role}` with roles `admin`, `client`). Routes are **role-gated** (browse
   routes accept `client`+`admin`; admin routes accept `admin` only). **MVP: the admin
   token grants the `admin` role** (so both panels work today), but the abstraction
   makes swapping in a real `client`/user role trivial later — this grounds D18
   multi-user without building all of Phase 2 now.
3. **Swagger = code-generated from annotations.** swag/huma-style annotations on the chi
   handlers (or a thin OpenAPI layer) → generate `openapi.yaml`/json at build time;
   serve at `/openapi.yaml` (+ a Swagger UI page, also embedded). Stays in sync with code.

## Scope

1. **React SPA scaffold + embedding.** Vite + React + TypeScript; `go:embed dist/`;
   served at `/` (SPA shell + cacheable hashed assets); dev workflow (Vite dev server
   proxying `/api` to the Go server, OR the Go server serving a dev build).
2. **Swagger/OpenAPI** (code-generated from handler annotations) + Swagger UI page.
3. **Roles auth** (extend Principal; role-gated routes; admin token → admin role; ready
   for a future client role).
4. **API extensions the UI needs** (additive — extend the existing chi API): list/manage
   libraries (`GET /libraries`, maybe `DELETE`/`PUT`); item detail with metadata
   (`GET /items/{id}` returning the full document w/ plugin provenance); scan trigger
   (exists `POST /libraries/{id}/scan`); plugin/status/config views for the admin panel.
   The planner audits the existing API (POST /libraries, POST /scan, GET /items) and adds
   what the UI needs.
5. **Library-management UI (admin panel):** add a library (name, path — local OR
   NFS-mounted dir, module type tv/image), list libraries, trigger scans, view
   status/plugins. (NFS = the OS mounts it; Mellifera just reads the path — no special
   backend beyond path-based, but the UI form accepts arbitrary paths + documents that
   NFS/network paths must be mounted by the OS.)
6. **Browse UI (client panel):** list items (filter by library/status), view an item's
   full document incl. plugin metadata (sources.<plugin> + _provenance + _view + _stages)
   rendered human-readable (precision-preserved per arch principle 4).

## Foundation (on main — reuse)
- The chi API (`internal/api`): `POST /api/v1/libraries`, `POST /api/v1/libraries/{id}/scan`,
  `GET /api/v1/items?library=&status=` (+ the admin-token middleware, `Principal`).
- The async pipeline: items reach `ready` with provenance (B1/B2) — the browse UI shows
  these.
- The build gate (check.sh, golangci-lint). pure-Go/no-CGO holds (the SPA is embedded
  static assets; node is dev-only).
- Additive where possible: the SPA is new; the API is extended (new GET endpoints +
  role-aware middleware); proto/sdk/enrich/store mostly unchanged (the planner verifies).

## Open questions for the planner (decide + justify; surface any needing the user)
1. **React toolchain:** Vite (recommended) + TS; routing (react-router); state (React
   Query / SWR for the REST data — cacheable); component lib (shadcn/ui, MUI, or plain
   Tailwind)? Keep the bundle small + cacheable.
2. **Embedding:** `go:embed` the built `web/dist` into `cmd/mellifera` (or a new
   `internal/web` package exposing a `http.FileSystem`/handler). Cache headers
   (immutable for hashed assets; revalidate for index.html). SPA fallback routing
   (serve index.html for client-side routes).
3. **Swagger lib:** `swaggo/swag` (annotations on handlers → openapi) vs `huma` vs
   `kin-openapi`. Pick the one that fits chi + the pure-delegation handlers with least
   friction. swag is the common choice.
4. **Roles design:** extend `Principal` (currently `{Admin bool}`) to a role model
   (`Principal{Role}` / a `Role` enum) without breaking the existing admin middleware
   contract; a future `client` role gates browse-only. Keep additive + D18-aligned.
5. **API additions:** audit the existing endpoints; add `GET /libraries` (list),
   `GET /items/{id}` (detail + metadata), admin status/config endpoints as needed. Do
   the existing handlers return the full document for browse, or is a detail endpoint
   + a metadata-rendering shape needed?
6. **Dev workflow:** how does the React dev server (Vite :5173) talk to the Go API
   (:8080) during dev — Vite proxy `/api` → Go? Document it.

## Acceptance sketch (planner refines)
- **AC-1 (admin):** an admin can add a library (local path + module type), trigger a
  scan, and see items appear (real flow through the Go API + the async queue). REAL
  browser-driven or black-box HTTP against the embedded SPA's API.
- **AC-browse (client):** a client can list items (filter library/status) and view an
  item's full metadata (plugin provenance rendered).
- **AC-swagger:** `/openapi.yaml` is served + accurate (reflects the actual endpoints +
  DTOs); Swagger UI loads.
- **AC-roles:** role-gating works (admin token → admin role → both panels; a denied
   client-role path is rejected). Easily swappable to a real client role.
- **AC-embed:** the SPA is served from the Go binary (`go:embed`); single-binary
  preserved; cache headers set; SPA client-side routes work (fallback).
- **AC-2:** build gates green + vet; ≤8 symbols/pkg; the Go gate still passes (node is
  dev-only — the gate builds the Go binary with the embedded pre-built dist; document
  the npm-build step).
- **AC-3:** additive where claimed (no proto/sdk/enrich contract break — verify).

## Out of scope (DEFERRED)
- Full multi-user auth (D18 Phase 2) — only the roles ABSTRACTION now (admin token MVP).
- Streaming/playback/transcoding of media (browse metadata only).
- Phase C (post-action).
- A separate client-account system (the swap point is built; accounts are later).

## Right-sizing (CRITICAL)
This is a LARGE feature (React SPA + Swagger + roles + library mgmt + 2 panels + API
extensions). The objective EXPLICITLY authorizes phasing. Likely phases: (1) Swagger +
roles auth + the API extensions the UI needs; (2) React scaffold + embedding + admin
library-management; (3) client browse UI; (4) admin panel polish. Or a different
grouping — planner decides + documents; if phasing, scope THIS plan to the first phase
and outline the rest. Note: the React build introduces a JS toolchain — the plan must
address how the Go build gate stays green (pre-built dist committed OR built in make;
node dev-only).
