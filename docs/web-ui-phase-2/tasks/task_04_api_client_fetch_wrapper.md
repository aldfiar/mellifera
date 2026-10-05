# Task 04 — API client (typed DTOs + `apiRequest<T>` Bearer fetch wrapper)

- **Type:** coder
- **Outline Step:** 3 (API client + TS types) — ordered after T03 (auth) because the wrapper reads/clears the token via `@/lib/auth`.
- **Seams:** S4 (Bearer wrapper — this task owns the New/Changed side)
- **AC trace:** AC-1, AC-7
- **Project scope:** `mellifera`
- **Deps:** T03 (`lib/auth.ts` exports `getToken`/`clearToken`)
- **Estimated LOC:** ~110 (DTOs + wrapper + error type)

## Context

- **why:** Every `/api/v1/*` call needs (a) the Bearer token attached, (b) a 401 → clear-token + `/login` redirect, (c) the canonical error body parsed. This wrapper is the single chokepoint where the SPA meets the Go API contract (`internal/api/middleware.go:32-45` expects `Authorization: Bearer`; `handlers.go:364-385` emits `{error:{code,message,retryable}}`). Getting it wrong = every admin call fails or hangs on a 401.
- **data_flow:** enters from: T05 query hooks (`useLibraries` etc.) → transforms: attach `Authorization: Bearer <getToken()>`, parse JSON verbatim → emits to: Go `/api/v1/*` handlers (the 4 existing endpoints, `router.go:92,98-100`).
- **rationale:** the DTOs MIRROR the Go wire shapes verbatim (`module_id`, not `moduleId` — they ARE the JSON shape; drift = bug, conventions §3). No rounding/averaging of document values (arch §3.4/§11.2 — structural invariant). The wrapper never enforces authZ; the Go middleware does (`middleware.go:32-75`). 401 is the source of truth that rotates the client back to `/login`.

## behaviors

- B1: `web/src/lib/api.ts` exports TS interfaces mirroring the Go DTOs verbatim — `CreateLibraryRequest`, `LibraryDTO`, `LibrariesResponse` (`{ items: LibraryDTO[] }`, empty array never null), `ScanResponse` (`warnings?` optional), `PluginHealth`, `EnrichStats`, `AdminStatus`. | ac: AC-7 | kind: normal
- B2: `apiRequest<T>(path, init?): Promise<T>` attaches `Authorization: Bearer <getToken()>` to every request when a token is present, sets `Accept: application/json`, and for `POST` sends `Content-Type: application/json` + `JSON.stringify(init.body)`. | ac: AC-1 | kind: normal
- B3: on a 2xx response → `JSON.parse` the body verbatim and resolve `T` (NEVER rounds/averages/collapses document values — arch §3.4/§11.2). | ac: AC-1 | kind: normal
- B4: on a 401 → `clearToken()` + redirect to `/login` (via `window.location` or router) + reject. | ac: AC-1 | kind: error
- B5: on any other non-2xx → parse the canonical body `{"error":{code,message,retryable}}` (`handlers.go:364-385`) and reject with an `ApiError` carrying `{ code, message, retryable }`; if the body is not the canonical shape, reject with a best-effort error (status text). | ac: AC-1 | kind: error
- B6: the file declares the 2a endpoint paths as typed constants (`GET /api/v1/libraries`, `POST /api/v1/libraries`, `POST /api/v1/libraries/{id}/scan`, `GET /api/v1/admin/status`) — all PRE-EXISTING (`router.go:92,98-100`); zero new endpoints (AC-7). | ac: AC-7 | kind: normal

## invariants

- **INV-no-rounding:** `JSON.parse` is the only transformation. No `toFixed`, no `Math.round`, no locale reformatting of document numbers, no field collapsing (arch §3.4/§11.2 — structural; load-bearing for 2b, harmless for 2a).
- **INV-bearer-always:** every `/api/v1/*` request carries `Authorization: Bearer <token>` when a token exists in localStorage. The wrapper does not skip it.
- **INV-401-source-of-truth:** a 401 is the SOLE signal that rotates the client to `/login`. `<RequireAuth>` does NOT clear the token; the wrapper does, on 401.
- **INV-only-existing-endpoints (AC-7):** the SPA calls ONLY `GET/POST /api/v1/libraries`, `POST /api/v1/libraries/{id}/scan`, `GET /api/v1/admin/status` in 2a. No new endpoints. (Phase-2b adds `GET /api/v1/items[/{id}]`, unused in 2a.)
- **INV-verbatim-field-names:** TS interface field names match the Go JSON tags EXACTLY (`module_id`, `root_path`, `display_name`, `library_id`, `checked_at`, `in_flight`). Drift = bug.

## precondition

T03 landed (`web/src/lib/auth.ts` exports `getToken`/`clearToken`). T01 installed `react`/`typescript`.
- evidence: T03 outputs; Go DTOs `internal/api/handlers.go:33-123` (createLibraryRequest :33, libraryDTO :46, librariesResponse, scanResponse :59 region, PluginHealth :86, EnrichStats :97, AdminStatus :110); canonical error body `handlers.go:364-385`; auth middleware `middleware.go:32-45`.

## postcondition

(AC-1/AC-7) `web/src/lib/api.ts` exports the verbatim DTO mirrors + `apiRequest<T>` that attaches Bearer, parses JSON losslessly, clears+redirects on 401, and surfaces `{code,message,retryable}` on other errors. Only the 4 existing endpoints are referenced. T05 query hooks build on `apiRequest`.

## test_seed

```
# arrange: mock fetch; localStorage.setItem("mellifera.token","t1").
# act:     await apiRequest<LibrariesResponse>("/api/v1/libraries")
# assert:  fetch called with headers including "Authorization: Bearer t1"; JSON parsed verbatim.
# act:     fetch returns 401
# assert:  clearToken() ran (localStorage has no key); redirect to /login fired; promise rejected.
# act:     fetch returns 400 body {"error":{"code":"bad_request","message":"...","retryable":false}}
# assert:  rejection is an ApiError with {code:"bad_request", message, retryable:false}.
# lossless: a rating value 8.9 in the body round-trips as 8.9 (no toFixed).
```

## spec

```
Signatures (file to CREATE — web/src/lib/api.ts):
  export interface CreateLibraryRequest { module_id: string; root_path: string; display_name: string }
  export interface LibraryDTO            { id: number; module_id: string; root_path: string; display_name: string }
  export interface LibrariesResponse     { items: LibraryDTO[] }
  export interface ScanResponse          { library_id: number; discovered: number; persisted: number; warnings?: string[] }
  export interface PluginHealth          { id: string; state: string; restarts: number; checked_at: string }
  export interface EnrichStats           { pending: number; in_flight: number; done: number; failed: number }
  export interface AdminStatus           { plugins: PluginHealth[]; enrich: EnrichStats }
  export class ApiError extends Error { readonly code: string; readonly retryable: boolean; ... }
  export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T>;
  // 2a endpoint path constants (pre-existing; AC-7):
  export const ENDPOINTS = { libraries: "/api/v1/libraries", scan: (id:number)=>`/api/v1/libraries/${id}/scan`, adminStatus: "/api/v1/admin/status" } as const;

Steps:
  1. CREATE web/src/lib/api.ts with the DTO interfaces (field names verbatim from handlers.go JSON tags).
  2. Define `ApiError` (extends Error; carries code, retryable, plus the parsed message).
  3. Define `apiRequest<T>(path, init?)`: read token via getToken(); build headers (Authorization Bearer if token, Accept json, Content-Type json when body); fetch same-origin (path starts with /api/v1/); on 2xx → return JSON.parse(await res.text()) as T; on 401 → clearToken() + window.location.assign("/login") + throw; on other non-2xx → try parse {error:{code,message,retryable}}, throw ApiError, else throw ApiError with status text.
  4. Export the ENDPOINTS constants (all pre-existing routes).
  5. Apache-2.0 header.
  6. `cd web && npx tsc --noEmit` → exit 0.
```

## error_handling

- **401 from /api:** clearToken() + redirect to /login + reject (B4). The token is wrong/rotated; the operator re-enters.
- **Non-2xx with canonical body:** reject ApiError{code,message,retryable} (B5). Surfaces inline in the admin UI (T08/T09/T10).
- **Non-2xx with non-canonical body:** reject ApiError with the HTTP status text as the message (B5; fail-fast, no silent success).
- **Network failure (fetch rejects):** propagate as a rejected promise (TanStack Query surfaces it as an error state in T05).

## allowed_imports

- `react`  # (only if a hook is exposed; otherwise none beyond the wrapper which is framework-agnostic) — prefer NO react import here; keep api.ts a pure module
- `@/lib/auth`  # getToken, clearToken (relative; allowed by path convention)

## allowed_categories

- npm-runtime

## callers_to_update

- (none — new file; T05 queries.ts imports `apiRequest` + the DTOs.)

## negative_examples

- "DO NOT round/average/collapse any numeric value (INV-no-rounding)."
- "DO NOT call an endpoint other than the 4 pre-existing ones (INV-only-existing-endpoints, AC-7)."
- "DO NOT enforce authZ in the wrapper — the Go middleware is the sole authZ authority (INV-401-source-of-truth; `middleware.go:32-75`)."
- "DO NOT rename DTO fields to camelCase — they ARE the JSON wire shape (INV-verbatim-field-names; `handlers.go:33-123`)."
- "DO NOT add a 4th endpoint path (Phase-2b items endpoints stay UNUSED in 2a)."

## existing_code_snapshot

```
(CREATE — web/src/lib/api.ts does not exist; T03 created web/src/lib/auth.ts)
# Reference: the Go DTOs being mirrored (internal/api/handlers.go:33-123):
#   type createLibraryRequest struct { ModuleID string `json:"module_id"`; RootPath string `json:"root_path"`; DisplayName string `json:"display_name"` }
#   type libraryDTO struct { ID int64 `json:"id"`; ModuleID, RootPath, DisplayName string (json: id/module_id/root_path/display_name) }
#   type librariesResponse struct { Items []libraryDTO `json:"items"` }
#   type scanResponse struct { LibraryID int64 `json:"library_id"`; Discovered, Persisted int; Warnings []string `json:"warnings,omitempty"` }
#   type PluginHealth struct { ID, State string; Restarts int; CheckedAt time.Time `json:"checked_at"` }  // handlers.go:86
#   type EnrichStats struct { Pending, InFlight `json:"in_flight"`, Done, Failed int }                      // handlers.go:97
#   type AdminStatus struct { Plugins []PluginHealth; Enrich EnrichStats }                                  // handlers.go:110
```

## source_anchor

CREATE `web/src/lib/api.ts`. DTO mirrors transcribed from `internal/api/handlers.go:33-123` (verified `grep -nE '^type ' internal/api/handlers.go`: createLibraryRequest:33, libraryDTO:46, PluginHealth:86, EnrichStats:97, AdminStatus:110). Canonical error body: `handlers.go:364-385`. Auth expectation: `internal/api/middleware.go:32-45`. Routes consumed: `internal/api/router.go:92,98-100` (all pre-existing).

## contract_test_scope

- **joint (S4):** `web/src/lib/api.ts apiRequest -> Go /api/v1/* (authMiddleware expects Bearer)` | assert: Bearer header attached when token present; 401 → token cleared + /login redirect; non-2xx → ApiError{code,message,retryable}. (Coder Vitest with mocked fetch; QA1 re-verifies end-to-end through the real Go API via the embedded SPA.)

## test_exclusions

- The DTO `interface` declarations — pure type declarations (no runtime logic); framework-validated by `JSON.parse` shape.

## scope_boundary

"CREATE only: `web/src/lib/api.ts`. No other files."

## out_of_scope

- `web/src/lib/queries.ts` (T05 — the TanStack hooks that call apiRequest)
- `internal/api/handlers.go` (Go DTOs — UNCHANGED; AC-6 byte-identical)
- the items/document TS shapes (`contracts.md §document shape`) — Phase 2b; not imported in 2a

## line_budget

110 (flex 1.2)

## acceptance_criteria

- scenario: AC-1 | given: a token is stored | when: any `/api` request is made | then: `Authorization: Bearer <token>` attached (this task owns the wrapper).
- scenario: AC-1 | given: a `/api` call returns 401 | when: the wrapper handles it | then: token cleared + redirect to /login.
- scenario: AC-7 | given: the SPA source | when: audited | then: only the 4 pre-existing endpoints are referenced (INV-only-existing-endpoints).

## refactoring_checklist

- `grep -nE "/api/v1/(libraries|admin/status)" web/src/lib/api.ts` → only those paths (no `items` calls used in 2a).
- `grep -nE 'Authorization' web/src/lib/api.ts` → Bearer injection present.
- `grep -nE '401|clearToken' web/src/lib/api.ts` → 401 → clearToken + redirect.
- `grep -rnE 'toFixed|Math\.round' web/src/lib/api.ts` → empty (INV-no-rounding).
- `cd web && npx tsc --noEmit` → exit 0.
- AC-7 verify probe: `grep -rnE "fetch|api\.v1|useQuery|useMutation" web/src | grep -vE '/(items|libraries|admin/status)'` → empty.

## skill_hint

`grounding`, `stack-patterns`
