# Close-out — tv-mode (archived 2026-11-02)

## Deliverable
Layer 7.2–7.4 TV mode: pure-SPA slice, ZERO Go source edits (swag regen a full no-op — the boundary held exactly). Embedded dist regenerated (commit 9e45582).

## Final receipt summary (all green; ledger at clean: 26 receipts + close receipts)
| Task | Commit | Tests | Note |
|---|---|---|---|
| 1.1 resolver (ladder, override) | 7d7e144 | 45 | dpr parenthetical = drafting note (reviewer-ruled; spec delta clean) |
| 1.2 boot apply | 9da3a0f | +4 = 49 | upgrade-only async probe; override law preserved |
| 2.1 media keys | 9edb3ca + a1e65ab (fixup: tsc mock typing) | 24 cases | one table; desktop rows byte-identical |
| 3.1 walker core | 658f10f | 50 | per-axis hold-clamp (spec-grounded refinement) |
| 3.2 TvFocusRoot | 1130909 | +5 | structural yield, tv-class-armed |
| 4.1 DialogShell Back | 9e9377e | +7 = 573-suite green | landed-entry popstate detection; StrictMode-safe |
| 5.1 .tv CSS block | fd1332b | 6 (fs contract) | no-bare-px sweep, ≥8-decl guard |
| 5.2 photo stage | 2628bbb | +8 (contract 8, ItemDetail 50) | exitWatch ripple wired; data-tv-yield both lanes |
| 6.1 Режим ТВ | 294c740 | +5 | single class-writer contract held |
| 7.1 dist regen | 9e45582 | red→green pair | rebuild byte-identical; go build ok |
| 7.2 desktop guard | — (no code) | 203 | desktop-unchanged proven |
| git-check | — | — | pushed origin feature/tv-mode |

## Gate record
review.md: all four axes PASS. Full-suite anchors: `go test ./...` rc 0 · web 41 files / 578 tests · tsc rc 0 · strict validate rc 0. Archive approval: operator, 2026-11-02.

## Accepted judgement calls (P3, reviewer)
App.tsx fragment indent cosmetics · OVERLAY_HISTORY_KEY test seam · dense-but-tested DialogShell history effect · adjacent-sibling metadata hide (revisit with data attribute if photo lane gains siblings) · 12vh --tv-poster-chrome flagged re-check-visually on real TV.

## Follow-ups seeded
- TV live retest: overscan padding at panel shapes, poster-chrome collapse, focus-ring at 3 m (jsdom can't).
- ASC-probe fallback (pre-existing, unrelated).
