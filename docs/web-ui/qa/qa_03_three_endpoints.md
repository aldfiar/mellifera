# QA 03 — The 3 endpoints: list-libraries, get-item, admin-status (independent acceptance re-derivation)

> **Status: DONE** (2026-08-05). Non-redundant slice written: `qa_endpoints_test.go` (independent harness — own token/status/store) — `TestQA_LibraryWireKeySet_INV4` (decodes the library object into a map and asserts the EXACT key set {id, module_id, root_path, display_name} on BOTH POST and GET /libraries; a struct decode silently ignores a created_at leak, so only the key-set diff catches an INV4 breach) + `TestQA_GetItemNotFoundCanonicalBody` (404 code=not_found AND retryable=false — the retryable field the coder's test skips). Full-document deep-equal, admin-status happy/nil-503/error-500, list ordering/empty proven by `router_test.go`/`admin_status_test.go`/`integration_web_test.go::ac3/4/5` and referenced. Budget: 2 boundary.

- **Type:** QA (integration)
- **AC trace:** AC-3 (list libraries), AC-4 (item detail), AC-5 (admin status)
- **Validates tasks:** T02 (store.ListLibraries), T05 (listLibraries handler), T06 (getItem handler), T07 (adminStatus handler + DTOs), T13 (Deps.Status closure wiring)
- **joints_targeted:** store↔api-handlers (boundary conversion INV4), api-handlers↔cmd-closure (Deps.Status), api-handlers↔router (route reachable under the right role)
- **mock_boundaries:** the `Deps.Status` closure in the admin-status tests is a STUB closure (returns canned `AdminStatus`/error) — this isolates the api handler from the real plugin/enrich subsystems (which require the plugin binaries). The store uses a REAL temp SQLite (`store.Open`). For AC-4, the `ready` item is inserted via the REAL `store.PutItem` (not a mock).

## behavior_coverage (independently re-derived from acceptance.md AC-3/AC-4/AC-5)

| B-id | behavior | covered_by |
|---|---|---|
| AC3-B1 | `GET /libraries` lists every library, `id ASC` | qa3_t1_list_libraries_ordered |
| AC3-B2 | empty store → `{"items":[]}` not null | qa3_t1_list_libraries_ordered (empty sub-case) |
| AC3-B3 | `libraryDTO` boundary conversion (no `store.Library` leak) | qa3_t2_library_dto_shape |
| AC4-B1 | `GET /items/{id}` → full document (sources/view/provenance/stages, precision preserved) | qa3_t3_get_item_full_document |
| AC4-B2 | missing id → 404 `not_found` canonical body | qa3_t4_get_item_404 |
| AC4-B3 | no separate "metadata summary" shape — `itemDTO.Document` is the full doc | qa3_t3_get_item_full_document (deep-equal) |
| AC5-B1 | `GET /admin/status` (admin) → 200 with plugins + enrich | qa3_t5_admin_status_happy |
| AC5-B2 | nil `Deps.Status` → 503 `unavailable` | qa3_t6_admin_status_nil_503 |
| AC5-B3 | closure error → 500 `internal_error` | qa3_t6_admin_status_nil_503 (error variant) |
| AC5-B4 | client role → 403 on `/admin/status` | qa3_t7_admin_status_forbidden_client |
| AC5-B5 | api imports NEITHER plugin NOR enrich (INV2) | qa3_t8_inv2_no_imports (structural) |

`uncovered_behaviors:` none.

## tests (≤4 joint + 2 boundary + 1 property)

- **qa3_t1_list_libraries_ordered** (joint): create 3 libraries (out of order) → `GET /api/v1/libraries` (admin) → 200 + decode `librariesResponse` → assert `len==3`, `Items[i].ID < Items[i+1].ID` (id ASC), fields round-trip. Empty sub-case: fresh store → `{"items":[]}` (decode into `map[string]any`, assert `items` is a non-null empty array).
- **qa3_t2_library_dto_shape** (boundary): the response JSON keys are EXACTLY `{id, module_id, root_path, display_name}` — no `created_at`, no extra fields (INV4 + the time-omission rule). Decode into a map, compare key set.
- **qa3_t3_get_item_full_document** (joint): `store.PutItem` a `ready` item with a known rich document `{sources:{tv:{}}, _view:{}, _provenance:{}, _stages:[]}` → `GET /api/v1/items/{id}` (admin) → 200 + decode `itemResponse` → assert `Item.Document` deep-equals the input (precision preserved, no field dropped/stripped).
- **qa3_t4_get_item_404** (boundary): `GET /api/v1/items/nonexistent` → 404 + decode `errorBody` → `Error.Code=="not_found"`, `Retryable==false`.
- **qa3_t5_admin_status_happy** (joint): `api.New` with a stub `Status` closure returning `AdminStatus{Plugins:[{ID:"base-scanner",State:"serving",Restarts:0,CheckedAt:"2026-08-05T00:00:00Z"}], Enrich:{Pending:2,InFlight:1,Done:5,Failed:0}}` → `GET /api/v1/admin/status` (admin) → 200 + decode `statusResponse` → fields round-trip.
- **qa3_t6_admin_status_nil_503_and_error_500** (boundary): (a) `Deps.Status == nil` → 503 `unavailable`; (b) `Status` returns `errors.New("boom")` → 500 `internal_error`.
- **qa3_t7_admin_status_forbidden_client** (property): synthetic `Principal{Role:RoleClient}` → `GET /api/v1/admin/status` → 403 (the admin-only gate — links to QA1 but re-asserted at the endpoint level).
- **qa3_t8_inv2_no_imports** (property, structural): `grep -rn 'internal/plugin\|internal/enrich' internal/api/*.go` → 0 hits (the load-bearing INV2). The closure lives in `cmd/mellifera` (verified separately: `grep -n 'internal/plugin\|internal/enrich' cmd/mellifera/main.go` ≥ 2 — it DOES import them, correctly).

## refactoring_validation

- `grep -n 'func (a \*app) listLibraries\|func (a \*app) getItem\|func (a \*app) adminStatus' internal/api/handlers.go` → 3 hits.
- `grep -n 'func (s \*Store) ListLibraries' internal/store/libraries.go` → 1 hit.
- `grep -rn 'internal/plugin\|internal/enrich' internal/api/*.go` → 0 hits (INV2).

## scope_boundary

- CREATE `qa_endpoints_test.go` (repo root).

## out_of_scope

- Roles-gating matrix beyond the admin-status client-403 (QA1 owns the full matrix).
- Swagger (QA2).
- Embed/build-gate (QA4).

## acceptance_criteria

- AC-3, AC-4, AC-5 (the 3 new GET endpoints — independent re-assertion)

## skill_hint

`mellifera-build`, `grounding`, `stack-patterns`
