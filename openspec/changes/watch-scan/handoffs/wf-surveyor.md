# wf-surveyor → wf-reviewer — watch-scan integration audit (amendment-round re-run)

Rewritten 2026-11-11, post-GATE-1 amendment round (the ONE surveyor re-run, openspec-loop
§Propose step 4), still pre-register. Baseline unchanged: 689a323 — all graph anchors
re-grounded this pass (run.go:75, main.go:403-405, router.go:30, handlers.go:1188,
store/libraries.go:349, access/viewer.go:45, janitor.go:61-62, runbook :94/:252,
NOTICE:22-27); planned-new nodes still absent from disk (internal/watch,
cmd/mellifera/scanflight.go, cmd/mellifera/main_test.go); go.mod still fsnotify-free;
proposal.md byte-untouched. Evidence lives in `openspec/changes/watch-scan/integration.md`
(§6 resolutions, §7 re-run verification); this file is belief for your re-check, never a
substitute for evidence.

## Amendment-round verdict: AMENDMENTS VERIFIED — all five landed, mechanically sound

- **Q2** — design.md:97-104 "Dispatch law (pinned)" (Run select loop NEVER awaits
  Deps.Scan inline; every trigger — quiet-window AND reconcile — dispatches its own
  goroutine; bounded by the single-flight), cross-referenced from D4 at design.md:123-126,
  operationalized in task 1.2 prose (tasks.md:8). D3 pins, D4 references, the task
  enforces; consistent with D4's starter-ctx discipline. Edge impact: none (E1/E2 already
  assumed dispatched fires — the amendment pins the contract).
- **Q3** — spec.md:72-74 stop bound "within one reconcile interval"; scenario
  deleted-library-stops-autoscan THEN carries the same bound (spec.md:82); in-gap
  failed-trigger WARN transient documented in task 3.1 (tasks.md:21).
- **Q4** — boot gap documented in task 3.1 §2 row (tasks.md:21); D5's no-boot-run pin
  (design.md:163-164) and spec lifecycle requirement (spec.md:86-87) untouched.
- **Q6** — TestRunReconcileDropsDeletedLibrary named in task 1.2 (tasks.md:8, "stops
  receiving scans within one tick" — mirrors the amended bound) + qa entry (tasks.md:9).
  Adapter named tests 6 → 7; deleted-library-stops-autoscan coverage row: gap → unit.
- **Q7** — task 1.2 NOTICE clause names BSD-3-Clause explicitly for the fsnotify line
  (tasks.md:8); the "(Apache-2.0…)" parenthetical now unambiguously describes the
  neighboring Swagger UI entry only.

## Question frontier: EMPTY for GATE 2

All seven questions ruled at GATE 1. Zero open questions. Exactly one waiver, to honor:

| Q | Resolution |
|---|---|
| Q1 | ANSWERED — two-knob surface kept (INTERVAL ≤ 0 disables, no boolean); no artifact edit needed |
| Q2 | ANSWERED (amended) — dispatch law pinned in design D3/D4 + task 1.2 |
| Q3 | ANSWERED (amended) — spec bound "within one reconcile interval" + scenario THEN + task 3.1 note |
| Q4 | ANSWERED (amended) — no-boot-scan kept; boot gap documented in task 3.1 |
| Q5 | **WAIVED** (human-approved at GATE 1) — both-sides join coverage at unit tier (unit -race + count-grep pin + both trigger paths covered end-to-end separately); no joint join leg |
| Q6 | ANSWERED (amended) — drop-side test + qa entry added to task 1.2 |
| Q7 | ANSWERED (amended) — BSD-3-Clause named in task 1.2 |

## Verdicts (re-run — deltas marked)

- **Wiring coverage: COVERED** (unchanged). 13 nodes / 11 edges, every edge has an
  implementing task; no orphans. Duty-strength observations stand, for your gate read:
  W1 — the NOTICE line has no duty assertion (task 1.2's verify greps go.mod only);
  W2 — both-sides re-route pinned by count-grep (≥2 `flight.run` in main.go), folded
  into the waived Q5; W3 — TestWatchKnobs vacuous until main_test.go exists (normal
  new-module posture; the duty's grep half carries teeth).
- **QA seam coverage: COVERED** (delta: was "unit tier + two gaps"). Q6 closed by
  amendment; Q5 waived per the table above. Named qa entries now: 5 engine + 7 adapter
  + 3 joint legs; self-authored: 3 scanflight tests + TestWatchKnobs.
- **Blast radius: CLEAN** (unchanged, re-checked this pass). scan.Run exactly one
  production caller (main.go:404); api.Deps.Scan exactly one consumer (handlers.go:1194),
  one production builder (main.go:397), re-route signature-compatible with router.go:30;
  scan_jobs reserved (open.go:117 / libraries.go:136 only); proto untouched holds; the
  zero-touch claim (api/scan/store/proto) HOLDS.

## Re-check hooks for GATE 2 (unchanged in substance)

- Both-sides join: `wf index query callers` is meaningless for the unexported cmd type —
  grep cmd/mellifera; assert BOTH closures route through the ONE scanFlight instance.
  Q5's waiver covers the join's coverage TIER, not the wiring — the E2/E3 edges still
  must exist in the diff.
- Orphan check: watch.Service consumed only by main.go; scanFlight by both closures; a
  wired node nothing calls after the change = FAIL.
- Pure leaf: no mellifera imports inside internal/watch (deps arrive as closures — D1).
- Cosmetic, not drift: proposal.md's Impact list names only "§2 knob rows" for the
  runbook (proposal.md:69) — the §8 troubleshooting row from the amendments is not
  listed beside it. proposal.md is GATE-1-frozen; tasks.md:21 is the executable contract.
  Planner-flagged, recorded, no action.
