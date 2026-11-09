# Review — home-rail

## GATE 2 record (2026-11-09)

- Reviewer verdict: **APPROVE** (@wf-reviewer, everything re-run fresh in the reviewer's own shell, `--by wf-reviewer`).
- Verify re-runs: 4/4 rc 0 — 1.1 fresh (3.3s), 1.2 same-code-state (go test cache), 2.1 tsc + vitest 9/9, 3.1 byte-idempotent regen (same `index-Cznl0keC.js` dist hash as the original receipt).
- Full suite at the GATE anchor: `go test ./...` **25/25 packages ok** (internal/itest fresh 326.6s; the known internal/art detached-fetch/TempDir flake did NOT reproduce); web `vitest run` **700/700** (52 files; baseline 699 + the new anchor-card test).
- Spec deltas ×3 (home-continue, web-ui, recommendation-sorting): fully implemented — every delta claim traced to a named pin (`watched_series_serves_anchor_card` omitempty wire probe, `skip_ahead_resumes_below_the_ledger`, `caught_up_without_next_serves_nothing`, `entity_grain_bound_cut_counts_cards`, `resume_row_byte_parity`, `renders-anchor-card-current-absent`, …); no diff behavior lacks delta coverage.
- Audit prose (tasks 1.1, 1.2, `audit: true`): verified by inspection. Two cosmetic prose slips in six-slot text (a season-number example; the vanished-item skip living in the entity walk rather than the composer — strictly stronger), neither a behavior breach.
- Standards axis: PASS — pure delegation holds, ZERO new exported symbols, no shared mutable types, client derives nothing; gofmt clean.
- integration.md re-ground: CLEAN — the index anomaly reproduced exactly as recorded (build ok, symbols=0), the grep fallback was sanctioned and used; removed symbols (`homeLoad`, `homeSeries`) have ZERO stale callers tree-wide; no wired-but-uncalled node; the Q2 re-ground item (`invisible_library_two_viewers`) confirmed nil-guarded against the new wire; waivers granted: none — none needed, all planned edges E1–E18 evidenced in the diff.
- Five cosmetic observations recorded (design.md method-vs-pure sketch; QueryItemsBySeries read per *resolved* series; floored entity carries no artwork leg — the honest direction; web's defensive bare-series branch for a never-served shape; proposal.md entity-layer phrasing residual). None blocking.

## Human archive approval

- **APPROVED by the user** (2026-11-09, chat): the standing instruction set the approval at the finished feature ("user approval only then feature will be done"); the user selected **"Approve — archive + PR"** and confirmed with **"approve"**. Close authorized end-to-end: commit → git-check → archive (delta merge) → placeholder police → @wf-docs → close-out notes → pipeline clean → merge-back (push + PR; the human merges the PR).
