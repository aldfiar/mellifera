# Task 05 — cmd/mellifera loads/stops the image-enricher subprocess  [DONE 2026-08-04]

> Step Outline 9. MODIFY `cmd/mellifera/main.go`. A mirrored Load/Start/Stop block for
> `image-enricher` (same `metadata_source` capability + `metadataService` as tv-parser),
> one new env-config field (`MELLIFERA_IMAGE_ENRICHER`), and the shutdown-order Stop.
> Flat constructor call — no DI, no reflect.

## Context

- **feature_goal:** (shared) image media type + EXIF enricher.
- **why:** the core must launch the image-enricher subprocess at startup (before the server serves) so the first image scan's B1 queue finds a live enricher, and tear it down on SIGTERM after the enrich pool + HTTP server (INV-start-before-serve + INV-shutdown-order).
- **data_flow:** `main` → `mgr.Load("image-enricher", cfg.imageEnricherPath, []sdk.Capability{{Type:"metadata_source",...}})` → `mgr.Start(ctx, "image-enricher")` → the B1 worker's gRPC client routes `(item, image-enricher)` RPCs to this subprocess; on shutdown `mgr.Stop(shutdownCtx, "image-enricher")` after the enrich pool stops.
- **rationale:** verbatim mirror of the tv-parser Load/Start/Stop block (`main.go:88-91,150`); image-enricher advertises the SAME capability type, so the existing `metadataService` FQN and Manager routing serve it unchanged.

## Type

MODIFY `cmd/mellifera/main.go`.

## Seams owned

- **S6** cmd plugin loading. (Joint test → Task 07; the golden e2e proves the subprocess loads and the chain runs.)

## behaviors

- B01: `main` loads `image-enricher` from `cfg.imageEnricherPath` with the capability declaration `[]sdk.Capability{{Type:"metadata_source", ID:"default", ProtoService:metadataService}}` — identical to tv-parser except the plugin id + path. | ac: AC-1 | kind: normal
- B02: `main` starts `image-enricher` BEFORE the HTTP server serves (after base-scanner + tv-parser start; before `srv.ListenAndServe`). A load/start failure is fatal at startup (`fatalOn`) — same as the other plugins. | ac: AC-1 | kind: normal
- B03: `config.imageEnricherPath = envOr("MELLIFERA_IMAGE_ENRICHER", "bin/image-enricher")` is resolved in `loadConfig` alongside the other plugin paths. | ac: AC-1 | kind: normal
- B04: On shutdown, `mgr.Stop(shutdownCtx, "image-enricher")` runs AFTER `srv.Shutdown` + `enrichQueue.Stop` and alongside the other plugin Stops (the enrich pool stops before plugin subprocesses so in-flight RPCs drain — INV-shutdown-order). | ac: AC-1 | kind: normal
- B05: No new import is added; `cmd/mellifera` stays a flat constructor list (no DI, no reflect). | ac: AC-2 | kind: normal

## invariants

- INV-start-before-serve: every plugin `Start` completes before `srv.ListenAndServe` (existing; the image-enricher block is inserted with the other plugin blocks, before `scanDeps`/server wiring).
- INV-shutdown-order: HTTP server → enrich pool → plugin subprocesses (existing; the image-enricher Stop is added next to the tv-parser/base-scanner Stops, after `enrichQueue.Stop()`).
- COOKIE PAIR: the core's `magicCookieKey`/`magicCookieValue` (`main.go:45-46`) already match what image-enricher validates (Task 01) — unchanged.
- CAPABILITY DECLARATION matches image-enricher's Handshake: `{Type:"metadata_source", ID:"default", ProtoService:"mellifera.metadata.v1.MetadataSource"}` (Task 01 / `metadataService`).
- DEFAULT PATH `bin/image-enricher` matches the `make build-plugin` output (Task 06 / S7).

## postcondition

The core launches the image-enricher subprocess at startup with the correct capability declaration + cookie pair, resolves its path from `MELLIFERA_IMAGE_ENRICHER` (default `bin/image-enricher`), and tears it down in the correct shutdown order.

## existing_code_snapshot (G2-verified @ `e2a7562`)

`cmd/mellifera/main.go:88-91` (the tv-parser block to mirror):
```go
	fatalOn(mgr.Load("tv-parser", cfg.tvParserPath, []sdk.Capability{
		{Type: "metadata_source", ID: "default", ProtoService: metadataService},
	}), "load tv-parser")
	fatalOn(mgr.Start(ctx, "tv-parser"), "start tv-parser")
```
`cmd/mellifera/main.go:148-150` (shutdown order — plugin Stops after the enrich pool):
```go
	enrichQueue.Stop()
	logErr(mgr.Stop(shutdownCtx, "base-scanner"), "stop base-scanner")
	logErr(mgr.Stop(shutdownCtx, "tv-parser"), "stop tv-parser")
```
`cmd/mellifera/main.go:154-162` (config struct):
```go
type config struct {
	dsn             string
	adminToken      string
	baseScannerPath string
	tvParserPath    string
	listenAddr      string
	enrich          enrich.QueueConfig
}
```
`cmd/mellifera/main.go:180-181` (loadConfig plugin path env resolution):
```go
		baseScannerPath: envOr("MELLIFERA_BASE_SCANNER", "bin/base-scanner"),
		tvParserPath:    envOr("MELLIFERA_TV_PARSER", "bin/tv-parser"),
```

## test_seed

`cmd/mellifera` has no unit-test harness today (composition root; covered by the golden e2e in Task 07). The behaviors are asserted there:
- The golden e2e (Task 07) starts the real core with all three plugins and asserts an image library scan reaches `status=ready` with `sources.image-enricher` — which proves B01/B02 (the subprocess loaded + started, else the chain would `outcomeUnavailable`).
- Shutdown order (B04) is asserted structurally: a `grep` that the Stop call is present and positioned after `enrichQueue.Stop()` (see refactoring_checklist).

## spec

### File to MODIFY: `cmd/mellifera/main.go`

1. After the tv-parser Load/Start block (`main.go:91`), add the mirrored image-enricher block:
   ```go
   // image-enricher is the image metadata_source plugin (EXIF via the system
   // exiftool subprocess — Task 01). Same dev-mode pattern + cookie pair +
   // capability declaration as tv-parser; its Handshake advertises the same
   // metadata_source capability (Task 01). Loaded/started BEFORE the server
   // serves (INV-start-before-serve) so the first image scan's B1 queue finds a
   // live enricher.
   fatalOn(mgr.Load("image-enricher", cfg.imageEnricherPath, []sdk.Capability{
       {Type: "metadata_source", ID: "default", ProtoService: metadataService},
   }), "load image-enricher")
   fatalOn(mgr.Start(ctx, "image-enricher"), "start image-enricher")
   ```
2. In the `config` struct (`main.go:154-162`), add a field after `tvParserPath`:
   ```go
   tvParserPath     string
   imageEnricherPath string
   ```
3. In `loadConfig`'s returned struct (`main.go:180-181`), add:
   ```go
   tvParserPath:     envOr("MELLIFERA_TV_PARSER", "bin/tv-parser"),
   imageEnricherPath: envOr("MELLIFERA_IMAGE_ENRICHER", "bin/image-enricher"),
   ```
4. In the shutdown block (`main.go:150`), add the image-enricher Stop alongside the other plugin Stops (after `enrichQueue.Stop()` at `:148`):
   ```go
   logErr(mgr.Stop(shutdownCtx, "tv-parser"), "stop tv-parser")
   logErr(mgr.Stop(shutdownCtx, "image-enricher"), "stop image-enricher")
   ```

### Steps (ordered)
1. Edit `config` struct (+ field).
2. Edit `loadConfig` (+ env resolution).
3. Edit `main` (+ Load/Start block after tv-parser).
4. Edit shutdown (+ Stop after tv-parser).
5. `cd /Users/aldfiar/projects/go/mellifera && go build ./cmd/mellifera/` (full gate run in Task 07).

## allowed_imports

(existing `cmd/mellifera` imports — unchanged set; NO new import)
- stdlib: `context`, `errors`, `log/slog`, `net/http`, `os`, `os/signal`, `path/filepath`, `strconv`, `syscall`, `time`
- `github.com/mellifera/mellifera/internal/{api,enrich,module,plugin,scan,store}`, `github.com/mellifera/mellifera/pkg/sdk`

allowed_categories: stdlib

## callers_to_update

NONE. The edit is internal to `main`/`config`/`loadConfig` (all in this file). The image-enricher plugin id is referenced as a STRING literal (`"image-enricher"`), matching the Handshake in Task 01 and the module seed in Task 04. evidence: `cmd/mellifera/main.go:88-91,148-150,154-162,180-181`.

## negative_examples

- DO NOT use DI/reflection to load image-enricher (flat `mgr.Load` call only — INV-flat-wiring).
- DO NOT start image-enricher AFTER the server serves (INV-start-before-serve).
- DO NOT stop image-enricher before `enrichQueue.Stop()` (INV-shutdown-order — pool drains against live subprocesses).
- DO NOT invent a new capability type/ProtoService (reuse `metadataService`).
- DO NOT edit `internal/plugin/**` (the Manager is capability-driven and already serves `metadata_source`).

## out_of_scope

- `internal/plugin/**` (capability routing is unchanged — AC-3).
- `plugins/**` (Tasks 01/02), `internal/module/**` (Task 04), `Makefile` (Task 06).
- `proto/**`, `internal/api/**`, `internal/enrich/**`, `pkg/sdk/**`.

## scope_boundary

MODIFY `cmd/mellifera/main.go` only (config struct + loadConfig + Load/Start block + Stop). No other file.

## project_scope

.

## line_budget

35  (4 small edits)
line_budget_flex: 1.0

## test_exclusions

- `config`/`loadConfig` (configuration wiring — composition root, covered by e2e; mirrors the existing un-tested plugin-path wiring).

## refactoring_checklist

- [ ] `grep -n 'image-enricher\|imageEnricherPath\|MELLIFERA_IMAGE_ENRICHER' cmd/mellifera/main.go` shows the Load + Start + Stop + config field + env resolution (5 hits across the 4 edits).
- [ ] The Load/Start block sits BEFORE `srv.ListenAndServe`; the Stop sits AFTER `enrichQueue.Stop()` (grep line-order check).
- [ ] No new `import` added to `cmd/mellifera/main.go` (`git diff cmd/mellifera/main.go | grep '^+import\|^+\t"'` — no new import line).
- [ ] `go build ./cmd/mellifera/` exits 0.

## skill_hint

- grounding (G2 the tv-parser block as the exact mirror; confirm capability decl + cookie pair already present)
- mellifera-build (flat-wiring INV; no new import)

## deps

- Soft dep on Task 01 (the image-enricher binary must exist for runtime start; the build compiles without it because cmd references the plugin by string id + path, not import). For a clean startup smoke, Task 01 should land first.

## verify

```
cd /Users/aldfiar/projects/go/mellifera
go build ./cmd/mellifera/
go vet ./cmd/mellifera/
```
(Full startup + shutdown exercised by the golden e2e in Task 07.)
