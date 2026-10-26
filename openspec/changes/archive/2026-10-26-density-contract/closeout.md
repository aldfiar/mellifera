# Closeout — density-contract (Layer 7.1, UI roadmap)

Archived 2026-10-26 as `2026-10-26-density-contract`; web-ui delta merged (+4 requirements). PR via merge-back follows this file.

## Final receipt summary (fresh home; all duties re-verified green vs SHIPPED code)

| Task | Duty (rc) | Commit | Notes |
|---|---|---|---|
| 1.1 density core | green (wf-qa 12:34Z; re-verified fresh) | `798f72f` + `bcc5599` re-pin | pure `web/src/lib/density.ts`, 4 exports; 20 tests after the tier re-pin (13 before) |
| 2.1 poster tracks | green (fresh home) | `75f306e` + `bcc5599` | mechanism superseded by GATE 2 ruling — tier budgets + posterTrackColumns + 662px media query; original home abandoned (tombstone reason: protected duty vs shipped mechanism) |
| 2.2 browse cap 6xl | green (first pass) | `399a988` | one-class edit; ItemDetail keeps 4× `max-w-5xl` |
| 2.3 type floor 14px | green (first pass) | `28d12ec` | `.scard-title` 12.5→14, `.ptile footer` 11→14 |
| 3.1 photo stage cap | green (first pass) | `5a67b47` | `max-h-[80vh]` gone; `photoStageMaxH(PHOTO_STAGE_CHROME_PX)` |
| 4.1 dist regen | green (re-verified post-bcc5599) | `0fb508b` + `bcc5599` | byte-identical rebuild proven twice (reviewer + session); `internal/web/api` clean |
| git-check | green | `ddf8199` | tree committed, branch pushed |

GATE 2: PASS WITH FLAGS (reviewer re-runs `by wf-reviewer`), human-ruled 2026-10-26 — rulings + visual spot-check evidence in review.md. Amendment chain: `fb5bc7e` (cleanup) → `bcc5599` (flag-3 fix) → abandon + re-author → fresh green. Folder commits: `ddf8199` (change folder), `9889499` (review.md), `169fe05` (archive move).

## Follow-ups seeded (non-blocking)

- Tier constants are parameters: `SERIES_GRID_CHROME_PX=182`, `SERIES_GRID_TWO_ROW_MIN_VH=662`, `PHOTO_STAGE_CHROME_PX=136` — re-derive visually if the collection header/chrome changes; tests pin the derivation pairs, arithmetic never moves.
- 4 pre-existing lint errors in `web/src/pages/admin/Sources.test.tsx` (unused vars) — pre-branch, out of scope.
- Layer 7 (TV mode + remote) is the next roadmap change and builds on this contract; carried flags from watch-flow-polish remain open (fold `prevEpisodeBefore` into nextup.ts; design.md Interfaces `seriesKey` omission; GLOSSARY duplicate Artwork entry).
