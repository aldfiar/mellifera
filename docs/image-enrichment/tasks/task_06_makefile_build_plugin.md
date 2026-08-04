# Task 06 — Makefile `build-plugin` builds the image-enricher binary  [DONE 2026-08-04]

> Step Outline 10 (build part). MODIFY `Makefile`. Adds `bin/image-enricher` to the
> `build-plugin` target (pure-Go, `CGO_ENABLED=0`) so the default path in Task 05
> (`bin/image-enricher`) resolves after `make build-plugin`. The operator-runtime-dep
> documentation (exiftool install) is owned by the Docs tasks; this task only adds
> a one-line comment in the Makefile pointing at it.

## Context

- **feature_goal:** (shared) image media type + EXIF enricher.
- **why:** `cmd/mellifera` loads image-enricher from `bin/image-enricher` by default (Task 05). `make build-plugin` must produce that binary alongside base-scanner + tv-parser so a single target builds every plugin. `go.mod` stays untouched (exiftool is a runtime dep, not a Go module — S8).
- **data_flow:** `make build-plugin` → `CGO_ENABLED=0 go build -o bin/image-enricher ./plugins/image-enricher` → the binary Task 05 loads at startup.
- **rationale (D-2/S7/S8):** the build target mirrors the existing two plugin lines; the image-enricher is pure-Go (exiftool is invoked via `os/exec`, NOT linked as CGO), so the no-CGO build guarantee holds.

## Type

MODIFY `Makefile`.

## Seams owned

- **S7** Makefile build-plugin. (Joint test → the AC-2 gate run in Task 07 asserts `make build-plugin` produces all three binaries.)

## behaviors

- B01: The `build-plugin` target builds `bin/image-enricher` via `CGO_ENABLED=0 go build -o bin/image-enricher ./plugins/image-enricher`, alongside the existing `bin/base-scanner` + `bin/tv-parser`. | ac: AC-2 | kind: normal
- B02: A comment in the `build-plugin` block documents `exiftool` as a RUNTIME dependency (like ffmpeg/ffprobe) with install hints (`brew install exiftool` / `apt install libimage-exiftool-perl`), pointing operators to the consolidated runtime-deps doc (Docs task). | ac: AC-2 | kind: normal
- B03: `go.mod` is NOT modified by this task (no new Go dependency — S8); the Makefile change is a build-target line + comment only. | ac: AC-2, AC-3 | kind: normal

## invariants

- PURE-GO BUILD: every `go build` under `build-plugin` uses `CGO_ENABLED=0` (the image-enricher line matches). The single-static-binary guarantee is intact.
- NO Go MODULE DEP: this task does NOT edit `go.mod`/`go.sum` (S8). exiftool is a runtime dep.
- DEFAULT PATH CONSISTENCY: the binary output path `bin/image-enricher` matches `envOr("MELLIFERA_IMAGE_ENRICHER", "bin/image-enricher")` in Task 05 (`cmd/mellifera/main.go`).

## postcondition

`make build-plugin` produces `bin/base-scanner`, `bin/tv-parser`, AND `bin/image-enricher` (all pure-Go); the Makefile documents exiftool as a runtime dep; `go.mod` is untouched.

## existing_code_snapshot (G2-verified @ `e2a7562`)

`Makefile:29-33` (the `build-plugin` target — builds base-scanner + tv-parser):
```make
# build-plugin: build every plugin binary. base-scanner is wired in T08;
# tv-parser (the first metadata_source plugin) in T06.
build-plugin:
	CGO_ENABLED=0 go build -o bin/base-scanner ./plugins/base-scanner
	CGO_ENABLED=0 go build -o bin/tv-parser ./plugins/tv-parser
```
`Makefile:1-3` (header — pure-Go posture):
```make
# Mellifera build targets. Pure-Go: CGO is disabled everywhere so the
# result is a single static binary with no C-toolchain dependency.
```

## test_seed

No unit test (Makefile). Verified structurally + by the AC-2 gate (Task 07):
- `make build-plugin` then `test -x bin/image-enricher` (B01).
- `grep -n 'image-enricher' Makefile` shows the new build line + the runtime-dep comment (B02).
- `git diff --name-only -- go.mod go.sum` empty (B03).

## spec

### File to MODIFY: `Makefile`

1. In the `build-plugin` target (`Makefile:31-33`), add the image-enricher line:
   ```make
   # build-plugin: build every plugin binary. base-scanner is wired in T08;
   # tv-parser (the first metadata_source plugin) in T06; image-enricher (EXIF
   # via the system exiftool subprocess) in B2/Task 06.
   build-plugin:
   	CGO_ENABLED=0 go build -o bin/base-scanner ./plugins/base-scanner
   	CGO_ENABLED=0 go build -o bin/tv-parser ./plugins/tv-parser
   	CGO_ENABLED=0 go build -o bin/image-enricher ./plugins/image-enricher
   ```
2. Add a runtime-deps comment block near the top of the file (after the header `Makefile:1-3`, or adjacent to `build-plugin`). Keep it short — the consolidated runtime-deps list lives in the docs (Docs task); the Makefile points at it:
   ```make
   # Runtime deps (operators install these; they are NOT Go module deps and are
   # NOT required at build time): ffmpeg/ffprobe (video probe — base-scanner) and
   # exiftool (image EXIF — image-enricher). exiftool: `brew install exiftool`
   # (macOS) / `apt install libimage-exiftool-perl` (Debian). A missing exiftool
   # is a per-source SOFT-FAIL at enrichment, not a startup/build failure.
   # See docs/architecture.md §1.2 (runtime deps) + the operator runbook.
   ```

### Steps (ordered)
1. Add the image-enricher build line to `build-plugin`.
2. Add the runtime-deps comment block.
3. `cd /Users/aldfiar/projects/go/mellifera && make build-plugin && test -x bin/image-enricher && git diff --name-only -- go.mod go.sum | grep . ; echo "go.mod_unchanged_exit=$?"`.

## allowed_imports

N/A (Makefile; no Go imports).

## callers_to_update

NONE. The `build-plugin` target is invoked by developers/CI; `cmd/mellifera` consumes the binary at runtime via a filesystem path (Task 05), not via this target. evidence: `Makefile:31-33`; `cmd/mellifera/main.go` (default path `bin/image-enricher`).

## negative_examples

- DO NOT add a `go get`/`go mod` step (no new Go dependency — S8).
- DO NOT drop `CGO_ENABLED=0` on the image-enricher build line (pure-Go guarantee).
- DO NOT make exiftool a BUILD dep (it is a runtime dep; the build must succeed without it installed).
- DO NOT edit `go.mod`/`go.sum`.

## out_of_scope

- `go.mod` / `go.sum` (S8 — no new Go dep).
- The consolidated runtime-deps documentation (Docs task owns the doc; this Makefile comment only points at it).
- `plugins/**`, `cmd/**`, `internal/**`.

## scope_boundary

MODIFY `Makefile` only (one build line + one comment block). No other file.

## project_scope

.

## line_budget

15  (one build line + ~6-line comment)
line_budget_flex: 1.0

## test_exclusions

- N/A (Makefile target; verified structurally + by the AC-2 gate).

## refactoring_checklist

- [ ] `grep -n 'image-enricher' Makefile` → the build line + the comment mention.
- [ ] `make build-plugin && test -x bin/image-enricher` → exit 0.
- [ ] `git diff --name-only -- go.mod go.sum` → empty.
- [ ] `grep -c 'CGO_ENABLED=0 go build -o bin' Makefile` → 3 (base-scanner, tv-parser, image-enricher).

## skill_hint

- mellifera-build (the build gate; CGO_ENABLED=0 posture; build-plugin target owner)

## deps

- Soft dep on Task 01 (the package `./plugins/image-enricher` must exist for the build line to compile). Task 01 should land first.

## verify

```
cd /Users/alldiar/projects/go/mellifera
make build-plugin
test -x bin/image-enricher && echo "image-enricher built"
git diff --name-only -- go.mod go.sum | grep . ; echo "go.mod_unchanged_exit=$?"  # expect exit=1
```
