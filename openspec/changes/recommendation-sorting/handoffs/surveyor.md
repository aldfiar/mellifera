# Surveyor handoff — recommendation-sorting (addressed to wf-reviewer)

RE-RUN record (amendment round 2026-11-03). The human adopted all seven
answers from the original survey; the planner amended the artifacts (all
validated strict): design.md Interfaces/D6/D7, tasks.md (2.2, 3.1, 3.3, 5.4,
1.1/1.2 @qa+qa:, all 13 verify duties), and the recommendation-sorting delta
(photo carve-out SHALL + scenario). The question frontier is CLOSED — zero
open questions. Evidence: `openspec/changes/recommendation-sorting/
integration.md` (§4 resolutions, §5 re-verification). Live source at HEAD
f03a3f3, tree unchanged since the original survey.

## Frontier status

CLOSED. Q1-Q7 all RESOLVED by adoption; the re-run raised no new
human-only question (two non-blocking notes remain — integration.md §5).
No waivers granted.

## Resolutions and their artifact homes

- Q1 resolver home: `internal/enrich` beside `ResolveGates`
  (genres-of-winning-document walk, exported for cmd; api keeps its
  unexported namer projection) — design.md Interfaces + task 2.2. Seam
  re-verified at `internal/enrich/gates.go:25`; enrich goes 11→12 top-level
  exports — inside the >12 fail bar, WARN band.
- Q2 score-then-window: full filtered set → recs score/sort in Go →
  offset/limit in the handler; never SQL-window order under the score
  default — design.md D6/D7 + task 3.1. No QueryItems collision: its SQL
  windowing (`internal/store/items.go:115`) never receives the score order;
  `limit <= 0` returns nil today (items.go:95-97), so the full-set read is
  new machinery — a QueryItems paging loop stays inside task 3.1's api
  scope, or a store method (budget-free: check.sh counts top-level
  declarations only, exported methods never count).
- Q3 photo carve-out: photo-scanner-module libraries serve path order
  regardless of score, by mechanism — delta SHALL + WHEN/THEN scenario +
  task 3.3 ModuleID branch. Anchor re-verified:
  `internal/store/libraries.go:21` (ModuleID);
  `internal/api/libraries.go` does not exist.
- Q4 task 5.4: bare `scripts/check.sh` dropped; duty = make build/check/
  lint + web vitest + tsc. Targets verified: Makefile build:14, test:18,
  lint:22, check:26, web-build:72; web carries vitest + tsc binaries.
- Q5 tv-mode sequencing: accepted; recorded in review.md at the gate (no
  artifact edit, by design).
- Q6 wake send: select-on-ctx, no channel close — design.md Interfaces.
- Q7 qa annotations: task 1.1 `@qa` + 5 `qa:` nodes; task 1.2 `@qa` + 4
  `qa:` nodes (tasks.md:7-12).

## Re-run verification summary

- All 13 `verify:` duties mechanically sound and RED today: nine named new
  test files absent (`test -f` red, incl. `internal/recs/recs_test.go`);
  4.1 greps red — both EXISTING test files
  (`web/src/lib/nextup.test.ts`, `web/src/pages/home/Home.test.tsx`) carry
  0 `rec_score` hits; 5.2 grep red — `internal/web/api/openapi.json` exists
  (132 KB, 0 hits) and `make web-build` regenerates it (Makefile:72-75);
  5.3 greps red — GLOSSARY.md 0/0.
- Map note: rebuilt this round, fingerprint unchanged, but the index
  carries 427 files with `symbols=0` — no Go symbol rows are extracted.
  Every Go anchor was grounded by targeted live-source grep (`file:line`)
  this round; re-ground Go edges the same way at the gate — do not expect
  map def/callers rows for Go.
- Verdicts stand after refresh: Wiring PASS (no orphans; the Q1/Q2 gaps
  resolved), qa seam PASS (dedicated 5.1 + probes 2.3/3.3 + now the 1.1/1.2
  annotations), Complexity PASS (photo mechanism specified, wake hazard
  resolved, no hidden scope — the Q2 full-set read stays inside named task
  scope).

## Notes for the gate re-check

- Episode-table narrative order SAFE by construction: dedicated route
  `/series/{id}/episodes` (router.go:329 → handlers.go:1343, store read
  ORDER BY relative_path series.go:205) — listItems changes cannot touch it.
- ContinueRow already renders served order with no client re-sort
  (Home.tsx:424-426) — task 4.1's web delta is Next-up ordering + DTO types.
- Non-blocking: task 4.1's prose names Home.tsx + Home.test.tsx while its
  verify also gates `web/src/lib/nextup.test.ts` (file exists, 0
  rec_score hits — red as intended); at most one red-verify loop.
- Design Interfaces still name three store methods (ListTagWeights appears
  only in task 1.2 + its qa: list) — "naming settled at build" covers it.
- enrich lands at exactly 12 top-level exports with the resolver — any
  further enrich export splits the package.
