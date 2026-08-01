# Task 11 — AC-1 golden integration test + AC-2 gates green (the acceptance gate)

- **Type:** coder
- **Step:** 11
- **Seams:** S-integration (e2e), S-proto (import now live)
- **AC trace:** AC-1 (golden), AC-2 (all gates), AC-5, AC-6, AC-7
- **Project scope:** `.` (root; `package mellifera_test`)
- **Deps:** Tasks 01-10 (the whole pipeline must be wired)
- **Estimated LOC:** ~180 (M — the golden harness + assertions)

## behaviors

- **B1** CREATE `integration_pipeline_test.go` (black-box, `package mellifera_test`): build the REAL `base-scanner` + `tv-parser` + server binaries, boot the server on a temp SQLite DB + a fixture TV library + both plugin env vars, drive `POST /api/v1/libraries/{id}/scan` with a real client. Skips under `-short` / missing ffprobe (INV4, mirror `integration_test.go`). | ac: AC-1 | kind: normal
- **B2** Golden assertions (AC-1), RE-DERIVED from the fixture filename (reviewer-independence): for `Show.Name.S01E02.1080p.mkv` assert the persisted `document` has `sources["tv-parser"].{title:"Show Name", season:1, episode:2}`, `_provenance.<field>.plugin_id=="tv-parser"`, `_view.title` populated, `_stages` carries the parse stage, and `status=="enriched"`. | ac: AC-1, AC-5 | kind: normal
- **B3** Extraction assertion (AC-1 structural): the persisted `document.parsed` (base-scanner's contribution) carries NO `season`/`episode` — TV parsing comes SOLELY from `sources["tv-parser"]`. | ac: AC-1 | kind: normal
- **B4** Soft-fail assertion (AC-6): kinopoisk/tmdb are seeded but not loaded -> the scan still succeeds; `_stages` records them skipped/failed; the item still reaches `enriched` via tv-parser. | ac: AC-6 | kind: normal
- **B5** API/state assertions (AC-7): `GET /api/v1/items` returns items with a `status` field; `?status=enriched` returns the scanned items; the provenance is queryable. | ac: AC-7, AC-5 | kind: normal
- **B6** Reconcile any scan-library integration/qa test that breaks under the new pipeline: the shipped `integration_test.go` golden asserted base-scanner emits `season`/`episode` (now extraction-removed) and `qa_*_test.go` may assert the old single-plugin shape — update those assertions MINIMALLY to the Phase A pipeline (TV fields now under `sources["tv-parser"]`; items carry `status`). | ac: AC-1, AC-3 | kind: normal
- **B7** AC-2 GATES GREEN: `make build && make build-plugin && go test ./... && golangci-lint run ./... && gofmt -l . && ./.claude/skills/mellifera-build/scripts/check.sh && go vet ./...` all pass; `check.sh` prints `check.sh: OK`. | ac: AC-2 | kind: normal

## invariants

- **INV-real-subprocess:** the golden runs REAL go-plugin subprocesses (base-scanner + tv-parser) + REAL ffprobe (arch §0 #2) — no fakes at this layer. It is the foundational proof the whole pipeline is wired.
- **INV-reviewer-independence:** the test DERIVES expected season/episode from the fixture filename (e.g. parse `S01E02` -> season 1, episode 2), not magic constants. The reviewer re-derives independently at the Acceptance Gate (`docs/scan-library/acceptance.md:76-84` rule).
- **INV-skip-clean:** skip (not fail) under `-short` or when ffprobe is off PATH (mirror `integration_test.go` INV4).
- **INV-no-regression (AC-3):** the reconciled scan-library tests still prove scan-library's shipped CONTRACT (additive-only) — they assert the additive new shape, not a rewrite.

## precondition

The full Phase A pipeline is implemented (Tasks 01-10): `bin/base-scanner` + `bin/tv-parser` build; enrich is wired into scan; the API fields/filters status. The scan-library `integration_test.go` exists as the harness template.
- evidence: `integration_test.go:1-55` (the black-box harness pattern — binary build, temp DB, random port, real client, skip rules; `TestIntegrationScanLibrary` is the structural template for `TestIntegrationPipeline`).
- evidence: `integration_test.go` docstring asserts "EXACT parsed title/season/episode (INV1)" from base-scanner — THIS is the assertion that breaks after Task 07 and must be reconciled to `sources["tv-parser"]`.
- evidence: acceptance.md AC-1 (the golden spec + verify probes) + AC-2 (the exact gate command sequence).

## postcondition

`integration_pipeline_test.go` exists and passes (the AC-1 golden); all scan-library tests pass under the new pipeline; `go test ./...` is green; every gate in AC-2 passes; `check.sh: OK`. Every package is within the symbol budget (≤12, WARN ≤12 tolerated); no reflect; no DI; parameterized SQL; `exec.Command` arg-slice only.

## test_seed

This task IS the test. Structure (mirror `integration_test.go`):
1. `exec.Command("go", "build", "-o", tmpBin, "./cmd/mellifera")` + build base-scanner + tv-parser (or reuse `make build-plugin` artifacts).
2. Start the server with env: `MELLIFERA_DATA_DIR=<tmp>`, `MELLIFERA_ADMIN_TOKEN=...`, `MELLIFERA_BASE_SCANNER=bin/base-scanner`, `MELLIFERA_TV_PARSER=bin/tv-parser`, `MELLIFERA_LISTEN=127.0.0.1:<free>`.
3. `POST /api/v1/libraries` (module `tv`, root = fixture dir) -> `POST /api/v1/libraries/{id}/scan`.
4. `GET /api/v1/items` -> assert the golden fields (re-derived from filename); assert `parsed` lacks season/episode; assert `sources["tv-parser"]` carries them; assert `status=="enriched"`; query `?status=enriched`.
5. Direct SQLite probe (optional): `json_extract(document,'$._provenance.title.plugin_id') == 'tv-parser'` (AC-5 probe).

## callers_to_update

- `integration_test.go` (scan-library golden) — reconcile the base-scanner TV-field assertions to the Phase A pipeline (B6).
- `qa_acceptance_test.go` / `qa_resilience_test.go` — reconcile any assertion of the old single-plugin shape (QueryItems already fixed to `""` by Task 04; update any status/field expectation minimally).

## allowed_imports

- stdlib only (`encoding/json`, `fmt`, `net`, `net/http`, `os`, `os/exec`, `path/filepath`, `strings`, `testing`, `time`) — black-box `package mellifera_test`, no internal imports (mirror `integration_test.go:17-28`).

## allowed_categories

- `stdlib`

## test_exclusions

- N/A — this task produces the test that gates the feature.

## negative_examples

- DO NOT fake the subprocesses at this layer — the golden runs real go-plugin subprocesses + real ffprobe (INV-real-subprocess).
- DO NOT hardcode season/episode as magic — derive from the fixture filename (reviewer-independence).
- DO NOT delete the scan-library `integration_test.go` — RECONCILE it (AC-3; additive, not a rewrite).
- DO NOT weaken the AC-2 gate sequence; every command must pass.

## existing_code_snapshot

The harness template is `integration_test.go` (build binaries, temp DB, free port, real client, skip rules — see `:1-55`). The new `integration_pipeline_test.go` mirrors it and adds: tv-parser env + binary, the provenance/sources/status assertions, and the soft-fail observation. The reconcile edits to `integration_test.go` change its base-scanner TV-field assertions to the new `sources["tv-parser"]` + `status` shape.

## contract_test_scope

- **joint (S-integration + S-proto):** the WHOLE pipeline (api -> scan -> enrich -> {module,plugin->tv-parser subprocess} -> store) + the now-live `metadatav1`/`commonv1` imports. This task is the single end-to-end proof; it jointly validates S1..S11 (mirror the scan-library claim that its golden "jointly validates S1..S11").

## scope_boundary

- CREATE `integration_pipeline_test.go`
- MODIFY `integration_test.go` (reconcile to the Phase A pipeline — minimal, additive)
- MODIFY `qa_acceptance_test.go` / `qa_resilience_test.go` (minimal reconcile if they assert the old shape; QueryItems already `""`-fixed by Task 04)
- RUN the full AC-2 gate suite (no source change beyond the above)

## out_of_scope

- Any coder-package logic (Tasks 01-10) — this task only adds/reconciles tests + runs gates
- Phase B (external fetch / async queue) and Phase C (post-action) behaviors
- performance/load tests (out of Phase A scope)

## line_budget

180 (flex 1.4 — the golden harness is the largest test; reconcile edits are small)

## acceptance_criteria

- AC-1 (golden e2e + parseTV split; the verify probes pass)
- AC-2 (all gates green; `check.sh: OK`)
- AC-5 (provenance queryable)
- AC-6 (soft-fail observed)
- AC-7 (status fielded + filterable over HTTP)

## refactoring_checklist

- **AC-1 golden probe:** `./mellifera-integration-pipeline` (or `go test -run TestIntegrationPipeline ./`) -> exit 0 AND provenance+status asserted.
- **AC-1 extraction probe (re-run the Task 07 owner probe at the gate):** `grep -rnE 'season|episode|SxxExx|parseTV' plugins/base-scanner/ | grep -v _test` -> 0; `grep -rn 'parseTV' plugins/tv-parser/` -> >= 1.
- **AC-2 gate sequence:** `cd mellifera && make build && make build-plugin && go test ./... && golangci-lint run ./... && gofmt -l . && ./.claude/skills/mellifera-build/scripts/check.sh && go vet ./...` -> all pass; `check.sh: OK`.
- **AC-3 additive probe:** `git diff --stat 7bcc6c9 -- proto/` -> empty; `sqlite3 <db> "PRAGMA table_info(items)"` -> `status` column default `'new'`.
- **AC-4 probe:** `grep -rnE '"(tv|tmdb|kinopoisk|movie)"' internal/ pkg/sdk/ cmd/ | grep -vE '_test\.go|registry\.go.*tvConfig|//|secrets'` -> 0 hits.
- `git diff --stat 7bcc6c9 -- go.mod` -> empty (no new deps).

## skill_hint

`mellifera-build`, `golang-security`, `grounding`, `contracts`, `stack-patterns`
