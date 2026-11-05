# Close-out — watched-signal-refinement (archived 2026-11-05)

The durable record: pipeline home `.tmp/watched-signal-refinement/` was deleted
at `wf pipeline clean`; this file carries the final per-task summary. Spec
deltas merged into the living web-ui spec (2 requirements amended: "Watched
element states" + "CardActions element menu" — glyph law, meta-row slot, D9
visibility split, restored hit twins, ✓-ownership cross-reference).

## Per-task receipts (all rc 0; last receipt per task)

| Task | Commit(s) | Duty (last receipt) |
|---|---|---|
| 1.1 WatchedToggle glyph law (✓ body, no inline styles, placement prop deleted, one carrier form) | `09d8ea6` + `7403228` | vitest run WatchedStates.test.tsx (15/15 first green; 23/23 at close) |
| 2.1 ItemDetail heading mount: dead arg drop + D1 comment sweep | `09d8ea6` | vitest run ItemDetail + WatchedStates (67/67; 75/75 at close) |
| 2.2 Collection.tsx both mounts: chrome→host (D2), .card-meta-row flow row, toggle last flow child | `09d8ea6` + `7403228` | vitest run Collection + WatchedStates (76/76; 84/84 at close) |
| 3.1 index.css: ONE appended block (+102/−0) — row rule, state colors, D3 hover pair, D9 visibility block | `9b08bfd` | vitest run WatchedStates + tvCssContract (33/33) |
| 4.1 Closeout regen: swag no-op + dist rebuild + tsc + residual chip-text sweep | `1eeeb53` | make web-build + tsc + grep sweep (17.2s; dist hashes byte-stable) |
| git-check (built-in) | branch pushed | clean tree incl. untracked, upstream set — green at close |

Commits are file-grouped (the shared test file evolved across 1.1/2.2/3.1
without per-task commits); receipts cite ids in
`.tmp/watched-signal-refinement/receipts.jsonl` (deleted with the home — the
counts above are the durable summary). Apply shape: sequential @wf-coder per
task (linear DAG, shared test file — no concurrency). One red first run
journalled: 2.2 rc 1 (the D2 move vs `within(link)` meta pins) → the accepted
scope-widening deviation → rc 0; ruled COMPLIANT at GATE 2 (scope-only,
content-identical; the count = 3 edit sites, first site drags 6 assertions
wider — negatives strictly stronger).

## Gate records

- GATE 1 approved 2026-11-04 ("Approve — amend Q4 first"); Q1–Q4 amendments
  landed pre-register; baseline GREEN @ 9949db0.
- GATE 2 PASS-WITH-FLAGS (2×P3, both dispositioned) — all six verifies re-run
  green by the reviewer; status rc 0 cmd-match; gate anchor `go test ./...`
  rc 0 (23 ok / 0 FAIL); integration re-ground HELD (10/10 edges, no orphans);
  N1 satisfied (reveals 0,4,0 after the 0,3,0 hide).
- Manual eyeball (the MANUAL TEST NOTE items) all PASS via playwright against
  the worktree build — incl. the coarse toggle MEASURED 40×40px and the
  keyboard :focus-visible reveal. Recorded in review.md.
- Archive approved 2026-11-05 ("Approve archive (Recommended)") — the eyeball
  ran first per the user's choice.

## Accepted deltas (deliberate, user-visible — from the design)

Tab order flips to link → toggle → ⋯; meta text no longer navigates; card
height +~12px fine / +~24px tv; touch/tv hit box ~22px → 40px+ (the fix);
lone ghost ✓ at the slot on empty-meta cards (coarse/tv); unwatched at-rest
clicks pass through the ghost slot on fine pointers; SR verbosity unchanged.

## Carried observations (non-blocking)

- Light-theme contrast of the accent ✓ (`#a4c8f4` ≈1.7:1 on white) stays
  accepted-shipped (D8); the `--watched-ink` token remains the seeded
  follow-up, decided only if a light theme ships.
- ItemGrid (tv-module library) mount and InProgressBar-in-row were not
  exercisable in dev data — covered by DOM pins + tvCssContract, not eyeballed.
- The `rulesOf` stylesheet-test helper duplicates the clampCssContract idiom
  (house idiom, reviewer-flagged as judgement, not violation).
- Stacked branch: this branch extends `feature/watched-toggle-label`
  (PR #29 open) — merge order matters; PR for this branch should target that
  lineage or wait for #29's merge.
