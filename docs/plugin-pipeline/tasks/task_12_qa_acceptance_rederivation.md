# Task 12 (QA) — Independent acceptance re-derivation (golden independence)

- **Type:** qa
- **Layer:** e2e + joint (independent black-box; NOT trusting the coder's assertions)
- **Status:** DONE — `mellifera/qa_pipeline_acceptance_test.go::TestQA_PipelineAcceptanceReDerivation` PASS (6 subtests: AC1 rederive+split, AC5 provenance/view, AC1 stages-stage-literal pin, AC7 lifecycle+filter, AC6 soft-fail, namespace cleanliness). Independent fixture set (Stranger.Things.S03E04.720p-WEB / Тьма S02E05 / Frieren.S01E01E02.1080p / Standup Special 2019) distinct from the coder golden + scan-library. `go test ./...` green.
- **Validates tasks:** T05 (enrich), T06 (tv-parser), T08 (scan wiring), T11 (integration golden)
- **AC trace:** AC-1, AC-5, AC-7
- **Project scope:** `.` (root; `package mellifera_test` / a dedicated `_test` package)

## purpose

Per `docs/scan-library/acceptance.md:76-84` (reviewer-independence rule) and `docs/plugin-pipeline/acceptance.md §Reviewer independence`, the Acceptance Gate RE-DERIVES the expected outcome from each scenario's Given/When/Then — it does not trust the coder's assertions. This QA task authors BLACK-BOX tests that independently re-derive and assert the expected pipeline output (provenance, parseTV split, lifecycle state) from first principles (the fixture filenames + the state machine), complementing the coder's `integration_pipeline_test.go` with an independent witness.

## behaviors

- **Q1** Independently re-derive expected `{title, season, episode, resolution}` for a set of TV fixture filenames (incl. Cyrillic, multi-episode, dot-separated, no-title fallback) and assert the persisted `document.sources["tv-parser"]` matches the RE-DERIVED values — not the coder's constants. | ac: AC-1 | kind: normal
- **Q2** Assert per-field provenance independence: for several enriched fields, `json_extract(document,'$._provenance.<field>.plugin_id') == 'tv-parser'` AND the lossless `sources["tv-parser"]` namespace carries the raw values; `_view.<field>.source == 'tv-parser'`. | ac: AC-5 | kind: normal
- **Q3** Assert the parseTV split is clean: the base-scanner contribution (`document.parsed`) has NONE of `{season,episode,episode_end,release_group,year,resolution}` — those live ONLY under `sources["tv-parser"]`. | ac: AC-1 | kind: normal
- **Q4** Independently exercise the lifecycle state machine (AC-7): a fresh scan -> `status='enriched'`; construct an item whose only source soft-fails -> it reaches the FURTHEST valid state (e.g. `parsed`), never an illegal state; assert `GET /items?status=<each>` partitions correctly. | ac: AC-7 | kind: normal
- **Q5** Assert illegal state transitions are observable as rejected (an item never persists a status outside `{new,pending,parsed,enriched,failed,deleted}`). | ac: AC-7 | kind: edge

## invariants

- **INV-independent:** these tests do NOT import any `internal/*` package (black-box). They derive expectations from the public HTTP surface + the fixture filenames + the documented state set, then assert. No shared helper with the coder's golden that would couple expectations.
- **INV-rederive-not-hardcode:** season/episode are PARSED from the fixture filename in-test (e.g. a tiny filename->expectation table the QA author writes from the spec), so a coder bug that emits wrong numbers is caught.

## precondition

The coder pipeline (Tasks 01-11) is implemented and `go test ./...` is green. The `integration_pipeline_test.go` golden exists. The HTTP API + a real subprocess stack are available (the QA harness reuses the integration binary-build pattern).

## postcondition

A new black-box QA file (e.g. `qa_pipeline_acceptance_test.go`) exists with the re-derivation table + provenance/state assertions; it passes independently of the coder's golden; it skips under `-short`/missing ffprobe like the integration harness.

## test_seed

- A QA-authored filename->expectation table (independent of the coder's): `{"Breaking Bad S01E01.mkv": {title:"Breaking Bad",season:1,episode:1}, "Игра престолов S02E05.720p.mkv": {title:"Игра престолов",season:2,episode:5,resolution:"720p"}, "Show.S01E01E02.mkv": {season:1,episode:1,episode_end:2}}`.
- Drive a scan per fixture (or a mixed fixture dir), then assert `sources["tv-parser"]` == the table value; assert `parsed` lacks TV keys; query `?status=enriched`.

## refactoring_validation

- `json_extract(document,'$._provenance.title.plugin_id') FROM items` -> `tv-parser` (AC-5 probe, run by this test).
- `SELECT DISTINCT status FROM items` -> subset of `{new,pending,parsed,enriched,failed,deleted}` (AC-7 probe).
- These grep/SQL probes are ASSERTED by the test, not just manually run.

## coverage gap addressed

The coder's golden asserts ONE fixture's fields; QA independently re-derives a BROADER fixture set (Cyrillic, multi-episode, fallbacks) + the provenance/state invariants, closing the "coder asserted magic constants" risk.

## scope_boundary

- CREATE `qa_pipeline_acceptance_test.go` (black-box, independent of coder tests)

## out_of_scope

- Re-implementing coder unit tests (this is independent acceptance, not duplication)
- Phase B/C behaviors

## acceptance_criteria

- AC-1, AC-5, AC-7 independently re-derived and asserted

## skill_hint

`mellifera-build`, `grounding`, `contracts`, `stack-patterns`
