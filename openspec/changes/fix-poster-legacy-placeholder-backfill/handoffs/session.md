# session handoff — fix-poster-legacy-placeholder-backfill

GATE 1 approved 2026-10-26 by the user, FULL scope (no trims): 3 groups / 6 tasks — settle repair leg (repro duty red-on-base), golden repair fixture, posters `no_upstream_art` reason (api+web), item→series artwork fallback, art-401 mask removal (red-on-base), embedded regen. Baselines green at base a467358: go 22 pkgs rc 0, vitest 29 files / 383 tests. Register derived 3 groups / 7 tasks (git-check included), first pass.

Wave plan (group order = DAG; art.go and settle_test.go each have ONE owner per wave):
1. {1.1 settle repair @wf-qa}
2. {1.2 golden fixture, 2.1 posters reason @wf-qa, 3.1 art-401 mask} — disjoint files
3. {2.2 item series fallback} — after 2.1 (same art.go)
4. {3.2 regen closure}
Then GATE 2 (@wf-reviewer), close, merge-back.

Carrier diagnosis: handoffs/wf-debugger.md (legacy placeholder keys pre-date the 2026-10-24 write-side drop; nothing was deleted). Key design pins: exact-prefix strip only (real URLs byte-identical), zero new exported symbols (internal/api at the 12 hard-fail boundary), field-driven «У источника нет постера» off the served reason, mask-removal shape for 3.1 (fetcher already routes 401).

Next: GATE 2 VERDICT — PASS (2026-10-26). Reviewer re-ran all six duties in its own shell (--by wf-reviewer; receipts 21:36–21:37Z now the latest, cmd-match holds); status `green: 6/7` rc 1 (git-check red = pre-close norm). Per-task 6× PASS, zero spec findings, one standards note: S-1 (P3, judgement call, NO action) — Settle's rows shape retains all walked docs in memory for the boot pass (streaming walk would avoid it; D1 explicit choice, KB-scale). Adjudications: 2.2 flake = PRE-EXISTING teardown timing (5/5 count=5, full -race green, dial call sites identical to base); in-session 3.2 = VERIFIED legitimate (4 files dist+api only, rebuild reproducible); 3.1 shared-worktree receipt = SUPERSEDED by final-tree re-run. Gate anchor: go test ./... 22 pkgs ok; vitest 29 files / 386 tests. AWAITING: human archive approval → review.md → archive → @wf-docs → closeout → clean → merge-back.
