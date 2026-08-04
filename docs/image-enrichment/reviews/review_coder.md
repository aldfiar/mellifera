# Reviewer Report — image-enrichment (Phase B2: coder phase)

- **Feature:** image-enrichment (B2) — image media type + EXIF enricher via the system `exiftool` subprocess
- **Branch:** `feature/image-enrichment` (off `main` @ `e2a7562`)
- **Reviewer:** @wf-reviewer (glm-5.2) | **Source:** coder (glm-5.2), tier `large`
- **Date:** 2026-08-04
- **Scope:** coder tasks T01-T07 (7/7). QA (QA1/QA2) + Docs (DOCS1/DOCS2) are NOT in scope here.
- **Mode:** read-only. No code modified, no git commits.

## Gate re-verification (independently re-run, read-only)

All commands run from `effective_cwd = mellifera` (`/Users/aldfiar/projects/go/mellifera`). HEAD is `e2a7562` with the coder's work **uncommitted in the working tree** (no feature commits exist; review is against the working-tree diff vs `e2a7562`).

| Gate | Result |
|---|---|
| `gofmt -l .` | **clean** — only out-of-scope pre-existing `.claude/skills/mellifera-build/module-template/doc.go` (a template, not feature code) |
| `CGO_ENABLED=0 go build ./...` | **exit 0** |
| `make build-plugin` | **exit 0** — 3 binaries: `bin/base-scanner`, `bin/tv-parser`, `bin/image-enricher` |
| `go vet ./...` | **exit 0** |
| `golangci-lint run ./...` | **exit 0**, 0 findings |
| `go test ./...` | **all 12 packages pass** (root 34.5s incl. image golden + reconciled TV goldens) |
| `bash .claude/skills/mellifera-build/scripts/check.sh` | **OK** (exported-symbol budget satisfied) |
| **AC-1 golden** `TestImageE2E_GoldenReady` | **RAN 6.80s (not skipped)**, all 5 sub-tests PASS |

**Toolchain present on host:** `exiftool` (homebrew), `ffmpeg`+`ffprobe` 7.1.1, `sips` (macOS built-in) — so the golden exercised real EXIF, real webp (ffmpeg fixture), and real HEIC (sips fixture).

## State audit

- `task_index.md`: 7/7 coder tasks `[x]`; 2 QA + 2 Docs `[ ]`.
- `state.json`: `completed_count=7` = `coder_tasks=7`; `pipeline_type: "feature"`; `model_provenance.tier: large`.
- **Drift: none.** Every `[x]` task has real working-tree changes; phase log entries match; no `[x]` without a diff, no `[ ]` counted done.

## Additive + pure-Go constraint verification (NON-NEGOTIABLE)

```
git diff e2a7562 -- mellifera/proto/ mellifera/internal/api/ mellifera/internal/enrich/ mellifera/pkg/sdk/ mellifera/go.mod mellifera/go.sum
```
→ **empty.** AC-3 / AC-queue / AC-2(no-dep) all hold.

| Constraint | Check | Result |
|---|---|---|
| Additive (proto/api/enrich/sdk) | diff vs `e2a7562` | **empty — PASS** |
| B1 queue untouched (`internal/enrich`) | diff vs `e2a7562` | **empty — PASS** |
| `go.mod`/`go.sum` unchanged | diff vs `e2a7562` | **empty — PASS** (NO new Go dependency) |
| Pure-Go / no CGO | `grep -rn 'import "C"'` in new code; `CGO_ENABLED=0` build | **0 hits, build OK — PASS** |
| No `reflect` | `grep '"reflect"'` in new/modified source | **none — PASS** |
| No DI | depguard (lint) | **exit 0 — PASS** |
| exiftool = subprocess, arg-slice only | `grep -nE 'sh -c\|bash -c\|Shell'` in `plugins/image-enricher`/`base-scanner` | only test/doc *comments*; exec is `exec.CommandContext(ctx, exiftoolBin, args...)` with an explicit `[]string` — **PASS** |
| Parameterized SQL | `internal/module/registry.go` | `ExecContext(ctx, seedModulesSQL, args...)` — **PASS** |
| Exported-symbol budget | image-enricher pkg main = **0 non-test exported**; `internal/module` adds **none** (`imageConfigJSON` unexported → stays 7) | **PASS** |
| Apache-2.0 headers | SPDX `Apache-2.0` on all 7 image-enricher files | matches `tv-parser` baseline — **PASS** |
| Media-type-agnostic core | "image"/"heic" only in plugin/module config, never in core `internal/scan` | **PASS** |

## Per-task verdicts

### Task 01 — image-enricher plugin — **PASS**
Files: `plugins/image-enricher/{doc,main,pluginsvc,enricher,exiftool}.go` + 2 test files. Verbatim structural mirror of `tv-parser` (only `pluginID` differs) + the `ffprobe` exec pattern.
- B01 cookie/Handshake, B02 Match, B03 BuildRequest, B04 Convert, B05 Merge, B06 exiftool soft-fail, B07 LookPath-every-Convert, B08 EXIF-less-yields-dims, B09 HEIC-native, B10 non-ASCII verbatim, B11 no-CGO/no-dep — **all 11 verified.**
- `var _ sdk.MetadataSource = (*enricherImpl)(nil)` compile-time assert; `enricherImpl struct{}` stateless.
- `runExiftool` (`exiftool.go`): `exec.LookPath` soft-fail, 30s `WithTimeout`, arg-slice `exec.CommandContext`, and all four soft-fail branches (missing / non-zero / timeout / non-JSON / empty array) return `map[string]any{}, warning`. Only a cancelled context is hard.
- `Convert` returns non-empty namespace (≥ `{width,height,format}`) for a decodable image → clean success, not spurious `no_data`; empty namespace → `Warnings` (soft), never a gRPC error.
- `Merge` writes `sources["image-enricher"]` only + per-field `ViewBinding`s; never touches `_provenance/_view/_stages`.
- Tests: 10 functions, 65 assertion-style statements — real, not tautological. Real-exiftool cases gated on `LookPath`.
- *Deviation (coder-flagged):* test fixtures generated in-test (stdlib `image/png`/`jpeg`), not committed testdata binaries; real-exiftool Convert/PNG cases skip locally. **Acceptable** — the real-exiftool EXIF-bearing end-to-end is the T07 golden, which I confirmed passes with real exiftool.

### Task 02 — base-scanner image discovery — **PASS** (deviation #1 adjudicated below)
Files: `plugins/base-scanner/image.go` (NEW), `walk.go` + `scanner.go` (MODIFY).
- B01 map selection, B02 `.mkv` excluded, B03 TV no-regression, B04 probeImage-vs-probe branch (ffprobe never for images), B06 HEIC soft-fail, B07 all-failures-soft, B08 Cyrillic discovered, B09 `Scan` forwards `ModuleType` — **all verified.**
- Module-type-**gated** (not union): `imageMode := moduleType=="image"` selects `imageMime` else `mediaMime`; `isMedia`/`mimeType` → `extHas(extMap,…)`/`mimeOf(extMap,…)` (parameterized by the selected map).
- B05 holds for **jpeg/png only** at discovery — see deviation #1 (webp soft-fails at discovery like HEIC). End-to-end webp still reaches `ready` with exiftool-supplied data (golden `fx.rels` includes `shot.webp`, drained to ready).

### Task 03 — scan stamps `absolute_path` — **PASS**
File: `internal/scan/run.go` (MODIFY) + `parsed_abs_test.go` (NEW).
- B01-B05 verified. `runScan`→`persist`→`assembleBaseDoc` threads `lib.RootPath`; `parsedWithAbsolutePath` stamps `absolute_path = filepath.Join(rootPath, rel)` into `doc["parsed"]` for **every** item, media-type-agnostic (no `module_type` branch — INV2). Existing keys preserved (additive). Deterministic for `(rootPath, rel)` → `baseChanged` byte-stable (re-marshal sorts keys). Deliberately does **not** import `structpb` (honors `run.go`'s json-marshal pattern).
- *Grounding note (justified):* the spec's G2 "filepath ALREADY imported" was incorrect (`run.go:11` was `time`); `path/filepath` was added from `allowed_imports`. Correct grounding-driven correction, not a hallucination.
- `run_test.go:623` updated consistently (added `libRoot` arg) — full scan suite passes.

### Task 04 — module seeds the `image` module — **PASS**
File: `internal/module/registry.go` (MODIFY) + `registry_test.go` (EXTEND).
- B01-B05 verified. `imageConfigJSON` binds `base-scanner` + `image-enricher` (priority 1, enabled, no `auth_mode`, no `filename_format`) under `media_type:"image"`, schema 1, `display_name` ru+en. Second idempotent `INSERT OR IGNORE` `ExecContext` in `Open`. Unexported const → exported-symbol count stays 7. Idempotent (Open twice, no dup). TV regression intact.

### Task 05 — cmd loads/stops the image-enricher — **PASS**
File: `cmd/mellifera/main.go` (MODIFY).
- B01-B05 verified. `config.imageEnricherPath = envOr("MELLIFERA_IMAGE_ENRICHER","bin/image-enricher")`; `Load`+`Start` after `tv-parser`, before `srv.ListenAndServe` (start-before-serve); capability decl identical to tv-parser (`metadataService` const @ main.go:51, G1-verified = `mellifera.metadata.v1.MetadataSource`, matches the plugin's Handshake); `Stop` after `enrichQueue.Stop()` + tv-parser stop (shutdown order). **No new import.** `fatalOn` makes the enricher mandatory at startup.

### Task 06 — Makefile `build-plugin` — **PASS**
File: `Makefile` (MODIFY).
- B01-B03 verified. 3rd `CGO_ENABLED=0 go build -o bin/image-enricher ./plugins/image-enricher`; runtime-deps comment (ffmpeg/ffprobe + exiftool, install hints, soft-fail-not-build-fail). `make build-plugin` produces all 3 binaries. `go.mod` untouched.

### Task 07 — image golden e2e + gates — **PASS**
File: `integration_image_test.go` (NEW, 503 lines) + reconciled root goldens.
- B01-B11 verified. `TestImageE2E_GoldenReady` builds 4 real binaries into tmp, starts the server hermetically (all plugin envs incl. `MELLIFERA_IMAGE_ENRICHER`), scans a real fixture library (`module_id=image`), and asserts the async image model + real EXIF provenance over a bounded poll. **Ran 6.80s with real exiftool/ffmpeg/sips**; 5 green sub-tests. The EXIF expectations are independent constants re-derived field-by-field (golden rule).
- AC-2/AC-3/AC-queue structural probes (B08-B11) re-verified independently as bash gates above.
- *B06 (exiftool-missing):* the golden uses the spec-permitted `t.Skip` fallback (simulation not feasible in this black-box harness). Soft-fail *logic* is unit-covered (`TestRunExiftool_SoftFailMissing`, `TestConvert_SoftFailMissingExiftool`); the full exiftool-missing **integration** sim is QA1's owned task (`TestImageE2E_ExiftoolMissing`). Acceptable.

## Refactoring audit

- Renamed/parameterized: `isMedia`→`extHas(extMap,…)`; `mimeType`→`mimeOf(extMap,…)`; `walk`/`toDiscovered`/`persist`/`assembleBaseDoc` gained params. All call-sites updated; the full repo compiles and tests pass.
- Stale references: grep finds **no** remaining `isMedia(`/`mimeType(` callers in non-test production code.
- No symbols renamed across package boundaries; `absolute_path` is a free-form parsed key (additive), read only by image-enricher; tv-parser reads only `season`/etc. and ignores it (confirmed — TV goldens pass).

## Behavioral verification

- **Tests:** all pass (12 packages). Golden re-derives EXIF field-by-field from independent constants.
- **Error handlers (AC-softfail):** exiftool LookPath / non-zero / timeout / non-JSON + probeImage open/decode/format-unsupported soft-fails — all present and fire (golden `AC_softfail` + unit tests).
- **Edge cases:** HEIC (sips fixture), webp (ffmpeg fixture), Cyrillic filename + non-ASCII Model, corrupt/truncated JPEG, EXIF-less PNG, stray `.mkv` gating — all asserted and passing.

## Acceptance re-derivation (reviewer independence — golden rule)

Re-derived each AC's expected outcome from its Given/When/Then, not from the coder's assertions:

| AC | Re-derivation | Result |
|---|---|---|
| **AC-1** golden e2e | real subprocesses + real exiftool + real images + real HTTP; scan non-blocking; items settle `ready`; `sources."image-enricher"` carries real EXIF + `_provenance`/`_view`/`_stages`. `TestImageE2E_GoldenReady` ran 6.80s, all 5 sub-tests PASS, EXIF asserted field-by-field from independent constants. | **PASS** |
| **AC-image** jpg/png/webp/heic discovered + EXIF | jpg/png/webp/heic all discovered (`fx.rels`); `.mkv` excluded; jpg/png/heic EXIF provenance confirmed; webp drained to ready. *Divergence (deviation #1):* webp base dims come from exiftool at enrichment, not stdlib at discovery. No feature loss. | **PASS (deviation #1 ACCEPTED)** |
| **AC-queue** B1 unchanged | `internal/enrich` diff empty; scan non-blocking (golden: ≥1 in-flight right after scan); settle `enriched→ready` via the B1 predicate. | **PASS** |
| **AC-softfail** no/partial EXIF, corrupt, exiftool-missing | no-EXIF PNG = clean success `{width,height,format}`; truncated.jpg persisted w/ empty base ffprobe (golden). exiftool-missing: logic unit-covered + golden `t.Skip` fallback; full sim deferred to QA1. | **PASS (coder-phase; QA1 owns full missing-sim)** |
| **AC-unicode** Cyrillic | `Фото.jpg` discovered; `model="Фотоаппарат"` verbatim (golden). | **PASS** |
| **AC-2** gates + pure-Go + budget | build/vet/lint(0)/check.sh/test all exit 0; no `import "C"`; `go.mod` unchanged. | **PASS** |
| **AC-3** additive | proto/internal/api/internal/enrich/pkg/sdk diff empty; go.mod unchanged. | **PASS** |

**All 7 acceptance scenarios PASS** (AC-image / AC-softfail carry the adjudicated deviations below).

## Adjudication of the coder's flagged deviations

1. **webp soft-fail (spec_error) — ACCEPT.** `image/webp` is not a stdlib package in Go 1.25.3; `golang.org/x/image/webp` is third-party and forbidden by the no-new-dep constraint. Grounded fix: webp stays **discovered** (`imageMime`) but stdlib base-info soft-fails at discovery (same pattern as HEIC); exiftool supplies full webp data at enrichment. Only jpeg/png get stdlib base dims. The end-to-end webp item reaches `ready` with `sources.image-enricher` dims (golden confirms). **No feature loss, no constraint breach.** → *Recommendation (INFO, route to specifier):* reconcile the literal wording in `contracts.md` (Imports Map lists `image/webp` as a stdlib blank import), `task_02` B05, and `acceptance.md` AC-image/AC-softfail (which assume stdlib webp decode) to match the implemented soft-fail.

2. **exiftool subprocess (T01) — ACCEPT (confirmed).** `exec.CommandContext(pctx, exiftoolBin, args...)` with an explicitly-built `[]string`; absPath is one argument, never shelled. Soft-fail on missing/non-zero/timeout/non-JSON mirrors `ffprobe.go`. No `sh -c`/`bash -c` in production code.

3. **T05 root-golden reconcile — ACCEPT.** `startServer`/`qaStartServer` gained one `imageEnricherBin` param + one `MELLIFERA_IMAGE_ENRICHER` env; all 4 callers build image-enricher into tmp. Changes are **purely additive harness setup** — **no assertion body touched or weakened**; the change actually *improves* hermeticity (no longer falls back to the repo-local `bin/image-enricher`). All 3 TV goldens still pass.

4. **in-test fixtures + HEIC via sips — ACCEPT.** JPEG/PNG stdlib-encoded; EXIF stamped by the real `exiftool` (`-n`, recon-verified); WEBP via ffmpeg; HEIC via macOS `sips`. `sips` is a **test-only fixture generator** (guarded `LookPath`→skip), not a production dependency — the shipped enricher uses exiftool only. All image files are real on-disk files exercised by real subprocesses.

5. **line budget (503 vs ~390 ceiling) — ACCEPT (INFO recommendation).** `integration_image_test.go` is 503 lines vs the 300×1.3 = 390 estimate. Reviewed line-by-line: every line is a real AC assertion, a real fixture generator, or the poll-to-settle harness — **no dead code**, 0 exported symbols (test file). The specifier's 300 estimate under-counted 6 fixture generators + 6 AC assertion groups + the harness; the accepted B1 precedent `integration_async_test.go` is 433 lines covering *less* fixture variety. Acceptable under the "never weaken a test" precedent. → *Recommendation (INFO):* monitor golden-test-file growth; if a B3 slice adds another fixture family, consider splitting fixtures into a helper file.

6. **absolute_path stamp (D-6) — ACCEPT (confirmed).** Stamped for **all** items in `internal/scan` (media-type-agnostic); the only file-location channel into the enricher chain (B1 passes an empty Merge doc). tv-parser ignores it (reads only `season`/etc.) — **additive, no regression** (TV goldens pass). The golden's EXIF assertion passing proves the enricher found each file via `absolute_path`.

## Findings

**P0 (blocking): none.** **P1 (fix before PR): none.**

INFO (non-blocking recommendations, routed as noted):
- **INFO-1 (specifier):** reconcile webp wording in `contracts.md` Imports Map, `task_02` B05, and `acceptance.md` AC-image/AC-softfail to reflect the stdlib-soft-fail/exiftool-at-enrichment reality (deviation #1). Doc-only; no code change.
- **INFO-2 (QA1):** implement the exiftool-**missing** integration simulation (`TestImageE2E_ExiftoolMissing`) per the AC-softfail Verify probe; the coder phase used the spec-permitted `t.Skip` fallback (B06).
- **INFO-3 (coder/docs):** `integration_image_test.go` is at the budget edge (503 lines) but clean; split helpers if B3 adds another fixture family.

## Verdict: **PROCEED**

The implementation is high quality, faithfully mirrors the established `tv-parser`/`ffprobe` patterns, is **fully additive** (proto/api/enrich/sdk/go.mod diff empty), **pure-Go** (no CGO, no new dependency, arg-slice-only subprocess), and the **AC-1 golden passes with real exiftool + real images + real HTTP** — independently re-verified. All 7 coder tasks PASS; all 7 acceptance scenarios PASS; all 6 flagged deviations are ACCEPTED (4 correct grounding-driven/test-harness choices, 2 confirmed additive). No P0/P1.

**Next:** health-check (@wf-auditor) → QA (QA1 behavior re-derivation incl. exiftool-missing sim; QA2 structural regression `TestB2_Ac3Additive` etc.) → Docs (DOCS1 module-map sync, DOCS2 exiftool operator runbook). INFO-1 (webp wording) should be folded into the specifier/DOCS pass.
