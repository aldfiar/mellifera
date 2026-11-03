# Session record — watched-states loop

Feature: `2026-11-03-watched-states` · lane strict · worktree `mellifera.worktrees/2026-11-03-watched-states` on `feature/2026-11-03-watched-states` (base `main` @ ffc3e76), attached to the pipeline home.

## Loop state at this writing (2026-11-03, post-batch A)

- GATE 1 APPROVED (human, this session): proposal adopted with ALL 11 surveyor recommendations amended in (planner round → surveyor re-run: 11/11 resolved, no new questions, waiver list empty). Amendment committed 1953bcf; duties authored before register (register refused twice en route: group headings needed `## N - goal`; task prose must be single-line).
- Registered: 4 groups / 16 tasks (15 + built-in git-check). Baseline green (go test ./... rc 0; web vitest 42 files / 612 tests).
- Batch A GREEN + committed: 1.1 (item/progress watched stamps across scored listing, single-item GET, seriesEpisodes, sort=path; new `recsFactsFor` on getItem/seriesEpisodes; `watchedSet` helper) → 9abfc84; 1.5 (Entry.Watched + partitioning Order + leaf test; scoredServe `watched` predicate wiring, items + series call sites, `seriesWatched` all-episodes law) → 1aad829.

## Group 1 CLOSED (2026-11-03, 5/16 green)

1.1 9abfc84 · 1.5 9abfc84+1aad829 · 1.2 7ff9fd4 · 1.3 c22f316 · 1.4 2788cc2. Prose amendment registered (1 amend): 3.2 retargets `TestWatchedItemStamp`'s hollowed progress-row case to `?include=watched` (1.3 flag). Reviewer queue: (a) qaRecsWatchDetect mirror took the intent-leg behavior — deviation recorded by 1.4, docstring contract justified it; (b) surveyor blast radius missed recs_probes_test.go + thumb_test.go closures (same seam ripple, handled); (c) 1.4 dropped the detector-failure PUT duty case by its own condition — repo doesn't expose it on the wire. Expected churn until 3.x: TestGoldenCompletedSkipsResumeBonus + TestRecsRoundtrip partition subtests (3.1/3.2 own; both already in authored scope).

## Group 2 CLOSED (2026-11-03, 10/16 green)

2.1 579e9aa · 2.2 b3d2ac7 · 2.3 a3b4fde · 2.4 6dea8d1. Reviewer queue additions: (d) 2.3's grid-level in-progress bars are NEW rendering (grids had no bars before) — justified from the web-ui delta's "keeps its bar" scenario, fed by the shared include=watched cache; pastel = default-library dot pastel #a4c8f4, deliberately outside the tv CSS shell; (e) 2.4's bypass hoisted `report` to component scope (useCallback) — listener lifetime verified unchanged; Player/SkipChip pin updates were 2.4's own ripple (3.2 owns only nextup pins). Web suite 631/631 green.

## Group 3 CLOSED + 4.1 (2026-11-03, 15/16 authored green; git-check pending)

3.2 eb66017 (+prose amend e84b144) · 3.1 2b9b127 · 4.1 68fc19b · 3.3 68fc19b+286b601 · 3.4 gate anchor GREEN on re-run (receipt 2026-11-03T16:02:18Z; the earlier red receipt is superseded — re-run, not a trust) — regen commit pending at this writing (test fix + dist/OpenAPI together).

**THE GATE CATCH (reviewer queue item g):** 3.4's full-suite anchor reded on `TestListItemsScored` — a test NO scoped duty ever matched (`'TestListItemsScored'` contains neither `Order` nor `TestQA` nor `Golden|Progress` patterns), so 3.2's retarget ran green-blind. Root cause was fixture-side, not production: the fixture's `ApplyTagWeights` write was `[]string{"thriller","thriller"}` — no action weight — so watchedFilm's tags-only score was honestly 1 (base), while the retargeted assertion wanted 2; `score_then_window` still pinned the pre-sink page order. Fixed IN-FIXTURE (weights write gains `action`; window retargeted to the served post-sink order) — pins kept at full strength, no production code touched, no assertion weakened. This is the SECOND demonstration of the baseline+gate full-suite-anchor law (cf. PR #21's exported-budget gate).

## Notes for the next launch / the gate

- GATE 2 next: @wf-reviewer re-runs every green duty (incl. 3.4's full gate chain — expensive but mandated), checks the diff vs the spec deltas, reads reviewer-queue items a–g above, and runs the item (f) joint directly (`go test ./internal/itest -run 'TestRecsRoundtrip$'`).
- Serial order in group 1 (1.2 → 1.3 → 1.4): handlers.go contention; 1.4 (OnProgress seam widening, api + cmd/mellifera + three test-closure sites) flies solo — any concurrent Go task breaks compile mid-flight.
- Group 2 plan: 2.1 solo (types + shared useProgressList) → {2.2 ∥ 2.3} → 2.4 (Collection.tsx holds SeriesCard/ItemGrid AND MarkWatchedRow).
- Group 3 plan: {3.1 ∥ 3.2} → {3.3 ∥ 4.1} → {3.4, 4.2}. 3.3's duty runs nextup.test.ts which 3.2 edits — hence serial after 3.2.
- Duty-authoring lesson (for future changes): a `-run` pattern must match test-name casing AND cover every test the task's prose touches — `TestListItemsScored` slipped every pattern in 3.1/3.2's duties. When a task edits a test by name, its duty should name that test.
- Session handoff cadence: this record written at GATE 1 approval (late — the put ran at approval, the write landed post-batch A); next writes after each applied batch and at the GATE 2 verdict.

## Evidence hierarchy

Receipts (`receipts.jsonl`) + `wf pipeline status` are the evidence; this record is belief. Verify deliverables on disk before trusting any report.
