# Close-out — collections-ux (archived 2026-11-04)

The durable record: pipeline home `.tmp/collections-ux/` (19 receipts) was
deleted at `wf pipeline clean`; this file carries the final per-task summary.
Spec deltas merged into living specs: playback-progress +1 requirement,
recommendation-sorting ~1 modified, web-ui +1 added ~2 modified.

## Per-task receipts (all rc 0, cmd-match green; commit on `feature/collections-ux`)

| Task | Commit | Duty (last receipt) |
|---|---|---|
| 1.1 DeleteWatched store primitive + TestDeleteWatchedResetsPosition | `df5ee84` | `go test ./internal/store -run 'TestDeleteWatchedResetsPosition'` |
| 1.2 putItemState handler + route + 4 wire tests | `8a1d338` | `go test ./internal/api -run 'TestPutItemState'` |
| 2.1 putItemState client + useSetItemState | `f7ce418` | `sh -c 'cd web && npx tsc --noEmit'` |
| 2.2 WatchedToggle component + tests | `422f42f` | `sh -c 'cd web && npx vitest run src/components/WatchedStates.test.tsx'` |
| 2.3 Three mounts + MarkWatchedRow removal | `fc25c3b` | vitest run WatchedStates + Collection + ItemDetail tests |
| 3.1 `.scard-title` CSS clamp + contract test | `6a3c7c2` | vitest run clampCssContract.test.ts |
| 3.2 DOM clamp layer + Synopsis `clamped` prop | `9b5560d` | vitest run Collection + ItemDetail tests |
| 4.1 Joint itest `TestQaItemStateRoundtrip` (@wf-qa) | `0ba5d13` | `go test ./internal/itest -run 'TestQaItemStateRoundtrip'` |
| 4.2 OpenAPI + dist regen (`make web-build`) | `e56308f` | make web-build + grep state route + tsc |
| git-check (built-in) | `4626099` | tree committed, branch pushed — green at close |

Gate records: GATE 1 approved 2026-11-04 after the amend-all-4 round
(0 open questions; Q4 waived — scenario headings immutable under openspec
1.14.0, body rewritten under the stale heading). GATE 2 PASS (reviewer
re-ran 9/9 duties rc 0 + uncached spot-checks; diff-vs-deltas PASS;
standards PASS; removal/orphan/waiver obligations PASS; all three session
flags adjudicated legitimate/safe) — verdict + operator archive approval in
`review.md`. Gate anchor: full Go suite green, 23 packages.

Apply-batch shape (≤3 concurrent, disjoint file sets):
A(1.1, 2.1, 3.1) → 3.2 → B(1.2, 2.2) → 4.1 (@wf-qa) → 2.3 → 4.2.

## Carried observations (all non-blocking, for future changes)

- `WATCHED_ACCENT = "#a4c8f4"` (WatchedToggle inline style) duplicates the
  CSS token — becomes a CSS var whenever the component next takes one.
- Q4's stale scenario heading ("Mark watched is gated on a known duration")
  survives in the merged `web-ui` spec until openspec ships a scenario
  RENAMED op; the body under it is current.
- Series-card bulk toggle is v1.1 (proposal non-goal); `in_progress` stays
  position-derived; P3 TV remote keys remain gated on a tvdebug field
  measurement.
- Pre-existing strict-validate failures in sibling open changes
  (frontier-pinned-eviction, transcode-lane, tv-debug-overlay) — not this
  change's, untouched.
- Web eslint carries 4 pre-existing errors (flagged at rec-sorting) —
  unchanged by this change.
