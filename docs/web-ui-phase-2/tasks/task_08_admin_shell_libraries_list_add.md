# Task 08 — Admin shell + Libraries page (list + add-library form)

- **Type:** coder
- **Outline Step:** 8 (Admin Libraries page — list + add)
- **Seams:** S5 consumer (uses `useLibraries`/`useCreateLibrary` from T05)
- **AC trace:** AC-2
- **Project scope:** `mellifera`
- **Deps:** T05 (`useLibraries`,`useCreateLibrary`), T02 (`table`,`input`,`label`,`select`,`button`,`badge`,`alert`,`card`), T03 (auth, transitively)
- **Estimated LOC:** ~210 (Admin shell + Libraries list/form)

## Context

- **why:** The admin panel's primary job in 2a is library management — list existing libraries (from `GET /api/v1/libraries`) and add a new one via a form (`module_id` tv/image, `root_path` w/ NFS-mount note, `display_name`) that POSTs and invalidates the list. This is the heart of AC-2.
- **data_flow:** enters from: T05 `useLibraries`/`useCreateLibrary` → transforms: TanStack cache → emits to: the table + the add-library form result (the new row appears after invalidation).
- **rationale:** the form documents that network paths must be OS-mounted (NFS) because the Go process reads them like local paths (no SMB/HTTP fetch in the server). The DTO field names are verbatim Go JSON tags (`module_id`,`root_path`,`display_name` — T04 INV-verbatim-field-names). Errors surface the canonical `{error:{code,message,retryable}}` inline (T04 ApiError).

## behaviors

- B1: `web/src/pages/admin/Admin.tsx` default-exports the admin shell with two sections (Libraries, Status) — a tab/section switcher (Status rendered by T10). | ac: AC-2 | kind: normal
- B2: `web/src/pages/admin/Libraries.tsx` renders a table of libraries (`id`, `module_id`, `root_path`, `display_name`) sourced from `useLibraries()`. | ac: AC-2 | kind: normal
- B3: an add-library form collects `module_id` (a `<Select>` ∈ {tv, image}), `root_path` (absolute path `<Input>`), `display_name` (`<Input>`) and on submit calls `useCreateLibrary().mutate({ module_id, root_path, display_name })`. | ac: AC-2 | kind: normal
- B4: on create success, the new library appears in the list (TanStack invalidates `["libraries"]` per T05; the table re-fetches). | ac: AC-2 | kind: normal
- B5: the form shows an inline note that network paths must be OS-mounted (local or NFS-mounted) — the Go process reads them like local paths. | ac: AC-2 | kind: normal
- B6: on a 400/500, the canonical error `{code,message,retryable}` is rendered inline (an `<Alert>` reading `ApiError.code` + `message`; a retry affordance MAY appear when `retryable`). | ac: AC-2 | kind: error
- B7: while the list is loading, a loading state is shown (not a crash); an empty list shows an empty-state row. | ac: AC-2 | kind: edge

## invariants

- **INV-verbatim-payload:** the POST body is exactly `{ module_id, root_path, display_name }` (the Go `createLibraryRequest`, `internal/api/handlers.go:33`). No camelCase, no extra fields.
- **INV-module-id-domain:** `module_id` ∈ {"tv","image"} only (arch §2.4 module seeds; the `<Select>` options enforce it). No free-text module_id.
- **INV-no-direct-fetch:** the page uses ONLY T05 hooks. No direct `apiRequest`/`fetch` call here.

## precondition

T05 (`useLibraries`,`useCreateLibrary`) + T02 (table, input, label, select, button, badge, alert, card) landed. The 4 endpoints exist (`internal/api/router.go:92,98-100`).
- evidence: T05/T02 outputs; Go DTO `internal/api/handlers.go:33` (`createLibraryRequest`); createLibrary handler `:152`; listLibraries `:243`.

## postcondition

(AC-2) The admin Libraries page lists libraries + adds a new one via the form (POST → 201 → list invalidates + re-renders); 400/500 surfaces the canonical error inline; the form documents the OS-mount/NFS requirement.

## test_seed

```
# arrange: mock apiRequest (MSW) → GET /api/v1/libraries returns {items:[{id:1,module_id:"tv",...}]};
#          render <Libraries/> inside QueryClientProvider + BrowserRouter.
# act:     render
# assert:  table shows the library row.
# act:     fill form (module_id="tv", root_path="/media/tv", display_name="TV"); click Add
# assert:  POST /api/v1/libraries body === {module_id:"tv",root_path:"/media/tv",display_name:"TV"}; on 201 the list refetches (row count grows).
# act:     POST returns 400 {error:{code:"bad_request",message:"..."}}
# assert:  Alert shows code+message inline.
```

## spec

```
Signatures (files to CREATE):
  web/src/pages/admin/Admin.tsx       # default export; shell with Libraries/Status sections (Status rendered by T10)
  web/src/pages/admin/Libraries.tsx   # default export; the list + add-library form

Steps:
  1. CREATE web/src/pages/admin/Admin.tsx:
     - section state: "libraries" | "status"; render <Libraries/> or <Status/> (import Status lazily / or directly once T10 lands).
     - simple tab nav (shadcn Button variants or Badge).
  2. CREATE web/src/pages/admin/Libraries.tsx:
     - const { data, isLoading, error } = useLibraries();
     - const create = useCreateLibrary();  // from T05
     - form state: moduleId ("tv"|"image"), rootPath, displayName.
     - onSubmit: create.mutate({ module_id: moduleId, root_path: rootPath, display_name: displayName }).
     - render: <Table> of data.items (id, module_id, root_path, display_name); loading/empty/error states; add-form (Select module, Input root_path + NFS note, Input display_name, Button); error <Alert> from create.error (ApiError).
  3. Apache-2.0 headers.
  4. `cd web && npx tsc --noEmit` → exit 0 (Status import gated on T10).
```

## error_handling

- **Create 400/500:** render `<Alert>` with `ApiError.code` + `message`; optional retry affordance when `retryable` (B6).
- **List error (GET /libraries non-2xx):** render an error state (not a crash); the ApiError message is shown.
- **List loading / empty:** loading indicator; empty-state row "No libraries yet" (B7).

## allowed_imports

- `react`  # useState, ReactElement
- `@tanstack/react-query`  # (types only — hooks come from @/lib/queries)
- `@/lib/queries`  # useLibraries, useCreateLibrary (T05)
- `@/lib/api`  # ApiError type, CreateLibraryRequest, LibraryDTO (T04)
- `@/components/ui/table`  # T02
- `@/components/ui/input`  # T02
- `@/components/ui/label`  # T02
- `@/components/ui/select`  # T02
- `@/components/ui/button`  # T02
- `@/components/ui/badge`  # T02
- `@/components/ui/alert`  # T02
- `@/components/ui/card`  # T02
- `@/pages/admin/Status`  # T10 (Status section; gate tsc on T10 landing)

## allowed_categories

- npm-runtime

## callers_to_update

- (none — new files; T06 App.tsx imports `@/pages/admin/Admin`.)

## negative_examples

- "DO NOT send camelCase fields — `{ module_id, root_path, display_name }` verbatim (INV-verbatim-payload)."
- "DO NOT allow free-text `module_id` — Select ∈ {tv, image} only (INV-module-id-domain)."
- "DO NOT call `fetch`/`apiRequest` directly — go through T05 hooks (INV-no-direct-fetch)."
- "DO NOT render document values (browse is 2b) — this page lists LIBRARIES only."

## existing_code_snapshot

```
(CREATE — web/src/pages/admin/ does not exist yet)
# Go DTO mirrored (internal/api/handlers.go:33):
#   type createLibraryRequest struct { ModuleID `json:"module_id"`; RootPath `json:"root_path"`; DisplayName `json:"display_name"` }
```

## source_anchor

CREATE `web/src/pages/admin/Admin.tsx` + `Libraries.tsx`. Hooks: T05. DTO: `internal/api/handlers.go:33` (`createLibraryRequest`, verified `grep -n 'createLibraryRequest' internal/api/handlers.go`). Handlers: `listLibraries` (handlers.go:243), `createLibrary` (:152).

## contract_test_scope

- **joint (S5 consumer):** `Libraries.tsx -> useLibraries/useCreateLibrary -> Go /api/v1/libraries` | assert: list renders rows; add-form POSTs the verbatim DTO; on 201 the list refetches (invalidation); on 400 the canonical error renders inline. (Coder Vitest with MSW; QA1 re-verifies end-to-end.)

## test_exclusions

- `web/src/pages/admin/Admin.tsx` shell — composition/tab wiring (no logic); smoke-tested via tsc + QA1.

## scope_boundary

"CREATE only: `web/src/pages/admin/Admin.tsx`, `web/src/pages/admin/Libraries.tsx`. No other files."

## out_of_scope

- the scan trigger row control (T09 — extends `Libraries.tsx`)
- `web/src/pages/admin/Status.tsx` (T10)
- `internal/api/handlers.go` (UNCHANGED)

## line_budget

210 (flex 1.2)

## acceptance_criteria

- scenario: AC-2 | given: authenticated admin on the Libraries page | when: fills the add-library form (`module_id` tv/image, `root_path` absolute local-or-NFS, `display_name`) + submits | then: SPA POSTs the verbatim body to `/api/v1/libraries`; on 201 the new library appears in the list; on 400/500 the canonical error surfaces inline; the form documents the OS-mount/NFS requirement.

## refactoring_checklist

- `grep -nE 'module_id|root_path|display_name' web/src/pages/admin/Libraries.tsx` → verbatim field names.
- `grep -n 'useLibraries\|useCreateLibrary' web/src/pages/admin/Libraries.tsx` → both hooks used.
- `grep -nE 'fetch\(|apiRequest' web/src/pages/admin/Libraries.tsx` → empty (INV-no-direct-fetch).
- `cd web && npx tsc --noEmit` → exit 0.

## skill_hint

`grounding`, `stack-patterns`
