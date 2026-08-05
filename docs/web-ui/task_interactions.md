# Task Interactions — web-ui (Phase 1)

> Symbol ownership, order dependencies, conflict surfaces, and the
> foundational/archetype coverage map. Built from `contracts.md`,
> `integration_map.md`, and the coder-task `behaviors`/`callers_to_update`.

## Symbol Ownership

| Symbol | Owner Task | Consumer Tasks | Shared Type? |
|---|---|---|---|
| `internal/web/dist/*` (placeholder) | T01 | T11 (`//go:embed all:dist`) | artifact (no Go symbol) |
| `store.ListLibraries` | T02 | T05 (`listLibraries` handler) | method (excluded from budget) |
| `Role` / `RoleAdmin` / `RoleClient` | T03 | T04 (`requireRole`), T08 (route groups) | yes (api) |
| `Principal{Role}` + `IsAdmin()`/`Admin()` | T03 | T04 (writer `authMiddleware`), T08 (test injection), middleware_test.go (T04) | yes (api) |
| `authMiddleware` | T04 | T08 (router `r.Use`), T13 (composed via api.New) | yes (api) |
| `requireRole` | T04 | T08 (route groups) | yes (api) |
| `libraryDTO` / `librariesResponse` / `listLibraries` | T05 | T08 (route mount), T09 (swag annotation) | yes (api, unexported) |
| `itemResponse` / `getItem` / `toItemDTO` | T06 | T08 (route mount), T09 (swag annotation) | yes (api, unexported) |
| `Deps.Status` field | T07 | T13 (closure assignment) | yes (api) |
| `AdminStatus` / `statusResponse` / `pluginHealthDTO` / `enrichStatsDTO` / `adminStatus` | T07 | T09 (swag), T13 (closure return type) | yes (api, unexported) |
| swag annotations (6 handlers + doc.go) | T09 | T10 (`swag init` reads them) | comments (no symbol) |
| `internal/web/api/openapi.{yaml,json}` + `docs.go` (generated) | T10 | T12 (`//go:embed` + serve) | artifact |
| `internal/web/swagger-ui/*` (vendored) | T10 | T12 (`//go:embed` + serve) | artifact |
| `web.Handler` / `web.Options` | T11 | T12 (swagger routes inserted into mux), T13 (composition) | yes (web, exported) |
| swagger sub-handler + `/openapi.*`+`/docs` routes | T12 | T13 (composed via web.Handler) | yes (web, unexported) |
| `Deps.Status` closure body (mgr + enrichQueue → AdminStatus) | T13 | (none — consumed at composition) | no (cmd-local) |
| `MELLIFERA_WEB_DEV` → `Options.DevMode` | T13 | (none) | env knob |
| `make web-build` target | T14 | (none — developer/CI regen path) | Makefile target |

## Order Dependencies

| Task | Must Complete Before | Reason |
|---|---|---|
| T01 | T11 | `//go:embed all:dist` requires committed dist files to compile |
| T02 | T05 | `listLibraries` handler calls `store.ListLibraries` |
| T03 | T04, T08 | T04 `requireRole` uses `Role`; T08 groups use `Role`/`Principal{Role}` |
| T03 | (lockstep) T04's middleware.go:38 writer | field rename breaks the writer — T03 updates it lockstep OR T04 does; ONE of them, not both |
| T04 | T08 | T08's route groups use `requireRole` + the renamed `authMiddleware` |
| T05 | T08, T09 | T08 mounts `GET /libraries` in the browse group; T09 annotates it |
| T06 | T08, T09 | T08 mounts `GET /items/{id}` in browse; T09 annotates it |
| T07 | T08, T09, T13 | T08 mounts `GET /admin/status` in admin; T09 annotates; T13 wires `Deps.Status` closure |
| T08 | T13 | T13 composes `api.New` (which uses the grouped router) inside `web.Handler` |
| T09 | T10 | `swag init` reads the annotations |
| T10 | T12 | T12 embeds the generated spec + vendored UI |
| T11 | T12, T13 | T12 inserts swagger routes into T11's mux; T13 composes `web.Handler` |
| T12 | T13 | T13's `web.Handler` must include the swagger routes |
| T13 | T15 | T15 boots the composed handler end-to-end |
| T14 | T15 | T15's node-free probe asserts `make build`/`check` don't call `web-build` |
| ALL (T01-T14) | T15 | T15 is the integration keystone (black-box AC-1..AC-7) |

**Linear execution order:** T01 → T02 → T03 → T04 → T05 → T06 → T07 → T08 → T09 → T10 → T11 → T12 → T13 → T14 → T15. (T02 and T03-T07 are partially parallelizable in principle, but the sequential numbering is safe and reviewer-friendly; no parallel branch is required.)

## Potential Conflicts

| Tasks | Shared File | Risk | Mitigation |
|---|---|---|---|
| T03, T04 | `internal/api/middleware.go:38` (Principal writer) | both touch the field-rename break | LOCKSTEP rule: T03 updates `:38` to `Principal{Role:RoleAdmin}` as part of the field rename; T04 does NOT re-touch `:38` (it owns the rename of `adminMiddleware`→`authMiddleware` + `requireRole`). Documented in both tasks' `callers_to_update`. |
| T04, T08 | `internal/api/router.go:40` (`r.Use(adminMiddleware)`) | T04 renames the call site; T08 restructures the route block | T04 does the one-token rename (`adminMiddleware`→`authMiddleware`) so the build stays green; T08 owns the structural `r.Group`+`requireRole` rework. |
| T05, T06, T07, T08 | `internal/api/router.go:41-44` (route block) | T05/T06/T07 each add a mount; T08 regroups all into `r.Group`s | Sequential: T05/T06/T07 add their mounts to the flat block (green after each); T08 is the FINAL api task that restructures. T08's `existing_code_snapshot` reflects T05/T06/T07's output. |
| T07, T13 | `cmd/mellifera/main.go:127` (`api.New` literal) | T07 adds the `Status` field to `Deps` (additive, nil-safe — the `main.go` literal omits it until T13); T13 sets it | Additive field — `main.go` compiles without `Status:` between T07 and T13 (returns 503). No conflict; documented in T07 `callers_to_update`. |
| T11, T12 | `internal/web/web.go` (mux) | T11 builds the mux (api+SPA); T12 inserts swagger routes ahead of the SPA fallback | Sequential: T11 leaves `/openapi.*`+`/docs` falling through to SPA (known gap); T12 closes it. T12's `existing_code_snapshot` reflects T11's output. |
| T09, T05/T06/T07 | `internal/api/handlers.go` | T09 adds annotation COMMENTS above the handlers T05/T06/T07 created | Sequential + comments-only — no statement conflict; T09 runs after T05/T06/T07. |

## Circular Dependencies

**none found.** The graph is a clean DAG:
`T01→T11`, `T02→T05`, `T03→{T04,T08}`, `T04→T08`, `{T05,T06,T07}→{T08,T09}`, `T08→T13`, `T09→T10`, `T10→T12`, `T11→{T12,T13}`, `T12→T13`, `{T13,T14}→T15`.
No back-edges. The `cmd/mellifera` composition (T13) is the single sink before the integration test (T15).

## Cross-Project Tasks

**none** — single Go module (`github.com/mellifera/mellifera`), `project_scope: "."` (root). No monorepo; no subproject boundary crossings. The Phase-2 `web/` (Vite/TS) will be a sibling directory but is NOT a separate Go subproject, and is out of Phase-1 scope.

## Foundational Setup Coverage

| Foundational Setup item (implementation_plan §Foundational Setup) | Emitted as | Notes |
|---|---|---|
| Install `swag` CLI (dev/CI only) | fold→precondition of **T10** | T10 runs `swag init`; documents `go install ...swag/cmd/swag@latest` |
| Vendor Swagger UI static into `internal/web/swagger-ui/` | **T10** (scope) | one-time vendor step in T10; Apache-2.0 |
| Commit Phase-1 placeholder `web/dist/index.html` + `assets/app.js` | **T01** (emits the artifact) | dedicated foundational task |
| Commit generated `internal/web/api/openapi.{yaml,json}` | **T10** (initial `swag init` run committed) | T10 owns the generated commit |
| `NOTICE` update for Swagger UI (Apache-2.0) | fold→**T10** (scope) | T10 appends the attribution |
| Decide swag output dir = `internal/web/api/` | decision (no task) | baked into T10's `-o` flag + conventions |

**No foundational item silently dropped.** One dedicated task (T01) + folds into T10 for the rest.

## Archetype Coverage (web-async — the resolved archetype)

Phase 1's dominant archetype is `web-async` (chi HTTP server + middleware + embedded static + role-gating). The `## Canonical Task Skeleton` families map as follows:

| Archetype family | Emitted task(s) | Skip reason (if any) |
|---|---|---|
| Routing + handler mounting | T05, T06, T07, T08 | — |
| AuthN/AuthZ middleware | T03, T04 | — |
| Static embed + SPA fallback | T01, T11 | — |
| API contract (OpenAPI) | T09, T10, T12 | — |
| Composition root | T13 | — |
| Build-gate / dev-tool story | T14 | — |
| Integration / acceptance | T15 | — |
| (streaming/SSE family) | — | SKIP — no streaming in Phase 1 (the async enrich queue is internal; no SSE endpoint) |
| (background-worker family) | — | SKIP — the enrich queue already exists (`internal/enrich`); Phase 1 adds NO new worker |

**Every applicable family maps to an emitted task.** The two skips are documented (no streaming; no new worker).

## test_budget (feature-level target)

```json
{ "unit": 12, "joint": 8, "e2e": 2, "total": 22 }
```

- Derived from: 11 seams (integration_map) + the web-async archetype pyramid stance (logic-heavy on the roles/embed/fallback; light on data). Coder contract tests (T02 unit, T04 unit, T05/T06/T07 route subtests, T08 gating matrix, T11/T12 web table tests, T15 e2e) ≈ 6 unit + 3 joint + 1 e2e = 10 written in coder tasks. QA writes the REMAINING ≈12 against this budget (4 QA tasks × ~3 tests). Going over requires deleting redundancy first (code-quality #6 REDUNDANCY gate), not raising the budget.
