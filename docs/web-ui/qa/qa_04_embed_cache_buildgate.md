# QA 04 — Embed/cache/fallback + build-gate node-free (independent acceptance re-derivation)

> **Status: DONE** (2026-08-05). Non-redundant slice written: `qa_embed_buildgate_test.go` — `TestQA_AssetEmptyNameGuard404` (the `name==""` guard in serveAsset, distinct from the /assets/missing.js ReadFile-error path) + `TestQA_BuildGateNodeFreeDryRun` (the load-bearing AC-7 invariant: `make -n build|check|test|lint` contain no node/npm/swag/web-build, with positive checks the recipes still run go build/check.sh/go test/golangci-lint — holds regardless of host node presence; explained skips under testing.Short/make-absent mirror `integration_web_test.go::ac7_gates`). SPA cache/fallback/dev-mode, make build+check exit 0, additive probe, check.sh proven by `web_test.go`/`integration_web_test.go::ac6/ac7_gates` and referenced. Budget: 1 boundary + 1 property.

- **Type:** QA (integration + structural/build-gate)
- **AC trace:** AC-6 (embed/delivery), AC-7 (build-gate/additive)
- **Validates tasks:** T01 (placeholder dist), T11 (web Handler embed/fallback/cache), T13 (cmd composition), T14 (Makefile web-build), T15 (integration — this QA re-derives the AC-6/AC-7 slice independently)
- **joints_targeted:** web-embed↔go:embed (dist served), web↔cmd (composition), Makefile↔committed-artifacts (gate consumes embedded bytes, not node)
- **mock_boundaries:** NONE — use the REAL `web.Handler` with the REAL committed `internal/web/dist/*` embedded. The build-gate probe runs the REAL `make build`/`make check` via `exec.Command` (skip under `testing.Short()`).

## behavior_coverage (independently re-derived from acceptance.md AC-6/AC-7)

| B-id | behavior | covered_by |
|---|---|---|
| AC6-B1 | `GET /` → 200 `text/html` (embedded index.html) | qa4_t1_root_served |
| AC6-B2 | `/assets/*` → `Cache-Control: public, max-age=31536000, immutable` | qa4_t2_asset_cache_immutable |
| AC6-B3 | `index.html` → `Cache-Control: no-cache` | qa4_t1_root_served (header check) |
| AC6-B4 | SPA fallback: unknown non-api/openapi/docs path → index.html 200 | qa4_t3_spa_fallback |
| AC6-B5 | real asset miss (`/assets/missing.js`) → 404 (no fallback) | qa4_t4_asset_miss_404 |
| AC6-B6 | nil apiHandler supported (SPA alone) | qa4_t1_root_served (nil-api variant) |
| AC6-B7 | `Options.DevMode` relaxes cache (no-cache everywhere) | qa4_t5_dev_mode |
| AC6-B8 | single-binary preserved (one binary serves API+SPA+Swagger) | qa4_t6_single_handler (structural) |
| AC7-B1 | `make build` exit 0, node-free | qa4_t7_build_gates_green |
| AC7-B2 | `make check` exit 0, node-free | qa4_t7_build_gates_green |
| AC7-B3 | proto/sdk/scan/enrich byte-identical vs 58a1130 (additive) | qa4_t8_additive_probe |
| AC7-B4 | `go.mod`/`go.sum` unchanged | qa4_t8_additive_probe |
| AC7-B5 | `make web-build` exists + NOT a prereq of build/check | qa4_t9_webbuild_dev_only (structural) |
| AC7-B6 | api ≤8 exported symbols (4 after Phase 1) | qa4_t10_symbol_budget (structural) |

`uncovered_behaviors:` none.

## tests (≤4 joint + 2 boundary + 1 property — note: the build-gate probes are structural/exec, counted as boundary/property)

- **qa4_t1_root_served** (joint): `web.Handler(nil, Options{})` → `GET /` → 200 + `text/html` + `Cache-Control: no-cache` + body contains the placeholder marker (e.g. `<script src="/assets/app.js">`). Re-run with a non-nil api handler → same SPA result (api handler is opaque to `/`).
- **qa4_t2_asset_cache_immutable** (joint): `GET /assets/app.js` → 200 + `Cache-Control` contains `immutable` + `max-age=31536000`.
- **qa4_t3_spa_fallback** (joint): `GET /some/client/route` (a path with no static asset, not under `/api`/`/openapi`/`/docs`) → 200 + `text/html` (index.html served as fallback).
- **qa4_t4_asset_miss_404** (boundary): `GET /assets/nonexistent.js` → 404 (NOT fallback — fail fast on broken hashed URLs).
- **qa4_t5_dev_mode** (boundary): `web.Handler(nil, Options{DevMode:true})` → `GET /assets/app.js` → `Cache-Control: no-cache` (immutable header suppressed); `GET /` → `no-cache`.
- **qa4_t6_single_handler_property** (property, structural): `grep -c 'http.Server{' cmd/mellifera/main.go` == 1 (single binary, single top-level handler — `web.Handler` composes api+spa+swagger).
- **qa4_t7_build_gates_green** (property, exec): `exec.Command("make","build")` + `exec.Command("make","check")` in `mellifera/` → both exit 0. Skip if `testing.Short()`. Document the node-free expectation (the host running this may have node; the assertion is the COMMANDS succeed, which they do because `make build`/`check` never invoke node).
- **qa4_t8_additive_probe** (property, exec/structural): `exec.Command("git","diff","--stat","58a1130","HEAD","--","proto/","pkg/sdk/","internal/scan/","internal/enrich/","internal/plugin/","internal/module/")` → stdout EMPTY; same for `go.mod`/`go.sum`. Skip if not on `feature/web-ui` or if `58a1130` absent.
- **qa4_t9_webbuild_dev_only** (property, structural): `grep -n 'web-build' Makefile` ≥ 1; AND `make -n build` + `make -n check` output does NOT contain `web-build`/`node`/`npm`/`swag`.
- **qa4_t10_symbol_budget** (property, structural): `./.claude/skills/mellifera-build/scripts/check.sh` exit 0; AND `grep -c 'func [A-Z]\|type [A-Z]\|^var [A-Z]' internal/api/*.go` ≤ 8 (api budget); `internal/web` ≤ 3.

## refactoring_validation

- `grep -n 'go:embed all:dist' internal/web/web.go` → 1 hit.
- `test -f internal/web/dist/index.html && test -f internal/web/dist/assets/app.js` → exit 0 (committed placeholder present).
- `make -n build | grep -E 'node|npm|swag|web-build'` → EMPTY (node-free gate).

## scope_boundary

- CREATE `qa_embed_buildgate_test.go` (repo root).

## out_of_scope

- Roles-gating (QA1).
- Swagger serve (QA2).
- The 3 endpoint data shapes (QA3).

## acceptance_criteria

- AC-6 (SPA served from Go binary; cache headers; fallback — independent re-assertion)
- AC-7 (Go build gate green without node; additive; web-build dev-only)

## skill_hint

`mellifera-build`, `grounding`, `stack-patterns`
