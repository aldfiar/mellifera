# Task 07 — Login page (token-entry form)

- **Type:** coder
- **Outline Step:** 7 (Login page)
- **Seams:** none new (consumes T03 auth, T02 ui primitives)
- **AC trace:** AC-1
- **Project scope:** `mellifera`
- **Deps:** T03 (`useToken`), T02 (`button`,`input`,`label`,`card`,`alert`)
- **Estimated LOC:** ~85

## Context

- **why:** The operator needs a screen to enter the admin token once per browser. On submit, the token is stored (T03 `setToken`) and the operator is redirected to the route they originally requested (`location.state.from` or `/admin`). This is the MVP auth surface (the admin token is a static env var — no Go login endpoint, arch §11.5).
- **data_flow:** enters from: operator form submit → transforms: `setToken(value)` (T03 → localStorage) → emits to: `<Navigate to={from || "/admin"}>` (the protected route renders via T06/T03).
- **rationale:** token-entry (not username/password) because there is no Go login endpoint and a single admin token (conventions §4). XSS-acknowledged localStorage posture (R2).

## behaviors

- B1: `web/src/pages/Login.tsx` default-exports a form (token `<Input>`, submit `<Button>`) styled with shadcn primitives; on submit it calls `setToken(value)` and navigates to `from` (or `/admin`). | ac: AC-1 | kind: normal
- B2: the redirect target is `location.state.from` (set by `<RequireAuth>` in T03) when present, else `/admin`. | ac: AC-1 | kind: normal
- B3: an empty submit does not store an empty token (guard: trim + non-empty check; show an inline `<Alert>` if empty). | ac: AC-1 | kind: edge
- B4: a one-line help note documents that the token is the server's `MELLIFERA_ADMIN_TOKEN` (so the operator knows what to paste). | ac: AC-1 | kind: normal

## invariants

- **INV-presence-only:** the Login page stores exactly what the operator pastes; it does NOT validate format/claims (the Go `authMiddleware` is the sole authZ authority — `middleware.go:32-45`). A wrong token simply yields a 401 on the next `/api` call, which rotates back to `/login` (T04).
- **INV-from-redirect:** after a successful set, navigate to `from` (preserving the original deep link) — not unconditionally `/admin`.

## precondition

T03 (`useToken`/`setToken`) + T02 (`button`,`input`,`label`,`card`,`alert`) landed. T06 (`App.tsx`) references `@/pages/Login` (default export).
- evidence: T03/T02 outputs; auth contract `contracts.md §Auth contract`.

## postcondition

(AC-1) The token-entry form stores the admin token via `setToken` and redirects to the requested route. An unauthenticated operator lands here from any `<RequireAuth>` redirect.

## test_seed

```
# arrange: render <Login/> inside <MemoryRouter initialEntries={[{pathname:'/login', state:{from:'/admin'}}]}>.
# act:     fireEvent.change(input, {target:{value:'my-token'}}); fireEvent.click(submit)
# assert:  localStorage.getItem("mellifera.token") === "my-token"; navigate called with "/admin".
# act:     submit with empty input
# assert:  setToken NOT called; inline Alert shown; no navigation.
```

## spec

```
Signatures (file to CREATE — web/src/pages/Login.tsx):
  export default function Login(): React.ReactElement;

Steps:
  1. CREATE web/src/pages/Login.tsx:
     - import { useNavigate, useLocation } from "react-router-dom";
     - import { useToken } from "@/lib/auth";
     - import { Button } from "@/components/ui/button"; Input, Label, Card*, Alert.
     - const { setToken } = useToken(); const navigate = useNavigate(); const location = useLocation();
     - const from = (location.state as { from?: Location } | null)?.from?.pathname || "/admin";
     - const [value, setValue] = useState(""); const [err, setErr] = useState<string|null>(null);
     - onSubmit: const t = value.trim(); if (!t) { setErr("Token required"); return; } setToken(t); navigate(from, { replace: true });
     - render the form (Card header "Admin sign in", Label "Admin token", Input type=password, Button "Sign in", Alert on err, help text mentioning MELLIFERA_ADMIN_TOKEN).
  2. Apache-2.0 header.
  3. `cd web && npx tsc --noEmit` → exit 0.
```

## error_handling

- **Empty submit:** inline Alert, no storage, no navigation (B3).
- (Wrong-token handling is NOT this page's job — the next `/api` call 401s and T04 rotates back here.)

## allowed_imports

- `react`  # useState, ReactElement
- `react-router-dom`  # useNavigate, useLocation
- `@/lib/auth`  # useToken (T03)
- `@/components/ui/button`  # T02
- `@/components/ui/input`  # T02
- `@/components/ui/label`  # T02
- `@/components/ui/card`  # T02
- `@/components/ui/alert`  # T02

## allowed_categories

- npm-runtime

## callers_to_update

- (none — new file; T06 App.tsx imports `@/pages/Login`.)

## negative_examples

- "DO NOT validate the token format/claims — presence-only (INV-presence-only)."
- "DO NOT redirect unconditionally to `/admin` — use `from` when present (INV-from-redirect)."
- "DO NOT add a username field — MVP = single admin token (conventions §4)."
- "DO NOT call `/api` from this page — the token is stored; the next page's hooks do the calling."

## existing_code_snapshot

```
(CREATE — web/src/pages/ does not exist yet)
```

## source_anchor

CREATE `web/src/pages/Login.tsx`. Auth hook: T03 `useToken`. Routing: T06 App imports it. Auth posture: `contracts.md §Auth contract`; `internal/api/middleware.go:32-45` (sole authZ).

## contract_test_scope

- (no new seam — covered by QA1's auth-flow e2e: navigate /admin → /login → submit → /admin.)

## test_exclusions

- (the form is UI composition; smoke-tested via tsc + QA1 e2e. The setToken round-trip is the only logic, owned by T03's test.)

## scope_boundary

"CREATE only: `web/src/pages/Login.tsx`. No other files."

## out_of_scope

- `web/src/components/RequireAuth.tsx` (T03)
- `web/src/lib/auth.ts` (T03)
- `internal/api/middleware.go` (UNCHANGED)

## line_budget

85 (flex 1.2)

## acceptance_criteria

- scenario: AC-1 | given: the operator at `/login` | when: enters the admin token + submits | then: token stored under `mellifera.token`; redirected to the requested admin route.

## refactoring_checklist

- `grep -n "setToken" web/src/pages/Login.tsx` → present.
- `grep -n "location.state" web/src/pages/Login.tsx` → `from` resolution present.
- `cd web && npx tsc --noEmit` → exit 0.

## skill_hint

`grounding`, `stack-patterns`
