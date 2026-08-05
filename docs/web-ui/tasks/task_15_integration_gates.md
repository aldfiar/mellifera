# Task 15 — integration: black-box `integration_web_test.go` (AC-1..AC-7) + gates-green node-free probe

- **Type:** coder (integration + gates)
- **Step:** 15 (Outline)
- **Seams:** all (S-roles, S-routing, S-list-libraries, S-get-item, S-admin-status, S-swag, S-web-embed, S-web-swagger, S-compose, S-makefile, S-placeholder-dist)
- **AC trace:** AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7
- **Project scope:** `.` (root; CREATE a repo-root integration test, mirroring `integration_test.go`/`integration_pipeline_test.go`/`qa_auth_test.go`)
- **Deps:** Tasks 01-14 (the whole feature)
- **Estimated LOC:** ~150 (L) — split into focused subtests, not one giant func

## behaviors

- **B1 (AC-1 roles):** boot the composed handler (`web.Handler(api.New(deps), opts)` OR the server binary); admin token → all 6 routes succeed; a synthetic `Principal{Role:RoleClient}` (injected via a test-only context wrapper) → browse routes 200, admin routes 403. | ac: AC-1 | kind: normal
- **B2 (AC-1 401):** no/wrong token → 401 `unauthenticated` on `/api/v1/*` (regression — existing behavior preserved). | ac: AC-1 | kind: edge
- **B3 (AC-2 swagger):** `GET /openapi.yaml` → 200 `application/yaml` + the AC-2 verify probe (`grep -cE '(/libraries|/items|/admin/status)' ≥ 6`); `GET /openapi.json` → 200 json; `GET /docs/` → 200 html (Swagger UI). | ac: AC-2 | kind: normal
- **B4 (AC-2 public):** `/openapi.yaml` + `/docs/` are reachable with NO auth header (200, not 401) — the public-contract surface. | ac: AC-2 | kind: normal
- **B5 (AC-3 list):** `POST /api/v1/libraries` ×2 → `GET /api/v1/libraries` (admin token) → 200 `librariesResponse` listing both, `id ASC`, fields round-trip; empty-store case → `{"items":[]}`. | ac: AC-3 | kind: normal
- **B6 (AC-4 item):** a `ready` item (via `store.PutItem` or a scan) → `GET /api/v1/items/{id}` → 200 `itemResponse` with the FULL document (deep-equal — sources/view/provenance/stages, precision preserved); `GET /api/v1/items/nonexistent` → 404 `not_found`. | ac: AC-4 | kind: normal
- **B7 (AC-5 status):** `GET /api/v1/admin/status` (admin) → 200 `statusResponse` with the 3 plugins (`base-scanner`/`tv-parser`/`image-enricher`) + enrich snapshot; a `Deps.Status == nil` build → 503 `unavailable`; a synthetic client principal → 403. | ac: AC-5 | kind: normal
- **B8 (AC-6 embed):** `GET /` → 200 `text/html` (embedded index.html) + `Cache-Control: no-cache`; `GET /assets/app.js` → 200 + `Cache-Control` contains `immutable`; `GET /some/client/route` → 200 text/html (SPA fallback); `GET /assets/missing.js` → 404. | ac: AC-6 | kind: normal
- **B9 (AC-6 public-spa):** `/` reachable with NO auth header (200, not 401). | ac: AC-6 | kind: normal
- **B10 (AC-7 gates):** `make build && make check` exit 0 on the dev host (node-free probe — the committed `web/dist/` + `openapi.*` + `swagger-ui/` embed without `node`); `git diff 58a1130 HEAD --stat -- proto/ pkg/sdk/ internal/scan/ internal/enrich/ internal/plugin/ internal/module/` → EMPTY (additive); `go.mod`/`go.sum` unchanged. | ac: AC-7 | kind: normal

## invariants

- **INV-black-box:** the test exercises the composed handler (or the booted binary) over HTTP ONLY — no internal-package white-box calls (mirrors `integration_test.go`/`qa_auth_test.go`). Assertions are on HTTP status + headers + JSON bodies.
- **INV-test-only-client-role:** the synthetic `Principal{Role:RoleClient}` is injected by a test-only middleware that OVERWRITES the context Principal. NO production resolver mints `RoleClient` (AC-1: "client role denied admin actions" via the gate, not via a real credential).
- **INV-gates-probe-is-structural:** the AC-7 probe is run as a `t.Run` that shells out to `make build && make check` (via `exec.Command`) OR is documented as a manual verify step if the test environment lacks `make`. The additive `git diff --stat` check is a structural assertion (`exec.Command("git","diff","--stat",...)` over the proto/sdk/scan/enrich/plugin/module paths).

## precondition

Tasks 01-14 landed: the full Phase-1 feature is implemented. The repo-root integration-test pattern exists (`integration_test.go`, `integration_pipeline_test.go`, `integration_async_test.go`, `integration_image_test.go`, `qa_auth_test.go` — black-box, stdlib `net/http`). `make build` + `make check` are green at HEAD.
- evidence: `integration_test.go`, `qa_auth_test.go:39` (`api.New` pattern); `docs/web-ui/acceptance.md AC-1..AC-7` (the behavior source); `docs/web-ui/source_baseline.md §Test inventory`.

## postcondition

`integration_web_test.go` exists at repo root, black-box, asserting AC-1..AC-7 (the 10 behaviors above). `go test ./...` green. `make build && make check` green on the dev host (node-free). The Phase-1 acceptance is verified end-to-end.

## test_seed

This task IS the test. Structure: a `setupWebTest(t)` helper that opens a temp store, loads the 3 plugins (OR stubs via a nil/empty plugin set if the binary plugins aren't available in CI — guard with `testing.Short()`), builds `api.Deps` with a `Status` closure, composes `web.Handler(...)`, returns the handler + admin token. Sub-tests `t.Run("ac1_roles", ...)`, `t.Run("ac2_swagger", ...)`, ... `t.Run("ac7_gates", ...)` each asserting the behaviors above. The AC-7 gates sub-test runs `exec.Command("make","build")` + `exec.Command("make","check")` + the `git diff --stat` additive probe (skip if `testing.Short()`). The client-role injection uses a wrapping middleware that sets `context.WithValue(r.Context(), principalKey{}, Principal{Role:RoleClient})` — same pattern as Task 08's unit test but driven through HTTP.

## callers_to_update

- (none — this is a new test file. It consumes the public `web.Handler` + `api.New` + `api.Deps`.)

## allowed_imports

- `context`, `encoding/json`, `net/http`, `net/http/httptest`, `os`, `os/exec`, `path/filepath`, `strings`, `testing`
- `github.com/mellifera/mellifera/internal/api`, `github.com/mellifera/mellifera/internal/store`, `github.com/mellifera/mellifera/internal/web` (the composed handler under test)

## allowed_categories

- `stdlib`

## test_exclusions

- (this IS the test file — no exclusions.)

## negative_examples

- DO NOT white-box internal api handlers (INV-black-box — HTTP only).
- DO NOT mint a real `RoleClient` credential (INV-test-only-client-role — synthetic context injection only).
- DO NOT skip the AC-7 additive `git diff --stat` probe (it is the load-bearing "additive where claimed" assertion — acceptance AC-7 verify probe).
- DO NOT depend on `node`/`npm`/`swag` in any sub-test (the AC-7 probe asserts node-free).

## existing_code_snapshot

```go
// qa_auth_test.go:39 (the api.New composition pattern this test mirrors at the web.Handler level)
handler := api.New(api.Deps{
	AdminToken: adminToken,
	Store:      st,
	// ...
})

// integration_test.go pattern (black-box server boot + HTTP assertions — the style to follow)
// - opens a temp store, builds the handler, fires real HTTP requests, asserts status + JSON bodies.
```

## contract_test_scope

- **joint (all seams):** the end-to-end Phase-1 acceptance. Every seam's joint contract is asserted here at the HTTP edge. This task is the integration keystone the other tasks' contract tests feed into.

## scope_boundary

- CREATE `integration_web_test.go` (repo root; black-box).

## out_of_scope

- In-package unit tests (those live with Tasks 02-12).
- A React/UI test (Phase 2).
- CI workflow files (separate concern; the AC-7 probe is in-test).

## line_budget

150 (flex 1.3 — 10 subtests × ~15 lines)

## acceptance_criteria

- AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7 (all Phase-1 acceptance — this task is the integration keystone)

## refactoring_checklist

- `test -f integration_web_test.go` → exit 0.
- `grep -cE 't\.Run\("ac[1-7]' integration_web_test.go` → ≥7 (one sub-test per AC).
- `cd mellifera && go test -run TestWeb_Integration ./... -v` green (or the chosen test name).
- `cd mellifera && make build && make check` exit 0 (AC-7 verify probe).
- `git diff 58a1130 HEAD --stat -- proto/ pkg/sdk/ internal/scan/ internal/enrich/ internal/plugin/ internal/module/` → EMPTY (additive — assert in-test via `exec.Command("git",...)` OR document as the manual verify).
- `git diff 58a1130 HEAD -- go.mod go.sum` → EMPTY.
- `./.claude/skills/mellifera-build/scripts/check.sh` OK.

## source_anchor

CREATE `integration_web_test.go` (repo root, sibling to `integration_test.go`/`qa_auth_test.go`). Pattern: `qa_auth_test.go:39` + `integration_test.go`. Contract: `docs/web-ui/acceptance.md AC-1..AC-7` + `integration_map.md` (all seams).

## skill_hint

`mellifera-build`, `grounding`, `stack-patterns`
