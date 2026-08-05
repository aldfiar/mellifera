# Task 13 — cmd/mellifera: compose `web.Handler(api.New(deps), opts)` + build `Deps.Status` closure + `MELLIFERA_WEB_DEV`

- **Type:** coder
- **Step:** 11 (Outline)
- **Seams:** S-compose, S-admin-status (closure side)
- **AC trace:** AC-5, AC-6
- **Project scope:** `.` (root; MODIFY `cmd/mellifera`; package main — 0 exported)
- **Deps:** Task 07 (`Deps.Status` field + `AdminStatus`/DTOs), Task 08 (router groups), Task 11 (`web.Handler`/`Options`), Task 12 (`web.Handler` swagger routes wired)
- **Estimated LOC:** ~45 (S)

## behaviors

- **B1** The sole top-level handler becomes `web.Handler(api.New(deps), opts)` — wrapping the chi api router with the SPA + swagger composer. `srv.Handler` (currently `handler` at `main.go:135`) is set to this composed handler. | ac: AC-6 | kind: normal
- **B2** The `Deps.Status` closure is built here (NOT in `api/` — INV2): it iterates the known plugin IDs, calls `mgr.Status(pluginID)` per id, maps `plugin.Health`→`api.pluginHealthDTO` (formatting `LastCheckedAt time.Time`→RFC3339 string), reads `enrichQueue.Stats()`→`api.enrichStatsDTO`, and returns `api.AdminStatus{Plugins, Enrich}`. | ac: AC-5 | kind: normal
- **B3** A plugin `Status` error (unknown plugin id, etc.) is handled gracefully — the closure either omits that plugin from the slice OR returns a partial result with the healthy plugins (best-effort liveness — arch §4.4 "best-effort race"; do NOT fail the whole status over one plugin). | ac: AC-5 | kind: edge
- **B4** `MELLIFERA_WEB_DEV` env (default false) → `web.Options{DevMode: true}` (loose cache headers for the Vite dev proxy). Read via `envOr`/`envBool` mirroring the existing env helpers (`main.go:246-251`). | ac: AC-6 | kind: normal
- **B5** `api.New(api.Deps{...})` gains the `Status:` field assignment; the existing `AdminToken`/`Store`/`Scan` fields are unchanged. | ac: AC-5 | kind: normal
- **B6** The shutdown order is unchanged (INV-shutdown-order preserved): `srv.Shutdown` → `enrichQueue.Stop` → `mgr.Stop` ×3. The web.Handler is just the `srv.Handler` value — no new shutdown step. | ac: AC-6 | kind: normal

## invariants

- **INV2-closure-not-import:** `cmd/mellifera` imports `internal/plugin` + `internal/enrich` (it already does — `main.go:33-35`) and builds the closure. `internal/api` does NOT import them — the closure returns the api-local `AdminStatus` type. This is the SAME anti-corruption pattern as the existing `Deps.Scan` closure (`main.go:130-132`).
- **INV-known-plugin-set:** there is NO `Manager.List()` method (`grep -n 'func (m \*Manager)' internal/plugin/*.go` — only `Status(pluginID string)`). The closure iterates the KNOWN plugin-ID slice `{"base-scanner", "tv-parser", "image-enricher"}` — the same three IDs `main.go` loads/starts at `:81,90,101`. (A Phase-2+ refactor may add a `Manager.List()`; until then the set is the literal in `main.go`.)
- **INV-time-format-at-edge:** the `time.Time→string` (RFC3339) conversion happens HERE (the composition root / closure), NOT in the api DTOs (INV4/INV-time-out — `api.pluginHealthDTO.CheckedAt` is a string). Use `t.Format(time.RFC3339)`; a zero time → `""`.
- **INV-flat-wiring:** the closure is one more flat constructor call in the `main()` list — no DI container, no reflect (depguard denies both; `main.go:9-11`).
- **INV-single-handler:** there is still exactly ONE top-level `http.Handler` (now `web.Handler(...)` instead of bare `api.New(...)`). The api router is mounted at `/api/*` INSIDE `web.Handler`; it is not a separate `http.Server`.

## precondition

Task 07 (`Deps.Status` + `AdminStatus`/DTOs), Task 08 (router groups), Task 11 (`web.Handler`/`Options`), Task 12 (swagger routes) landed. `cmd/mellifera/main.go:127` is `handler := api.New(api.Deps{AdminToken, Store, Scan})`; `:135` is `srv := &http.Server{Handler: handler}`. `main.go` imports `internal/{api,enrich,module,plugin,scan,store}` + `pkg/sdk`. The plugin IDs loaded are `"base-scanner"` (`:81`), `"tv-parser"` (`:90`), `"image-enricher"` (`:101`). `mgr` (`:76`) + `enrichQueue` (`:117`) are in scope.
- evidence: `cmd/mellifera/main.go:62-166` (main), `:76` (mgr), `:81,90,101` (3 plugin IDs), `:117` (enrichQueue), `:127-133` (api.New + Scan closure precedent), `:135` (srv.Handler), `:182-213` (loadConfig), `:246-251` (envOr); `internal/plugin/lifecycle.go:102` (Manager.Status — no List()); `internal/enrich/queue.go:189` (Queue.Stats).

## postcondition

`main.go` calls `web.Handler(api.New(api.Deps{..., Status: <closure>}), web.Options{DevMode: cfg.webDev})` and assigns it to `srv.Handler`. The closure maps `mgr.Status`+`enrichQueue.Stats`→`api.AdminStatus`. `loadConfig` reads `MELLIFERA_WEB_DEV`. `go build ./cmd/mellifera && go vet ./...` green. The server boots; `/`, `/openapi.yaml`, `/docs` are public; `/api/v1/*` is role-gated.

## test_seed

`cmd/mellifera` is `package main` — no in-package unit test for wiring (composition root exercised end-to-end by Task 15). This task's verification: `go build ./cmd/mellifera` succeeds; the server starts (`waitForReady` harness in Task 15); `/admin/status` returns 200 with the 3 plugins + enrich snapshot (proves the closure is wired); `MELLIFERA_WEB_DEV=1` boots without error. The closure's plugin-id iteration is logic — a focused `config_test.go` or `status_closure_test.go` (package main) asserting the closure shape against a stub `mgr`/`enrichQueue` is RECOMMENDED (extract the closure into a named function `buildStatusClosure(mgr, enrichQueue) api.Deps.Status-func` so it is testable without booting the server).

## callers_to_update

- `cmd/mellifera/main.go:127-133` — `api.New(api.Deps{...})` gains `Status:`; the result is passed to `web.Handler(...)`.
- `cmd/mellifera/main.go:135` — `srv.Handler` = the `web.Handler(...)` result (was bare `handler`).
- `cmd/mellifera/main.go:169-177` (`config`) — add `webDev bool`.
- `cmd/mellifera/main.go:182-213` (`loadConfig`) — read `MELLIFERA_WEB_DEV`.

## allowed_imports

- (already imported) `context`, `errors`, `log/slog`, `net/http`, `os`, `os/signal`, `path/filepath`, `strconv`, `syscall`, `time`
- (already imported) `github.com/mellifera/mellifera/internal/{api,enrich,module,plugin,scan,store}`, `pkg/sdk`
- (NEW) `github.com/mellifera/mellifera/internal/web` — the new package (Task 11/12).

## allowed_categories

- `stdlib`

## test_exclusions

- `loadConfig` env parsing IS logic → table-test if a `config_test.go` exists (Task 15 covers it indirectly if not).
- The wiring calls are composition → verified end-to-end by Task 15.

## negative_examples

- DO NOT import `internal/plugin`/`internal/enrich` from `internal/api` (INV2 — the closure is built HERE in `cmd/mellifera`, which already imports them).
- DO NOT add a second `http.Server` (INV-single-handler — `web.Handler` wraps the api router).
- DO NOT change the shutdown order (INV-shutdown-order — `srv.Shutdown`→`enrichQueue.Stop`→`mgr.Stop`).
- DO NOT fail the whole `/admin/status` over one plugin's `Status` error (B3 — best-effort; omit the failing plugin).
- DO NOT format `time.Time` inside the api DTOs (INV-time-format-at-edge — format here with `time.RFC3339`).
- DO NOT use a hardcoded plugin-ID list that diverges from the load/start sites (`:81,90,101`) — define the slice ONCE near the load block and reference it in the closure (DRY).

## existing_code_snapshot

```go
// cmd/mellifera/main.go:127-139 (api.New + srv — this task wraps api.New in web.Handler + adds Status)
handler := api.New(api.Deps{
	AdminToken: cfg.adminToken,
	Store:      st,
	Scan: func(ctx context.Context, libraryID int64) (scan.Result, error) {
		return scan.Run(ctx, scanDeps, libraryID)
	},
})
srv := &http.Server{
	Addr:              cfg.listenAddr,
	Handler:           handler,
	ReadHeaderTimeout: readHeaderTimeout,
}

// cmd/mellifera/main.go:81,90,101 (the 3 plugin IDs the closure iterates — define a shared slice)
fatalOn(mgr.Load("base-scanner", cfg.baseScannerPath, /* ... */), "load base-scanner")
fatalOn(mgr.Load("tv-parser", cfg.tvParserPath, /* ... */), "load tv-parser")
fatalOn(mgr.Load("image-enricher", cfg.imageEnricherPath, /* ... */), "load image-enricher")

// cmd/mellifera/main.go:246-251 (envOr — mirror for the MELLIFERA_WEB_DEV bool read)
func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" { return v }
	return def
}

// internal/plugin/lifecycle.go:102-116 (Manager.Status — called per id in the closure; NO List() exists)
// internal/enrich/queue.go:189-196 (Queue.Stats — called once in the closure)
```

## contract_test_scope

- **joint (S-compose + S-admin-status closure):** `cmd/mellifera -> web.Handler(api.New(+Status closure)) -> /api + /openapi + /docs + /` | assert: the server boots; `/` 200 (SPA public); `/openapi.yaml` 200 (swagger public); `/api/v1/admin/status` 200 with the 3 plugins + enrich snapshot (closure wired); `/api/v1/libraries` still role-gated (api auth intact inside web.Handler). Verified end-to-end by Task 15 integration test.

## scope_boundary

- MODIFY `cmd/mellifera/main.go` (compose `web.Handler`; build the `Deps.Status` closure; add `webDev` to config + `loadConfig`; assign `srv.Handler`).

## out_of_scope

- `web.Handler` itself (Task 11/12).
- The api handlers + `Deps.Status` field (Tasks 05-08).
- A `config_test.go` (optional — see test_seed; Task 15 is authoritative).
- The SPA/swagger route definitions (Tasks 11/12 — this task only COMPOSES them).

## line_budget

45 (flex 1.3 — closure + config)

## acceptance_criteria

- AC-5 (admin status — the closure body; the api handler is Task 07)
- AC-6 (SPA served from the Go binary — the composition)

## refactoring_checklist

- `grep -n 'web\.Handler\|web\.Options' cmd/mellifera/main.go` → ≥2 hits.
- `grep -n 'Status:' cmd/mellifera/main.go` (inside the `api.Deps{}` literal) → 1 hit.
- `grep -n 'MELLIFERA_WEB_DEV' cmd/mellifera/main.go` → ≥1 hit.
- `grep -n 'internal/plugin\|internal/enrich' internal/api/*.go` → 0 hits (INV2 still holds — the closure lives in cmd, NOT api).
- `cd mellifera && go build ./cmd/mellifera && go vet ./...` green.
- Confirm exactly ONE `http.Server` (`grep -c 'http.Server{' cmd/mellifera/main.go` → 1).
- Confirm the plugin-ID slice used by the closure matches the load sites (`:81,90,101`).
- `./.claude/skills/mellifera-build/scripts/check.sh` OK (package main — 0 exported).

## source_anchor

MODIFY `cmd/mellifera/main.go:127-139` (api.New + srv → wrap in web.Handler + add Status closure), `:169-177` (config + webDev), `:182-213` (loadConfig + MELLIFERA_WEB_DEV). Contract: `contracts.md §api.Deps` + `§internal/web` + `integration_map.md S-compose + S-admin-status`.

## skill_hint

`mellifera-build`, `grounding`, `stack-patterns`
