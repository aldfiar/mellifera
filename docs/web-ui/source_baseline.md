# Source Baseline — web-ui

> Transcribed grounding facts (G1/G2/G5) for the web-ui feature. Every claim
> carries a `file:line` anchor verified against live source on
> `feature/web-ui` (off `main` @ `58a1130`). This is the input to the Step
> Outline, Integration Map, and the self-review. Phase-1 scope: Go-side
> foundation (roles auth + Swagger codegen/serve + API extensions + embedding
> scaffold + build-gate story). The React app itself is Phase 2 (outlined).

## Feature posture

**ADDITIVE where possible.** The SPA is net-new (`internal/web`, `web/`); the
chi API is *extended* (3 new GET routes + role-aware middleware + new
`store.ListLibraries`); `proto/`, `pkg/sdk`, `internal/scan`, `internal/enrich`
are NOT touched (verify-probe in acceptance AC-7). `cmd/mellifera/main.go`
gains a top-level composer. The Go build gate (`check.sh`, `golangci-lint`,
`CGO_ENABLED=0 go build`) MUST stay green without `node` — `node`/`npm` is a
**dev-only** toolchain; the committed artifacts (`web/dist/`, generated
`openapi.*`) are embedded via `go:embed`.

## Module: internal/api (MODIFY — the primary surface)

Exports 3 symbols today (`doc.go:16-20`): `Deps`, `Principal`, `New`. The
package is **pure delegation** (`doc.go:4-8`, INV1: parse → ONE domain call →
write; `funlen≤60`, `gocognit≤15`). INV2 (`doc.go:26-28`): api imports ONLY
`internal/store`, `internal/scan`, stdlib + chi — it MAY NOT import
`internal/plugin` or `internal/module`. (`.golangci.yml` depguard denies only
`reflect` + DI frameworks — INV2 is doc-enforced, not lint-enforced; the plan
must keep it manually.)

- `router.go:21` — `Deps{AdminToken string; Store *store.Store; Scan func(ctx, libraryID int64) (scan.Result, error)}`.
- `router.go:30` — `Principal{Admin bool}`. **Phase-2-widening-anticipated** (arch §11.5: "Phase 2: `Principal{user_id, roles, library_acls}`").
- `router.go:37` — `New(deps Deps) http.Handler`. Builds chi router; `r.Use(adminMiddleware(deps.AdminToken))` wraps **every** route (`router.go:40`); 3 routes under `/api/v1` (`router.go:41-44`): `POST /libraries`, `POST /libraries/{id}/scan`, `GET /items`.
- `middleware.go:29` — `adminMiddleware(token)` constant-time-compares a `Bearer` credential (`middleware.go:49 bearerCredentials`); on match sets `Principal{Admin:true}` in the context (`middleware.go:38`); on miss writes 401 canonical body and does NOT call next. `principalFromContext` (`middleware.go:19`) is the unexported reader.
- `handlers.go` — `app{deps}` (`handlers.go:19`). DTOs (all unexported, INV4 no `store.Item` over the wire): `createLibraryRequest` (`:32`), `libraryResponse` (`:39`), `scanResponse` (`:47`), `itemsResponse` (`:55`), `itemDTO` (`:63`; carries `Document json.RawMessage` — the **full** §3.1 document is already on the wire), `apiError`/`errorBody` (`:175`/`:181`). Handlers: `createLibrary` (`:77`), `scanLibrary` (`:97`), `listItems` (`:120`; parses `?library=` + `?status=` + pagination). Helpers: `parsePagination` (`:139`), `toItemDTOs` (`:156`), `writeJSON` (`:186`), `writeError` (`:193`).

**Principal evolution (roles):** `Principal.Admin` is **read by exactly one site** — `middleware_test.go:55` (`!principal.Admin`). No production handler reads it (middleware.go:17 comment: "for MVP none do"). So widening `Principal{Admin bool}` → `Principal{Role Role}` + `IsAdmin()` is safe (one test updates). Confirmed by grep: `Principal{` appears only at `middleware.go:26` (comment) + `middleware.go:38` (writer); `.Admin` only at `middleware_test.go:55` + `router.go:40` (comment-context only, not a field read).

## Module: internal/store (MODIFY — one new method)

- `items.go:16` — `Item{ID, ModuleID, LibraryID, FileID, RelativePath, MediaType, Document json.RawMessage, SchemaVersion, Status, CreatedAt, UpdatedAt}`.
- `items.go:74` — `GetItem(ctx, id string) (Item, error)` — **exists, no API-layer caller today** (callers: `scan/run.go:215`, `enrich/queue.go:383`, tests). `GET /items/{id}` will be the first API caller.
- `items.go:88` — `QueryItems(ctx, libraryID, status, limit, offset)` — used by `listItems` (`handlers.go:128`).
- `libraries.go:13` — `Library{ID, ModuleID, RootPath, DisplayName, CreatedAt}`.
- `libraries.go:24` — `CreateLibrary(ctx, moduleID, rootPath, displayName) (int64, error)`.
- `libraries.go:41` — `GetLibrary(ctx, id) (Library, error)`.
- **No `ListLibraries`/`QueryLibraries` exists** (grep empty) — **CREATE** needed for `GET /libraries`.
- Parameterized SQL only (INV1, `items.go:87-88`); status never interpolated. New `ListLibraries` follows the same pattern.

## Module: internal/enrich (CONSUMED — read-only, for admin status)

- `queue.go:80` — `Stats{Pending, InFlight, Done, Failed int}` (best-effort liveness snapshot).
- `queue.go:189` — `func (q *Queue) Stats() Stats`. **Zero API/cmd callers today** (grep empty); `GET /admin/status` will be the first.
- The package is NOT modified (AC-7). api must NOT import it (INV2) → admin status reaches api via a `Deps.Status func` closure built in `cmd/mellifera`.

## Module: internal/plugin (CONSUMED — read-only, for admin status)

- `manager.go:68` — `Health{State, Message, Restarts int, LastCheckedAt time.Time}`.
- `lifecycle.go:102` — `func (m *Manager) Status(pluginID string) (Health, error)`. **Zero API/cmd callers today**; `GET /admin/status` will be the first.
- NOT modified (AC-7). api must NOT import it (INV2) → reached via the same `Deps.Status` closure.

## Module: internal/scan (UNCHANGED)

`Run`/`Deps`/`Result` (3 symbols, `scan/doc.go`). `scan.Run` is wired into `api.Deps.Scan` (`main.go:130`). Not touched by web-ui.

## Module: cmd/mellifera (MODIFY — composition root)

- `main.go:62` `main()` — flat constructor list. `store.Open` (`:69`), `module.Open` (`:73`), `plugin.Open`+`Load`+`Start` 3 plugins (`:76-104`), `scanDeps` (`:106`), `enrichQueue := enrich.NewQueue(...)` (`:117`), `enrichQueue.Start` (`:118`), `scanDeps.Notify` closure (`:124`), `handler := api.New(api.Deps{...})` (`:127`), `srv := &http.Server{Handler: handler}` (`:135`).
- This is the **only** place the top-level `http.Handler` is composed → the SPA + Swagger mount here, wrapping/alongside `api.New`. `mgr` (`:76`) + `enrichQueue` (`:117`) are in scope to feed the admin-status closure.
- `loadConfig` (`:182`): `MELLIFERA_ADMIN_TOKEN` required (fail-fast, `:188`); `MELLIFERA_LISTEN` default `127.0.0.1:8080` (`:198`). New env knobs for web (e.g. disable-SPA dev flag) are additive.

## Module: internal/web (CREATE — net-new, the embedding + composition layer)

No `web/`, `internal/web/`, `dist/`, or `package.json` exists (find empty). This
package will own: `go:embed web/dist/*` (the SPA), SPA-fallback routing,
immutable cache headers for hashed assets, and the Swagger spec + Swagger UI
mount. It is the **first real `go:embed`** in the codebase (plugin embed
D11/Q20 is documented but not yet implemented; the SPA embed is simpler — static
assets, no first-run extraction).

## Test inventory

- `internal/api/router_test.go` + `middleware_test.go` — chi handler/middleware tests; `middleware_test.go:55` is the lone `.Admin` reader (updates to `.IsAdmin()`/`.Role`).
- `internal/store/store_test.go` (table-driven; covers `GetItem`/`QueryItems`/`CreateLibrary`/`GetLibrary`), `ledger_test.go`.
- Black-box integration (stdlib `net/http`): `integration_test.go` (scan-library AC-1), `integration_pipeline_test.go` (Phase A), `integration_async_test.go` (B1), `integration_image_test.go` (B2), `qa_*_test.go` (independent acceptance + regression, incl. `qa_auth_test.go:39` which calls `api.New`). **Pattern for Phase-1 ACs: a new `integration_web_test.go` black-box test** boots the server binary (or `api.New`+`web.Handler` in-process) + asserts `/`, `/openapi.yaml`, `/docs`, role-gating, and the 3 new GET routes.

## Cross-Module Dependencies (table — symbols this feature touches)

| Symbol | Defined In | Imported/Called By (verified) | web-ui action |
|---|---|---|---|
| `api.New` | `internal/api/router.go:37` | `cmd/mellifera/main.go:127`; `qa_auth_test.go:39` | MODIFY (signature unchanged; routes added; role-gating) |
| `api.Deps` | `internal/api/router.go:21` | `cmd/mellifera/main.go:128`; `qa_auth_test.go:39` | MODIFY (add `Status func(ctx) (AdminStatus, error)` field — additive) |
| `api.Principal` | `internal/api/router.go:30` | `middleware.go:38` (write); `middleware_test.go:55` (read) | MODIFY (`Admin bool` → `Role Role` + `IsAdmin()`; 1 test updates) |
| `store.GetItem` | `internal/store/items.go:74` | `scan/run.go:215`; `enrich/queue.go:383`; tests | (no change) — new `getItem` handler becomes first API caller |
| `store.QueryItems` | `internal/store/items.go:88` | `api/handlers.go:128` | (no change) |
| `store.CreateLibrary` | `internal/store/libraries.go:24` | `api/handlers.go:83` | (no change) |
| `store.Library` | `internal/store/libraries.go:13` | `api/handlers.go` (DTO conversion) | (no change) — consumed by new `listLibraries` |
| `store.ListLibraries` | (does not exist) | — | **CREATE** |
| `enrich.Queue.Stats` | `internal/enrich/queue.go:189` | (none in cmd/api) | (no change) — reached via `main.go` closure |
| `plugin.Manager.Status` | `internal/plugin/lifecycle.go:102` | (none in cmd/api) | (no change) — reached via `main.go` closure |
| `web.Handler` (tentative) | `internal/web` (net-new) | `cmd/mellifera/main.go` (new) | **CREATE** |

## Build gate (must stay green)

- `Makefile`: `build` = `CGO_ENABLED=0 go build ./...`; `check` = `bash .claude/skills/mellifera-build/scripts/check.sh`; `build-plugin` = 3 binaries. **No `web-build` target** — **CREATE** (dev-only; NOT in `build`/`check`).
- `.golangci.yml`: `funlen 60/40`, `gocognit 15`, `gocyclo 15`, `lll 120`, `dupl 100`, depguard denies `reflect` + `wagon` (DI). No api-import rule (INV2 is manual).
- `check.sh`: counts top-level exported `func/type/var/const` per package (excl `*_test.go`, `*.pb.go`, `*.gen.go`); **WARN >8, FAIL >12**. Methods-with-receivers are excluded → `IsAdmin()` and unexported handler methods don't count.
- `go.mod`: chi v5, modernc.org/sqlite, go-plugin, grpc, protobuf. **No web/swagger deps** — and none added at runtime: `swag`/`swagfmt` are CLI tools (like `protoc`), annotations are comment metadata, and the generated `openapi.*` is embedded bytes (no generated-package import). **go.mod UNCHANGED** (AC-7).
- **Symbol budget after Phase 1:** `api` 3→4 (`Deps`,`Principal`,`New`,`Role`) — under 8. `web` net-new, target ≤3 (`Handler`,`New`,`Spec`-ish). `store` +1 method (excluded from count). All within budget.

## Git state

Branch `feature/web-ui` off `main` @ `58a1130` (scan-library + plugin-pipeline A + async-enrichment B1 + image-enrichment B2). Planner is read-only: writes only to `docs/web-ui/`; no commits, no code.
