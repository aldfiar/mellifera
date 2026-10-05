# Task 03 — Auth layer (localStorage token + `<RequireAuth>`)

- **Type:** coder
- **Outline Step:** 4 (auth layer) — ordered before Step 3 (api) because `lib/api.ts` (T04) imports `getToken`/`clearToken` from this module.
- **Seams:** S4 (Bearer wrapper depends on `auth.ts`; the wrapper itself is T04 — this task owns the credential store + route guard)
- **AC trace:** AC-1
- **Project scope:** `mellifera`
- **Deps:** T01 (npm project; react)
- **Estimated LOC:** ~75

## Context

- **why:** The SPA needs a credential store (localStorage `mellifera.token`) and a route guard so unauthenticated navigations redirect to `/login`. T04's fetch wrapper reads/clears the token via this module; T06 (App routing) wraps `/admin` in `<RequireAuth>`; T07 (Login) calls `setToken`. Without it, every `/api` call is anonymous (401) and `/admin` is unprotected.
- **data_flow:** enters from: T07 Login form submit → transforms: writes localStorage key `mellifera.token` → emits to: T04 apiRequest (reads token for Bearer) + T06 `<RequireAuth>` (reads presence).
- **rationale:** localStorage (not sessionStorage) so the operator enters the token once per browser; not a cookie (no Go login endpoint exists — the admin token is a static env var, arch §11.5). XSS acknowledged + accepted for a 127.0.0.1-bound personal server (conventions §4; R2). `<RequireAuth>` checks presence-of-token for ROUTING only — the Go `authMiddleware` + `requireRole` are the sole authZ authority (conventions §2; `middleware.go:32-75`).

## behaviors

- B1: `web/src/lib/auth.ts` exports `TOKEN_KEY = "mellifera.token"` and a `useToken()` hook returning `{ token: string|null, setToken(t: string): void, clearToken(): void }` backed by `localStorage`. | ac: AC-1 | kind: normal
- B2: `setToken` writes `localStorage.setItem(TOKEN_KEY, t)`; `clearToken` writes `localStorage.removeItem(TOKEN_KEY)`; `token` reads `localStorage.getItem(TOKEN_KEY)`. | ac: AC-1 | kind: normal
- B3: `<RequireAuth>` renders its children iff a token is present; else `<Navigate to="/login" state={{ from: location }} replace />`. | ac: AC-1 | kind: edge
- B4: `<RequireAuth>` is rendered inside `<BrowserRouter>` (uses `useLocation`); when a token exists, children render unchanged (it does NOT validate the token — a 401 from `/api` is the source of truth, handled by T04). | ac: AC-1 | kind: normal
- B5: token storage round-trips losslessly (set "abc" → read "abc"); clearing yields `null`. | ac: AC-1 | kind: edge

## invariants

- **INV-fixed-key:** the localStorage key is the literal `"mellifera.token"` (matches `contracts.md §Constants` `MELLIFERA_TOKEN_KEY`). Drift = bug.
- **INV-presence-only-authN:** `<RequireAuth>` checks ONLY presence-of-token. It never validates the token, never reads claims, never enforces authZ. The Go `authMiddleware` (`internal/api/middleware.go:32-45`) + `requireRole` (`:56-75`) are the sole authZ authority. A 401 from `/api` (handled by T04) is the source of truth that clears the token.
- **INV-no-cookie:** no cookie/session endpoint is introduced (the admin token is a static env var — `MELLIFERA_ADMIN_TOKEN`, `main.go:240-244`; arch §11.5). D18 is where multi-user auth lands.

## precondition

T01 landed (`web/src/` exists; `react`, `react-router-dom` installed). No `lib/auth.ts` or `components/RequireAuth.tsx` yet.
- evidence: T01 outputs; auth contract `contracts.md §Auth contract`; Go authZ authority `internal/api/middleware.go:32-45,56-75`.

## postcondition

(AC-1) The credential store + route guard exist: `useToken()` reads/writes/clears `localStorage["mellifera.token"]`; `<RequireAuth>` redirects to `/login` when no token is present. T04 (api) imports `getToken`/`clearToken`; T06 (App) wraps protected routes.

## test_seed

```
# arrange: render <RequireAuth> inside <BrowserRouter>; localStorage empty.
# act:     render(<RequireAuth><Child/></RequireAuth>)
# assert:  Navigate to /login fired (Child NOT rendered).
# arrange: localStorage.setItem("mellifera.token", "t1")
# act:     render(<RequireAuth><Child/></RequireAuth>)
# assert:  Child rendered.
# round-trip: setToken("abc"); assert getToken()==="abc"; clearToken(); assert getToken()===null.
```

## spec

```
Signatures (files to CREATE):
  web/src/lib/auth.ts
    export const TOKEN_KEY = "mellifera.token";
    export function getToken(): string | null;
    export function setToken(token: string): void;
    export function clearToken(): void;
    export function useToken(): { token: string | null; setToken: (t: string) => void; clearToken: () => void };
  web/src/components/RequireAuth.tsx
    export function RequireAuth({ children }: { children: React.ReactNode }): React.ReactElement;

Steps:
  1. CREATE web/src/lib/auth.ts: TOKEN_KEY constant; getToken/setToken/clearToken as thin localStorage wrappers; useToken() = useState seeded from getToken() + setToken/clearToken that also write localStorage.
  2. CREATE web/src/components/RequireAuth.tsx: const token = getToken(); const location = useLocation(); if (!token) return <Navigate to="/login" state={{ from: location }} replace />; return <>{children}</>.
  3. Add Apache-2.0 headers.
  4. `cd web && npx tsc --noEmit` → exit 0.
```

## error_handling

- **localStorage unavailable (SSR / private mode edge):** out of scope for the 2a MVP (the SPA always runs in a browser); do not add defensive fallbacks beyond the natural `null` read. (Vitest jsdom provides localStorage.)

## allowed_imports

- `react`  # useState, ReactNode, ReactElement (auth hook + guard)
- `react-router-dom`  # Navigate, useLocation (RequireAuth)

## allowed_categories

- npm-runtime (react, react-router-dom)

## callers_to_update

- (none — new files; T04/T06/T07 import these.)

## negative_examples

- "DO NOT validate the token in `<RequireAuth>` — presence-only (INV-presence-only-authN)."
- "DO NOT introduce a cookie/session endpoint (INV-no-cookie)."
- "DO NOT change the key from `"mellifera.token"` (INV-fixed-key)."
- "DO NOT import `internal/*` or any Go module — the SPA is a pure HTTP client."

## existing_code_snapshot

```
(CREATE — web/src/lib/ and web/src/components/ do not yet exist; T01 left web/src/main.tsx)
```

## source_anchor

CREATE under `web/src/`. Auth contract: `contracts.md §Auth contract` + `§Constants` (`MELLIFERA_TOKEN_KEY="mellifera.token"`). Go authZ authority (sole authZ): `internal/api/middleware.go:32-45` (`authMiddleware`) + `:56-75` (`requireRole`).

## contract_test_scope

- **joint (S4 producer side):** `web/src/components/RequireAuth -> <Navigate to="/login"> (no token)` | assert: no-token → Navigate; token → children render. (Coder Vitest; re-verified end-to-end by QA1.)

## test_exclusions

- `getToken`/`setToken`/`clearToken` — accessors (localStorage pass-through); covered by the round-trip test only.

## scope_boundary

"CREATE only: `web/src/lib/auth.ts`, `web/src/components/RequireAuth.tsx`. No other files."

## out_of_scope

- `web/src/lib/api.ts` (T04 — the fetch wrapper that USES getToken/clearToken)
- `web/src/pages/Login.tsx` (T07)
- `internal/api/middleware.go` (Go authZ — UNCHANGED)

## line_budget

75 (flex 1.1)

## acceptance_criteria

- scenario: AC-1 | given: a browser with no token in localStorage | when: the operator navigates to `/admin` | then: `<RequireAuth>` redirects to `/login` (this task owns the guard).
- scenario: AC-1 | given: a token is stored | when: any SPA route renders | then: `<RequireAuth>` renders children (presence = authenticated for routing).

## refactoring_checklist

- `grep -n "mellifera.token" web/src/lib/auth.ts` → TOKEN_KEY literal.
- `grep -rn "from '@/lib/auth'" web/src/` → T04 api.ts, T06 App.tsx, T07 Login.tsx (after those land).
- `cd web && npx tsc --noEmit` → exit 0.
- Vitest: `<RequireAuth>` no-token → redirect; token → render (run in T04 or QA1).

## skill_hint

`grounding`, `stack-patterns`
