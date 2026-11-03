# review — recommendation-sorting

## GATE 1 record (2026-11-02)

**Verdict: APPROVED — proceed to register + apply.**

- Proposal presented in-session (5-phase summary: recs model → learn → serve → web → closeout, 13 tasks); human directive **"run till gate 2"** (2026-11-02) then **"Adopt all 7"** surveyor answers at the frontier decision — recorded as the GATE 1 approval.
- **Baseline disclosure** (worktree bootstrap, base main f03a3f3): `go test ./...` exit 0, all packages green (long pole `internal/itest` 259 s); `npm ci` exit 0. Zero pre-existing failures inherited.
- **Surveyor**: trigger T1+T3; survey ran, amendment round applied (all 7 answers), re-run certifies **frontier CLOSED — 0 open questions**; wiring / qa-seam / complexity all PASS (integration.md §4 resolution table + handoffs/surveyor.md).
- **Amendment round** (planner, pre-register): Q1 enrich-resolver home · Q2 score-then-window · Q3 photo ModuleID carve-out (spec SHALL + scenario) · Q4 scripts/check.sh path dropped · Q6 wake select-on-ctx, no close · Q7 @qa + qa: on 1.1/1.2 · cosmetic line-cite fixes · 13 `verify:` duties authored (validate strict rc 0).
- **Q5 (TV-branch sequencing)**: accepted — rec-sorting lands on main first; `feature/tv-mode` (PR #24 open, deployed to TV test) rebases at integration and the TV retest covers the scored default on TV surfaces.
- **Reviewer note (map caveat)**: `wf index build` in this tree extracts no Go symbol rows (fingerprint stable, symbols=0); all anchors were grounded by live-source grep at file:line — re-ground Go edges the same way at GATE 2.

## GATE 2 record (2026-11-03)

**Verdict: PASS** — one FLAG raised at the gate, fixed, spot-checked; gate closed with the human's archive approval.

- **Evidence**: full-suite anchor `go test ./...` exit 0 (only harness-plugin DEBUG noise); `wf pipeline status` rc 0 (14/14, cmd-match); reviewer re-ran all 14 duties green (`--by wf-reviewer`; 5.1 also forced uncached `-count=1` — 4/4 subtests with real plugin processes), spec deltas anchored at file:line, integration edges e1–e10 re-grounded against the post-change tree, orphan check clean (notifyRecs live — one production caller, watch_detect.go:66), standards axis clean (all judgement calls documented, none breaching a documented standard), 2.2's wake-send deviation judged PASS (Q6's no-panic/no-hang holds better under the guarded send than the authored select-on-ctx wording), 3.3's sanctioned additions verified wired + mutation-checked.
- **FLAG (task 3.2) → FIXED**: `GET /api/v1/progress/{id}` under-scored a zero-position episode row of a STARTED series (tags-only where the grid serves 500+tags — startedness derived from the single-item slice; recs_ordering.go:186-193 + handlers.go getProgress). Human ruling: **fix now** (2026-11-03). Fix (wf-coder): `startedSeed map[string]bool` param on scoreItems — listings pass nil, derivation byte-identical; new unexported `(*app).seriesStartedFact` (QueryItemsBySeries full-set read + the scoreSeries started rule over the global batched facts) seeds getProgress for episode items; pinning test `TestGetProgressRecScoreZeroPositionEpisodeStartedSeries` covers BOTH startedness legs (asserting 502). Reviewer spot-check: 3.2 FLAG → **PASS** (uncached runs + goldens green, no new exported symbols, no new imports/INV2 intact, duty text unchanged).
- **Residuals recorded (none blocking)**: (1) operational — close must commit the fix + re-run the git-check duty before archive (honored in this close sequence); (2) P3, pre-existing — listing startedness derives from the FILTERED slice, so a path_prefix/top_level filter hiding sibling episodes under-reports startedness in that grid view (seriesStartedFact is the pattern if it ever matters); (3) accepted cost — one QueryItemsBySeries point read on the single-entity route, never in a loop.
- **Archive approval**: human approved **fix-now** + **archive + close sequence** (2026-11-03) — recorded here as the GATE 2 human step.
