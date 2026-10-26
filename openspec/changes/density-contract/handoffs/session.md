# session handoff — density-contract

GATE 1 approved 2026-10-26 by the user (proposal as presented: 4-group/6-task plan, cap decision = browse unified at 6xl / ItemDetail 5xl exception, type floor 14px, photo stage calc cap; TV mode 7.2–7.4 fenced out to a future change). Baseline green at base 7fb8fde: go test rc 0, vitest 28 files / 363 tests. Register derived 4 groups / 7 tasks (built-in git-check included), first pass, no grammar refusals.

Wave plan (≤3 concurrent, group order = DAG):
1. {1.1 density core @wf-qa, 2.2 cap unify @wf-coder, 2.3 type floor @wf-coder}
2. {2.1 grid clamp, 3.1 photo stage cap} — both depend on 1.1's lib/density
3. {4.1 closure: make web-build, dist committed, api byte-identical}
Then GATE 2 (@wf-reviewer re-runs all duties), close, merge-back.

Open tuning notes carried from planning: chrome constants 302/136 are pre-#15 measurements — parameters, re-check visually at review; the clamp var is scoped to the SeriesGrid ul only (other .scard renders resolve `none` by design).

Next: GATE 2 ruled by the human 2026-10-26 (recorded in design.md): (1) rows @540px superseded by a tiered contract (two-row tier at vh ≥ 662, one-row below, floor-only below 422); (2) photo-stage identity below the fold accepted as documented degradation; (3) chrome double-count fixed 302 → 182. Fixes landed as bcc5599 (tier tracks, posterTrackColumns, fs-pin test) + fb5bc7e (review cleanup). 2.1's old duty became unsatisfiable (duty is protected on receipted tasks) → home abandoned with tombstone (reason recorded), artifacts re-authored to the shipped mechanism, fresh init/attach/register, all six duties re-verified green against shipped code. Dev server run + stopped (visual fix evidence: 4 tracks × ~260.7px, cards fill tracks, 388px posters, first row bottom 635px at 1280×633). Change folder committed + branch pushed. Remaining: review.md (gate record + archive approval), archive, docs, closeout, clean, merge-back.
