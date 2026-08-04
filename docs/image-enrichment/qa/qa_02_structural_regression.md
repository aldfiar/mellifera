# QA 02 — structural & regression (AC-2 gates, AC-3 additive, AC-queue B1 untouched, TV no regression)

> **Status: DONE — 2026-08-04.** Implemented in `mellifera/qa_image_regression_test.go`:
> `TestB2_TVNoCoverArtRegression` (NEW direction — cover.jpg/poster.png gated out of
> a TV lib; TV .mkv drains ready with tv-parser provenance), `TestB2_Ac3Additive`
> (proto/api/enrich/sdk + go.mod diff empty vs e2a7562; internal/enrich stat empty),
> `TestB2_PluginsBuildPureGo` (CGO_ENABLED=0 build of 3 plugins + server, hermetic).
> Module-registry compose/idempotent tests DROPPED as redundant (proven by coder
> `internal/module/registry_test.go`). All gates green. Coverage map: `qa/.joint_coverage.md`.

> Independent structural + regression coverage for image-enrichment. Asserts the
> cross-cutting structural ACs (AC-2 build/budget/no-CGO/no-dep; AC-3 additive diff)
> and the regression invariants (B1 queue source untouched — AC-queue; TV scans
> byte-identical — R-I4 no cover-art junk). These probes are the user's navigability/
> complexity-budget and additivity safety net; they run regardless of whether
> `exiftool` is installed.

## Context

- **feature_goal:** (shared) image media type + EXIF enricher, ADDITIVE on shipped Phase A + B1.
- **why:** the user's hardest constraint is additivity (image support must NOT break the TV pipeline or its contracts — AC-3/AC-queue) and the no-CGO/no-new-dep/budget guarantee (AC-2). These are structural properties no per-module unit test can assert alone; QA runs them as independent gates and re-derives the expected "unchanged" state from the merge base `e2a7562`.
- **joints_targeted:** the seams S5 (image module seed — `Get("image")` resolves, `List` len 2), S6 (cmd plugin loading — startup order), S7 (Makefile build-plugin), S8 (no Go dep / no CGO). Plus the no_seam trees (proto/api/enrich/sdk — must be untouched) and the TV-discovery regression (S1 video fallback).
- **mock_boundaries:** these are structural probes (`git diff`, `grep`, the build gate, `make`) + targeted Go tests (`internal/module` registry, a TV-library scan). NO external services; NO mock of the enricher (the TV regression uses the real tv-parser subprocess + a real TV fixture tree).

## validates_tasks

- Task 04 (module seed — `List` includes image; idempotent re-Open)
- Task 05 (cmd wiring — startup/shutdown order; no new import)
- Task 06 (Makefile build-plugin — 3 binaries)
- Task 01 (no-CGO build; no Go dep)
- Task 02 (TV scan regression — module-type gating)
- All tasks (AC-3 additive — no proto/api/enrich/sdk edits)

## behavior_coverage (MANDATORY — independent re-derivation)

| B-id | Behavior | Derived expected result | Test/Probe |
|---|---|---|---|
| B11 (T07) | go build/vet/golangci/check/test green | exit 0 for each | structural_gate |
| B12 (T01) | image-enricher builds CGO_ENABLED=0 | `CGO_ENABLED=0 go build ./plugins/image-enricher/` exit 0; `grep 'import "C"'` 0 hits | no_cgo_probe |
| B13 (T01/T07) | go.mod untouched | `git diff --name-only e2a7562 -- go.mod` empty | go_mod_unchanged_probe |
| B14 (T06) | make build-plugin produces bin/image-enricher | `make build-plugin && test -x bin/image-enricher` | build_plugin_probe |
| B15 (T01) | no reflect, no DI; ≤8 exports/pkg | `check.sh` green; `grep -rn 'reflect\.' plugins/image-enricher/` 0 hits | budget_probe |
| B16 (ALL) | no edits to proto/internal/api/internal/enrich/pkg/sdk | `git diff --name-only e2a7562 -- proto/ internal/api/ internal/enrich/ pkg/sdk/` empty (note: `internal/api` may show NEW `*_test.go` only — no edits to handlers/router) | ac3_additive_probe |
| B21 (T07) | internal/enrich source untouched | `git diff --stat e2a7562 -- internal/enrich/` empty | queue_unchanged_probe |
| B03 (T02) | TV/movie scan byte-identical (video ext fallback; no cover-art junk) | a TV lib scan discovers ONLY video exts; `cover.jpg` absent from items | tv_regression_test |
| B05 (T01/T04) | image-enricher + image module compose: `Get("image")` binds base-scanner + image-enricher | `module.Open` → `Get("image")` returns Module w/ Scanner=base-scanner + MetadataSources=[image-enricher p1]; `List` len 2 | registry_compose_test |
| B04 (T04) | idempotent seed | `Open` twice → no error, no duplicate rows, `List` len stable | registry_idempotent_test |

`uncovered_behaviors:` none for the structural/regression scope. (Feature-behavior B-ids B01-B10 are owned by QA 01.)

## mock_boundaries (detailed)

- REAL: the Mellifera build toolchain (`go`, `golangci-lint`, `make`, `git`), `internal/module` against a temp store, the real `bin/base-scanner` + `bin/tv-parser` subprocesses for the TV regression.
- MOCK/STUB: temp store (SQLite) for the registry tests; a temp TV-library directory with `show.mkv` + `cover.jpg`.
- EXTERNAL TOOL: `exiftool` NOT required for any probe here (these are structural/regression — the TV regression uses ffprobe-backed video, not exiftool).

## test_plan

Joint tests (≤4):
1. `TestB2_Ac3Additive` (AC-3, AC-queue): `git diff --name-only e2a7562 -- proto/ internal/api/ internal/enrich/ pkg/sdk/` is empty (allowing only NEW `*_test.go` under `internal/api/`); `git diff --stat e2a7562 -- internal/enrich/` empty.
2. `TestB2_Ac2BuildGates` (AC-2): runs `go build ./...`, `go vet ./...`, `golangci-lint run ./...`, `check.sh`, `go test ./...` and asserts each exits 0 (a Go test that shells the gate via `exec.Command`, OR a CI step — the QA task pins the assertion).
3. `TestB2_NoCgoNoDep` (AC-2): `grep -rnE 'import "C"' plugins/image-enricher/ plugins/base-scanner/` 0 hits; `git diff --name-only e2a7562 -- go.mod go.sum` empty.
4. `TestB2_TVRegression` (AC-image/R-I4): real base-scanner + tv-parser; scan a TV lib with `show.mkv` + `cover.jpg` → items contain `show.mkv`, NOT `cover.jpg`; (companion) an image lib scan omits `.mkv`.

Boundary tests (≤2):
1. `TestB2_ModuleRegistryCompose` (AC-1/AC-image): `module.Open` → `Get("image")` Scanner.PluginID=="base-scanner" + MetadataSources=[{image-enricher, p1, enabled, no auth_mode}]; `List` len 2 ("image","tv"); `Get("tv")` unchanged.
2. `TestB2_ModuleSeedIdempotent` (AC-1): `Open` twice → no error; row count unchanged; `INSERT OR IGNORE` semantics.

Property test (≤1):
1. `TestB2_BuildPluginProducesAll` (AC-2): `make build-plugin` → `bin/base-scanner`, `bin/tv-parser`, `bin/image-enricher` all exist and are executable.

## refactoring_validation

- AC-3 probe is the 1:1 mirror of acceptance.md AC-3 Verify probe + AC-queue Verify probe (run them verbatim).
- Symbol-budget probe: `bash .claude/skills/mellifera-build/scripts/check.sh` asserts `internal/module` stays at 7, image-enricher/base-scanner package main ~0 (≤8/≤12 gate).
- No-new-import probes: `git diff e2a7562 -- cmd/mellifera/main.go | grep -E '^\+\s*"'` — confirms cmd adds NO new import (Task 05 invariant); `git diff e2a7562 -- internal/module/registry.go | grep -E '^\+\s*"'` — confirms module adds NO new import.

## skill_hint

- mellifera-build (owns the AC-2 gate; the symbol-budget check; build-plugin)
- grounding (G2 the merge-base diff; re-derive "what must be unchanged" from contracts/plan)
- golang-security (no-reflect/no-DI budget probe)

## deps

- All coder tasks (01-07) complete.

## verify

```
cd /Users/aldfiar/projects/go/mellifera
# structural probes (run regardless of exiftool presence):
CGO_ENABLED=0 go build ./... && go vet ./... && golangci-lint run ./... && bash .claude/skills/mellifera-build/scripts/check.sh && go test ./...
grep -rnE 'import "C"' plugins/image-enricher/ plugins/base-scanner/ ; echo "no_cgo=$?"
git diff --name-only e2a7562 -- go.mod go.sum | grep . ; echo "go.mod_unchanged=$?"
git diff --name-only e2a7562 -- proto/ internal/api/ internal/enrich/ pkg/sdk/ | grep . ; echo "ac3_additive=$?"
git diff --stat e2a7562 -- internal/enrich/ | grep . ; echo "queue_unchanged=$?"
make build-plugin && for b in base-scanner tv-parser image-enricher; do test -x bin/$b || echo "MISSING bin/$b"; done
go test ./internal/module/ -run 'TestB2_Module'
```
