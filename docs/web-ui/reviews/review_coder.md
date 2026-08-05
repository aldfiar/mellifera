# Code Review — web-ui (Phase 1: API + roles + Swagger + embed scaffold)

- **Reviewer:** @wf-reviewer | **Model:** glm-5.2 (large tier)
- **Feature:** web-ui | **Branch:** `feature/web-ui` (off `main` @ `58a1130`)
- **Source model:** coder phase (state.json `model_provenance` not set; coder handoff in `.phase_cache/`)
- **Scope:** all 15 coder tasks (T01-T15); QA/docs tasks out of scope here
- **Method:** independent re-build + per-task spec cross-ref + golden-rule AC re-derivation (read-only; no code edits)
- **Verdict:** **PROCEED** (all gates green, all 15 tasks PASS, all 7 ACs met, all 6 deviations ACCEPT)

---

## 0. Gate Re-Verification (independently re-run, read-only)

| Gate | Command | Result |
|---|---|---|
| format | `gofmt -l .` | **clean** for web-ui source. One hit — `.claude/skills/mellifera-build/module-template/doc.go` — is a pre-existing skill asset NOT in web-ui scope (confirmed: not touched by this feature). |
| build | `CGO_ENABLED=0 go build ./...` | **exit 0** |
| plugin build | `make build-plugin` | **exit 0** — base-scanner, tv-parser, image-enricher all build |
| test | `go test ./...` | **ALL PASS** (incl. root pkg 42.5s, formerly-blocked `TestQA_AdditiveContract_…` + `TestB2_Ac3Additive`, and all new web-ui tests) |
| lint | `golangci-lint run ./...` | **exit 0** (funlen/gocognit/gocyclo/lll/depguard/dupl) |
| vet | `go vet ./...` | **exit 0** |
| build gate | `bash .claude/skills/mellifera-build/scripts/check.sh` | **OK** (exported-symbol count: api=7 ≤8, web=2 ≤3) |
| integration keystone | `go test -run TestWeb_Integration -v .` | **PASS** — all 7 sub-tests (ac1..ac7) green |

### Go gate is node-free (AC-7 hard requirement)

`Makefile` confirms `build`/`test`/`lint`/`check` are pure `go build`/`go test`/`golangci-lint`/`check.sh` — **none invoke `node`/`npm`/`swag`**. The only target touching the swag/js toolchain is `web-build` (`swag init …`), which is **intentionally NOT a prerequisite of any other target** (Makefile comment: "INV-node-free-gate"). The Swagger UI is served via the Go module `github.com/swaggo/http-swagger` (no vendored js tree at build time); the committed `internal/web/api/openapi.{yaml,json}` + `internal/web/dist/*` are what the Go gate embeds. Confirmed by running the full gate on this host with no swag-in-path dependency.

---

## 1. Per-Task Validation (T01-T15)

All postconditions cross-referenced against each `tasks/task_NN_*.md` spec and the live source. **15/15 PASS.**

### T01 — placeholder dist + web/README.md — PASS
- `internal/web/dist/index.html` (hand-written Phase-1 SPA shell, `<!DOCTYPE html>`…`<title>Mellifera</title>`) + `internal/web/dist/assets/app.js` (Apache-2.0 header placeholder) committed; `web/README.md` describes the Phase-2 Vite/TS app and the `go:embed` invariant.
- Enables AC-6: `web.go` reads `dist/index.html` via `mustReadIndex()` (panics loudly if missing — fail-fast at startup, not per-request).

### T02 — store.ListLibraries — PASS
- `internal/store/libraries.go:68` `func (s *Store) ListLibraries(ctx) ([]Library, error)` — `SELECT … FROM libraries ORDER BY id` (parameterized; no user interpolation), non-nil empty slice (`make([]Library, 0)`), `rows.Err()` checked, `defer rows.Close()`.
- Test `store_test.go:121 list_ordering_and_empty` asserts empty→non-nil `[]`, id-ASC ordering, seeded rows present. Signature + postconditions match contracts.md exactly.

### T03 — api roles types — PASS
- `router.go:39` `type Role string`; consts `RoleAdmin="admin"`, `RoleClient="client"`; `router.go:57` `Principal{Role Role}`; `IsAdmin()` (canonical) + deprecated `Admin()` (mirrors IsAdmin for the legacy reader). INV3 (Principal is a type, not a bool gate) holds — handlers never branch on Role.
- `doc.go` updated with INV1-INV5 + the 7-symbol public-API list.
- Test `roles_test.go TestPrincipal_IsAdmin` matrix over admin/client/empty/unknown.

### T04 — authMiddleware + requireRole — PASS
- `middleware.go:32 authMiddleware` — constant-time `subtle.ConstantTimeCompare`, resolves `Principal{Role:RoleAdmin}`, 401 canonical body on miss; `principalKey{}` context key is unexported (INV3).
- `middleware.go:56 requireRole(roles…)` — positive-membership authZ, **default-deny** (empty/unknown role → 403, empty roles set fails closed), reads Principal from context, 403 canonical body.
- Test `middleware_test.go:78 TestRequireRole` — 7-case matrix incl. `client_denied_by_admin_only`, `unknown_role_denied`, `empty_role_denied_default_deny`, `empty_allow_set_fails_closed`. authN-then-authZ ordering intact.

### T05 — listLibraries handler + DTOs — PASS
- `handlers.go:249 listLibraries` — `store.ListLibraries → librariesResponse` (pure delegation, INV1); `toLibraryDTOs` boundary conversion (INV4). `GET /libraries` mounted in browse group.
- DTOs `libraryDTO`/`librariesResponse` unexported, json-tagged.
- Tests `router_test.go:187 list_libraries` + `:232 list_libraries_empty`.

### T06 — getItem handler + 404 — PASS
- `handlers.go:272 getItem` — `chi.URLParam(r,"id")` (string UUID, not int-parsed) → `store.GetItem` → `itemResponse{Item: toItemDTO(it)}`. Missing row: `errors.Is(err, sql.ErrNoRows)` → 404 `not_found`; other error → 500.
- `itemDTO.Document json.RawMessage` carries the FULL §3.1 document opaque (INV-full-document — no projection).
- Tests `router_test.go:258 get_item_full_document` + `:319 get_item_not_found`.

### T07 — adminStatus handler + AdminStatus/DTOs — PASS
- `handlers.go:298 adminStatus` — `deps.Status(ctx)` closure call (pure delegation). **Nil-safe**: `a.deps.Status == nil` → 503 `unavailable`; closure error → 500 `internal_error`; success → `statusResponse`.
- `AdminStatus` (api-local aggregate), `PluginHealth`/`EnrichStats` (exported seam inputs, BLK-T13-1 fix), `statusResponse` (unexported wire envelope — INV4).
- Tests `admin_status_test.go`: `admin_status_nil_returns_503`, `admin_status_happy` (round-trip), `admin_status_error_returns_500`. All three paths covered.

### T08 — router role groups — PASS
- `router.go:96 mountV1Routes` — **browse group** `requireRole(RoleAdmin, RoleClient)`: `GET /libraries`, `GET /items`, `GET /items/{id}`. **admin group** `requireRole(RoleAdmin)`: `POST /libraries`, `POST /libraries/{id}/scan`, `GET /admin/status`. No handler forks on Role (INV-no-handler-fork).
- `mountV1Routes` extracted (unexported) so production `New` (behind authMiddleware) and the role-gating test (behind `principalInjector`) exercise the SAME wiring.
- Test `role_gating_test.go TestNew_RoleGating` — 6-case matrix over the real `mountV1Routes` asserting admin→pass / client→403-forbidden on every route, + 403 body `code=="forbidden"`, + real-`New` admin-token passes both groups.

### T09 — swag annotations + general-info — PASS
- All 6 handlers carry `@Summary/@ID/@Router/@Param/@Success/@Failure` annotations (verified in handlers.go: createLibrary, scanLibrary, listItems, listLibraries, getItem, adminStatus). Annotations are comment-only (INV1 preserved — no executable logic).
- `doc.go:9-14` general-info block (`@title/@version/@description/@license.name/@host/@BasePath`).

### T10 — swag codegen + vendor UI + NOTICE — PASS
- `internal/web/api/openapi.yaml` + `openapi.json` committed (code-generated; `operationId` values match the handler `@ID`s — confirmed not hand-written). swag output dir is `internal/web/api/` (swag `-o`, avoiding `docs/`).
- Swagger UI served via the `github.com/swaggo/http-swagger` Go module (not a vendored static tree). `NOTICE` updated with the Apache-2.0 Swagger UI attribution (SmartBear) + the swag codegen note.

### T11 — web Handler + embed + cache + SPA fallback — PASS
- `web.go:45 Handler(apiHandler, opts)` — `//go:embed all:dist`; `/api/*` mount (skipped when apiHandler nil); `/` → no-cache index; `/assets/*` → immutable (`public, max-age=31536000, immutable`); `NotFound` → SPA fallback for non-`/assets/` paths, **404 fail-fast for broken `/assets/` URLs** (no paper-over).
- `Options.DevMode` collapses cache to no-cache (Vite dev proxy). `contentTypeFor` inlined (no `mime` import — stays in allowed set). 2 exported symbols (`Handler`, `Options`) ≤3.
- Tests `web_test.go`: `TestHandler_SPAAndCache`, `TestHandler_DevMode`, `TestHandler_Swagger`, `TestHandler_SwaggerNotFallback`.

### T12 — swagger serve — PASS
- `swagger.go` — `//go:embed api/openapi.yaml` + `api/openapi.json`; `registerSwagger` mounts `/openapi.yaml` (application/yaml), `/openapi.json` (application/json), `/docs/*` (httpSwagger UI pointed at `/openapi.json`, deep-linking). Registered **ahead of** the SPA fallback so `/openapi.*` + `/docs` never leak index.html. All three public (no auth — INV-public-contract).

### T13 — cmd wiring + Deps.Status closure + MELLIFERA_WEB_DEV — PASS
- `cmd/mellifera/main.go:86` defines `pluginIDs := []string{"base-scanner","tv-parser","image-enricher"}` ONCE near the load block (DRY); `main.go:141 statusClosure` iterates it, maps `plugin.Health→api.PluginHealth` (RFC3339 at edge), reads `enrichQueue.Stats()→api.EnrichStats`. **Best-effort**: per-plugin `Status` error → `slog.Warn` + `continue` (omits that one entry, does NOT fail the snapshot — B3). Closure built in package main (cmd/mellifera) → **api imports neither plugin nor enrich (INV2 confirmed by grep)**.
- `main.go:185 web.Handler(apiHandler, web.Options{DevMode: cfg.webDev})` — single top-level handler (INV-single-handler, no second http.Server). `MELLIFERA_WEB_DEV` via `envBool` (INV-env-defaults).

### T14 — Makefile web-build (dev-only) — PASS
- `Makefile:56 web-build` runs `swag init …` (Phase-2 Vite build commented out). Heavily documented as dev/CI-only; NOT a prerequisite of `build`/`check`/`lint`/`test`. Mirrors the `proto`/`build-plugin` regen-target pattern.

### T15 — integration keystone (AC-1..AC-7) — PASS
- `integration_web_test.go TestWeb_Integration` — black-box (`package mellifera_test`), assertions on HTTP status/headers/bodies only. 7 sub-tests (ac1_roles, ac2_swagger, ac3_list, ac4_item, ac5_admin_status, ac6_embed, ac7_gates) — all PASS. `ac7_gates` runs `make build && make check` (node-free) + the `git diff 58a1130 HEAD -- proto/ pkg/sdk/ internal/scan/ internal/enrich/ internal/plugin/ internal/module/` additive probe (empty).
- `deepEqualJSON` helper preserves precision for the AC-4 full-document assertion. 3 grounding-driven deviations documented in the file header (adjudicated in §3 below).

---

## 2. Acceptance Re-Derivation (golden rule — independently derived)

| AC | Re-derived requirement | Evidence | Result |
|---|---|---|---|
| **AC-1** roles gating | browse routes accept admin+client; admin-only routes accept admin, reject client with 403; authN (401) precedes authZ | `mountV1Routes` browse/admin groups + `requireRole` default-deny; `TestNew_RoleGating` matrix asserts client→403 on all 3 admin routes via real wiring; `TestWeb_Integration/ac1_roles` asserts admin→all 6 routes + no/wrong token→401 | **MET** |
| **AC-2** swagger served + accurate + UI loads | `/openapi.{yaml,json}` public + list every endpoint/DTO; `/docs/` HTML; code-generated | `swagger.go` serves both; `openapi.yaml` has **6 operationIds** (admin-status, list-items, get-item, list-libraries, create-library, scan-library) across **5 path keys** (/libraries carries 2 ops); `/docs/*` via httpSwagger; `@ID`↔operationId proves code-gen; `ac2_swagger` verifies all | **MET** |
| **AC-3** GET /libraries | 200 `{items:[{id,module_id,root_path,display_name}…]}`, all libs, id ASC | `ListLibraries` ORDER BY id; `list_libraries` + `list_libraries_empty` tests; `ac3_list` (empty→`{"items":[]}`, 2 libs id ASC) | **MET** |
| **AC-4** GET /items/{id} detail | 200 with full document (sources/_view/_provenance/_stages, precision preserved); 404 on missing | `getItem` returns `itemDTO.Document` opaque; `ac4_item` deep-equals the full document + asserts 404 `not_found` | **MET** |
| **AC-5** GET /admin/status populated | 200 plugin health (state/restarts/last_checked_at) + enrich snapshot (pending/in_flight/done/failed); admin-only; closure-built, api import-free | `statusClosure` in main.go; `adminStatus` handler; `ac5_admin_status` round-trips 3 plugins + enrich via exported seam types + nil→503 | **MET** |
| **AC-6** embed/cache/SPA-fallback | `/`→200 text/html no-cache; `/assets/*`→immutable; client route→index.html; single-binary | `web.go` embed + cacheControl + NotFound fallback; `ac6_embed` asserts all 4 (+ `/assets/missing.js`→404) | **MET** |
| **AC-7** node-free gate + additive + pure-delegation | make build/check/lint/test pass w/o node; proto/sdk/scan/enrich byte-identical; api≤8 exported | gate re-verified §0; additive diff **EMPTY** (§4); api=7≤8; handlers pure-delegation | **MET** |

---

## 3. Deviation Adjudication

All 6 flagged deviations **ACCEPT**. Each is grounding-justified, documented in `state.json.key_decisions` and the source file headers, and consistent with the delegation block's authorized exceptions.

### D1 — BLK-T13-1 fix (Option A): exported `PluginHealth` + `EnrichStats`; `AdminStatus` retyped — **ACCEPT**
- **Issue:** the `Deps.Status` closure is built in package main (cmd/mellifera) and consumed by the external integration test, so `AdminStatus` must be constructible cross-package. The originally-specced unexported `pluginHealthDTO`/`enrichStatsDTO` could not be named from outside api.
- **Fix applied:** exported `PluginHealth` + `EnrichStats` carry the JSON tags; the unexported DTOs were subsumed (deleted); `AdminStatus` fields retyped to `[]PluginHealth`/`EnrichStats`; the wire envelope `statusResponse` **stayed unexported (INV4 intact)**.
- **Wire shape unchanged?** YES — `statusResponse{Plugins []PluginHealth \`json:"plugins"\`, Enrich EnrichStats \`json:"enrich"\`}`; `PluginHealth` fields carry `id/state/restarts/checked_at`, `EnrichStats` carry `pending/in_flight/done/failed` — byte-identical to what the unexported DTOs would have serialized. Verified by `ac5_admin_status` round-trip.
- **Symbol budget:** api 5→7 (≤8 held; doc.go INV5 updated). This was the correct fix — the alternative (unexported DTOs + a per-field copy in the handler) would have required api to expose a constructor or break the cross-package closure.

### D2 — `swaggo/http-swagger` Go dependency (T12) — **ACCEPT**
- The first new Go runtime dep; web-ui legitimately adds it for Swagger UI serving. `go.mod` change is the orchestrator-authorized exception (the repo-wide "go.mod unchanged" historical guards were retired — see D-related test edits below).
- **Precise go.mod diff:** the ONLY new direct dep is `github.com/swaggo/http-swagger v1.3.4`. `chi v5.3.1` and `modernc.org/sqlite v1.55.0` were promoted `// indirect`→direct by `go mod tidy` (NO version change — they were already used directly by api/store). New transitive indirects (go-openapi/*, swaggo/swag, swaggo/files, KyleBanks/depth, easyjson, etc.) all flow from http-swagger. Two minor indirect bumps (x/net 0.55→0.56, x/text 0.37→0.38) are non-contract utility libs.
- Historical-guard retirement: `qa_image_regression_test.go` (B2 AC-3) dropped `internal/api/` from its no-seam list (web-ui now extends api source) and retired the AC-2 go.mod-constant probe; `qa_pipeline_regression_test.go` dropped `go.mod`/`go.sum` from its additive probe. Both keep `proto/` (and B2 keeps `enrich/sdk`) guarded. Consistent + authorized.

### D3 — `mountV1Routes` test seam (T08) — **ACCEPT**
- The client-role 403 path is NOT constructible from the external integration test (`api.principalKey` is unexported; no resolver mints RoleClient). The coder extracted the real route wiring into unexported `mountV1Routes` and tests it in-package via `principalInjector` (overwrites the context Principal with a synthetic role) — **exercising the SAME wiring `New` calls**, not a duplicate.
- `TestNew_RoleGating` genuinely asserts client→403-forbidden (body `code=="forbidden"`) on all 3 admin routes + admin→pass on browse. Sound: widening api's surface with a test-only injector would have violated the ≤8 budget for no behavioral gain.

### D4 — T15 spec path-key grep miscount (5 paths / 6 operations) — **ACCEPT**
- acceptance.md's verify probe `grep -cE '(/libraries|/items|/admin/status)' >= 6` counts path-key LINE occurrences, not operations. The code-generated spec has **5 distinct path keys** carrying **6 operations** (`/libraries` carries both POST create + GET list). Verified directly: `grep -c operationId` = 6; path keys = `/admin/status`, `/items`, `/items/{id}`, `/libraries`, `/libraries/{id}/scan`.
- The coder asserted the TRUE invariant (all 5 path keys + ≥6 operationIds present). The acceptance intent (spec names every real route) is fully met; only the imprecise probe was corrected.

### D5 — T13 Deps.Status closure (best-effort, 3 plugin IDs) — **ACCEPT**
- `statusClosure` iterates the canonical `pluginIDs` slice (defined once near the load block — DRY), maps `plugin.Health→api.PluginHealth`, reads `enrichQueue.Stats()`. A per-plugin `Status` error omits that entry (`continue` + `slog.Warn`) rather than 500-ing `/admin/status` over one bad plugin (B3 best-effort).
- **INV2 confirmed:** the closure lives in `cmd/mellifera/main.go` (package main), NOT in api. `grep mellifera/internal/ internal/api/*.go` shows api imports only `internal/store` + `internal/scan` — neither `plugin` nor `enrich`.

### D6 — `Deps.Scan` import in `integration_web_test.go` (T15) — **ACCEPT**
- The test imports `internal/scan` to build the `Deps.Scan` stub (`scan.Result` is the closure return type — cannot be named without the import). **G5 grounding:** the sibling repo-root test `qa_auth_test.go` imports `internal/scan` for exactly the same reason. Structural necessity, not an invented API. T15's `allowed_imports` under-listed it.

---

## 4. Invariant & Additive Audit

### AC-7 additive probe (the hard invariant)
```
git diff 58a1130 -- proto/ pkg/sdk/ internal/scan/ internal/enrich/ internal/module/ --stat
→ (empty, 0 lines)
```
Also verified via the integration test's `ac7_gates` additive probe (which additionally includes `internal/plugin/` — also empty). proto/sdk/scan/enrich/plugin/module are **byte-identical** to the 58a1130 baseline. web-ui touched only: `Makefile`, `NOTICE`, `cmd/mellifera/main.go`, `go.mod`/`go.sum`, `internal/api/*`, `internal/store/{libraries,store_test}.go`, `internal/web/*` (new), `web/README.md` (new), `integration_web_test.go` (new), the two `qa_*_regression_test.go` guard-retirements, and `docs/web-ui/`.

### api invariants
- **INV1 (pure delegation):** every handler is parse → ONE domain call → write. No branching/orchestration. funlen≤60, gocognit≤15 (golangci-lint green).
- **INV2 (no plugin/enrich/module/web import):** `go list -f '{{.Imports}}' ./internal/api/` → `[context crypto/subtle database/sql encoding/json errors github.com/go-chi/chi/v5 github.com/mellifera/mellifera/internal/scan github.com/mellifera/mellifera/internal/store net/http strconv]`. Clean. (scan is pre-existing — `Deps.Scan` uses `scan.Result`.)
- **INV3 (Principal is a type):** Role/Principal/IsAdmin; handlers read context via unexported helper; no handler forks on Role.
- **INV4 (no domain type over wire):** all DTOs unexported; store.Item→itemDTO, store.Library→libraryDTO boundary conversions; `statusResponse` wire envelope unexported; exported `PluginHealth`/`EnrichStats` are plain api-local structs (no plugin.Health/enrich.Stats over the wire).
- **INV5 (≤8 exported symbols):** api = **7** (Deps, Principal, New, Role, AdminStatus, PluginHealth, EnrichStats); web = **2** (Handler, Options). Both within budget.

### Other constraints
- **No reflect / no DI:** all `reflect` references are in generated `proto/**/*.pb.go` (additive-guarded, byte-identical to baseline) and doc-comment text. depguard denies `reflect` + `wagon`; golangci-lint exit 0.
- **Parameterized SQL:** `ListLibraries` (no args, `ORDER BY id` only), `GetItem`/`CreateLibrary` use `?` placeholders — no string interpolation of user input.
- **Apache-2.0 headers:** every new `.go` file carries the SPDX short-form header; `NOTICE` updated for Swagger UI.
- **Single-binary preserved:** one `http.Server`, SPA embedded via `go:embed`, no separate frontend server at runtime.

---

## 5. Overall Verdict

### **PROCEED**

- 15/15 coder tasks **PASS**.
- AC-1..AC-7 independently re-derived and **all MET**.
- All 6 flagged deviations **ACCEPT** (each grounding-justified, documented, within authorized exceptions).
- Full gate green and **node-free**; AC-7 additive probe empty; INV1-INV5 + symbol budgets hold.
- **Zero P0 / P1 findings.** No blockers for the downstream phases.

### Next steps
- Hand off to **health-check (@wf-auditor)** for the changed-files health sweep, then **QA** (QA1-QA4) + **docs** (DOCS1-DOCS2) per the pipeline. The reviewer raises no coder re-work; the integration keystone + in-package tests already cover the AC surface QA will widen.
- NOTE for QA: the AC-1 client-role 403 distinction is covered in-package (`role_gating_test.go`); QA1 may optionally add an external black-box client-role injection if a Phase-2 resolver makes it reachable, but it is NOT a gap today (the seam is sound and tested at the wiring layer).
