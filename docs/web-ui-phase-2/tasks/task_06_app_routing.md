# Task 06 — App routing (`/login`, `/admin`, `/` → `/admin`)

- **Type:** coder
- **Outline Step:** 6 (App routing)
- **Seams:** none new (relies on the Phase-1 NotFound SPA fallback, `internal/web/web.go:54-63`)
- **AC trace:** AC-1, AC-5
- **Project scope:** `mellifera`
- **Deps:** T03 (`<RequireAuth>`), T05 (main.tsx renders `<App>`), T07/T08 land the page components (App imports them — gate tsc on those)
- **Estimated LOC:** ~45

## Context

- **why:** The SPA needs real routes for deep-linking + the Phase-1 NotFound SPA-fallback contract (`internal/web/web.go:54-63`) to mean anything. `/admin` is `RequireAuth`-gated; `/login` is the only public route; `/` redirects to `/admin` in 2a (becomes `/browse` in 2b).
- **data_flow:** enters from: operator browser navigation → transforms: react-router `<Routes>` match → emits to: T07 Login / T08 Admin components.
- **rationale:** react-router was decided in Phase 1 (architecture_review §Complexity budget — single-page tab state rejected: the SPA needs real routes for deep-linking + the Phase-1 NotFound fallback). Client-side routes work because the Go `web.Handler` NotFound (`internal/web/web.go:54-63`) serves `index.html` for any non-`/api`/`/openapi`/`/docs`/`/assets` path.

## behaviors

- B1: `web/src/App.tsx` exports `<App>` rendering `<Routes>` with: `/login` → `<Login/>` (public), `/admin/*` → `<Admin/>` wrapped in `<RequireAuth>`, `/` → `<Navigate to="/admin" replace />`. | ac: AC-1 | kind: normal
- B2: a `*` catch-all redirects to `/admin` (2a; becomes `/browse` in 2b). | ac: AC-5 | kind: edge
- B3: `/admin` renders only when `<RequireAuth>` sees a token (T03); otherwise it redirects to `/login` with `state.from`. | ac: AC-1 | kind: normal
- B4: client-side routes (`/admin`, `/login`) resolve without server config because the Go NotFound fallback serves `index.html` (AC-5 verify probe: `curl /admin` → 200). | ac: AC-5 | kind: normal

## invariants

- **INV-public-login-only:** `/login` is the ONLY unauthenticated SPA route. Every other route is wrapped in `<RequireAuth>` (or redirects into one that is).
- **INV-root-redirect-2a:** `/` → `/admin` in 2a. (Phase 2b flips this to `/browse` — leave a `// 2b: /browse` comment.)
- **INV-no-server-route-config:** routing is purely client-side. No Go route changes. The Go NotFound fallback (`internal/web/web.go:54-63`) is the only server-side enabler and it is byte-identical (AC-6).

## precondition

T03 (`<RequireAuth>`) + T05 (main.tsx mounts `<App>`) landed. T07 (`Login`) + T08 (`Admin`) are this task's import targets — coordinate so `tsc --noEmit` passes (either land T07/T08 first, or temporarily gate this task's tsc on them).
- evidence: T03/T05 outputs; Phase-1 NotFound SPA fallback `internal/web/web.go:54-63`; routing contract `contracts.md §Routing contract`.

## postcondition

(AC-1/AC-5) `web/src/App.tsx` mounts the route table; `/login` public, `/admin` under `<RequireAuth>`, `/` → `/admin`. Client-side routes resolve via the Go NotFound fallback (unchanged).

## test_seed

```
# arrange: render <App/> inside <BrowserRouter>; localStorage empty.
# act:     navigate to "/admin"
# assert:  <RequireAuth> redirects to /login (Login rendered).
# act:     localStorage.setItem("mellifera.token","t1"); navigate to "/admin"
# assert:  Admin rendered.
# act:     navigate to "/"
# assert:  resolves to /admin (Navigate to="/admin").
# (AC-5 e2e — QA2): curl -s -o /dev/null -w '%{http_code}' localhost:8080/admin → 200 (Go NotFound fallback).
```

## spec

```
Signatures (file to CREATE — web/src/App.tsx):
  export default function App(): React.ReactElement;

Steps:
  1. CREATE web/src/App.tsx:
     import { Routes, Route, Navigate } from "react-router-dom";
     import { RequireAuth } from "@/components/RequireAuth";
     import Login from "@/pages/Login";
     import Admin from "@/pages/admin/Admin";
     export default function App() {
       return (
         <Routes>
           <Route path="/login" element={<Login />} />
           <Route path="/admin/*" element={<RequireAuth><Admin /></RequireAuth>} />
           <Route path="/" element={<Navigate to="/admin" replace />} />  {/* 2b: /browse */}
           <Route path="*" element={<Navigate to="/admin" replace />} />
         </Routes>
       );
     }
  2. Apache-2.0 header.
  3. `cd web && npx tsc --noEmit` → exit 0 (after T07/T08 land their default-export pages).
```

## allowed_imports

- `react-router-dom`  # Routes, Route, Navigate
- `react`  # ReactElement
- `@/components/RequireAuth`  # T03
- `@/pages/Login`  # T07 (default export)
- `@/pages/admin/Admin`  # T08 (default export)

## allowed_categories

- npm-runtime

## callers_to_update

- (none — new file; main.tsx (T05) imports `./App`.)

## negative_examples

- "DO NOT add a server-side route for `/admin` or `/login` — client-side only (INV-no-server-route-config; `internal/web/web.go:54-63` is unchanged)."
- "DO NOT leave `/admin` unwrapped by `<RequireAuth>` (INV-public-login-only)."
- "DO NOT make `/` redirect to `/browse` in 2a (INV-root-redirect-2a; `/browse` is 2b)."
- "DO NOT import any Go-side module."

## existing_code_snapshot

```
(CREATE — web/src/App.tsx does not exist; T05 main.tsx imports "./App")
```

## source_anchor

CREATE `web/src/App.tsx`. Routing contract: `contracts.md §Routing contract`. Phase-1 NotFound fallback enabling client routes: `internal/web/web.go:54-63` (verified read; unchanged — AC-6).

## contract_test_scope

- (no new seam — relies on the existing Go NotFound fallback. The `/admin` → 200 fallback is asserted by the AC-5 verify probe in QA2, not a coder joint test.)

## test_exclusions

- `web/src/App.tsx` — route table (composition/declarative wiring, no logic). Smoke-tested via `tsc --noEmit` + QA1 e2e.

## scope_boundary

"CREATE only: `web/src/App.tsx`. No other files."

## out_of_scope

- `web/src/pages/Login.tsx` (T07), `web/src/pages/admin/Admin.tsx` (T08) — the imported components
- `internal/web/web.go` NotFound (UNCHANGED — AC-6)

## line_budget

45 (flex 1.1)

## acceptance_criteria

- scenario: AC-1 | given: no token | when: navigate to `/admin` | then: redirect to `/login` (this task wraps `/admin` in `<RequireAuth>`).
- scenario: AC-5 | given: the built SPA served by Go | when: `GET /admin` | then: 200 (SPA fallback serves index.html; this task's `/admin` route then renders client-side).

## refactoring_checklist

- `grep -nE 'RequireAuth|/login|/admin' web/src/App.tsx` → `/admin` wrapped in `<RequireAuth>`; `/login` public.
- `grep -n 'Navigate to="/admin"' web/src/App.tsx` → `/` redirect present (2a).
- `cd web && npx tsc --noEmit` → exit 0.
- (QA2) `curl -s -o /dev/null -w '%{http_code}' localhost:8080/admin` → `200`.

## skill_hint

`grounding`, `stack-patterns`
