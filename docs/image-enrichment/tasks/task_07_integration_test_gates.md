# Task 07 — image golden e2e (AC-1) + full gate green (AC-2/AC-3 probes)  [DONE 2026-08-04]

> Step Outline 11. NEW integration test (real subprocesses + real image fixtures + real
> HTTP) + the full Mellifera gate run. This task is the integration capstone: it
> exercises every seam (S1-S8) end-to-end and asserts the cross-cutting structural
> ACs (AC-2 build/budget/no-CGO; AC-3 additive diff). QA independently re-derives
> behavior coverage in the QA tasks; THIS task provides the coder-side golden test
> the reviewer + QA build on.

## Context

- **feature_goal:** (shared) image media type + EXIF enricher.
- **why:** the per-task unit tests (Tasks 01-04) prove each module in isolation; this task proves they compose — a real core process with real `base-scanner` + `image-enricher` subprocesses scans a real image directory and items reach `status=ready` with `sources.image-enricher` + `_provenance/_view/_stages`. It also runs the cross-cutting gates (build/vet/lint/symbol-budget/test + the AC-3 additive-diff probe) that no single owning task can assert alone.
- **data_flow (the golden path under test):** `POST /api/v1/libraries {"module_id":"image","root_path":"<tmp img dir>"}` → `POST /api/v1/libraries/{id}/scan` (returns non-blocking) → B1 worker drains → `GET /api/v1/libraries/{id}/items?status=ready` → each item's `document.sources."image-enricher"` is non-null (+ `_provenance` plugin_id `image-enricher`, a `_view`, a `_stages` entry).
- **rationale:** mirrors the existing golden e2e pattern in `internal/api/router_test.go` (real subprocesses on the hot path — no in-process fakes) per the B1 acceptance convention.

## Type

CREATE new test file(s) + committed image fixtures; RUN the full gate.

## Seams owned (integration capstone — joint coverage for all)

- Joint coverage for **S1-S8** is asserted here (real subprocess flow). The Coverage Matrix in `integration_map.md` lists this task's joint test for every seam.

## behaviors

- B01: A scan of an image library (jpg/png/webp/HEIC fixtures) with real `base-scanner` + `image-enricher` subprocesses returns non-blocking (`Discovered≥4`, `Persisted≥4`, scan HTTP returns before enrichment completes — AC-queue), and after the worker drains every item reaches `status="ready"` with `document.sources."image-enricher"` non-null (+ `_provenance`/`_view`/`_stages`). | ac: AC-1 | kind: normal
- B02: The JPEG with EXIF yields `{width,height,format, make,model,date_taken,orientation, gps_lat,gps_lon}` in `sources.image-enricher`; the EXIF-less png/webp yield `{width,height,format}` (clean success — no spurious `no_data`). | ac: AC-1, AC-image, AC-softfail | kind: normal
- B03: A `.mkv` placed inside the image library root is NOT discovered (module-type gating — S1); the jpg/png/webp/heic ARE present in the item listing. | ac: AC-image | kind: edge
- B04: The HEIC fixture is discovered and, after enrichment, `sources."image-enricher".width` is non-null (exiftool supplies full HEIC data — S2/S3). | ac: AC-image | kind: edge
- B05: Soft-fail path (exiftool present, corrupt/truncated image): the scan returns 200 and the library is listable; the corrupt item settles via the B1 ledger/cooldown path; the scan is not aborted. | ac: AC-softfail | kind: error
- B06: exiftool-missing path: simulate `exiftool` absence for a second library (e.g. PATH override on the image-enricher subprocess env, or skip-on-absent with `t.Skip` if simulation is not feasible in the harness) — the scan returns 200, items are listable, and image items settle via `no_data` cooldown (no panic, no aborted scan). | ac: AC-softfail | kind: error
- B07: Unicode path: `Фото.jpg` (Cyrillic filename) with a non-ASCII EXIF `Model` — the file is discovered and `sources."image-enricher".model` preserves the non-ASCII string verbatim. | ac: AC-unicode | kind: edge
- B08: AC-2 gate green: `CGO_ENABLED=0 go build ./...`, `go vet ./...`, `golangci-lint run ./...`, `bash .claude/skills/mellifera-build/scripts/check.sh` (≤8/≤12 exported symbols per package), and `go test ./...` all exit 0. | ac: AC-2 | kind: normal
- B09: AC-2 no-CGO: `grep -rnE 'import "C"' plugins/image-enricher/ plugins/base-scanner/` → 0 hits; `git diff --name-only e2a7562 -- go.mod` → empty (no new Go dependency). | ac: AC-2 | kind: normal
- B10: AC-3 additive: `git diff --name-only e2a7562 -- proto/ internal/api/ internal/enrich/ pkg/sdk/` → empty (no edits to shipped proto/api/queue/sdk contracts). | ac: AC-3 | kind: edge
- B11: AC-queue additive: `git diff --stat e2a7562 -- internal/enrich/` → empty (B1 queue source untouched); image items settle `enriched→ready` via the same B1 predicate as TV (asserted by B01's `?status=ready`). | ac: AC-queue | kind: edge

## invariants

- REAL SUBPROCESSES on the hot path: the golden e2e uses the real `cmd/mellifera` server + real `bin/base-scanner` + real `bin/image-enricher` (built via `make build-plugin`); NO in-process fakes for the scanner/enricher RPCs (mirrors the B1 router_test convention). In-process fakes are acceptable ONLY for the store (temp SQLite) and the HTTP client.
- FIXTURES are real image files committed under testdata (a tiny JPEG with EXIF, an EXIF-less PNG, a tiny WEBP, a HEIC, a Cyrillic-named JPEG, a truncated JPEG). If exiftool is absent from the CI/host, the exiftool-dependent assertions `t.Skip` with a clear message (mirroring the soft-fail contract) — but the AC-3/AC-2 structural probes (B08-B11) still run unconditionally.
- NON-BLOCKING SCAN: the scan HTTP handler returns before enrichment completes; the test polls `?status=ready` (bounded retries) — it does NOT assert readiness synchronously.

## postcondition

A golden e2e proves image discovery + EXIF enrichment + B1 settle end-to-end (AC-1, AC-image, AC-unicode, AC-softfail) over real subprocesses; the full Mellifera gate (AC-2) and the additive-diff probes (AC-3, AC-queue) are green; image items are indistinguishable from TV items to the B1 queue.

## test_seed (the deliverable)

NEW test file `internal/api/image_e2e_test.go` (or extend `router_test.go` per the existing B1 golden pattern — confirm the harness via `grep -n 'func Test.*Golden\|httptest\|buildSubprocess' internal/api/router_test.go`):
- Build the plugin binaries (`exec.Command("go","build","-o",bin,"./plugins/...")` in `TestMain` or a helper — mirror how the B1 test prepares `bin/base-scanner`/`bin/tv-parser`).
- Start the real server on an ephemeral port with a temp SQLite DSN + `MELLIFERA_ADMIN_TOKEN`; point `MELLIFERA_BASE_SCANNER`/`MELLIFERA_TV_PARSER`/`MELLIFERA_IMAGE_ENRICHER` at the freshly built binaries.
- Commit fixtures under `internal/api/testdata/image-e2e/` (binary-safe; keep tiny): `IMG_exif.jpg` (with Make/Model/DateTimeOriginal/Orientation/GPS), `plain.png` (no EXIF), `shot.webp`, `HEIC_shot.heic`, `Фото.jpg` (Cyrillic, non-ASCII Model), `truncated.jpg` (corrupt), and a stray `not_video.mkv` (small fake — content irrelevant; it must NOT be discovered by the image module).
- Cases map 1:1 to B01-B07 above (table-driven where possible; the unicode + soft-fail cases as separate sub-tests).
- `exiftool` presence: `exec.LookPath("exiftool")`; absent → `t.Skipf("exiftool not installed; soft-fail + structural probes still run")` for B01-B07, but B08-B11 (the structural gate probes) run regardless.

PLUS the gate run (B08-B11) — these can live in a standalone test `internal/gates_test.go` OR a `TestAC2Gates`/`TestAC3Additive` that shells the probes (the git-diff probes are asserted via `exec.Command("git","diff","--name-only","e2a7562","--",...)` + `grep`).

## spec

### Files to CREATE
- `internal/api/image_e2e_test.go` (or the chosen location per the existing harness) — the golden e2e (B01-B07).
- `internal/api/testdata/image-e2e/*` — the committed fixtures (binary-safe; tiny).
- (optional) a small `TestB2StructuralProbes` covering B08-B11's git-diff/grep assertions (or fold into the e2e test file).

### Steps (ordered)
1. Read `internal/api/router_test.go` to confirm the exact harness (server startup, plugin binary build, temp DSN, polling pattern). Mirror it.
2. Commit the image fixtures (generate tiny images; for the EXIF JPEG use exiftool itself or a committed binary fixture; for HEIC use a committed tiny fixture).
3. Write the golden e2e + the structural probes.
4. Run the full gate (the `verify` block).

### allowed_imports
- stdlib: `testing`, `context`, `net/http`, `net/http/httptest`, `os`, `os/exec`, `path/filepath`, `time`, `strings`, `encoding/json`, `bytes`, `fmt`
- `github.com/mellifera/mellifera/internal/api` (if the test is external) or in-package (if `internal/api`)
- (existing `internal/api` test imports carry forward)

allowed_categories: stdlib

### callers_to_update
NONE (new test files; no production symbol changed). evidence: `internal/api/router_test.go` (the existing golden e2e harness — confirmed in source_baseline.md Test Inventory + architecture_review.md grounding audit).

## negative_examples

- DO NOT use in-process fakes for the scanner/enricher RPCs on the golden path (the AC is "real subprocesses + real HTTP" — acceptance.md AC-1 Verify probe).
- DO NOT assert scan synchronously reaches `ready` (scan is non-blocking — poll `?status=ready` with a bounded timeout).
- DO NOT modify production code to make the test pass — if a probe fails, HALT and report (a gate failure is a real bug, not a test to relax).
- DO NOT check in large fixtures (keep images tiny; binary-safe; the repo stays lean).

## out_of_scope

- Production source in `internal/api/**` (AC-3 — additive; the test ADDS files under `internal/api/` but does not edit existing handlers/router). If the existing harness needs a new test helper, add it as a test-only (`*_test.go`) helper, not production code.
- `internal/enrich/**`, `proto/**`, `pkg/sdk/**` (AC-3/AC-queue — no edits).
- The unit tests for Tasks 01-04 (owned by those tasks; this task is the integration capstone).

## scope_boundary

CREATE new `*_test.go` + `testdata/` under `internal/api/`. RUN the gate. No production source file is edited.

## project_scope

.

## line_budget

300  (e2e harness + cases + structural probes; fixture bytes are git-lfs-less tiny images, not counted)
line_budget_flex: 1.3

## test_exclusions

- (test-only file; the test_exclusions rule applies to production code — N/A here. Note: funlen-60 still applies to test helper functions; factor the server-startup helper out.)

## refactoring_checklist (the AC-2/AC-3 Verify probes — also run by the reviewer at the Acceptance Gate)

- [ ] AC-2 gate: `cd /Users/alldiar/projects/go/mellifera && CGO_ENABLED=0 go build ./... && go vet ./... && golangci-lint run ./... && bash .claude/skills/mellifera-build/scripts/check.sh && go test ./...` → exit 0.
- [ ] AC-2 no-CGO / no-dep: `grep -rnE 'import "C"' plugins/image-enricher/ plugins/base-scanner/` → 0 hits; `git diff --name-only e2a7562 -- go.mod` → empty.
- [ ] AC-3 additive: `git diff --name-only e2a7562 -- proto/ internal/api/ internal/enrich/ pkg/sdk/ | grep . ; echo "exit=$?"` → `exit=1` (0 changed files in those trees; `internal/api` may show NEW test files only — no edits to existing handlers/router.go).
- [ ] AC-queue: `git diff --stat e2a7562 -- internal/enrich/` → empty.
- [ ] Golden e2e: `curl GET …/items?status=ready | jq '.items[].document.sources."image-enricher"'` (or the Go-test equivalent) → non-null for each image item.

## skill_hint

- mellifera-build (owns the gate run — the 5-gate AC-2 probe)
- grounding (G2 the `router_test.go` harness; G1 every production symbol the test touches)
- golang-security (the e2e builds subprocesses via `go build` — keep arg-slice discipline in the test's own exec calls)

## deps

- Task 01 (image-enricher binary), Task 02 (base-scanner image discovery), Task 03 (absolute_path stamp), Task 04 (image module seed), Task 05 (cmd wiring), Task 06 (make build-plugin) — all must land before the e2e is meaningful. This is the LAST coder task.

## verify

```
cd /Users/aldfiar/projects/go/mellifera
make build-plugin
CGO_ENABLED=0 go build ./...
go vet ./...
golangci-lint run ./...
bash .claude/skills/mellifera-build/scripts/check.sh
go test ./...
# structural probes:
grep -rnE 'import "C"' plugins/image-enricher/ plugins/base-scanner/ ; echo "no_cgo_exit=$?"   # expect 1
git diff --name-only e2a7562 -- go.mod | grep . ; echo "go.mod_unchanged_exit=$?"               # expect 1
git diff --name-only e2a7562 -- proto/ internal/api/ internal/enrich/ pkg/sdk/ | grep . ; echo "ac3_exit=$?"  # expect 1 (no matches) — note internal/api may show new *_test.go only
git diff --stat e2a7562 -- internal/enrich/ | grep . ; echo "queue_unchanged_exit=$?"           # expect 1
```
