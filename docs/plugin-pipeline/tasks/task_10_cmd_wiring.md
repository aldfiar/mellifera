# Task 10 — cmd/mellifera: wire enrich.Deps + load/start tv-parser (composition root)

- **Type:** coder
- **Step:** 9
- **Seams:** S10 (cmd wiring)
- **AC trace:** AC-1
- **Project scope:** `.` (root; `package main` at `cmd/mellifera/`)
- **Deps:** Task 05 (`enrich.Deps`), Task 06 (`bin/tv-parser` built + capability declaration), Task 08 (`scan.Deps.Enrich` field)
- **Estimated LOC:** ~25 (XS — flat constructor additions)

## behaviors

- **B1** `main` constructs `enrich.Deps{Store, Plugins, Modules}` and sets `scanDeps.Enrich` so scan.Run drives the enrichment chain (flat composition root — every dependency an explicit constructor call). | ac: AC-1 | kind: normal
- **B2** `main` reads `MELLIFERA_TV_PARSER` (default `bin/tv-parser`) and `Load`s + `Start`s the tv-parser subprocess (mirrors base-scanner `Load`/`Start` at `main.go:75-78`), declaring its `metadata_source` capability. | ac: AC-1 | kind: normal
- **B3** Graceful shutdown `Stop`s tv-parser alongside base-scanner (mirrors `main.go:111`). | ac: AC-1 | kind: normal
- **B4** Two subprocess plugins now run (base-scanner `scanner` + tv-parser `metadata_source`); the app graph is still readable top-to-bottom in one flat file (no DI/reflect). | ac: AC-1, AC-2 | kind: normal

## invariants

- **INV-flat-main:** `cmd/mellifera/main.go` stays a flat constructor list (ai-arch §5; conventions.md §no-DI). The enrich wiring is ONE explicit `enrich.Deps{...}` construction; the tv-parser wiring mirrors the existing base-scanner block verbatim in shape. No DI framework, no reflect (depguard denies both, `.golangci.yml:32-39`).
- **INV-dev-load:** tv-parser loads from a filesystem path (`MELLIFERA_TV_PARSER`, default `bin/tv-parser`) — the same dev-mode pattern as base-scanner (`MELLIFERA_BASE_SCANNER`, `main.go:139`). go:embed first-run extraction stays deferred (D11/Q20).
- **INV-cap-declaration:** tv-parser is loaded with `[]sdk.Capability{{Type:"metadata_source", ID:"default", ProtoService:"mellifera.metadata.v1.MetadataSource"}}` (matches the plugin's `Handshake` declaration from Task 06; the caps-driven launch from Task 02 dispenses it).
- **INV-cookie-pair:** tv-parser uses the SAME magic-cookie pair as base-scanner + the core (`MELLIFERA_MAGIC_COOKIE`/`mellifera-plugin-v1`, `main.go:42-44`) — go-plugin validates the match at substrate handshake.

## precondition

`enrich.Deps` exists (Task 05); `scan.Deps` has the `Enrich` field (Task 08); `bin/tv-parser` is buildable (`make build-plugin`, Task 06); the plugin.Manager launches caps-driven (Task 02, so a `metadata_source`-only plugin dispenses correctly).
- evidence: `cmd/mellifera/main.go:56-113` (`main` — the flat wiring list; `scanDeps := scan.Deps{...}` at `:80`; base-scanner Load+Start at `:75-78` to mirror for tv-parser; shutdown Stop at `:111`).
- evidence: `cmd/mellifera/main.go:116-121` (`config` struct — add `tvParserPath`); `:126-142` (`loadConfig` — add `tvParserPath: envOr("MELLIFERA_TV_PARSER", "bin/tv-parser")`); `:139` (the `envOr` base-scanner default pattern); `:145-150` (`envOr` helper).
- evidence: `cmd/mellifera/main.go:18-35` (imports — ADD `internal/enrich`); `:75-77` (the `sdk.Capability` declaration shape to mirror, with `Type:"metadata_source"`).

## postcondition

main constructs `enrich.Deps`, sets `scanDeps.Enrich`, Load+Starts tv-parser, and Stops it on shutdown. A fresh process boots with both plugins serving and the enrich chain wired into scan. (The integration test, Task 11, exercises the full boot end-to-end.)

## test_seed

`cmd/mellifera` is `package main` with no shipped unit test (composition root). Correctness is proven by the Task 11 integration golden (which boots the real server with both plugins). Add a focused test ONLY if one naturally exists (e.g. a `loadConfig` env-parsing test mirroring any existing config test); otherwise rely on the integration gate. Do NOT spin a unit test purely to satisfy check.sh (main packages with no exported symbols have no co-located-test requirement).

## callers_to_update

- `cmd/mellifera/main.go` — `config` (+`tvParserPath`), `loadConfig` (+env read), `main` (construct `enrich.Deps`, set `scanDeps.Enrich`, Load+Start tv-parser, Stop tv-parser in shutdown).

## allowed_imports

- `context`, `errors`, `log/slog`, `net/http`, `os`, `os/signal`, `path/filepath`, `syscall`, `time` (stdlib, already imported)
- `github.com/mellifera/mellifera/internal/api` (already)
- `github.com/mellifera/mellifera/internal/enrich` (NEW)
- `github.com/mellifera/mellifera/internal/module` (already)
- `github.com/mellifera/mellifera/internal/plugin` (already)
- `github.com/mellifera/mellifera/internal/scan` (already)
- `github.com/mellifera/mellifera/internal/store` (already)
- `github.com/mellifera/mellifera/pkg/sdk` (already)

## allowed_categories

- `stdlib`

## test_exclusions

- `package main` composition root — no exported symbols; the integration test (Task 11) is the verification gate. A `loadConfig` env test is acceptable but not required.

## negative_examples

- DO NOT use reflect or a DI container (depguard denies; flat constructors only).
- DO NOT hardcode the tv-parser path — read `MELLIFERA_TV_PARSER` (default `bin/tv-parser`).
- DO NOT declare a capability type the plugin does not serve (tv-parser declares `metadata_source`; the Load caps MUST match its `Handshake`, Task 06).
- DO NOT forget to `Stop` tv-parser in graceful shutdown (process leak).
- DO NOT change the base-scanner wiring (AC-3; only ADD the tv-parser block + enrich.Deps).

## existing_code_snapshot

base-scanner Load+Start to mirror (`main.go:75-78`):
```go
fatalOn(mgr.Load("base-scanner", cfg.baseScannerPath, []sdk.Capability{
	{Type: "scanner", ID: "default", ProtoService: scannerService},
}), "load base-scanner")
fatalOn(mgr.Start(ctx, "base-scanner"), "start base-scanner")
```
-> add the tv-parser block (mirror; `Type:"metadata_source"`, ProtoService `mellifera.metadata.v1.MetadataSource`).
scanDeps (`main.go:80-87`) — set the enrich field:
```go
scanDeps := scan.Deps{Store: st, Modules: reg, Plugins: mgr, Enrich: enrich.Deps{Store: st, Plugins: mgr, Modules: reg}}
```
shutdown Stop (`main.go:111`): add `logErr(mgr.Stop(shutdownCtx, "tv-parser"), "stop tv-parser")`.
config (`main.go:116-121`) + loadConfig (`:139`): add `tvParserPath` + `envOr("MELLIFERA_TV_PARSER", "bin/tv-parser")`.

## contract_test_scope

- **joint (S10):** `cmd wiring -> enrich.Deps + tv-parser Load/Start` | assert: the booted process runs both plugins and scan.Run drives the enrich chain. Verified end-to-end in Task 11 integration (AC-1 golden — the whole graph boots).

## scope_boundary

- MODIFY `cmd/mellifera/main.go` (config, loadConfig, main wiring, shutdown)

## out_of_scope

- `internal/enrich` (Task 05)
- `internal/scan` Deps.Enrich field (Task 08)
- `plugins/tv-parser` + Makefile build (Task 06)
- `internal/plugin` caps-driven launch (Task 02)
- go:embed extraction (deferred — D11/Q20)
- `go.mod` (NO new deps; all imports already present)

## line_budget

25 (flex 2.0 — small but must wire 4 points: enrich.Deps, Load, Start, Stop)

## acceptance_criteria

- AC-1 (two plugins serve; enrich wired into scan; a fresh boot scans TV end-to-end — proven by Task 11)

## refactoring_checklist

- `cd mellifera && go build ./cmd/mellifera/...` green.
- `make build-plugin` -> `bin/base-scanner` AND `bin/tv-parser` exist; `bin/mellifera` (via `make build`) boots without error when both plugin envs point at the binaries.
- `grep -n 'tv-parser\|MELLIFERA_TV_PARSER\|enrich.Deps' cmd/mellifera/main.go` -> >= 1 hit each (wiring present).
- `grep -rn 'reflect\|wagon' cmd/mellifera/` -> 0 hits (no DI/reflect).
- `git diff --stat 7bcc6c9 -- proto/ go.mod` -> empty (no proto/deps change).

## skill_hint

`mellifera-build`, `golang-security`, `grounding`, `contracts`, `stack-patterns`
