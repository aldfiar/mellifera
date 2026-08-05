# Acceptance Criteria — web-ui (Phase 1: API + auth + Swagger + embed scaffold)

## Source

User request (enhanced_objective.md, pre-approved 2026-08-04): *"Give Mellifera a
UI: a React SPA served from the Go binary (single-binary preserved at runtime
via go:embed), backed by a Swagger/OpenAPI contract, with library management
and client + admin panels."* — with three CONFIRMED decisions: (1) React SPA
embedded via `go:embed` (npm dev-only); (2) role-aware auth (extend `Principal`;
MVP admin token → admin role; client role ready-but-not-issued); (3) Swagger
code-generated from annotations.

**Phase scope.** This plan covers **Phase 1 only** (the Go-side foundation the
UI depends on): roles auth, Swagger codegen + serving, the API extensions the
panels need, and the embedding scaffold (`internal/web` + a placeholder
committed `web/dist/` so `go:embed` works and the delivery mechanism is
verifiable now). The React app, the admin library-management panel, and the
client browse panel are **Phases 2-4** (outlined in implementation_plan.md §Out
of Scope / Later Phases). AC-6/AC-7 verify the *delivery mechanism + build
gate*, which must be proven before the React app lands.

## Scenarios

### AC-1: role-gating works (admin token → admin role → both panels; client role denied admin actions)
- **Given**: a server with `MELLIFERA_ADMIN_TOKEN` set, and the new role-aware middleware resolving a Bearer admin token to `Principal{Role: RoleAdmin}`.
- **When**: the admin token calls a browse route (`GET /api/v1/libraries`, `GET /api/v1/items`, `GET /api/v1/items/{id}`) and an admin-only route (`POST /libraries`, `POST /libraries/{id}/scan`, `GET /api/v1/admin/status`).
- **Then**: every call succeeds (browse routes accept admin+client; admin routes accept admin only). A synthetic `client`-role principal (injected in a test) is accepted on browse routes and **rejected with 403** on `GET /admin/status` (and the other admin-only routes). The roles abstraction is additive — the existing admin-token middleware behavior (valid token → authenticated) is preserved.
- **User intent**: *"roles auth ... MVP: admin token → admin role (both panels work) ... easily swappable to a real client role later"* — the gating must be correct now so Phase 2+ just mints a client principal.
- **Covers tasks**: [T-roles-mw, T-routing, T-admin-status]

### AC-2: Swagger/OpenAPI is served, accurate, and Swagger UI loads
- **Given**: the server running with the code-generated OpenAPI spec embedded.
- **When**: `GET /openapi.yaml` (and `/openapi.json`) and `GET /docs/` (Swagger UI) are requested (no auth — the contract + UI are public, like the SPA shell).
- **Then**: `/openapi.yaml` returns 200 `application/yaml` and the spec lists **every actual endpoint + DTO**: `POST /libraries`, `GET /libraries`, `GET /items`, `GET /items/{id}`, `POST /libraries/{id}/scan`, `GET /admin/status`, with the request/response schemas matching the handlers' DTOs (`createLibraryRequest`, `libraryResponse`, `itemDTO`, `scanResponse`, the admin-status shape). `/docs/` returns 200 HTML (Swagger UI loads). The spec is **code-generated from handler annotations** (not hand-written).
- **User intent**: *"Swagger = code-generated from annotations ... served at /openapi.yaml + a Swagger UI page ... stays in sync with code."*
- **Verify probe**: `curl -s localhost:8080/openapi.yaml | grep -cE '(/libraries|/items|/admin/status)'` → `>=6` hits (structural — the spec must name the real routes).
- **Covers tasks**: [T-swag-annotations, T-web-swagger, T-compose]

### AC-3: an admin can list libraries
- **Given**: one or more libraries created via `POST /api/v1/libraries`.
- **When**: the admin token calls `GET /api/v1/libraries`.
- **Then**: 200 with `{items:[{id, module_id, root_path, display_name}, ...]}` listing every library (the new `store.ListLibraries`). This is the data the admin panel's library list renders.
- **User intent**: *"admin panel ... list libraries"* + open question 5 (*"add GET /libraries list"*).
- **Covers tasks**: [T-list-libraries]

### AC-4: a client can view an item's full metadata document (plugin provenance)
- **Given**: an item that has reached `ready` (B1/B2) — its document carries `sources.<plugin_id>`, `_view`, `_provenance`, `_stages`.
- **When**: the admin token calls `GET /api/v1/items/{id}` (the new detail endpoint).
- **Then**: 200 with the single `itemDTO` whose `document` is the **full** §3.1 document (sources + provenance + view + stages, precision preserved — not a stripped summary). A request for a non-existent id returns the canonical 404 body. This is the shape the client browse-detail view renders.
- **User intent**: *"Browse UI (client panel): ... view an item's full document incl. plugin metadata (sources.<plugin> + _provenance + _view + _stages) rendered human-readable (precision-preserved)."*
- **Covers tasks**: [T-get-item]

### AC-5: an admin can see system status (plugin health + enrich queue stats)
- **Given**: the server running with base-scanner + tv-parser + image-enricher loaded and the enrich queue started.
- **When**: the admin token calls `GET /api/v1/admin/status`.
- **Then**: 200 with plugin health per plugin (`state`, `restarts`, `last_checked_at`) + a best-effort enrich-queue snapshot (`pending`, `in_flight`, `done`, `failed`). Admin-only (AC-1). Built via a pure-delegation handler calling one `Deps.Status` closure (no `internal/plugin`/`internal/enrich` import in `api` — INV2 preserved).
- **User intent**: *"admin panel ... view status/plugins"* + open question 5 (*"admin status/config endpoints as the panels need"*).
- **Covers tasks**: [T-admin-status, T-compose]

### AC-6: the SPA is served from the Go binary (go:embed); single-binary + cache headers + SPA fallback hold
- **Given**: the server built with `CGO_ENABLED=0 go build` (the committed `web/dist/` embedded via `go:embed` in `internal/web`); **no `node`/`npm` in the build path**.
- **When**: `GET /`, `GET /assets/<hashed>.js` (a Phase-1 placeholder asset), and `GET /some/client/route` are requested (no auth — the SPA shell is public).
- **Then**: `/` returns 200 `text/html` (the embedded index.html); `/assets/*` responses carry `Cache-Control: public, max-age=31536000, immutable`; `GET /some/client/route` falls back to index.html (200, SPA client-side routing); `index.html` itself carries `Cache-Control: no-cache`. Single-binary preserved — one binary serves API + SPA + Swagger.
- **User intent**: *"React SPA ... served from the Go binary (go:embed, cacheable) ... SPA client-side routes work (fallback)."* (Phase 1 verifies the delivery mechanism with a placeholder dist; the real React app is Phase 2.)
- **Verify probe**: `curl -sI localhost:8080/ | grep -i cache-control` → contains `no-cache` (index); `curl -sI localhost:8080/assets/app.js | grep -i cache-control` → contains `immutable` (placeholder asset).
- **Covers tasks**: [T-web-embed, T-compose, T-placeholder-dist]

### AC-7: the Go build gate stays green WITHOUT node; additive; pure-delegation holds
- **Given**: Phase-1 source committed (Go + the committed `web/dist/` placeholder + generated `openapi.*`).
- **When**: `make build`, `make check`, `make lint`, `make test` run on a host **without `node` installed**.
- **Then**: all four pass. `internal/api` ≤8 exported symbols (4 after Phase 1). The handlers stay pure-delegation (parse → one domain call → write; swag annotations are comments, not logic). `proto/`, `pkg/sdk`, `internal/scan`, `internal/enrich` are byte-identical vs `58a1130` (additive). `make web-build` (the dev-time `swag init` + `npm run build`) is documented and NOT invoked by `make build`/`make check`.
- **User intent**: *"the Go build gate stays green ... node is dev-only — the gate builds the Go binary with the embedded pre-built dist"* + *"additive where claimed (no proto/sdk/enrich contract break)"*.
- **Verify probe (structural)**: `make build && make check` on a node-less host → exit 0; `git diff 58a1130 HEAD -- proto/ pkg/sdk/ internal/scan/ internal/enrich/ --stat` → empty; `grep -c 'func [A-Z]' internal/api/*.go` (approx exported count) ≤ 8.
- **Covers tasks**: [T-makefile, T-swag-annotations, all]

## Coverage Matrix

| Scenario | Tasks | Verified By |
|---|---|---|
| AC-1 roles-gating | T03, T04, T08 | T04 `TestRequireRole`; T08 `TestNew_RoleGating`; T15 `ac1_roles`; QA1 `qa_roles_test.go` |
| AC-2 swagger | T09, T10, T12, T13 | T12 `TestHandler_Swagger`; T15 `ac2_swagger`; QA2 `qa_swagger_test.go` |
| AC-3 list libraries | T02, T05 | T05 `list_libraries` subtest; T15 `ac3_list`; QA3 `qa3_t1_list_libraries_ordered` |
| AC-4 item detail | T06 | T06 `get_item_full_document` + `get_item_not_found`; T15 `ac4_item`; QA3 `qa3_t3`/`qa3_t4` |
| AC-5 admin status | T07, T13 | T07 `admin_status_*`; T15 `ac5_admin_status`; QA3 `qa3_t5`/`qa3_t6`/`qa3_t7` |
| AC-6 embed/delivery | T01, T11, T12, T13 | T11 `TestHandler_SPAAndCache`; T15 `ac6_embed`; QA4 `qa4_t1`..`qa4_t5` |
| AC-7 build-gate/additive | T09, T10, T14, all | T15 `ac7_gates` (make build+check node-free + git diff additive probe); QA4 `qa4_t7`/`qa4_t8`/`qa4_t9`/`qa4_t10` |

## Out of scope (Phase 2+ — outlined, not verified here)
- The real React app (Vite + TS + router + TanStack Query + Tailwind), `web/src/`, the Vite dev-server proxy, `npm` build wiring. (AC-6 uses a hand-written placeholder `web/dist/index.html`.)
- The admin library-management UI (add-library form, scan-trigger button) and the client browse UI (item list + detail rendering).
- A real `client`-role resolver / user accounts (D18 Phase 2) — only the role *abstraction* + a synthetic test principal.
- `DELETE`/`PUT /libraries`, config-edit endpoints, and `/api/v1/admin/config` beyond the status snapshot.
