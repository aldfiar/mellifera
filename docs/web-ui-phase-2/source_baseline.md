# Source Baseline — web-ui Phase 2 (React SPA + panels)

> Digest of the code state Phase 2 builds on. Phase 2 = the visible React SPA +
> panels consuming the **Phase-1 Go foundation** (already on `main` @ `47f276e`).
> The Go side is essentially unchanged; Phase 2 is primarily a NEW React app under
> `web/` plus the built dist replacing the placeholder. Every claim below is
> cited to `file:line` (grounding G1/G2); symbols were read directly from source.

## Sub-phasing verdict (right-sizing)

Phase 2 is **LARGE**; the enhanced objective (`docs/web-ui-phase-2/.phase_cache/enhanced_objective.md:107-113`) **authorizes sub-phasing**. This plan scopes **Phase 2a** and outlines 2b/2c:

- **Phase 2a (THIS plan):** scaffold (Vite + TS + react-router + TanStack Query + Tailwind + shadcn/ui) + auth (token-entry, Bearer fetch wrapper, `RequireAuth`) + **admin library-management** (list, add, scan, admin/status). Proves the delivery: real React build served by Go, Go gate node-free.
- **Phase 2b (outlined):** client browse panel — items list (filter library+status) + item detail + metadata rendering (`sources.<plugin>` cards, `_provenance` badges, `_view` fields, `_stages` progress).
- **Phase 2c (outlined):** polish — responsive layout, empty/loading/error states, pagination, a11y, dark mode.

## Modules (Go foundation — consumed, mostly unchanged)

### `internal/web` (Phase 1 — the embed/composition layer Phase 2 feeds)

- **Exports** (`internal/web/web.go`, `swagger.go`): `Handler(apiHandler http.Handler, opts Options) http.Handler` (`web.go:45`), `Options{DevMode bool}` (`web.go:30-36`). **2 exported symbols** (ai-architecture §4 module map).
- **`//go:embed all:dist`** (`web.go:20-21`) embeds **`internal/web/dist/`** (the package-local dir). This is the authoritative embed target — embed paths MUST be within the package tree, so `web/dist/` CANNOT be embedded by `internal/web`. Phase 2's Vite build output is redirected here (see File Map).
- **`mustReadIndex`** (`web.go:138-144`) reads `dist/index.html` at init and panics if missing — the build MUST emit `dist/index.html`.
- **Routing** (`web.go:45-64`): `/api/*` → apiHandler (carries its own auth); `/openapi.{yaml,json}` + `/docs/*` → `registerSwagger` (`swagger.go:35-44`, registered AHEAD of the SPA fallback); `GET /` → `serveIndex`; `GET /assets/*` → `serveAsset`; `NotFound` → SPA client-route fallback EXCEPT `/assets/*` (broken hashed assets 404 fail-fast).
- **Cache headers** (`web.go:97-102`): `DevMode` OR non-asset → `no-cache`; hashed `/assets/*` (non-dev) → `public, max-age=31536000, immutable`.
- **Embedded dist (current placeholder, Phase 2 REPLACES):** `internal/web/dist/index.html` (338 bytes) + `internal/web/dist/assets/app.js` (681 bytes) — hand-written Phase-1 shell (`web/README.md:8-12`).
- **Swagger** (`swagger.go`): `//go:embed api/openapi.yaml` + `api/openapi.json` (`swagger.go:20-24`); served unauthenticated at `/openapi.{yaml,json}` + `/docs/*`.
- **Importers of `web.Handler`:** `cmd/mellifera/main.go:185` — the SOLE caller (`web.Handler(apiHandler, web.Options{DevMode: cfg.webDev})`). No other consumer.

### `internal/api` (Phase 1 — the role-aware endpoints the SPA calls; UNCHANGED in Phase 2)

- **Exports** (`internal/api/doc.go`, confirmed by reading router.go/handlers.go) — **7 symbols** (≤8 budget): `New`, `Deps`, `Principal`, `Role`, `AdminStatus`, `PluginHealth`, `EnrichStats`.
- **`Deps`** (`router.go:21-32`): `AdminToken string`, `Store *store.Store`, `Scan func(ctx, libraryID) (scan.Result, error)`, `Status func(ctx) (AdminStatus, error)` (the INV2 anti-corruption closure, nil-safe → 503).
- **`Role`/`Principal`** (`router.go:39-64`): `RoleAdmin = "admin"` (minted by the admin-token resolver), `RoleClient = "client"` (defined, **not minted** by any resolver — D18 swap point). `Principal{Role}`; `IsAdmin()` is a method (excluded from the symbol count). Handlers never fork on Role.
- **Route table** (`router.go:89-102` — `mountV1Routes`):
  - **Browse group** (`requireRole(RoleAdmin, RoleClient)` — read-only): `GET /api/v1/libraries`, `GET /api/v1/items`, `GET /api/v1/items/{id}`.
  - **Admin group** (`requireRole(RoleAdmin)` — mutating + liveness): `POST /api/v1/libraries`, `POST /api/v1/libraries/{id}/scan`, `GET /api/v1/admin/status`.
  - **No `DELETE`/`PUT /libraries`** (grep-confirmed) — library management in Phase 2 MVP = add + list + scan (deferred to later per arch §12).
- **Auth middleware** (`middleware.go`): `authMiddleware` (`:32-45`) resolves `Authorization: Bearer <token>` → `Principal{Role: RoleAdmin}` (constant-time compare, `:36`); any miss → 401 `unauthenticated`. `requireRole` (`:56-75`) → 403 `forbidden` on role mismatch. **authN precedes authZ** (INV-authn-then-authz).
- **DTOs the SPA consumes** (`handlers.go`):
  - `createLibraryRequest` (`:34-38`): `{module_id, root_path, display_name}`.
  - `libraryDTO` (`:46-51`): `{id, module_id, root_path, display_name}`.
  - `librariesResponse` (`:54-56`): `{items: []libraryDTO}`.
  - `scanResponse` (`:59-64`): `{library_id, discovered, persisted, warnings?}`.
  - `itemsResponse` (`:67-69`): `{items: []itemDTO}`.
  - `itemResponse` (`:74-76`): `{item: itemDTO}` — `itemDTO.Document` (`:129-139`) is `json.RawMessage` carrying the FULL §3.1 document (sources + `_view` + `_provenance` + `_stages`), precision-preserved (INV-full-document).
  - `itemDTO` (`:129-139`): `{id, module_id, library_id, file_id, relative_path, media_type, document, schema_version, status}`.
  - `PluginHealth` (`:86-91`, exported): `{id, state, restarts, checked_at}` (checked_at RFC3339 string).
  - `EnrichStats` (`:97-102`, exported): `{pending, in_flight, done, failed}`.
  - `AdminStatus` (`:110-113`, exported): `{plugins []PluginHealth, enrich EnrichStats}`.
  - `statusResponse` (`:120-123`, unexported envelope): `{plugins, enrich}`.
- **`listItems`** (`handlers.go:216-230`): `?library=<int>&status=<string>&limit=&offset=`; empty/absent `status` → all (INV-empty-all); pagination `defaultLimit=50`, `maxLimit=200` (`:28-31`).
- **Error body** (`handlers.go:364-385`): canonical `{"error":{code, message, retryable}}` (arch §11.6). 401 unauthenticated, 403 forbidden, 404 not_found, 503 unavailable (nil Status closure), 500 internal_error.
- **Invariants** (`doc.go` INV1-INV5): INV1 pure delegation; INV2 api MAY NOT import plugin/enrich/module/web; INV3 Principal is a TYPE; INV4 no store.Item/plugin.Health/enrich.Stats over the wire; INV5 7 symbols.

### `cmd/mellifera` (composition root — UNCHANGED in Phase 2)

- `api.New(api.Deps{...})` wired at `main.go:172-179`; `web.Handler(apiHandler, web.Options{DevMode: cfg.webDev})` at `main.go:185` — the SOLE top-level handler (INV-single-handler).
- `MELLIFERA_WEB_DEV` → `cfg.webDev` (`main.go:255`) loosens cache headers for the Vite dev proxy.
- `MELLIFERA_ADMIN_TOKEN` (`main.go:240-244`) — **required**, fail-fast if empty.

### `web/` (Phase-1 placeholder directory — Phase 2a fills this)

- **Current contents:** `web/README.md` only (3.5KB). **No `package.json`, `src/`, `vite.config.ts`, `node_modules/`** — grep-confirmed (Phase 2a CREATEs them).
- **`web/README.md:66-81`** documents the Phase-2 contract: `web/` = React app source + dev config (`src/`, `package.json`, `vite.config.ts`, `tsconfig.json`, `node_modules/`); `internal/web/dist/` = committed build INPUT for `//go:embed`. Toolchain: Vite + React 18 + TS + react-router-dom + TanStack Query + Tailwind.

### `Makefile` (build gate — MODIFY in Phase 2a)

- `build`/`test` (`:14-19`): `CGO_ENABLED=0 go build/test ./...` — **node-free**.
- `lint` (`:22-23`): `golangci-lint run ./...`.
- `check` (`:26-27`): `bash .claude/skills/mellifera-build/scripts/check.sh` (lint + exported-symbol count; WARN >8, FAIL >12).
- `web-build` (`:56-61`): `swag init -g internal/api/doc.go -o internal/web/api -ot json,yaml` + a **COMMENTED-OUT** npm step. The comment (`:58-61`) says "build the Vite SPA into internal/web/dist/" but the command reads `cd internal/web && npm ci && npm run build` — **INCONSISTENT** with `web/README.md:66-81` (npm project at `web/`). Phase 2a corrects this to `cd web && npm ci && npm run build` (outDir → `internal/web/dist/`). See architecture_review R1.

### `.gitignore`

- `node_modules/` (matches anywhere — covers `web/node_modules/`).
- `/web/dist/` — ignored (so Vite's default `dist/` output, if any, is NOT committed). Phase 2 redirects outDir to `internal/web/dist/` (the committed embed target, NOT gitignored). Already correct; no change needed.

### `.golangci.yml`, `check.sh`

- funlen 60, gocognit/gocyclo 15, lll 120, dupl 100, depguard denies `reflect` + DI frameworks (`golangci.yml`). `check.sh` counts top-level exports only (methods excluded); Go-side symbol budget is unaffected by Phase 2 (no new Go exports).

## Test Inventory

- **Go tests (existing, Phase 1 — UNCHANGED):** `internal/web/web_test.go` (Handler + SPA + cache), `internal/web/qa_swagger_test.go`, `internal/api/{router_test,middleware_test,role_gating_test,roles_test,admin_status_test,qa_roles_test}.go`. The Go gate runs them node-free.
- **Phase-2a tests (NEW, JS side):** Vitest (unit) for `lib/api.ts` (Bearer injection, 401 handling), `lib/auth.ts` (token storage), `RequireAuth`. A build/integration probe: `make web-build` produces `internal/web/dist/index.html` + `assets/*`; `make build && make check` green node-free. The Go-side `internal/web` tests still pass against the real React dist (they assert headers/fallback, not placeholder bytes — verify at plan review).
- **Framework:** Vitest + @testing-library/react + jsdom (Phase 2a dev deps). No new Go test framework.

## Cross-Module Dependencies (the seams Phase 2a touches)

| Symbol / Surface | Defined In | Imported / Consumed By | Phase-2a change |
|---|---|---|---|
| `//go:embed all:dist` → `internal/web/dist/` | `internal/web/web.go:20` | `internal/web` (init) | REPLACE dist contents (placeholder → React build); directive UNCHANGED |
| `web.Handler` | `internal/web/web.go:45` | `cmd/mellifera/main.go:185` | none (consumes whatever dist embeds) |
| `web/README.md` | `web/README.md` | (docs) | MODIFY: Phase-2 status landed |
| `Makefile` `web-build` | `Makefile:56-61` | dev/CI (manual) | MODIFY: uncomment + correct npm step |
| `GET /api/v1/libraries` | `internal/api/router.go:92` | SPA (Phase 2a admin list) | none (consume) |
| `POST /api/v1/libraries` | `internal/api/router.go:98` | SPA (Phase 2a add form) | none (consume) |
| `POST /api/v1/libraries/{id}/scan` | `internal/api/router.go:99` | SPA (Phase 2a scan trigger) | none (consume) |
| `GET /api/v1/admin/status` | `internal/api/router.go:100` | SPA (Phase 2a status page) | none (consume) |
| `GET /api/v1/items`, `GET /api/v1/items/{id}` | `internal/api/router.go:93-94` | SPA (Phase 2b browse) | none (outlined for 2b) |

**Net Go-side change: NONE to source code.** The only Go-side deltas are (a) the committed `internal/web/dist/*` bytes (regenerated, not hand-edited) and (b) two doc/build files (`web/README.md`, `Makefile`). `internal/api`, `internal/web/*.go`, `cmd/mellifera`, `proto/`, `pkg/sdk`, `internal/{scan,enrich,store,module,plugin}` are byte-identical vs `47f276e`.

## Git State

Branch `feature/web-ui-phase-2` off `main` @ `47f276e` (scan-library + plugin-pipeline A + async-enrichment B1 + image-enrichment B2 + web-ui Phase 1). No commits yet on the feature branch (planner is read-only; specifier commits). Apache-2.0 headers enforced on Go source (`arch §11.7`); the React app carries Apache-2.0 headers in source headers + `NOTICE` entries for bundled deps (Radix UI — MIT; TanStack Query — MIT; Tailwind — MIT; Vite — BSD-3).
