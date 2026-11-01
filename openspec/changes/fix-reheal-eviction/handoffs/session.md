# Session record — fix-reheal-eviction

## GATE 1 APPROVED (2026-11-01, user via approval prompt)

- "Approve as proposed": all 5 OQ rulings (grace 10m; locked const; seam RETIRED; face (a) out of scope; budget stale-first) + BOTH behavior expansions (orphan mtime reclaim, stale staging reclaim).
- Registered: 2 groups, 5 tasks (1.1, 1.2, 2.1, 2.2 + built-in git-check); pipeline home .tmp/fix-reheal-eviction in the WORKTREE, worktree attached (attach ran from the worktree — main-tree attach refuses on cwd-scoped home resolution, hls-round precedent).
- Baseline: full go suite rc 0 @ base 2950ace (clean, nothing to disclose); web vitest 447/447 green.
- Repro RED at anchor: internal/itest/reheal_eviction_joint_test.go TestRehealEvictionRetainsSupersededBuild binds the real eviction path; NO task touches that file — 1.2's duty proves it green unchanged.
- Next: apply batches — 1.1 → 1.2 → 2.1 → 2.2 (one fresh wf-coder each), then GATE 2.

## Apply batch complete (2026-11-01) — 4/4 green

- 1.1 GREEN first run (16.5s): pure deletion, 261 lines − / 0+ — seam (Deps.AfterPackPersist, EvictSuperseded, wiring, evict_test.go, TestStreamsLaneAfterPackPersist) gone; repro untouched.
- 1.2 GREEN first run (11.9s): pma_e/pma_f + pcg leg (b) flipped to the retention contract (both nonces present; superseded URL answers 200 with the session's old token); the REPRO TURNED GREEN UNCHANGED (byte-identical, untracked). Coder disclosed: leg-banner reword beyond anchored ranges + 2 stale comments left (pma_e :1222, pcg :39-40) — for the reviewer.
- 2.1 GREEN first run (1.1s): retentionGrace = 10m locked; sweepRetention in newSweep (frontier → retention → budget → integrity), dual-anchor rule, TestSweepRetention 7 subtests. Disclosed: one warn log on unreadable-row skip; no .tmp- carve-out (mtime anchor owns staging); deleted-status rows doc-judged in retention.
- 2.2 GREEN on re-run (first red = grep-literal "Stale bool" vs gofmt's two-space alignment; the doc comment carries the literal): ArtifactDir.Stale + stale-first sort clause after the fronted pin; sweepBudget all-stale for orphan+deleted rows; 3 new TestBudgetEviction cases + TestSweepBudget 4 subtests.
- GATE 2 dispatched: reviewer re-runs (4 duties --by wf-reviewer) + full-suite anchor go test ./... + spec/standards axes.

## GATE 2 — first verdict FAILED on the anchor; repaired via task 1.3 (2026-11-01)

- Reviewer verdict: spec PASS, standards PASS (all 8 disclosed judgment calls ruled ACCEPT/CORRECT; two P3 comment flags), repro quality PASS (RED evidenced via handoff tail verbatim + birth==mtime; never journaled — predates pipeline init, correct for the /fix pre-step). DUTY re-runs 4/4 green.
- ANCHOR RED: TestWeb_Integration/ac7_gates (make check → golangci-lint lll max 120) flagged 3 over-length lines of the UNTRACKED repro test (:74/:108/:112) — the PR #21 ac7 precedent exactly (scoped duties never hit make check).
- Repair BY THE BOOK: task 1.3 authored + registered (new id; duties of receipted tasks unchanged; --reason names the amendment): wrap the 3 lines, sweep the 2 stale comments (pma "(publish replacement)" dropped; pcg evict_test.go citation → retention_test.go TestSweepRetention).
- 1.3 GREEN on re-run (first red: funlen 61>60, forced by the wraps; fixed with package-level const format literals — rendered messages byte-identical, compiler-guaranteed; disclosed). lll 3→0, repro still green unchanged. No .golangci.yml carve-out.
- Full-suite anchor re-run dispatched (session shell); on green → human archive approval.
