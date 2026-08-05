# Integration Map — web-ui (Phase 1)

> Completeness view of every seam where Phase-1 code meets the existing system.
> Built from `source_baseline.md` (existing symbols + importers) and
> `contracts.md` (new types/endpoints). Every MODIFY file in the File Map
> appears in ≥1 seam. Coverage Matrix owner-task + joint-test filled by the
> specifier.

## Seams

| ID | Existing (file:line) | New/Changed (file) | Before | After | Contract (behavior) | evidence |
|---|---|---|---|---|---|---|
| **S-roles** | `internal/api/router.go:30` (`Principal{Admin bool}`); `middleware.go:38` (writer); `middleware_test.go:55` (reader) | `router.go` (`Role`, `Principal{Role}`); `middleware.go` (`authMiddleware`+`requireRole`); `doc.go` (roles doc) | Principal = `{Admin bool}`; one global `adminMiddleware` wraps all routes; no per-route gating | Principal = `{Role Role}` + `IsAdmin()`; `authMiddleware` resolves admin token→`RoleAdmin`; `requireRole(...)` gates each route group (admin-only vs admin+client) | Auth behavior for a valid admin token is unchanged (authenticated → proceeds). NEW: a `client` principal is accepted on browse routes, rejected (403 `forbidden`) on admin-only routes. `client` is not minted by any resolver yet (test-only). | `internal/api/middleware.go:29,38`; `internal/api/router.go:30,40`; arch §11.5 (Principal widening anticipated) |
| **S-routing** | `internal/api/router.go:41-44` (3 routes under `/api/v1`, global admin mw) | `router.go` (mount 3 new GETs + per-route `requireRole`) | 3 routes, all admin-gated | 6 routes: browse group (`GET /libraries`,`GET /items`,`GET /items/{id}` → admin+client); admin group (`POST /libraries`,`POST /libraries/{id}/scan`,`GET /admin/status` → admin only) | Existing 3 routes keep method+path+DTO; only the gate widens for browse. New routes are additive. | `internal/api/router.go:42-44` |
| **S-list-libraries** | `internal/store/libraries.go` (no list method) | `store/libraries.go` (`ListLibraries`); `api/handlers.go` (`listLibraries`+`librariesResponse`/`libraryDTO`) | No list endpoint; UI cannot enumerate libraries | `GET /libraries` → `store.ListLibraries` → `librariesResponse` | One domain call (pure-delegation). Returns all libraries `id ASC`, empty `items:[]` when none. | `internal/store/libraries.go:24` (CreateLibrary pattern to mirror); `internal/api/handlers.go:120` (listItems pattern) |
| **S-get-item** | `internal/store/items.go:74` (`GetItem` — exists, no API caller) | `api/handlers.go` (`getItem`+`itemResponse`) | `GetItem` unused by api; no per-item detail endpoint | `GET /items/{id}` → `store.GetItem` → `itemResponse{Item: itemDTO}` (full document) | First API caller of `GetItem`. Returns the full §3.1 document (sources/view/provenance/stages). 404 `not_found` on missing/`sql.ErrNoRows`. | `internal/store/items.go:74`; `internal/api/handlers.go:63` (itemDTO carries `Document json.RawMessage`) |
| **S-admin-status** | `internal/plugin/lifecycle.go:102` (`Manager.Status`); `internal/enrich/queue.go:189` (`Queue.Stats`) — both zero API/cmd callers | `api/router.go` (`Deps.Status` field); `api/handlers.go` (`adminStatus`+`statusResponse`/`AdminStatus`); `cmd/mellifera/main.go` (closure) | No status endpoint; UI cannot show plugin/enrich health | `GET /admin/status` → `deps.Status(ctx)` → `statusResponse` | Admin-only. `Deps.Status` is a closure built in `main.go` over `mgr.Status`+`enrichQueue.Stats` → api-local `AdminStatus`. Keeps api free of plugin/enrich imports (INV2). Nil `Status` ⇒ 503 `unavailable`. | `internal/plugin/manager.go:68` (Health); `internal/enrich/queue.go:80` (Stats); `internal/api/doc.go:26` (INV2) |
| **S-swag** | `internal/api/doc.go` (package doc only); `handlers.go` (no annotations) | `api/doc.go` (general-info block: `@title/@version/@BasePath /api/v1`); `handlers.go` (per-handler `@Router/@Summary/@Param/@Success` comments) | No OpenAPI; contract drifts from code | `swag init` emits `openapi.{json,yaml}` to `internal/web/api/` (committed, embedded); reflects real routes+DTOs | Annotations are **comments only** — the parse→call→write handler body is untouched (INV1 preserved). Generated at dev/CI time, not at runtime. | `internal/api/doc.go:4-8` (pure-delegation rule); `internal/api/handlers.go:77,97,120` |
| **S-web-embed** | (none — net-new) | `internal/web/web.go` + `doc.go` (`Handler`, `Options`; `//go:embed all:dist`) | No SPA served; server returns chi's 404 for `/` | `GET /` + `/assets/*` serve embedded dist; SPA fallback for unknown non-api paths | Immutable cache for hashed `/assets/*`; `no-cache` for index.html; client-route fallback returns index.html (200). `web/dist/index.html` placeholder committed so embed compiles pre-Phase-2. | (greenfield — first `go:embed`; D11/Q20 plugin-embed documented but unbuilt) |
| **S-web-swagger** | (none — net-new) | `internal/web/swagger.go` (`//go:embed openapi.yaml` + vendored `swagger-ui/`); serves `/openapi.{yaml,json}` + `/docs/` | No Swagger endpoint | `/openapi.yaml`+`/openapi.json` serve the embedded spec; `/docs/` serves Swagger UI | Public (no auth) — the contract + UI load like the SPA shell. UI pointed at `/openapi.json`. | contracts.md §internal/web |
| **S-compose** | `cmd/mellifera/main.go:127` (`handler := api.New(...)`) then `:135` (`srv.Handler = handler`) | `cmd/mellifera/main.go` (`web.Handler(api.New(deps), opts)`; `Deps.Status` closure over `mgr`+`enrichQueue`) | Sole top-level handler = the chi API router (admin-mw on all routes, incl. `/`) | Sole top-level handler = `web.Handler` composing: `/api/*`→api router; `/openapi.*`,`/docs`→swagger; `/`→SPA. Crucially `/`,`/docs`,`/openapi.*` are NOT admin-gated (SPA shell + contract are public) | API routes keep their auth (role-gated, via the api router's own middleware). The SPA/swagger routes sit **outside** `adminMiddleware`. | `cmd/mellifera/main.go:127,135`; `internal/api/router.go:40` (adminMiddleware currently global) |
| **S-makefile** | `Makefile:14` (`build`), `:26` (`check`) | `Makefile` (`web-build` target — dev-only) | `build`/`check`/`build-plugin` only | + `web-build`: runs `swag init` + (Phase 2) `npm run build`; **NOT** called by `build`/`check` | `make build` and `make check` stay node-free (they embed the committed `web/dist/`+`openapi.*`). `web-build` is the regen path for developers/CI-web-job. | `Makefile:14,26`; check.sh (no node) |
| **S-placeholder-dist** | (none) | `web/dist/index.html` (committed placeholder); `internal/web/api/openapi.yaml` (committed generated spec) | — | A minimal valid `index.html` (+ a placeholder `/assets/app.js` for the cache-header AC) is committed so `//go:embed` compiles and AC-6 is verifiable now | These are build inputs the Go gate consumes; the real React build replaces `dist/` in Phase 2. | acceptance AC-6 |

`no_seam:` none — every MODIFY/CREATE file maps to a seam above.

## Behavior-change impact on existing flows

- **Existing API callers (admin token):** zero behavior change on the 3 existing routes (method+path+DTO+auth intact). Browse routes additionally accept a future `client` role, but no client principal is minted yet, so today only admin tokens reach them. (S-roles, S-routing)
- **`api.New` callers:** `cmd/mellifera/main.go:127` and `qa_auth_test.go:39` — `api.New` signature is UNCHANGED (the new `Deps.Status` field is additive/nil-safe; `qa_auth_test.go` need not set it). The handler returned by `api.New` still mounts `/api/v1` with auth — the change is that `main.go` now wraps it in `web.Handler`. (S-compose)
- **`store.GetItem` callers** (`scan/run.go:215`, `enrich/queue.go:383`): unaffected — the new `getItem` handler is an additional caller, not a change to the method. (S-get-item)
- **Auth boundary:** `/`, `/docs`, `/openapi.*` become **public** (outside admin mw). This is intentional (SPA shell + contract must load before any token is entered; auth happens via Bearer header on `/api` calls). Risk: an operator who relied on "everything requires the admin token" now has a public landing page. Mitigation: the public surface serves no data — only static shell + the API contract. Documented in conventions. (S-compose, S-web-embed)
- **Build/CI:** `make build`/`make check` untouched in behavior (node-free). A new CI consideration: `web-build` runs in a separate (node-enabled) job or as a developer pre-commit; the Go CI job must NOT install node. (S-makefile)

## External boundary changes

No new **outbound** runtime calls (swag + npm are build/dev tools, not runtime). New **inbound** public boundaries:

| Boundary | Protocol | Timeout/retry/idempotency | Reason |
|---|---|---|---|
| `GET /` + `/assets/*` (SPA) | HTTP (static) | N/A — static read; no retry (immutable assets cache 1y; `no-cache` index revalidates) | Public shell; no data |
| `GET /openapi.{yaml,json}` + `/docs/` | HTTP (static) | N/A — static; no retry | Public contract + UI |
| `GET /api/v1/admin/status` | HTTP (auth) | reads are in-memory snapshots (`Stats` best-effort race per `queue.go:81`; `Manager.Status` polled) — no retry, no external IO | Liveness only |

## Coverage Matrix (specifier fills owner + joint test)

| Seam | Owner task | Joint/contract test |
|---|---|---|
| S-roles | T03 (types) + T04 (middleware) | T08 `TestNew_RoleGating` (admin OK both groups; client OK browse, 403 admin) + QA1 `qa1_t4_client_denied_admin` |
| S-routing | T08 (router groups) | T08 `TestNew_RoleGating` (route inventory via gating matrix — 6 routes) + T15 `ac1_roles` |
| S-list-libraries | T02 (store) + T05 (handler) | T05 `list_libraries` subtest (create N → GET /libraries returns them id ASC) + QA3 `qa3_t1_list_libraries_ordered` |
| S-get-item | T06 (handler; consumes existing `store.GetItem`) | T06 `get_item_full_document` + `get_item_not_found` + QA3 `qa3_t3_get_item_full_document` / `qa3_t4_get_item_404` |
| S-admin-status | T07 (api handler+types) + T13 (cmd closure) | T07 `admin_status_happy`/`_nil_returns_503`/`_error_returns_500` + QA3 `qa3_t5_admin_status_happy` / `qa3_t6_admin_status_nil_503_and_error_500` |
| S-swag | T09 (annotations) + T10 (codegen) | T10 grep probe (`grep -cE '(/libraries\|/items\|/admin/status)' openapi.yaml ≥ 6`) + QA2 `qa2_t3_six_routes_named` + T15 `ac2_swagger` |
| S-web-embed | T11 (Handler+embed) | T11 `TestHandler_SPAAndCache` + `TestHandler_DevMode` + QA4 `qa4_t1_root_served`..`qa4_t5_dev_mode` |
| S-web-swagger | T12 (swagger serve) | T12 `TestHandler_Swagger` + `TestHandler_SwaggerNotFallback` + QA2 `qa2_t1_openapi_yaml_served` / `qa2_t2_docs_ui_loads` |
| S-compose | T13 (cmd) | T15 `ac5_admin_status` + `ac6_embed` (top-level handler serves all three; /api auth-gated; /, /docs public) |
| S-makefile | T14 (web-build) | T15 `ac7_gates` + QA4 `qa4_t7_build_gates_green` / `qa4_t9_webbuild_dev_only` (make build+check green w/o node; web-build exists dev-only) |
| S-placeholder-dist | T01 (dist artifact) | T11 `//go:embed all:dist` compiles + QA4 `qa4_t1_root_served` (committed dist/ serves `/`) |

Every seam maps to exactly one owner task (or a split owner with a primary) and at least one joint/contract test. No row left as `(specifier)`.
