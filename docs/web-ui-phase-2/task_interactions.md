# Task Interactions — web-ui Phase 2a

## Step → Task ordering note

Tasks are numbered in DEPENDENCY order, not strict outline order. The only inversion vs the outline: **Step 4 (auth) → T03 runs BEFORE Step 3 (api) → T04**, because `web/src/lib/api.ts` imports `getToken`/`clearToken` from `web/src/lib/auth.ts`. The planner's outline (api=3, auth=4) has a forward reference; ordering auth first keeps the coder's per-task `tsc --noEmit` green at every step. Every outline step still maps 1:1 to a task (see `task_index.md` Step → Task map). This is the specifier's dependency-ordering responsibility (software-design: "if step A produces output consumed by step B, they go in separate tasks (A first)").

## Symbol Ownership

| Symbol / Module | Owner Task | Consumer Tasks | Shared Type? |
|---|---|---|---|
| `web/vite.config.ts` (outDir + dev proxy) | T01 | T12 (build), QA2 (S3 dev proxy) | no |
| `web/package.json` (dep manifest) | T01 | T02-T10 (import the deps), T11 (`make web-build` runs `npm ci`) | no |
| `web/src/lib/utils.ts` `cn()` | T02 | T02 primitives, (T07-T10 via primitives) | no |
| `web/src/components/ui/*` (8 shadcn primitives) | T02 | T07, T08, T09, T10 | no |
| `web/src/lib/auth.ts` (`useToken`,`getToken`,`setToken`,`clearToken`,`TOKEN_KEY`) | T03 | T04 (api wrapper), T06 (App → no, uses RequireAuth), T07 (Login) | no |
| `web/src/components/RequireAuth.tsx` | T03 | T06 (wraps `/admin`) | no |
| `web/src/lib/api.ts` (`apiRequest<T>`, DTOs, `ApiError`, `ENDPOINTS`) | T04 | T05 (queries), T08/T09/T10 (DTO types) | **yes — DTOs are the TS wire contract (mirror of Go DTOs)** |
| `web/src/lib/queries.ts` (`useLibraries`,`useCreateLibrary`,`useScanLibrary`,`useAdminStatus`) | T05 | T08, T09, T10 | no |
| `web/src/main.tsx` (provider root) | T05 | (rendered by the browser; imports `./App`) | no |
| `web/src/App.tsx` (route table) | T06 | T05 main.tsx imports it | no |
| `web/src/pages/Login.tsx` | T07 | T06 App imports it | no |
| `web/src/pages/admin/Admin.tsx` (shell) | T08 | T06 App imports it | no |
| `web/src/pages/admin/Libraries.tsx` (list+add+scan) | T08 (creates), T09 (extends scan) | T08 Admin shell renders it | no |
| `web/src/pages/admin/Status.tsx` | T10 | T08 Admin shell imports it | no |
| `Makefile` `web-build` target | T11 | T12 (runs `make web-build`) | no |
| `web/README.md` (status + Building) | T11 | DOCS 02 (consistency) | no |
| `internal/web/dist/*` (the embedded build) | T12 (regenerates + commits) | `//go:embed all:dist` (`internal/web/web.go:20`) — Go binary | **yes — the Go↔SPA delivery contract** |
| Go DTOs (`createLibraryRequest`, `libraryDTO`, `scanResponse`, `PluginHealth`, `EnrichStats`, `AdminStatus`) | Phase 1 (UNCHANGED — `internal/api/handlers.go`) | T04 (TS mirrors), T05, T08, T09, T10 | **yes — the SPA mirrors them verbatim** |
| Go routes (`/api/v1/libraries`, `/scan`, `/admin/status`) | Phase 1 (UNCHANGED — `internal/api/router.go:92,98-100`) | T04 (ENDPOINTS), T05, T08, T09, T10 | **yes — consumed over HTTP** |

## Order Dependencies

| Task | Must Complete Before | Reason |
|---|---|---|
| T01 | T02, T03, T04, T05, T06, T11, T12 | T01 creates the npm project root + Vite config; everything else imports from `web/` or depends on the build wiring |
| T02 | T07, T08, T10 | the pages import shadcn primitives from `@/components/ui/*` |
| T03 | T04, T06, T07 | api.ts imports `getToken`/`clearToken`; App uses `<RequireAuth>`; Login uses `useToken` |
| T04 | T05 | queries.ts calls `apiRequest` + uses the DTOs |
| T05 | T06 (main→App), T08, T09, T10 | the pages consume the query hooks; main.tsx renders App |
| T06 | (consumed by browser via main.tsx) | App is the route table |
| T07 | T06 (App imports Login) | route target |
| T08 | T06 (App imports Admin), T09 (Libraries extended) | Admin shell + Libraries page |
| T09 | (extends T08's file) | per-row scan trigger |
| T10 | T08 (Admin imports Status) | Status section |
| T11 | T12 | T12 runs the corrected `make web-build` |
| T01-T11 | T12 | T12 builds + embeds the whole app + runs the gate |

Linear execution order (coder pipeline): **T01 → T02 → T03 → T04 → T05 → T06 → T07 → T08 → T09 → T10 → T11 → T12.**

## Potential Conflicts

| Tasks | Shared File | Risk | Mitigation |
|---|---|---|---|
| T08, T09 | `web/src/pages/admin/Libraries.tsx` | T09 extends the file T08 creates | T09 `deps: [T08]`; T09 is an additive extension (scan cell + result area) — distinct edit region |
| T05, T06 | `web/src/main.tsx` ↔ `web/src/App.tsx` | main.tsx imports `./App` (T06) | T05 creates main.tsx; T06 creates App.tsx; gate `tsc --noEmit` after both land (T05 notes the App import) |
| T08, T10 | `web/src/pages/admin/Admin.tsx` | Admin shell imports both Libraries (T08) and Status (T10) | T08 creates Admin.tsx with the Libraries section; T10 adds the Status import — gate tsc on T10 |
| T01, T11 | `web/package.json` / Vite config ↔ Makefile | T11's `make web-build` cwd + the build scripts must match T01's package.json + vite outDir | T11 `deps: [T01]`; both cite the same contract (`web/` = npm root; `internal/web/dist/` = outDir) |

## Circular Dependencies

None. The dependency graph is a DAG with one linear chain (T01 → … → T12). The api↔auth edge (T04 → T03) is the only non-outline-order edge, resolved by running T03 first (no cycle: auth is a leaf).

## Cross-Project Tasks

N/A — single project (`mellifera`). `project_scope = mellifera` for all tasks. `web/` is a subdirectory of the mellifera repo (the npm project root), NOT a separate subproject — no monorepo routing. The Go side (`internal/web`, `internal/api`, `cmd/mellifera`) is unchanged; only the `internal/web/dist/*` bytes (regenerated) + `Makefile` + `web/README.md` change on the Go-facing side.

## Foundational Setup coverage (no item dropped)

Every row in `implementation_plan.md §Foundational Setup` is covered:
- npm dev toolchain (node v24 + npm 11) → fold→precondition (T01 runs `npm install`).
- `web/package.json` dependency list → emitted in T01 (CREATE).
- `web/node_modules/` (gitignored) → fold→precondition (T01; `.gitignore:26`).
- `MELLIFERA_TOKEN_KEY` (`"mellifera.token"`) → T03 (constant in `auth.ts`).
- Apache-2.0 headers in `web/src/*` + NOTICE entries → fold→precondition (T01 header convention; conventions §5).
- `make web-build` regen step → T11 (emits the Makefile fix) + T12 (runs it to regenerate dist).
- No new Go module deps → fold→precondition (AC-6 additive; conventions §1).

## Notes for the coder

- **T11 is R1-load-bearing** (the Makefile cwd fix). Getting `cd web` (not `cd internal/web`) right is the difference between AC-5 pass/fail.
- **T12 owns the delivery proof** — it runs `make web-build`, the Go gate, and the AC-5/AC-6/AC-7 verify probes, then commits the regenerated dist.
- **JS type-check gate:** each SPA task runs `cd web && npx tsc --noEmit`. Tasks that import not-yet-created siblings (T05→App, T06→Login/Admin, T08→Status) note the gating — the coder lands them in order so tsc stays green.
- **No Go source edits** anywhere except the regenerated `internal/web/dist/*` bytes (T12). If a Go change seems needed, HALT — it's out of 2a scope (escalate).
