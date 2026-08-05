# Health Check: web-ui (Phase 1)
Date: 2026-08-05 | Mode: health-check | Stack: go 1.25.3 (CGO_ENABLED=0) / chi v5
Scope: changed-files vs `58a1130` (working-tree diff + untracked new files)
Reviewer: PROCEED'd (correctness) — this audit is code-HEALTH only.

## Changed-files inventory
CREATE (untracked):
- `internal/web/` — `doc.go`, `web.go`, `swagger.go`, `web_test.go`, `dist/index.html`, `dist/assets/app.js`, `api/openapi.json`, `api/openapi.yaml`
- `integration_web_test.go` (468 lines, Task 15 keystone)
- `web/README.md` (Phase-2 dev-workflow doc)
- `internal/api/admin_status_test.go`, `internal/api/role_gating_test.go`, `internal/api/roles_test.go`

MODIFY:
- `internal/api/{handlers.go, router.go, middleware.go, doc.go, router_test.go, middleware_test.go}`
- `internal/store/{libraries.go, store_test.go}`
- `cmd/mellifera/main.go`, `Makefile`, `NOTICE`, `go.mod`, `go.sum`
- `qa_image_regression_test.go`, `qa_pipeline_regression_test.go` (go.mod-guard retirement)

Additive probe (AC-7): `git diff 58a1130 --stat -- proto/ pkg/sdk/ internal/scan/ internal/enrich/` → **empty**. Byte-identical confirmed.

## Gate re-run results (read-only)
| Gate | Result |
|---|---|
| `gofmt -l .` | clean for all feature files (sole hit `.claude/skills/mellifera-build/module-template/doc.go` — a skill template, out of scope) |
| `CGO_ENABLED=0 go build ./...` | exit 0 |
| `make build-plugin` | exit 0 (3 plugin binaries) |
| `go test ./...` | all PASS (13 packages with tests) |
| `golangci-lint run ./...` | exit 0 (funlen/gocognit/gocyclo/lll/depguard/dupl all clean) |
| `bash .claude/skills/mellifera-build/scripts/check.sh` | `check.sh: OK` (symbol counts within budget) |

**Node-free confirmation (AC-7):** `make -n build check test lint` contains **no** `node`/`npm`/`swag`. `web-build` is the only target touching the swag/js toolchain and is explicitly NOT a prerequisite of any other target (Makefile comment `INV-node-free-gate`). The Go gate embeds the committed `internal/web/{dist,api}` bytes. Confirmed node-free.

## Per-package / per-file health

### internal/web (NEW — 2 exported symbols: Handler, Options)
Clean. `Handler` composes `/api/*` → apiHandler + embedded SPA + swagger; owns no domain logic (INV1). Cache headers, SPA fallback, fail-fast 404 on missing hashed assets, and nil-apiHandler validity all verified by `web_test.go` (real behavioral assertions on status/body/headers — no tautologies). `contentTypeFor` inlines the extension map with a documented reason (stay inside the allowed import set) — acceptable, not a smell. swagger.go embeds the committed spec bytes (no runtime codegen). Apache-2.0 headers present.

### internal/api (MODIFY — 7 exported symbols: New, Deps, Principal, Role, AdminStatus, PluginHealth, EnrichStats)
Mostly clean. The 3 new GET handlers (`listLibraries`, `getItem`, `adminStatus`) are textbook pure-delegation (parse → one domain call → write); the `Deps.Status` func-field closure preserves INV2 (api imports only store/scan/chi/stdlib — verified: zero plugin/enrich/module/web imports). DTO conversions at the boundary (INV4). Tests are high-quality table-driven behavioral assertions (`admin_status_test.go`, `role_gating_test.go`, `roles_test.go` — no garbage/tautology). Two findings below (P2 dead deprecated method; P2 DRY duplication).

### internal/store (MODIFY — ListLibraries added)
Clean. Parameterized `QueryContext` with a static `ORDER BY id` clause (no interpolation — INV1). Non-nil empty slice on zero rows (documented + tested). New `list_ordering_and_empty` test is solid (empty-not-nil, id-ASC ordering, full-field round-trip on a fresh store).

### cmd/mellifera (MODIFY — statusClosure + web wiring)
Clean. `statusClosure` iterates a canonical `pluginIDs` literal (DRY — load sites + closure share it), maps `plugin.Health`→`api.PluginHealth` (RFC3339 at the edge), best-effort per-plugin (one bad plugin omits one entry, does not 500 the snapshot). `web.Handler` composes the single top-level handler. `envBool` mirrors the existing env-default pattern.

### Tests (new + modified)
Sampled all new test files + the modified store/router/middleware tests. **No garbage/tautological/pojo tests found.** `integration_web_test.go` is honestly documented (explicit "GROUNDING-DRIVEN DEVIATIONS" block, black-box HTTP-only assertions). The deprecated `Admin()` is pinned only by `roles_test.go` (see D-01).

## Findings

### P0 — none
(none)

### P1 — none
(none)

### P2 — dead-code / DRY
| ID | File:Line | Pattern | origin | Description | Fix |
|----|-----------|---------|--------|-------------|-----|
| D-01 | internal/api/router.go:66-71 | dead-code (deprecated, zero callers) | feature | `Principal.Admin()` is marked `// Deprecated: use IsAdmin.` and the comment claims it is "retained ... so the lone legacy reader can transition gradually." Repo-wide grep shows the ONLY caller is `internal/api/roles_test.go:32` (which asserts it mirrors `IsAdmin`). There is no legacy reader to transition — the `{Admin bool}`→`{Role Role}` widening happened in THIS feature, and `internal/` packages have no external compat surface. The deprecation justification is hollow; this is dead code. (Internal pkg + deprecated ⇒ P2, not P0.) | `delete` `Admin()` and the mirroring assertion at `roles_test.go:31-34`; keep `IsAdmin()` as the sole reader. |
| R-01 | internal/api/handlers.go:41-46 + 52-57 | dry-violation (duplicated knowledge) | feature | `libraryResponse` and `libraryDTO` are byte-identical structs (same 4 fields, same JSON tags: `id`/`module_id`/`root_path`/`display_name`). Two types encode the ONE wire shape of "a library" — they must drift in lockstep if a field is added/renamed. `createLibrary` uses `libraryResponse`; `listLibraries` uses `libraryDTO` via `librariesResponse`. Note the package already does this right for items: `itemResponse` reuses `itemDTO` as a field rather than re-declaring it — the library pair is a localized inconsistency. | `merge`: drop `libraryResponse`, have `createLibrary` write a `libraryDTO` (or a thin `itemResponse`-style wrapper). |

### P3 — convention drift (informational)
| ID | File:Line | Pattern | origin | Description | Fix |
|----|-----------|---------|--------|-------------|-----|
| A-01 | go.mod (require block) + conventions.md:12 | convention-breach (doc drift) | feature | conventions.md §3 states "No new runtime Go deps ... `go.mod`/`go.sum` unchanged (AC-7)." The implementation adds `github.com/swaggo/http-swagger v1.3.4` as a direct runtime dep (+ ~9 transitives: go-openapi/spec, swaggo/swag, KyleBanks/depth, mailru/easyjson, gopkg.in/yaml.v2, etc.) to serve the Swagger UI at `/docs/`. This is a deliberate, NOTICE-documented choice and AC-7 itself does not require go.mod unchanged (only the 4 gates + proto/sdk/scan/enrich byte-identical), but conventions.md §3's claim is now inaccurate. | Reconcile the doc: update conventions.md §3 to record the `swaggo/http-swagger` runtime exception (or narrow §3 to "no new runtime deps *except* the Swagger-UI server"). Non-blocking. |
| A-02 | conventions.md:13 | convention-breach (count drift) | feature | conventions.md §4 says "`internal/api` 3→4 (`Deps`, `Principal`, `New`, `Role`)". Actual exported count is **7** (adds `AdminStatus`, `PluginHealth`, `EnrichStats`, promoted to exported seam-input types for the `Deps.Status` closure). `doc.go` (authoritative) correctly states 7; `check.sh` passes (≤8). The conventions figure under-counted. | Update conventions.md §4 to "3→7" to match `doc.go` INV5. Non-blocking. |

## AC reconciliation
`acceptance.md` defines AC-1…AC-7, all **positive** scenarios (role-gating, swagger served, list-libraries, item-detail, admin-status, embed/delivery, build-gate). There are **no negative/structural ACs** of the form "symbol X is unimportable" or "package Y does not depend on Z." Therefore no feature-origin finding matches a negative-AC intent:
- D-01 (dead `Admin()`) — no AC asserts `Admin()` is removed; the role-gating behavior (AC-1) is carried by `IsAdmin()`/`requireRole`. Non-blocking.
- R-01 (library DTO dup) — no AC asserts a single library wire type. Non-blocking.
- A-01/A-02 — doc drift, not AC-intent regressions.

All four findings are `origin: feature` but none lock to BLOCK.

## Verdict
**P0: 0 | P1: 0 | P2: 2 | P3: 2.** No P0. No `origin: feature` finding matches a negative-AC intent. Gate verdict: **PROCEED**. Overall code-health: **ISSUES-FOUND** — two minor cleanups (drop deprecated dead `Principal.Admin()`; collapse the duplicate `libraryResponse`/`libraryDTO` wire type) and two doc-reconciliation notes worth folding into the next touch of conventions.md. None block QA.

## Scan details
- Files scanned: 24 (8 new web pkg + 5 new/modified api tests + 4 modified api + 2 store + main.go + Makefile + NOTICE + go.mod + 2 qa regression + integration_web_test).
- Grep patterns run: `.Admin()` callers (whole-repo), `principalFromContext` callers, api `internal/` import allowlist (INV2), additive probe (proto/sdk/scan/enrich), exported-symbol counts (api/web), `make -n` node-free probe.
- Gates re-run read-only: gofmt, go build, make build-plugin, go test, golangci-lint, check.sh — all green.
- Skipped: `internal/web/dist/` (embedded placeholder assets), `openapi.{json,yaml}` (generated bytes), `web/README.md` (Phase-2 prose), `.claude/skills/...` (skill templates).
