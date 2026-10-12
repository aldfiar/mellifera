# Gate record: serial

## Verdict (GATE 2 step 1 — @wf-reviewer)

**GATE PASS** — zero FAIL, three non-blocking FLAGs.

Probe evidence (all re-run by the reviewer, exit codes observed):
- d4167ca009f50671 `go test ./plugins/serial-parser -run TestSeriesNameGrammar` → rc 0 (uncached re-run, all subtests PASS)
- ce10a0d2a6656bf4 (same probe command) → rc 0
- 142510dd698d7b6c `go test ./plugins/serial-parser -run TestEpisodeNameGrammar` → rc 0
- b5d78250688f037a `go test ./plugins/serial-scanner -run TestBareNamedEpisodeSidecar` → rc 0
- 16778b8ef0faece4 joint e2e → rc 0, `--- PASS: TestQASerial_JointLibraryE2E (7.72s)`, 8/8 subtests over the real subprocess graph

Spec axis: all boxes' task rows green in their tables; pipeline matches the spec text (strip order, always-season, episode first-match + season fallback, Match confidence 1.0/0.6); D-7 verified (brand appears only in parser_test.go fixture rows; releasetags.go fully role/shape-keyed); D-8 verified (no /Volumes reads at runtime; derived rows neutralized); QA-cycle regex fix reviewed safe (single-case words and Title_(Shiro) preserved, multi-word Demon Slayer row pinned); box 2.1 season-ladder omission judged sound (bare forms keyed by number alone, per the MODIFIED Sidecar association requirement).

Standards axis: PASS — package-main with zero exported symbols, pure core/thin shell, no new deps, downward-only deps with the cited replication convention, table-driven tests, sentinel retired without a compat shim.

FLAGs (non-blocking):
1. Stale CONTRACT-MISMATCH residue comments in qa_serial_e2e_test.go — RESOLVED pre-archive (comment/error-string-only reword + full reopen+retick, check re-verified green).
2. Episode-0 divergence: parser's серия/edge-bracket branches accept 0, scanner gates n>0 — spec letter not breached, no fixture hits it. Follow-up candidate: one-line normalization in both binaries.
3. DRY nit: resolution vocabulary encoded twice in releasetags.go (resolutionRe vs releaseTagTokens["resolution"]) — P3, mirrors the shipped replication posture. Follow-up candidate.

## Human archive approval (GATE 2 step 3)

Approved by the human, 2026-10-12: "approve".

GATE PASS (step 1) + `wf change check serial` exit 0 (step 2, 5/5 done re-verified) + approval above (step 3) → `openspec archive serial --yes` authorized.
