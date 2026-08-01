# Task 13 (QA) — Regression (additive contract) + structural/negative probes

- **Type:** qa
- **Layer:** joint + structural (regression of scan-library's shipped contract; the negative ACs)
- **Status:** DONE — `mellifera/qa_pipeline_regression_test.go` PASS (3 tests: AC-3 additive proto/go.mod/go.sum unchanged since 7bcc6c9; AC-4 no media literals in orchestrator core; AC-1 parseTV extraction boundary). AC-2/AC-6/state-machine/namespace-at-subprocess covered by check.sh + coder `enrich_test.go` + the T12/T11 runtime tests (see qa/.joint_coverage.md). `go test ./...` green.
- **Validates tasks:** T03 (module), T04 (store), T07 (base-scanner extract), T09 (api), T11 (gates)
- **AC trace:** AC-2, AC-3, AC-4, AC-6
- **Project scope:** `.` (root; `package mellifera_test` / structural probes)

## purpose

Phase A is ADDITIVE (deprecate-don't-delete). This QA task proves scan-library's shipped contract still holds AND that the structural/negative invariants (core media-type-agnostic, parseTV fully extracted, soft-fail) are true — independently of the coder's own tests. It guards the regression surface the coder is least likely to assert about (someone else's shipped behavior).

## behaviors

- **Q6** Additive-contract regression (AC-3): `scanner.v1.Scanner` (Scan/Identify) is byte-unchanged on the wire; base-scanner still serves discovery; `GET /api/v1/items` still works; the `items` table change is a defaulted `status` column (existing rows readable with the default). Assert via a scan-library-era fixture scan + the table_info probe. | ac: AC-3 | kind: normal
- **Q7** Structural/negative AC-4 (config-driven core): a test or probe asserting NO occurrence of media-type literals (`"tv"`/`"tmdb"`/`"kinopoisk"`/`"movie"`) in core orchestration code (`internal/`, `pkg/sdk/`, `cmd/`) outside config/tests. | ac: AC-4 | kind: normal
- **Q8** Structural/negative AC-1 (extraction): assert `parseTV`/`season`/`episode`/`SxxExx` are ABSENT from `plugins/base-scanner/` non-test code and PRESENT in `plugins/tv-parser/`. | ac: AC-1 | kind: normal
- **Q9** Soft-fail regression (AC-6): with a module config listing an enricher whose plugin is absent/misconfigured, the scan SUCCEEDS; the failure is recorded in `_stages` + the scan warnings; the item is still persisted and reaches the furthest valid state. | ac: AC-6 | kind: normal
- **Q10** Gates regression (AC-2): run the full gate sequence and assert `check.sh: OK`, no package >12 exported symbols, no reflect, no DI framework, parameterized SQL only, `exec.Command` arg-slice only (the `golangci-lint`/`check.sh` invariants). | ac: AC-2 | kind: normal

## invariants

- **INV-regression-not-rewrite:** the regression tests assert scan-library's CONTRACT still holds (additive shape), not that nothing changed. They document the intentional behavior change (base-scanner emits base fields; TV via tv-parser) as acceptable.
- **INV-automated-probes:** the AC-4 / AC-1 structural probes are ASSERTED by a test (e.g. a `go test` that greps the source tree and fails on a hit), not left as manual shell commands — so CI catches a regression.

## precondition

The coder pipeline (Tasks 01-11) is implemented and green. scan-library's shipped proto/store/API surface is the regression baseline (commit `7bcc6c9`).

## postcondition

A new QA file (e.g. `qa_pipeline_regression_test.go`) exists with: the additive-contract assertions, the soft-fail regression, and the automated structural probes (AC-4 media-literal scan + AC-1 extraction scan) that fail on violation. All pass.

## test_seed

- Additive: open a scan-library-era DB (or simulate one), assert items read with `status='new'`; scan via base-scanner, assert discovery works + `Identify` still returns the wire fields (FileId/MediaType/Parsed/Confidence/ParserName).
- Structural AC-4: a test that walks `internal/`+`pkg/sdk/`+`cmd/` `.go` files (excl `_test.go` and the `tvConfigJSON` seed + comments) and fails if a media literal is found in logic.
- Structural AC-1: a test asserting `plugins/base-scanner/*.go` (non-test) has no `parseTV` and `plugins/tv-parser/*.go` has it.
- Soft-fail: seed a module whose `metadata_sources` includes a plugin ID not Loaded; scan; assert success + `_stages` failed/skipped entry + warning.

## refactoring_validation

- AC-4 probe (automated in-test): `grep -rnE '"(tv|tmdb|kinopoisk|movie)"' internal/ pkg/sdk/ cmd/ | grep -vE '_test\.go|registry\.go.*tvConfig|//|secrets'` -> 0.
- AC-1 extraction probe (automated in-test): base-scanner non-test -> 0 `parseTV`; tv-parser -> >= 1.
- AC-3 probe: `git diff --stat 7bcc6c9 -- proto/` -> empty (asserted by checking no proto file changed).
- These are run by the test (e.g. via `os.ReadFile`+`strings.Contains` over the tree, or `exec` of `git diff`).

## coverage gap addressed

The coder proves the NEW pipeline works; QA proves the SHIPPED contract still holds AND that the negative invariants (no media logic in core, parseTV gone from base-scanner) are durably asserted in CI — the surface most likely to silently regress.

## scope_boundary

- CREATE `qa_pipeline_regression_test.go` (additive-contract + structural probes + soft-fail regression)

## out_of_scope

- Re-asserting the happy-path golden (QA-1 / coder T11 own that)
- Phase B/C behaviors

## acceptance_criteria

- AC-2 (gates green, durably asserted), AC-3 (additive contract), AC-4 (no media strings, asserted), AC-6 (soft-fail regression)

## skill_hint

`mellifera-build`, `grounding`, `contracts`, `golang-security`, `stack-patterns`
