# Tasks: web-ui (Phase 1: API + roles + Swagger + embed scaffold)

> 15 coder + 4 QA + 2 docs = 21 tasks. Ordered by dependency (see
> `task_interactions.md`). Phase-1 scope: Go-side foundation ONLY (no React app —
> Phase 2). Foundational setup tasks emitted first (T01). Each coder task carries
> `behaviors` (AC-traced B-ids), `invariants`, `callers_to_update`,
> `allowed_imports`, `existing_code_snapshot`, `scope_boundary`, `acceptance_criteria`,
> `source_anchor`. MODIFY targets G2-verified against live source on
> `feature/web-ui` (off `main` @ `58a1130`).

## Coder Tasks

- [x] **T01** — Foundational: commit Phase-1 placeholder `internal/web/dist` + `web/README.md` — `tasks/task_01_placeholder_dist.md` (step 13; S-placeholder-dist; enables AC-6)
- [x] **T02** — store: `ListLibraries(ctx) ([]Library, error)` + table test — `tasks/task_02_store_list_libraries.md` (step 1; S-list-libraries; AC-3)
- [x] **T03** — api: `Role` + `Principal{Role}` + `IsAdmin()`/`Admin()`; doc.go INV/symbol-count — `tasks/task_03_api_roles_types.md` (step 2; S-roles; AC-1, AC-7)
- [x] **T04** — api/middleware: `adminMiddleware`→`authMiddleware` + `requireRole(roles...)`; update `middleware_test.go` — `tasks/task_04_authmiddleware_require_role.md` (step 3; S-roles; AC-1)
- [x] **T05** — api/handlers: `listLibraries` + `libraryDTO`/`librariesResponse`; mount `GET /libraries` — `tasks/task_05_handler_list_libraries.md` (step 4; S-list-libraries; AC-3)
- [x] **T06** — api/handlers: `getItem` + `itemResponse`; mount `GET /items/{id}`; 404 on missing — `tasks/task_06_handler_get_item.md` (step 6; S-get-item; AC-4)
- [x] **T07** — api: `Deps.Status` field + `adminStatus` + `AdminStatus`/DTOs; mount `GET /admin/status` — `tasks/task_07_handler_admin_status.md` (step 7; S-admin-status; AC-5)
- [x] **T08** — api/router: regroup routes into `requireRole` groups (browse: admin+client; admin: admin-only) — `tasks/task_08_router_role_groups.md` (step 5; S-routing, S-roles; AC-1, AC-3, AC-4, AC-5)
- [x] **T09** — api: swag annotations on all 6 handlers + general-info block in `doc.go` — `tasks/task_09_swag_annotations.md` (step 8; S-swag; AC-2, AC-7)
- [x] **T10** — Foundational: initial `swag init` (commit `openapi.*`) + vendor Swagger UI + `NOTICE` — `tasks/task_10_swag_codegen_vendor_ui.md` (step 14; S-swag, S-web-swagger; AC-2, AC-7)
- [x] **T11** — internal/web: `Handler` + `Options` + `//go:embed all:dist` + SPA fallback + cache + `doc.go` — `tasks/task_11_web_handler_embed.md` (step 9; S-web-embed; AC-6)
- [x] **T12** — internal/web/swagger: embed `openapi.yaml` + vendored UI; serve `/openapi.{yaml,json}` + `/docs` — `tasks/task_12_web_swagger_serve.md` (step 10; S-web-swagger; AC-2)
- [x] **T13** — cmd/mellifera: compose `web.Handler(api.New(deps), opts)` + `Deps.Status` closure + `MELLIFERA_WEB_DEV` — `tasks/task_13_cmd_wiring.md` (step 11; S-compose, S-admin-status; AC-5, AC-6)
- [x] **T14** — Makefile: `web-build` target (dev-only; NOT in `build`/`check`) — `tasks/task_14_makefile_web_build.md` (step 12; S-makefile; AC-7)
- [x] **T15** — integration: black-box `integration_web_test.go` (AC-1..AC-7) + gates-green node-free probe — `tasks/task_15_integration_gates.md` (step 15; all seams; AC-1..AC-7)

## QA Tasks (after coder + reviewer)

- [x] **QA1** — Roles-gating + routing (AC-1) — `qa/qa_01_roles_gating.md` (validates T03, T04, T08) — DONE: `internal/api/qa_roles_test.go::TestQA_RoutingDefaultDeny_BrowseGroup` (browse-group default-deny gap; admin/client matrix referenced from role_gating_test.go)
- [x] **QA2** — Swagger accuracy + serve (AC-2) — `qa/qa_02_swagger_accuracy_serve.md` (validates T09, T10, T12, T13) — DONE: `internal/web/qa_swagger_test.go` (DTO-accuracy drift catcher + served==committed bytes + R-01 spec verification)
- [x] **QA3** — The 3 endpoints: list-libraries / get-item / admin-status (AC-3, AC-4, AC-5) — `qa/qa_03_three_endpoints.md` (validates T02, T05, T06, T07, T13) — DONE: `qa_endpoints_test.go` (INV4 library wire key-set exact + getItem-404 retryable=false)
- [x] **QA4** — Embed/cache/fallback + build-gate node-free (AC-6, AC-7) — `qa/qa_04_embed_cache_buildgate.md` (validates T01, T11, T13, T14, T15) — DONE: `qa_embed_buildgate_test.go` (empty-name asset guard + AC-7 node-free dry-run)

## Docs Tasks (after coder + reviewer)

- [x] **DOCS1** — Sync module map (`docs/ai-architecture.md §4`) for internal/web + api roles + new endpoints — `docs/docs_01_module_map_sync.md` (AC-7) — DONE: `docs/ai-architecture.md` §4 (api 3→7, NEW `internal/web` row, `cmd/mellifera` [web-ui] note, header marker, dep-direction `web→api`); `docs/project_structure.md` (callout + Stack row + tree + entry-point + Phase web-ui additions + deferred); `docs/.project_context.json` `src_layout`/`framework`/`docs_index`. P3 reconciles folded in.
- [x] **DOCS2** — Operator runbook (node dev-only + `make web-build` + public-surface-widens R-2 + env knobs) — `docs/docs_02_operator_runbook.md` (AC-7, R-2) — DONE: `docs/web-ui/operator-runbook.md` (build-gate node-free story, `make web-build` regen, R-2 public-surface mitigation, roles, env knobs incl. `MELLIFERA_WEB_DEV`, dev workflow, verification probes).

## Counts

- coder: 15 (T01-T15)
- qa: 4 (QA1-QA4)
- docs: 2 (DOCS1-DOCS2)
- total: 21

## Notes

- **Foundational tasks:** T01 (placeholder dist) + T10 (swag codegen + vendor) own no AC of their own but are required prerequisites (T01→T11; T10→T12). The other Foundational Setup items (swag CLI install, NOTICE, generated-spec commit) fold into T10's scope/precondition.
- **INV2 (load-bearing):** api MUST NOT import `internal/plugin`/`internal/enrich`/`internal/module`/`internal/web`. The `Deps.Status` closure (built in T13/cmd) is the anti-corruption seam. Verified by grep in T07/T13/QA3.
- **AC-7 (additive):** proto/sdk/scan/enrich/plugin/module byte-identical vs `58a1130`; `go.mod`/`go.sum` unchanged. Probe in T15/QA4.
- **Step→task mapping:** the outline's step NUMBER is not the execution order (step 5/`->` deps execute AFTER 2,3,4,6,7). Task numbering IS dependency-correct: T01→T15.
