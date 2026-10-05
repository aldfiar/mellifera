# Task 09 — Libraries scan trigger (extend `Libraries.tsx`)

- **Type:** coder
- **Outline Step:** 9 (scan trigger — extends the Step-8 file)
- **Seams:** S5 consumer (`useScanLibrary` from T05)
- **AC trace:** AC-3
- **Project scope:** `mellifera`
- **Deps:** T08 (`Libraries.tsx` exists), T05 (`useScanLibrary`)
- **Estimated LOC:** ~55 (extension to an existing file)

## Context

- **why:** AC-3 needs a per-row "Scan" button that POSTs to `/api/v1/libraries/{id}/scan` and renders the `{library_id, discovered, persisted, warnings?}` result inline. The async enrich queue then drains (visible in T10's status page). This task EXTENDS the file T08 created — it adds the scan control + result render to each library row.
- **data_flow:** enters from: per-row Scan button → transforms: `useScanLibrary(id)` mutation (T05 → T04 → Go `/api/v1/libraries/{id}/scan`) → emits to: inline `ScanResponse` render + (transitively) the T10 status page reflecting the queue draining.
- **rationale:** the scan mutation is NOT auto-retried (non-idempotent — the operator re-clicks; integration_map §External boundary; T05 INV-no-mutation-retry). `warnings?` is optional and rendered when present.

## behaviors

- B1: each library row in `Libraries.tsx` has a "Scan" `<Button>` that calls `useScanLibrary().mutate(id)`. | ac: AC-3 | kind: normal
- B2: on 200, the `ScanResponse` `{ library_id, discovered, persisted, warnings? }` renders inline (per-row result area): "discovered N · persisted M" + optional warnings list. | ac: AC-3 | kind: normal
- B3: `warnings` (optional `string[]`) renders as a list when present; absent → not rendered (no placeholder noise). | ac: AC-3 | kind: edge
- B4: on a scan error (non-2xx), the canonical `ApiError` renders inline for that row (not a crash). | ac: AC-3 | kind: error
- B5: while a scan is pending, the row's Scan button is disabled (no double-submit). | ac: AC-3 | kind: edge

## invariants

- **INV-scan-not-retried:** the scan mutation is not auto-retried (T05 INV-no-mutation-retry); failures require the operator to re-click.
- **INV-per-row-state:** scan result/error state is per-row (a scan on row A does not clobber row B's display). Track by `library_id`.

## precondition

T08 landed (`web/src/pages/admin/Libraries.tsx` exists with the table + add-form). T05 (`useScanLibrary`) landed. The scan endpoint exists.
- evidence: T08 outputs; T05 outputs; Go route `POST /api/v1/libraries/{id}/scan` (`internal/api/router.go:99`); scanLibrary handler (`internal/api/handlers.go:181`); `scanResponse` DTO (`handlers.go` scanResponse region).

## postcondition

(AC-3) Each library row has a working Scan button: POST `/api/v1/libraries/{id}/scan` → inline `{library_id, discovered, persisted, warnings?}` on 200; inline ApiError on failure; disabled while pending.

## test_seed

```
# arrange: mock apiRequest → POST /api/v1/libraries/1/scan returns {library_id:1, discovered:5, persisted:5};
#          render <Libraries/> with one library row (id:1).
# act:     click "Scan" on row 1
# assert:  POST /api/v1/libraries/1/scan fired once; "discovered 5 · persisted 5" renders on row 1.
# act:     response includes warnings: ["x"]
# assert:  warnings list rendered.
# act:     response 500 {error:{code:"internal",message:"boom"}}
# assert:  inline error on row 1; row 2 (if any) unaffected.
```

## spec

```
Signatures (MODIFY web/src/pages/admin/Libraries.tsx — extend):
  // add a per-row scan cell + result area; add `const scan = useScanLibrary();` to the component.
  // track per-row scan state via the mutation's variables + data/error (keyed by library id).

Steps:
  1. EDIT web/src/pages/admin/Libraries.tsx:
     - import useScanLibrary from @/lib/queries; import ScanResponse + ApiError types from @/lib/api.
     - const scan = useScanLibrary();
     - add a per-row "Scan" Button (disabled while scan.isPending && scan.variables === row.id).
     - onClick: scan.mutate(row.id).
     - per-row result: if scan.data?.library_id === row.id → render "discovered N · persisted M" + (scan.data.warnings?.length ? <ul>warnings</ul> : null).
     - per-row error: if scan.error && scan.variables === row.id → render <Alert> with ApiError.code + message.
  2. Apache-2.0 header (already present from T08 — keep).
  3. `cd web && npx tsc --noEmit` → exit 0.
```

## error_handling

- **Scan 400/500:** inline `<Alert>` per row (ApiError.code + message) (B4). No global error toast.
- **Network failure:** surfaces as scan.error (TanStack); render the same per-row inline state.

## allowed_imports

- `@/lib/queries`  # useScanLibrary (T05)
- `@/lib/api`  # ScanResponse, ApiError types (T04)
- `@/components/ui/button`  # T02
- `@/components/ui/alert`  # T02
- (react already imported in T08)

## allowed_categories

- npm-runtime

## callers_to_update

- `web/src/pages/admin/Libraries.tsx` | symbol: the row component / the Libraries default export | change: add per-row Scan button + result/error render + `useScanLibrary` (this task owns the edit; the file was created in T08).

## negative_examples

- "DO NOT auto-retry the scan mutation (INV-scan-not-retried)."
- "DO NOT clobber other rows' scan state — track by library_id (INV-per-row-state)."
- "DO NOT render `warnings` when absent (B3)."
- "DO NOT call `/api` directly — use the `useScanLibrary` hook."

## existing_code_snapshot

```
# web/src/pages/admin/Libraries.tsx (created in T08):
#   - default export `Libraries` rendering a <Table> of data.items + an add-library form.
#   - imports useLibraries, useCreateLibrary from @/lib/queries.
#   (this task ADDS: useScanLibrary import, per-row Scan Button, per-row result/error area.)
```

## source_anchor

MODIFY `web/src/pages/admin/Libraries.tsx` (T08 output). Scan route: `internal/api/router.go:99` (verified `grep -n 'libraries/{id}/scan' internal/api/router.go`). scanLibrary handler: `internal/api/handlers.go:181`. `scanResponse` DTO: `handlers.go` (warnings `omitempty`).

## contract_test_scope

- **joint (S5 consumer):** `Libraries.tsx scan trigger -> Go /api/v1/libraries/{id}/scan` | assert: POST fires per-row; 200 → inline {library_id, discovered, persisted, warnings?}; failure → inline ApiError; no double-submit. (Coder Vitest with MSW; QA1 re-verifies end-to-end + the queue-drain visibility in T10.)

## test_exclusions

- (the scan trigger is logic-bearing — tested; no exclusion.)

## scope_boundary

"MODIFY only: `web/src/pages/admin/Libraries.tsx` (extend with the scan trigger). No other files."

## out_of_scope

- `web/src/pages/admin/Status.tsx` (T10 — the queue-drain visibility)
- `web/src/pages/admin/Admin.tsx` (T08)
- `internal/api/handlers.go` (UNCHANGED)

## line_budget

55 (flex 1.2)

## acceptance_criteria

- scenario: AC-3 | given: a library exists (AC-2) + the plugins/queue are running | when: the operator clicks "Scan" on a row | then: SPA POSTs to `/api/v1/libraries/{id}/scan`; on 200 `ScanResponse {library_id, discovered, persisted, warnings?}` renders inline.

## refactoring_checklist

- `grep -n 'useScanLibrary' web/src/pages/admin/Libraries.tsx` → present.
- `grep -nE 'discovered|persisted|warnings' web/src/pages/admin/Libraries.tsx` → inline result render present.
- `grep -nE 'fetch\(' web/src/pages/admin/Libraries.tsx` → empty (uses the hook).
- `cd web && npx tsc --noEmit` → exit 0.

## skill_hint

`grounding`, `stack-patterns`
