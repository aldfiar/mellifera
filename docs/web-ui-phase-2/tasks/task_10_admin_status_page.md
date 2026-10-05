# Task 10 — Admin Status page (plugin health + enrich queue stats)

- **Type:** coder
- **Outline Step:** 10 (Admin Status page)
- **Seams:** S5 consumer (`useAdminStatus` from T05)
- **AC trace:** AC-4
- **Project scope:** `mellifera`
- **Deps:** T05 (`useAdminStatus`), T02 (`table`,`badge`,`alert`,`card`)
- **Estimated LOC:** ~120

## Context

- **why:** AC-4 needs the Status page to render the liveness snapshot — a per-plugin health table (`id`, `state` ∈ {serving,degraded,not_serving,failed}, `restarts`, `checked_at`) for base-scanner/tv-parser/image-enricher + an enrich-queue stats block (`pending`, `in_flight`, `done`, `failed`). A 503 (status disabled via nil closure) must render as a clear "status unavailable" state, not a crash. This page also makes the AC-3 queue drain visible (pending → in_flight → done as items progress).
- **data_flow:** enters from: T05 `useAdminStatus` (refetch interval) → transforms: TanStack polling cache → emits to: the plugin-health table + the enrich-stats block.
- **rationale:** refetch interval (TanStack `refetchInterval`) so the operator sees the queue drain without manual refresh (AC-3 Then clause). 503 handled as a distinct "unavailable" state because `adminStatus` returns 503 when the status closure is nil (status disabled).

## behaviors

- B1: `web/src/pages/admin/Status.tsx` default-exports the Status page rendering two blocks: plugin-health table + enrich-stats. | ac: AC-4 | kind: normal
- B2: the plugin-health `<Table>` renders one row per `AdminStatus.plugins[]` entry: `id`, `state` (a `<Badge>`), `restarts`, `checked_at` (RFC3339; "" when zero). | ac: AC-4 | kind: normal
- B3: the enrich-stats block renders `pending`, `in_flight`, `done`, `failed` from `AdminStatus.enrich`. | ac: AC-4 | kind: normal
- B4: `useAdminStatus()` polls on a refetch interval (T05 sets `refetchInterval`) so the queue drain is visible (AC-3 Then: pending → in_flight → done). | ac: AC-4 | kind: normal
- B5: on a 503 (status disabled — nil closure), the page renders a clear "Status unavailable" `<Alert>` state, NOT a crash. | ac: AC-4 | kind: error
- B6: `checked_at` "" (zero LastCheckedAt) renders as a placeholder ("—"), not an empty cell. | ac: AC-4 | kind: edge
- B7: while loading the first fetch, a loading state is shown; transient refetch errors do not blank the last-known data (TanStack keeps stale data). | ac: AC-4 | kind: edge

## invariants

- **INV-state-domain:** plugin `state` is rendered verbatim from the Go enum values {serving, degraded, not_serving, failed} (`internal/api/handlers.go:86` PluginHealth). The `<Badge>` color maps from these; do NOT invent states.
- **INV-503-not-crash:** a 503 is a first-class "unavailable" UI state (AC-4 Then). The page must NOT throw on 503.
- **INV-no-direct-fetch:** the page uses ONLY `useAdminStatus` (T05). No `fetch`/`apiRequest` here.

## precondition

T05 (`useAdminStatus`) + T02 (`table`,`badge`,`alert`,`card`) landed. The status endpoint exists.
- evidence: T05/T02 outputs; Go route `GET /api/v1/admin/status` (`internal/api/router.go:100`); adminStatus handler (`internal/api/handlers.go:292`); DTOs PluginHealth (`handlers.go:86`), EnrichStats (`:97`), AdminStatus (`:110`).

## postcondition

(AC-4) The Status page renders the plugin-health table + enrich-stats block, polls on a refetch interval, and shows a clear "status unavailable" state on 503 (not a crash). The AC-3 queue drain is visible here.

## test_seed

```
# arrange: mock apiRequest → GET /api/v1/admin/status returns
#   { plugins:[{id:"base-scanner",state:"serving",restarts:0,checked_at:"2026-08-05T10:00:00Z"}], enrich:{pending:2,in_flight:1,done:5,failed:0} }
# act:     render <Status/> inside QueryClientProvider
# assert:  plugin row "base-scanner" with Badge "serving"; enrich block shows pending 2 / in_flight 1 / done 5 / failed 0.
# act:     apiRequest returns 503
# assert:  "Status unavailable" Alert rendered (no throw).
# act:     checked_at ""
# assert:  cell shows "—" (placeholder).
```

## spec

```
Signatures (file to CREATE — web/src/pages/admin/Status.tsx):
  export default function Status(): React.ReactElement;

Steps:
  1. CREATE web/src/pages/admin/Status.tsx:
     - const q = useAdminStatus();  // from T05
     - if q.isError && (q.error is ApiError with status 503 OR no data yet) → render <Alert> "Status unavailable".
     - if q.isLoading && !q.data → loading state.
     - else render:
       - <Card> "Plugin health": <Table> rows from q.data.plugins (id, <Badge>{state}</Badge>, restarts, checked_at || "—").
       - <Card> "Enrich queue": stats grid pending / in_flight / done / failed.
     - Badge color mapping: serving→green, degraded→amber, not_serving→gray, failed→red.
  2. Apache-2.0 header.
  3. `cd web && npx tsc --noEmit` → exit 0.
```

## error_handling

- **503 (status disabled):** "Status unavailable" `<Alert>` (B5). Distinguish from transient errors when possible (T05 surfaces the ApiError; check `code/status`).
- **Transient refetch error (non-503):** keep the last-known data rendered (TanStack stale-while-revalidate); optionally show a subtle "refresh failed" hint. Do not blank the page.

## allowed_imports

- `react`  # ReactElement
- `@/lib/queries`  # useAdminStatus (T05)
- `@/lib/api`  # AdminStatus, PluginHealth, EnrichStats, ApiError types (T04)
- `@/components/ui/table`  # T02
- `@/components/ui/badge`  # T02
- `@/components/ui/alert`  # T02
- `@/components/ui/card`  # T02

## allowed_categories

- npm-runtime

## callers_to_update

- (none — new file; T08 `Admin.tsx` imports `@/pages/admin/Status`.)

## negative_examples

- "DO NOT invent plugin states — render the Go enum verbatim (INV-state-domain)."
- "DO NOT crash on 503 — render the 'Status unavailable' state (INV-503-not-crash)."
- "DO NOT call `fetch`/`apiRequest` directly — use `useAdminStatus` (INV-no-direct-fetch)."
- "DO NOT round the enrich counters — integers render verbatim."

## existing_code_snapshot

```
(CREATE — web/src/pages/admin/Status.tsx does not exist)
# Go DTOs mirrored (internal/api/handlers.go):
#   type PluginHealth struct { ID, State string; Restarts int; CheckedAt time.Time `json:"checked_at"` }   // :86
#   type EnrichStats struct { Pending, InFlight `json:"in_flight"`, Done, Failed int }                      // :97
#   type AdminStatus struct { Plugins []PluginHealth; Enrich EnrichStats }                                  // :110
```

## source_anchor

CREATE `web/src/pages/admin/Status.tsx`. Status route: `internal/api/router.go:100` (verified). adminStatus handler: `internal/api/handlers.go:292`. DTOs: `:86,:97,:110` (verified `grep -nE '^type (PluginHealth|EnrichStats|AdminStatus)' internal/api/handlers.go`).

## contract_test_scope

- **joint (S5 consumer):** `Status.tsx -> useAdminStatus -> Go /api/v1/admin/status` | assert: plugin table + enrich stats render from the DTO; 503 → "Status unavailable"; polling interval set. (Coder Vitest with MSW; QA1 re-verifies end-to-end.)

## test_exclusions

- (logic-bearing — the 503 branch + state mapping are testable; no exclusion.)

## scope_boundary

"CREATE only: `web/src/pages/admin/Status.tsx`. No other files."

## out_of_scope

- `web/src/pages/admin/Admin.tsx` (T08 — imports Status)
- `internal/api/handlers.go` adminStatus (UNCHANGED)

## line_budget

120 (flex 1.2)

## acceptance_criteria

- scenario: AC-4 | given: authenticated admin on the Status page | when: the page loads (and on each refetch) | then: `GET /api/v1/admin/status` → plugin-health table + enrich-stats block render; a 503 renders "Status unavailable" (not a crash).
- scenario: AC-3 (partial) | given: a scan just ran (AC-3) | when: the Status page polls | then: enrich stats reflect the queue draining (pending → in_flight → done).

## refactoring_checklist

- `grep -n 'useAdminStatus' web/src/pages/admin/Status.tsx` → present.
- `grep -nE '503|Status unavailable|unavailable' web/src/pages/admin/Status.tsx` → 503 branch present.
- `grep -nE 'fetch\(|apiRequest' web/src/pages/admin/Status.tsx` → empty (INV-no-direct-fetch).
- `cd web && npx tsc --noEmit` → exit 0.

## skill_hint

`grounding`, `stack-patterns`
