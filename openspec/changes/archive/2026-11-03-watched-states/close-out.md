# Close-out — watched states

Strict openspec-loop run, 2026-11-03. Worktree `mellifera.worktrees/2026-11-03-watched-states` on
`feature/2026-11-03-watched-states` (base main @ ffc3e76). This file is the durable record once the
machine home (`.tmp/2026-11-03-watched-states/`) is cleaned.

## Loop record

- **Propose / GATE 1**: planner-authored proposal + design D1–D7 + 4-group tasks; surveyor round
  (trigger T1+T3) → 11/11 recommendations adopted, question frontier empty, waiver list empty.
  Approval committed 1953bcf; duties authored pre-register (register refused twice en route:
  group headings need `## N - goal`; task prose must be single-line — both lessons applied live).
- **Apply**: 16 tasks → 17 (1.6 added at the gate). One fresh @wf-coder per task, ≤3 concurrent,
  batching by file contention (group 1 serial on handlers.go; group 2: 2.1 → 2.2∥2.3 → 2.4).
  4 authored prose/duty amendments total (drift-gate-legal: `--reason` prose retargets only).
- **GATE 2**: round 1 **FAIL** — 15/15 duty re-runs exit 0, diff trace PASS, queue a–g CONFIRMED-OK,
  but integration edge 9 unimplemented (`GET /progress/{item_id}` served `rec_score` without
  `watched`). Closed by task **1.6** (new id, 2e31eab); 3.4's anchor re-run green (receipt
  16:38:55Z, regen zero churn); round 2 **PASS** (18/18 edges evidenced). Human approval recorded
  in review.md (pre-authorized conditional on PASS).
- **Close**: archive (spec deltas merged: `recommendation-sorting` ~2, `web-ui` +2; Purpose blocks
  verified real) → merge-back push + **PR #27** → alatoic deploy → @wf-docs (b144ba0) → this file.

## Final receipt summary (17/17 green; 39 receipts total — reds superseded by re-runs)

| Task | Final receipt (UTC) | Final by | Note |
|---|---|---|---|
| 1.1 | 16:08:39 | wf-reviewer | item/progress stamps + recsFactsFor |
| 1.2 | 16:08:48 | wf-reviewer | series stamps |
| 1.3 | 16:08:56 | wf-reviewer | rail withdrawal both branches |
| 1.4 | 16:09:06 | wf-reviewer | completed flag on OnProgress |
| 1.5 | 16:09:13 | wf-reviewer | Entry.Watched + Order partition |
| 1.6 | 16:40:47 | wf-reviewer | edge-9 closure (added at gate) |
| 2.1 | 16:09:24 | wf-reviewer | SPA wire types + shared query |
| 2.2 | 16:09:32 | wf-reviewer | rail filter |
| 2.3 | 16:09:39 | wf-reviewer | tri-state rendering |
| 2.4 | 16:09:46 | wf-reviewer | flagged-write edges + dedupe bypass |
| 3.1 | 16:09:57 | wf-reviewer | roundtrip qa pins (duty-pattern gap covered by 3.4 — queue item f) |
| 3.2 | 16:10:15 | wf-reviewer | expectation sets (fixture fix 8572c9b after gate catch — queue item g) |
| 3.3 | 16:10:28 | wf-reviewer | SPA vitest consolidation |
| 3.4 | 16:38:55 | wf-coder | full gate anchor, 2nd re-run, zero churn |
| 4.1 | 16:10:36 | wf-reviewer | README bullet |
| 4.2 | 16:10:46 | wf-reviewer | validate --strict green |
| git-check | 16:45:24 | wf-coder | green after merge-back push |

Every task's duty was re-run to green by the reviewer in its own shell before the verdict; red
receipts (3.4 gate catch; git-check pre-push) were superseded by re-runs, never trusted.

## Full-suite anchors (the law held twice)

- Baseline @ ffc3e76: `go test ./...` rc 0; web 42 files / 612 tests.
- Gate @ 2e31eab: `make build && make check && make test` 23 pkgs ok; web 45 files / 633 tests;
  web-build regen byte-stable (reproduced a third time inside alatoic's docker build at deploy).

## The gate catches (session lessons, recorded for the next change)

1. **Full-suite anchor caught TestListItemsScored** — no scoped `-run` pattern matched it
   (`'TestListItemsScored'` contains neither `Order`, `TestQA`, nor the golden/progress patterns),
   so 3.2's retarget ran green-blind; root cause was fixture-side (weights write lacked the action
   tag). Rule: when a task edits a test by name, its duty names that test.
2. **Reviewer's edge audit caught a real planned-but-missed wire stamp** (edge 9 → task 1.6).
3. Deploy determinism: committed dist rebuilt byte-identical on alatoic.

## Ship state

- Deployed **alatoic @ 49c15d4** 2026-11-03 (health HTTP 200/6s) via
  `MELLIFERA_REPO=<worktree> mellifera-deploy/deploy.sh`.
- **PR #27** open (`feature/2026-11-03-watched-states` → `main`, carries docs commit b144ba0):
  human merges; then human-run `git worktree remove` + `git branch -d` from the main tree
  (merge-back plan steps 3–4).
- Docs debt untouched by design (dedicated pass): api-reference.md lacks the watched wire
  (`?include=watched`, `watched`, `completed`); internal/api/doc.go INV2/INV5 staleness (flagged
  24 Oct) persists.
