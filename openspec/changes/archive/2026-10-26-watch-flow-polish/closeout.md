# Close-out — watch-flow-polish (archived 2026-10-26)

Layer 3 of the UI roadmap (watch-flow polish). 4 groups / 10 authored tasks + built-in git-check — all green; pipeline home deleted after this note (the receipts below are the durable record).

## Per-task receipts (acceptance runs; reviewer re-ran all rc 0)

| Task | Commit | Duty result | Notable |
|---|---|---|---|
| 1.1 watch-defaults endpoint | 170d21f | go test ok, 887 ms | pure delegation, browse-group role-gated, zero new imports |
| 1.2 countdown env knob | 3daf5f4 | go test ok, 992 ms | max(1, envInt(...,10)); warning asserted via scoped slog swap |
| 2.1 nextup move | bc41508 | vitest 40/40, 1353 ms | byte-verbatim move; seriesKey export adjudicated PASS |
| 2.2 nextEpisodeAfter | 1509212 | vitest 24/24 | reuse of moved primitives; Pick<NextUpEntry,…> shape |
| 3.1 skip chip | d1caf11 | vitest 14/14, 1049 ms | end-exclusive ranges, 4s fade, seek end+0.5 via Player.seekTo |
| 3.2 info column | 52f18f2 | vitest 42/42, 2115 ms | About exactly once on watch lane (showAbout gate) |
| 3.3 auto-next | 09b7a21 | vitest 29/29, 2296 ms | served countdown only; no shape → never autoplay; Player overlay mount |
| 3.4 keyboard + legend | 58b2b32 | vitest 43/43, 1886 ms | pure applyShortcut; fine-pointer legend |
| 4.1 golden joints | 22ccb96 | go goldens + vitest 29/29, 3595 ms | one fixture per joint, both suites; shape drift fails both by construction |
| 4.2 artifact regen | 28c5328 | make web-build ×2 byte-stable, 11661 ms | dist + openapi carry watch-flow; go build ok |
| git-check | (branch push) | exit 0, 50 ms | tree committed, branch pushed |

Gate anchor: go test ./... rc 0 · vitest 28 files / 363 tests. GATE 2: PASS WITH FLAGS (review.md in this folder).

## Follow-up flags (from the gate, non-blocking)
1. Fold ItemDetail's `prevEpisodeBefore` mirror into web/src/lib/nextup.ts beside `nextEpisodeAfter` (one shared ordered-pick helper; nextup.ts at the 8-export cap — no ninth export).
2. design.md Interfaces list omits exported `seriesKey` (recorded in review.md).
3. Docs pass rode along: itest bullet count corrected (30→38); GLOSSARY has a pre-existing duplicated Artwork entry (left for glossary effort).

Docs actualization: 06e99d6 (project_structure.md watch-flow subsection + counts, runbook env row, ai-architecture §4 rows).
