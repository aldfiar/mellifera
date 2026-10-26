# Review — density-contract (GATE 2 record)

## Verdict: PASS WITH FLAGS → human-ruled → all duties green vs shipped code

- Reviewer re-ran all six duties in its own shell (receipts `by wf-reviewer`): 1.1 (13 vitest), 2.1 (57), 2.2, 2.3, 3.1 (40), 4.1 (dist byte-identical, api clean, go build ok). Scope guard: exactly the declared 9-file impact; Go tree untouched. Standards: 4/8 export surface, table-driven tests, zero dead code, no naming drift.
- Post-verdict amendments (human-ruled 2026-10-26, recorded in design.md): fixes landed as `bcc5599` (tier-track mechanism, posterTrackColumns, chrome 302→182, fs-pin 662 pair) and `fb5bc7e` (import-alias + cast-comment cleanup). 2.1's original duty became unsatisfiable (protected field on a receipted task) → home abandoned with recorded reason, artifacts re-authored to the shipped mechanism, fresh home re-derived, **all six duties re-verified green against the shipped code**; `wf pipeline status` rc 0 (7/7 incl. git-check).

## Rulings (the human gate)

1. **Rows @540px** — superseded, not just accepted: tiered contract (two-row tier at vh ≥ 662, one-row tier below with real-width cards, floor-only below 422); spec scenarios reworded to match.
2. **Photo-stage identity below the fold** — accepted as documented degradation; no parameter change.
3. **Chrome double-count** — fixed as proposed: `SERIES_GRID_CHROME_PX` 302 → 182; card bodies ride the rows·cardBodyH leg only.

## Visual spot-checks (contract-assigned to the human gate) — performed live

Dev server (worktree vite :5173 + main-tree API :8080) at 1280×633 post-fix: 4 tracks × ~260.7px, all cards fill their tracks, posters uniform 388px (2:3 preserved), first row bottom 635px — one full row + header fits (one-row tier). Photo stage: no mid-photo clip.

## Known non-blocking flags

- 4 pre-existing lint errors in `web/src/pages/admin/Sources.test.tsx` (unused vars) — pre-date this branch; left out of scope deliberately.

## Archive approval

Human approved archive 2026-10-26 ("approve"), after the rulings above and the green status.
