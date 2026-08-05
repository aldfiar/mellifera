# QA 02 — Swagger accuracy + serve (independent acceptance re-derivation)

> **Status: DONE** (2026-08-05). Non-redundant slice written: `internal/web/qa_swagger_test.go` — `TestQA_SpecDTOAccuracy` (decodes served /openapi.json and matches handler DTO property names — the R-3 DTO drift catcher the coder's path-key/operationId-count probe cannot catch; also verifies R-01: api.libraryResponse ABSENT, POST /libraries refs api.libraryDTO) + `TestQA_ServedEqualsCommitted` (served /openapi.yaml byte-equals the committed file — pure-embed passthrough). yaml/json 200 + content-types + /docs + 6 operationIds proven by `web_test.go`/`integration_web_test.go::ac2_swagger` and referenced. Budget: 1 joint + 1 property.

- **Type:** QA (integration/structural)
- **AC trace:** AC-2 (primary), AC-7 (swag dev-only, go.mod unchanged)
- **Validates tasks:** T09 (annotations), T10 (codegen + vendor), T12 (web/swagger serve), T13 (compose — public route reachable)
- **joints_targeted:** api-annotations↔generated-spec (swag codegen), web/swagger↔embedded-bytes (serve), compose↔public-surface (route reachable without auth)
- **mock_boundaries:** NONE — serve the REAL embedded bytes through the REAL `web.Handler`. The swag CLI is a build tool (not mocked); the test reads the committed `internal/web/api/openapi.yaml` AND the served `/openapi.yaml` and asserts they match (no drift at serve).

## behavior_coverage (independently re-derived from acceptance.md AC-2)

| B-id | behavior | covered_by |
|---|---|---|
| AC2-B1 | `/openapi.yaml` → 200 `application/yaml` | qa2_t1_openapi_yaml_served |
| AC2-B2 | `/openapi.json` → 200 `application/json` | qa2_t1_openapi_yaml_served (json variant) |
| AC2-B3 | `/docs/` → 200 HTML (Swagger UI loads) | qa2_t2_docs_ui_loads |
| AC2-B4 | spec names ALL 6 routes (AC-2 verify probe ≥6) | qa2_t3_six_routes_named |
| AC2-B5 | spec DTOs match handler DTOs (`createLibraryRequest`, `itemDTO`, `statusResponse`, etc.) | qa2_t4_dto_shapes_match |
| AC2-B6 | swagger routes PUBLIC (no auth) — `/openapi.yaml` + `/docs/` reachable with no header | qa2_t5_public_no_auth |
| AC2-B7 | served spec == committed embedded bytes (no runtime drift) | qa2_t6_served_equals_committed |
| AC2-B8 | annotations are comments only — handler bodies unchanged (INV1) | qa2_t7_annotations_comments_only (structural) |

`uncovered_behaviors:` none.

## tests (≤4 joint + 2 boundary + 1 property)

- **qa2_t1_openapi_yaml_served** (joint): boot `web.Handler(nil, opts)` (apiHandler nil — swagger is independent) → `GET /openapi.yaml` → 200 + `Content-Type: application/yaml` (or `text/yaml`); `GET /openapi.json` → 200 + `application/json`.
- **qa2_t2_docs_ui_loads** (joint): `GET /docs/` → 200 + `text/html` + body contains `swagger-ui` (the vendored bundle reference). Optionally fetch the bundle URL it points at and assert 200.
- **qa2_t3_six_routes_named** (joint, the AC-2 verify probe): `GET /openapi.yaml` body → `grep -cE '(/libraries|/items|/admin/status)'` ≥ 6 (assert `strings.Count(body, "/libraries")+strings.Count(body,"/items")+strings.Count(body,"/admin/status") >= 6`). This is the R-3 drift catcher.
- **qa2_t4_dto_shapes_match** (joint): decode `openapi.json` → assert the schemas for `createLibraryRequest`, `itemDTO`/`itemResponse`, `librariesResponse`, `statusResponse` reference the expected property names (idempotent structural — does NOT require full JSON-schema conformance).
- **qa2_t5_public_no_auth** (boundary): `GET /openapi.yaml` + `GET /docs/` with NO `Authorization` header → 200 (not 401). Proves the public-contract surface (R-2).
- **qa2_t6_served_equals_committed** (property): read `internal/web/api/openapi.yaml` from disk (committed bytes) → assert `GET /openapi.yaml` body byte-equals it (the serve path is a pure embed, no mutation).
- **qa2_t7_annotations_comments_only** (property, structural): `git diff 58a1130 HEAD -- internal/api/handlers.go` shows ONLY added `//` comment lines above handlers + the new handler funcs from T05/T06/T07 — NO statement changes to `createLibrary`/`scanLibrary`/`listItems` bodies. (Run via `exec.Command("git","diff",...)` OR document as manual.)

## refactoring_validation

- `grep -c '@Router' internal/api/handlers.go` ≥ 6 (every handler annotated).
- `grep -i 'swagger-ui\|Swagger UI' NOTICE` ≥ 1 (attribution).
- `test -f internal/web/swagger-ui/LICENSE` → exit 0.
- `git diff --stat go.mod go.sum` (vs 58a1130) → EMPTY (swag is dev-only).

## scope_boundary

- CREATE `qa_swagger_test.go` (repo root or `internal/web/qa_swagger_test.go`).

## out_of_scope

- The handler DATA logic (QA3).
- Roles-gating (QA1).
- Embed/cache/fallback for the SPA (QA4 — this QA covers only the swagger serve).

## acceptance_criteria

- AC-2 (Swagger served, accurate, UI loads — independent re-assertion)
- AC-7 (swag dev-only; go.mod unchanged)

## skill_hint

`mellifera-build`, `grounding`, `stack-patterns`
