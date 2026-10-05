# Tasks: web-ui Phase 2a (scaffold + auth + admin library-management)

> 12 coder tasks (one per outline step, dependency-ordered), 2 QA tasks, 2 docs tasks = 16 total.
> The Go side is ADDITIVE (byte-identical except regenerated `internal/web/dist/*` + Makefile + web/README.md).
> Phase 2b (browse+detail+metadata) + 2c (polish) are OUT of scope (outlined in implementation_plan §Out of Scope).

## Step → Task map (dependency-ordered; the only outline inversion is auth (Step 4) → T03 before api (Step 3) → T04, because `api.ts` imports `getToken`/`clearToken` from `auth.ts`)

| Outline Step | Task | Title | AC trace |
|---|---|---|---|
| 1 | T01 | Vite + React 18 + TS scaffold (outDir → internal/web/dist; dev proxy) | AC-5, AC-6 |
| 2 | T02 | Tailwind CSS + shadcn/ui setup (copy-in primitives) | AC-2, AC-4, AC-6 |
| 4 | T03 | Auth layer (localStorage token + `<RequireAuth>`) | AC-1 |
| 3 | T04 | API client (typed DTOs + `apiRequest<T>` Bearer fetch wrapper) | AC-1, AC-7 |
| 5 | T05 | TanStack Query admin hooks + provider root (`main.tsx`) | AC-2, AC-3, AC-4 |
| 6 | T06 | App routing (`/login`, `/admin`, `/` → `/admin`) | AC-1, AC-5 |
| 7 | T07 | Login page (token-entry form) | AC-1 |
| 8 | T08 | Admin shell + Libraries page (list + add-library form) | AC-2 |
| 9 | T09 | Libraries scan trigger (extend `Libraries.tsx`) | AC-3 |
| 10 | T10 | Admin Status page (plugin health + enrich queue stats) | AC-4 |
| 11 | T11 | Makefile `web-build` cwd fix (R1) + `web/README.md` Phase-2a status | AC-5, AC-6 |
| 12 | T12 | Replace `internal/web/dist/*` with the real build + verify the Go gate | AC-5, AC-6, AC-7 |

## Coder Tasks

- [x] Task 01: Vite + React 18 + TS scaffold (outDir → internal/web/dist; dev proxy) — `tasks/task_01_vite_react_scaffold.md`
- [x] Task 02: Tailwind CSS + shadcn/ui setup (copy-in primitives) — `tasks/task_02_tailwind_shadcn_setup.md`
- [x] Task 03: Auth layer (localStorage token + `<RequireAuth>`) — `tasks/task_03_auth_token_requireauth.md`
- [x] Task 04: API client (typed DTOs + `apiRequest<T>` Bearer fetch wrapper) — `tasks/task_04_api_client_fetch_wrapper.md`
- [x] Task 05: TanStack Query admin hooks + provider root (`main.tsx`) — `tasks/task_05_query_hooks_providers.md`
- [x] Task 06: App routing (`/login`, `/admin`, `/` → `/admin`) — `tasks/task_06_app_routing.md`
- [x] Task 07: Login page (token-entry form) — `tasks/task_07_login_page.md`
- [x] Task 08: Admin shell + Libraries page (list + add-library form) — `tasks/task_08_admin_shell_libraries_list_add.md`
- [x] Task 09: Libraries scan trigger (extend `Libraries.tsx`) — `tasks/task_09_libraries_scan_trigger.md`
- [x] Task 10: Admin Status page (plugin health + enrich queue stats) — `tasks/task_10_admin_status_page.md`
- [x] Task 11: Makefile `web-build` cwd fix (R1) + `web/README.md` Phase-2a status — `tasks/task_11_makefile_webbuild_readme.md`
- [ ] Task 12: Replace `internal/web/dist/*` with the real build + verify the Go gate — `tasks/task_12_replace_dist_verify_gates.md`

## QA Tasks (after coder + reviewer)

- [ ] QA 01: SPA served + auth + admin library-management e2e (through the Go API) — `qa/qa_01_spa_auth_admin_e2e.md` — validates T03,T04,T05,T06,T07,T08,T09,T10 (AC-1, AC-2, AC-3, AC-4)
- [ ] QA 02: Structural + build-gate probes (delivery, node-free, additive) — `qa/qa_02_structural_build_gate_probes.md` — validates T01,T11,T12 (AC-5, AC-6, AC-7)

## Docs Tasks (after coder + reviewer)

- [ ] DOCS 01: Module map — `web/` React app + build workflow (`docs/ai-architecture.md` §4) — `docs/docs_01_module_map_web_app.md` — related T01,T11,T12
- [ ] DOCS 02: Operator runbook — npm dev workflow + corrected `make web-build` (`docs/web-ui/operator-runbook.md` §2/§5/§6/§7) — `docs/docs_02_operator_runbook_npm_webbuild.md` — related T11,T12,T01

## Summary

- **Coder tasks:** 12 (one per outline step; dependency-ordered)
- **QA tasks:** 2 (QA1 = the SPA↔API behavioral e2e for AC-1..AC-4; QA2 = the structural + node-free-gate probes for AC-5..AC-7)
- **Docs tasks:** 2 (developer module-map note + operator runbook update)
- **Total:** 16
- **Seams covered:** S1 (T12), S2 (T01 owner; T12 joint), S3 (T01), S4 (T04 owner; T03 producer), S5 (T05 owner; T08/T09/T10 consumers), S6 (T11), S7 (T11) — see `integration_map.md` Coverage Matrix.
- **Foundational Setup:** every `## Foundational Setup` row in `implementation_plan.md` is folded into a precondition (npm toolchain → T01; `web/package.json` dep list → emitted in T01; `web/node_modules/` gitignored → precondition; `MELLIFERA_TOKEN_KEY` constant → T03; Apache-2.0 headers → T01 convention; `make web-build` regen → T11/T12; no new Go module deps → AC-6 additive). No setup item is dropped.
- **Load-bearing:** T11 owns R1 (the Makefile cwd fix). T12 owns S1 (the dist replace + gate). Both fail → AC-5/AC-6 fail.
