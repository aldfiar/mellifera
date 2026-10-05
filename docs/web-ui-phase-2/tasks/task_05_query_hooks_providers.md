# Task 05 — TanStack Query admin hooks + provider root (`main.tsx`)

- **Type:** coder
- **Outline Step:** 5 (TanStack Query wiring + admin hooks)
- **Seams:** S5 (query hooks — this task owns the New/Changed side)
- **AC trace:** AC-2, AC-3, AC-4
- **Project scope:** `mellifera`
- **Deps:** T04 (`apiRequest` + DTOs), T01 (react, @tanstack/react-query)
- **Estimated LOC:** ~95

## Context

- **why:** The admin pages (T08/T09/T10) need cached, invalidating data hooks over the 4 existing endpoints. TanStack Query gives cache + invalidation (create/scan → refetch libraries) + background refetch (admin/status). `main.tsx` mounts the provider tree (`QueryClientProvider` + `BrowserRouter`) that every page assumes.
- **data_flow:** enters from: T08/T09/T10 page components → transforms: TanStack cache (`["libraries"]`, `["admin-status"]`, `["library-scan", id]`) → emits to: Go `/api/v1/*` via T04 `apiRequest`.
- **rationale:** cache invalidation (create/scan → refetch) + background refetch (status) are exactly TanStack Query's purpose (architecture_review §Complexity budget — hand-rolling fetch+useEffect rejected). Query keys per conventions §3.

## behaviors

- B1: `useLibraries()` = `useQuery({ queryKey: ["libraries"], queryFn: () => apiRequest<LibrariesResponse>("/api/v1/libraries") })` returning `{ items }`-shaped data. | ac: AC-2 | kind: normal
- B2: `useCreateLibrary()` = `useMutation` POSTing `CreateLibraryRequest` to `/api/v1/libraries`; on success it invalidates `["libraries"]` so the list re-fetches. | ac: AC-2 | kind: normal
- B3: `useScanLibrary()` = `useMutation` POSTing to `/api/v1/libraries/{id}/scan` returning `ScanResponse`; mutations are NOT auto-retried (non-idempotent — the operator re-clicks). | ac: AC-3 | kind: normal
- B4: `useAdminStatus()` = `useQuery({ queryKey: ["admin-status"], queryFn: ..., refetchInterval: <ms> })` for the background refresh. | ac: AC-4 | kind: normal
- B5: `web/src/main.tsx` replaces the T01 stub: `ReactDOM.createRoot(...).render(<QueryClientProvider client={client}><BrowserRouter><App/></BrowserRouter></QueryClientProvider>)`. | ac: AC-2 | kind: normal
- B6: on a mutation/query error, the canonical `ApiError` (T04) surfaces to the page (the hook does not swallow it). | ac: AC-2 | kind: error

## invariants

- **INV-query-keys:** query keys are exactly `["libraries"]`, `["admin-status"]`, `["library-scan", id]` (conventions §3). `useCreateLibrary`/`useScanLibrary` invalidate `["libraries"]` on success.
- **INV-no-mutation-retry:** POST mutations (`/libraries`, `/scan`) are NOT auto-retried by TanStack (non-idempotent — integration_map §External boundary). GET queries MAY use the default retry.
- **INV-pure-delegation:** hooks call `apiRequest` (T04) only — no direct `fetch`, no business logic, no authZ.

## precondition

T04 landed (`apiRequest` + DTOs in `web/src/lib/api.ts`). T03 (`auth.ts`) landed. T01 installed `@tanstack/react-query`, `react-dom`.
- evidence: T04 outputs; routes `internal/api/router.go:92,98-100`; Go handlers `listLibraries` (handlers.go:243), `createLibrary` (:152), `scanLibrary` (:181), `adminStatus` (:292).

## postcondition

(AC-2/AC-3/AC-4) `web/src/lib/queries.ts` exports the 4 hooks; `web/src/main.tsx` mounts the provider root. T08/T09/T10 consume the hooks; mutations invalidate the libraries list.

## test_seed

```
# arrange: mock apiRequest (or use MSW); QueryClient with retries off.
# act:     const { result } = renderHook(() => useLibraries(), { wrapper })
# assert:  apiRequest called with "/api/v1/libraries"; result.data.items is LibraryDTO[].
# act:     renderHook(() => useCreateLibrary()).mutate({module_id:"tv", root_path:"/x", display_name:"X"})
# assert:  POST /api/v1/libraries; on resolve, ["libraries"] invalidated (queryClient.invalidateQueries called).
# main.tsx: render(<App/>) shows the router (smoke).
```

## spec

```
Signatures (files):
  web/src/lib/queries.ts (CREATE)
    export function useLibraries(): UseQueryResult<LibrariesResponse>;
    export function useCreateLibrary(): UseMutationResult<LibraryDTO, ApiError, CreateLibraryRequest>;
    export function useScanLibrary(): UseMutationResult<ScanResponse, ApiError, number /* library id */>;
    export function useAdminStatus(): UseQueryResult<AdminStatus>;
  web/src/main.tsx (REPLACE T01 stub)
    import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
    import { BrowserRouter } from "react-router-dom";
    // createRoot(...).render(<QueryClientProvider><BrowserRouter><App/></BrowserRouter></QueryClientProvider>)

Steps:
  1. CREATE web/src/lib/queries.ts:
     - queryClient exported (or a factory) with mutations defaulting to retry:0 (INV-no-mutation-retry).
     - useLibraries: useQuery(["libraries"], () => apiRequest<LibrariesResponse>("/api/v1/libraries")).
     - useCreateLibrary: useMutation({ mutationFn: (req) => apiRequest<LibraryDTO>("/api/v1/libraries", {method:'POST', body: req as unknown as BodyInit/json}), onSuccess: () => queryClient.invalidateQueries({queryKey:["libraries"]}) }).
     - useScanLibrary: useMutation({ mutationFn: (id) => apiRequest<ScanResponse>(`/api/v1/libraries/${id}/scan`, {method:'POST'}) }).  (No invalidation of libraries by default — a scan does not change the library row; T09 may re-render the scan result.)
     - useAdminStatus: useQuery(["admin-status"], () => apiRequest<AdminStatus>("/api/v1/admin/status"), { refetchInterval: 5000 }).
  2. REPLACE web/src/main.tsx: import App from "./App"; mount QueryClientProvider + BrowserRouter + App.
  3. Apache-2.0 headers.
  4. `cd web && npx tsc --noEmit` → exit 0.
```

## error_handling

- **Query/mutation error:** the `ApiError` from T04 propagates as the hook's `error` state (B6). Pages render it inline (T08/T09/T10). Do not swallow.
- **503 on admin/status (status disabled):** propagates as an error state; T10 renders the "status unavailable" state (AC-4 edge). The hook does NOT special-case 503.

## allowed_imports

- `@tanstack/react-query`  # useQuery, useMutation, QueryClient, QueryClientProvider, types
- `@/lib/api`  # apiRequest + DTOs (T04)
- `react`  # (main.tsx) createRoot
- `react-dom/client`  # createRoot
- `react-router-dom`  # BrowserRouter (main.tsx)
- `./App`  # the router (T06 — created next; main.tsx imports it; if T06 hasn't landed, gate on `npx tsc --noEmit` after T06)

## allowed_categories

- npm-runtime

## callers_to_update

- (none — new file `queries.ts`; `main.tsx` is a stub REPLACE from T01.)

## negative_examples

- "DO NOT auto-retry POST mutations (INV-no-mutation-retry)."
- "DO NOT call `fetch` directly — go through `apiRequest` (INV-pure-delegation)."
- "DO NOT use query keys other than the 3 listed (INV-query-keys)."
- "DO NOT change `internal/api` routes (the hooks hit the 4 pre-existing endpoints only)."

## existing_code_snapshot

```
# web/src/main.tsx (T01 stub — REPLACE):
// SPDX-License-Identifier: Apache-2.0
// (placeholder stub created in T01; T05 replaces it with the provider root)
export {};  // or a bare createRoot placeholder that type-checks
```

## source_anchor

CREATE `web/src/lib/queries.ts`; REPLACE `web/src/main.tsx` (T01 stub). Endpoints: `internal/api/router.go:92,98-100`; handlers `internal/api/handlers.go:152,181,243,292` (createLibrary, scanLibrary, listLibraries, adminStatus).

## contract_test_scope

- **joint (S5):** `web/src/lib/queries.ts -> Go /api/v1/libraries,/scan,/admin/status` | assert: each hook hits its pre-existing endpoint via apiRequest; useCreateLibrary invalidates ["libraries"] on success; mutations don't retry. (Coder Vitest with mocked apiRequest/MSW; QA1 re-verifies end-to-end.)

## test_exclusions

- `web/src/main.tsx` — composition root (provider mounting; framework wiring, no logic).

## scope_boundary

"CREATE `web/src/lib/queries.ts`; REPLACE `web/src/main.tsx`. No other files."

## out_of_scope

- `web/src/App.tsx` (T06 — the route table main.tsx imports)
- the admin pages (T08-T10)
- `internal/api` (UNCHANGED)

## line_budget

95 (flex 1.2)

## acceptance_criteria

- scenario: AC-2 | given: the admin Libraries page (T08) | when: rendered after a create | then: `useCreateLibrary` invalidates `["libraries"]` and the list re-fetches.
- scenario: AC-3 | given: an admin clicks Scan (T09) | when: `useScanLibrary(id)` fires | then: POST `/api/v1/libraries/{id}/scan` returns `ScanResponse` (not auto-retried).
- scenario: AC-4 | given: the admin Status page (T10) | when: mounted | then: `useAdminStatus` polls on a refetch interval.

## refactoring_checklist

- `grep -nE 'queryKey' web/src/lib/queries.ts` → `["libraries"]`, `["admin-status"]`, `["library-scan"` only.
- `grep -nE 'invalidateQueries' web/src/lib/queries.ts` → useCreateLibrary onSuccess invalidates `["libraries"]`.
- `grep -nE 'retry' web/src/lib/queries.ts` → mutations retry:0 (or default-off for mutations).
- `grep -rn 'from "@/lib/queries"' web/src/` → T08/T09/T10 (after they land).
- `cd web && npx tsc --noEmit` → exit 0 (after T06 lands the App import).

## skill_hint

`grounding`, `stack-patterns`
