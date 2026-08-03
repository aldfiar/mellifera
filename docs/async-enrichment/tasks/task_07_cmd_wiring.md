# Task 07 — cmd/mellifera/main.go: construct + Start the queue; wire Notify; Stop; env knobs

- **Type:** coder
- **Step:** 8 (Outline)
- **Seams:** S6 (cmd wiring)
- **AC trace:** AC-async, AC-1, AC-2
- **Project scope:** `.` (root; MODIFY `cmd/mellifera`; package main — 0 exported)
- **Deps:** Task 05 (`enrich.NewQueue`/`Queue.Start`/`Stop`/`Notify`), Task 06 (`scan.Deps.Notify` field)
- **Estimated LOC:** ~35 (XS)

## behaviors

- **B1** Construct `q := enrich.NewQueue(enrich.Deps{Store: st, Modules: reg, Plugins: mgr}, enrichConfig)` where `enrichConfig` is read from env with §4.4 defaults. | ac: AC-1 | kind: normal
- **B2** `q.Start(ctx)` launches the bounded worker pool for the process lifetime (it runs alongside the HTTP server goroutine). Start happens BEFORE the server starts serving (so the first scan's `Notify` lands in a running queue). | ac: AC-async, AC-1 | kind: normal
- **B3** Thread `q.Notify` into `scan.Deps` (the new `Notify` field from Task 06) so `scan.runScan`'s post-drain call reaches the queue. | ac: AC-async, AC-1 | kind: normal
- **B4** `q.Stop()` runs in the graceful-shutdown block (`main.go:127-129`, alongside `srv.Shutdown` + `mgr.Stop`) — workers exit cleanly, in-flight leases expire lazily, pending work survives in `items`. | ac: AC-1 | kind: normal
- **B5** Env knobs (read in `loadConfig` / a helper, mirroring the existing `envOr` reads `main.go:158-160`): `MELLIFERA_ENRICH_WORKERS` (default 4), `MELLIFERA_ENRICH_MAX_ATTEMPTS` (default 3), `MELLIFERA_ENRICH_LEASE_TTL` (default 60s), `MELLIFERA_ENRICH_BACKOFF` (default 2s), `MELLIFERA_ENRICH_EXHAUSTED_COOL` (default 7d), `MELLIFERA_ENRICH_NODATA_COOL` (default 30d), `MELLIFERA_ENRICH_COOL_CAP` (default 365d). Malformed values fall back to the §4.4 default (soft — log a warning, do not abort startup). | ac: AC-2 | kind: edge

## invariants

- **INV-start-before-serve:** `q.Start(ctx)` runs BEFORE `srv.ListenAndServe` so the first scan's `Notify` is not lost. The queue's `Start` is non-blocking (it launches workers + returns).
- **INV-shutdown-order:** on signal, shutdown order is: stop accepting HTTP (`srv.Shutdown`) → stop the enrich pool (`q.Stop`) → stop plugin subprocesses (`mgr.Stop`) → `store.Close` (deferred). The pool stops BEFORE the plugin manager so in-flight RPCs can drain against still-live subprocesses (best-effort within `shutdownTimeout`).
- **INV-env-defaults:** every env knob has a §4.4 zero-value default; a missing/empty/malformed value NEVER aborts startup (it falls back + logs). Only `MELLIFERA_ADMIN_TOKEN` remains fail-fast (existing, `main.go:150-154`).
- **INV-flat-wiring:** explicit constructor calls — no DI container, no reflection (depguard denies both; `main.go:9-11` documents this). The queue is one more line in the flat constructor list.
- **INV-context-shared:** `q.Start` receives the SAME `ctx` (`signal.NotifyContext`, `main.go:62`) so SIGINT/SIGTERM cancels the pool + the HTTP server together.

## precondition

Tasks 05-06 landed: `enrich.NewQueue`/`QueueConfig`/`Start`/`Stop`/`Notify` (T05); `scan.Deps.Notify` field (T06). Phase A `cmd/mellifera/main.go` exists: `scanDeps` (`:92-97`), the scan closure (`:101-103`), the HTTP server goroutine (`:113`), the shutdown block (`:125-130`), `loadConfig` (`:145-162`), `envOr` (`:165-170`), `fatalOn`/`logErr`.
- evidence: `cmd/mellifera/main.go:92-97` (`scanDeps`), `:101-103` (scan closure wired into `api.New`), `:113` (HTTP goroutine), `:125-130` (shutdown: `srv.Shutdown` + `mgr.Stop` ×2), `:145-162` (`loadConfig`), `:165-170` (`envOr`).
- evidence (env-read idiom): `main.go:158-160` (`envOr("MELLIFERA_BASE_SCANNER", ...)` etc. — the pattern to mirror for the enrich knobs).

## postcondition

`cmd/mellifera/main.go` constructs `enrich.NewQueue`, `Start`s it before serving, threads `q.Notify` into `scan.Deps`, and `Stop`s it in the shutdown block; `loadConfig` reads the enrich env knobs with §4.4 defaults. The binary still builds (`go build ./...`); `go vet ./...` clean. No new exported symbol (package main).

## test_seed

`cmd/mellifera` is `package main` — there is no in-package unit test for wiring (the composition root is exercised end-to-end by the integration test, Task 08). This task's verification is the AC-1 golden integration (Task 08) + the gates (Task 09): `go build ./cmd/mellifera` succeeds, the server starts (`waitForReady` in the integration harness), a scan's items reach `ready` (proving `Start`+`Notify`+workers are wired), and shutdown is clean (the server process exits 0 on SIGTERM). The coder MAY add a focused test for `loadConfig`'s env parsing (a `config_test.go` in package `main` asserting defaults + overrides) — recommended but not mandatory if the integration test covers the knobs indirectly.

## callers_to_update

- `cmd/mellifera/main.go` — MODIFY: `loadConfig` (add the enrich env knobs), the wiring block (construct `q`, `Start`, thread `Notify` into `scanDeps`), the shutdown block (`q.Stop()`). evidence: `cmd/mellifera/main.go:92-97,101-103,113,125-130,145-162`.

## allowed_imports

- (already imported) `context`, `errors`, `log/slog`, `net/http`, `os`, `os/signal`, `path/filepath`, `syscall`, `time`
- (already imported) `github.com/mellifera/mellifera/internal/{api,enrich,module,plugin,scan,store}`, `pkg/sdk`
- (NO new imports — `strconv` for parsing int/duration env knobs, OR reuse `envOr` + parse inline. If `strconv`/`time.ParseDuration` are needed they are stdlib and allowed.)

## allowed_categories

- `stdlib`

## test_exclusions

- `loadConfig` env parsing IS logic — if a `config_test.go` is added, table-test it (defaults + overrides + malformed-fallback). If not, the integration test covers it indirectly.
- The wiring calls are composition — verified by the integration golden (Task 08).

## negative_examples

- DO NOT start the queue AFTER the server (INV-start-before-serve — the first scan's `Notify` would be lost).
- DO NOT stop the plugin manager before the pool (INV-shutdown-order — in-flight RPCs need live subprocesses).
- DO NOT make a missing/empty env knob fatal (INV-env-defaults — fall back to §4.4 default + log).
- DO NOT introduce a DI container or `reflect`-based wiring (depguard denies both; `main.go:9-11`).
- DO NOT give the queue a different `ctx` than the server (INV-context-shared — SIGTERM must cancel both).
- DO NOT change the admin-token fail-fast or the existing `MELLIFERA_*` plugin path knobs.

## existing_code_snapshot

```go
// cmd/mellifera/main.go:92-104 (scanDeps + scan closure — gains queue wiring)
scanDeps := scan.Deps{
	Store:   st,
	Modules: reg,
	Plugins: mgr,
	Enrich:  enrich.Deps{Store: st, Modules: reg, Plugins: mgr},
	// Notify: <filled by Task 07 — q.Notify>
}
handler := api.New(api.Deps{AdminToken: cfg.adminToken, Store: st,
	Scan: func(ctx context.Context, libraryID int64) (scan.Result, error) {
		return scan.Run(ctx, scanDeps, libraryID)
	},
})
// cmd/mellifera/main.go:113 (HTTP goroutine — the only background goroutine today)
go func() { serveErr <- srv.ListenAndServe() }()
// cmd/mellifera/main.go:125-130 (shutdown block — gains q.Stop())
shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
defer cancel()
logErr(srv.Shutdown(shutdownCtx), "shutdown http server")
logErr(mgr.Stop(shutdownCtx, "base-scanner"), "stop base-scanner")
logErr(mgr.Stop(shutdownCtx, "tv-parser"), "stop tv-parser")
// cmd/mellifera/main.go:145-162 (loadConfig — gains enrich env knobs)
```

## contract_test_scope

- **joint (S6):** `cmd/mellifera wiring -> enrich.Queue.Start/Stop + scan.Deps.Notify` | assert: the pool starts before serving; scan's `Notify` reaches a running queue; clean shutdown stops the pool. Verified end-to-end by the AC-1 golden integration test (Task 08): items reach `ready` (pool ran) + the server exits cleanly on SIGTERM.

## scope_boundary

- MODIFY `cmd/mellifera/main.go` (`loadConfig` env knobs; construct `q`; `Start`; thread `Notify`; `Stop` in shutdown).

## out_of_scope

- The `enrich.Queue` implementation (Task 05) and the `scan.Deps.Notify` field (Task 06).
- A `config_test.go` (optional — see test_seed; the integration test is authoritative).
- An admin HTTP route exposing `Stats`/env knobs (deferred).

## line_budget

35 (flex 1.3 — env parsing may add a helper)

## acceptance_criteria

- AC-async (the pool runs for the process lifetime; scan hands off to it)
- AC-1 (a scan's items drain to `ready` — the wiring is correct)
- AC-2 (`go build ./cmd/mellifera`; gates green; no new exported symbol)

## refactoring_checklist

- `cd mellifera && go build ./cmd/mellifera && go vet ./...` green.
- `grep -nE 'enrich\.NewQueue|q\.Start|q\.Stop|\.Notify' cmd/mellifera/main.go` → ≥4 hits (construct + start + stop + thread Notify).
- `grep -nE 'MELLIFERA_ENRICH_WORKERS' cmd/mellifera/main.go` → ≥1 hit (the primary knob present).
- Confirm `q.Start(ctx)` appears BEFORE `go func(){ serveErr <- srv.ListenAndServe() }()` (line-order check).
- Confirm `q.Stop()` appears in the shutdown block AFTER `srv.Shutdown` and BEFORE `mgr.Stop` (INV-shutdown-order).
- `./.claude/skills/mellifera-build/scripts/check.sh` OK.

## source_anchor

MODIFY `cmd/mellifera/main.go:92-104` (scanDeps + scan closure), `:106-113` (server start — Start the queue before this), `:125-130` (shutdown — add `q.Stop()`), `:145-162` (`loadConfig` — add enrich env knobs), `:165-170` (`envOr` reused). Wiring contract: `contracts.md §Queue.NewQueue/Start/Stop/Notify`.

## skill_hint

`mellifera-build`, `grounding`, `stack-patterns`
