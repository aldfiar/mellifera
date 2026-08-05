# QA 01 — Roles-gating + routing (independent acceptance re-derivation)

> **Status: DONE** (2026-08-05). Non-redundant slice written: `internal/api/qa_roles_test.go::TestQA_RoutingDefaultDeny_BrowseGroup` — the browse-group default-deny failure mode (unknown/empty role denied on the permissive group through real `mountV1Routes`), which `role_gating_test.go::TestNew_RoleGating` does not reach (it injects only admin/client). All other AC-1 clauses (token matrix, requireRole full matrix, real-admin-reaches-all) proven by existing coder tests and REFERENCED, not re-proven. Budget: 1 joint.

- **Type:** QA (integration/regression)
- **AC trace:** AC-1 (primary), AC-7 (additive/regression)
- **Validates tasks:** T03 (Role/Principal types), T04 (authMiddleware/requireRole), T08 (router role groups)
- **joints_targeted:** middleware↔router (authN→authZ ordering), router↔handlers (route-group→handler dispatch), the Principal-context seam
- **mock_boundaries:** NONE for internal modules — use the REAL `api.New` + real `store.Open` (temp SQLite). The synthetic `Principal{Role:RoleClient}` is a test-only context injection (not a mock of a real resolver — there IS no client resolver yet).

## behavior_coverage (independently re-derived from acceptance.md AC-1)

| B-id | behavior | covered_by |
|---|---|---|
| AC1-B1 | valid admin token → `Principal{Role:RoleAdmin}` (authN) | qa1_t1_admin_token_resolves_admin |
| AC1-B2 | missing/wrong token → 401 `unauthenticated` (regression) | qa1_t2_token_matrix_401 |
| AC1-B3 | `requireRole(RoleAdmin)` admits admin on admin routes | qa1_t3_admin_on_admin_routes |
| AC1-B4 | `requireRole(RoleAdmin)` denies client on admin routes → 403 `forbidden` | qa1_t4_client_denied_admin |
| AC1-B5 | `requireRole(RoleAdmin,RoleClient)` admits both on browse routes | qa1_t5_client_on_browse |
| AC1-B6 | unknown/empty Role → denied admin (default-deny, R-4) | qa1_t6_unknown_role_denied |
| AC1-B7 | `.Admin`→`.IsAdmin()` transition (no production reader broken) | qa1_t7_no_admin_field_read |
| AC1-B8 | existing 3 routes keep method+path+DTO+auth (regression) | qa1_t8_existing_routes_intact |

`uncovered_behaviors:` none — every AC-1 clause + R-4 edge has a test.

## tests (≤4 joint + 2 boundary + 1 property)

- **qa1_t1_admin_token_resolves_admin** (joint): `api.New` with admin token → admin-token request to a browse + an admin route → context Principal (read via a test handler) is `{Role:RoleAdmin}`; `IsAdmin()==true`.
- **qa1_t2_token_matrix_401** (joint, regression): table `{no header, wrong scheme, wrong token, correct token}` → 401 short-circuit (next NOT called) for the 3 misses; 200 for correct. Mirrors `middleware_test.go:17` but driven through the REAL router.
- **qa1_t3_admin_on_admin_routes** (joint): admin token → `POST /libraries`, `POST /libraries/{id}/scan`, `GET /admin/status` → all succeed (2xx; scan/status may need stubs — use a no-op `Deps.Scan` + a `Status` closure returning empty).
- **qa1_t4_client_denied_admin** (joint): synthetic `Principal{Role:RoleClient}` → admin routes → 403 + canonical `forbidden` body; next NOT called.
- **qa1_t5_client_on_browse** (boundary): synthetic client → browse routes (`GET /libraries`, `GET /items`, `GET /items/{id}`) → 200.
- **qa1_t6_unknown_role_denied** (boundary): synthetic `Principal{Role:""}` + `Principal{Role:"weird"}` → admin routes 403; browse routes 403 (unknown is not in `requireRole(RoleAdmin,RoleClient)` either).
- **qa1_t7_proposal_no_admin_field_read** (property, structural): `grep -rn '\.Admin\b' internal/api/*.go` returns ONLY the deprecated `Admin()` method definition + its deprecation comment — no FIELD read remains (the field is gone; only the method).

## refactoring_validation

- `grep -rn 'adminMiddleware' internal/` → 0 hits (fully renamed to `authMiddleware`).
- `grep -rn '\.Admin\b' internal/api/` → only `func (p Principal) Admin()` (the deprecated method) — no field, no reader.
- `grep -nE 'r\.Group|requireRole' internal/api/router.go` → ≥4 hits (2 groups + 2 requireRole calls).

## scope_boundary

- CREATE `qa_roles_test.go` (repo root or `internal/api/qa_roles_test.go`) — independent of the T04/T08 in-package tests.

## out_of_scope

- The endpoint DATA shapes (QA3).
- Swagger (QA2).
- Embed/build-gate (QA4).

## acceptance_criteria

- AC-1 (roles-gating works — the independent re-assertion)

## skill_hint

`mellifera-build`, `grounding`, `stack-patterns`
