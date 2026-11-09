# review - tombstone-lifecycle

## GATE 2 record (2026-11-09, @wf-reviewer @ 208481b)

**Verdict: Pending Fixes → fix round → ALL CLEAR.**

- Re-runs: 12/12 authored duties green in the reviewer's own shell (`--by wf-reviewer`, receipts landed); git-check flagged mechanical (gate-cadence handoff write) — green after close commits.
- Full suite: first verdict FAIL — ac7_gates/make-check lint, 9 findings all in the change's own new test files (base verified lint-clean at /tmp/wf-gate2-base; the PR #21 precedent class — the check only runs at the full-suite anchor). Fix round b4fbd07 (lint-only: dupl→shared helper, gocognit→healLeg table, funlen→2 extractions, ineffassign→dead captures dropped, lll→wrapped; all 12 test names frozen, zero behavior change) → golangci-lint rc 0, ac7 ok, `go test ./...` 27 packages ok, duties 2.2/2.5 receipts refreshed green.
- Vitest 702/702 (baseline 699 + 3).
- Deltas: all four (scan-library, playback-progress, packaged-playback, web-ui) implemented; nothing outside deltas except the recorded D4 amendment (design.md dated note — the 2.4-red falsified-assumption story owning tasks 2.5/2.6/2.7).
- @audit contracts read pin-for-pin: 2.2, 2.3 (queue.go fire = contract-driven, not drift), 2.5 (bridge law + Q11 single-leg grounding in all four spots), 2.6 (walk exclusion + fire guard + self-move guards), 3.1 (consts + stat gate + missing-beats-cooldown), 3.2 (one seam, store invariant, serve-boundary 404, art ALL-rows pin).
- Edges E1–E26 re-grounded by grep (index symbols=0 anomaly): callers exact, guards in place, orphan check clean.
- Waivers: NONE. Q1–Q12 all resolved.
- Standards: exported-symbol budgets unchanged from base (WARN band posture, pre-justified R10); table-driven tests for new exported symbols; P3 notes recorded (N+1-shaped series re-read bounded by tombstone count; two unexported stamp-read helpers; stat-error-as-missing honesty; PUT /items/{id}/state test pin = one-line follow-up).

## Amendment acknowledgment record (surveyor round-4 request)

Q11 (bridge-floor single-leg attribution) + Q12 (stale pre-amendment scenario trio) were raised by @wf-surveyor round 4 and resolved by @wf-planner fold-in under the session's STANDING user instruction ("continue with design and wf-surveyor checks, until design be without issues, then implement; user approval when the feature is done") — the same basis as amendment rounds 1–2. Both fixes verified landed by the GATE 2 reviewer (Q12: each scenario appears exactly once; Q11: all four spots).

## Human archive approval

**APPROVED** — 2026-11-09, the user selected "Approve — archive + PR + deploy (Recommended)": archive the change, merge spec deltas, open the PR, deploy to alatoic, then one rescan of library 3 ("Ongoings") — acceptance: JoJo E03's 88% lands on itm_3_0ae96378e0faeb8a; Black Clover + the 4 old JoJo items retire.
