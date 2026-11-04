# GATE 2 review — collections-ux

## Reviewer verdict (2026-11-04): PASS

- **Axis 1 — verify re-runs**: 9/9 rc 0 under `--by wf-reviewer` (+ uncached `-count=1` Go spot-checks). `wf pipeline status`: 9/10 authored green; git-check (built-in) gated on the close push. Handoff inbox clean; `openspec validate --strict` rc 0.
- **Axis 2 — diff vs spec deltas**: PASS — playback-progress 5/5 scenarios implemented+tested (never-started→0, unwatch clears, never-re-ledgers via non-vacuous backfill positive control); recommendation-sorting 2/2 (fresh-stamp postdates unwatchAt ⇒ PK freed); web-ui toggle on the three surfaces with the disclosure law composed via cardact-trigger, series cards passive, clamp law at all five sites with title attrs. `unwatch SHALL NOT roll back applied tag weights` pinned by construction (DeleteWatched = exactly two statements, no tag_weights path) + the fresh-learn-once itest half. MovieCard covering film cards judged in-scope (only series cards are the named carve-out).
- **Axis 3 — standards**: PASS — parse-once + exhaustive switch both sides; zero shims/remnants after MarkWatchedRow removal; parameterized SQL; wrapped errors; tests pass the justification gate. J1 P3: `WATCHED_ACCENT = "#a4c8f4"` duplicates the css token (inline-style constraint, 2.2 file scope) — future CSS var, non-blocking. J3: seriesPathOf reuse over design-D3's inline mirror — DRY-positive, behavior-identical.
- **Axis 4 — removal + integration obligations**: MarkWatchedRow zero references repo-wide; no position=duration caller remains; all 21 planned edges re-grounded post-change; orphan check clean (DeleteWatched→handlers.go:916, putItemState→router.go:348, WatchedToggle→3 mounts, useSetItemState→WatchedToggle; CardActions rows prop keeps its SeriesCard user; Player.tsx keeps the sole remaining putProgress callers); Q4 waiver honored (stale heading, immutable under openspec 1.14.0).
- **Flags adjudicated**: 1.1 no item-existence guard = CONFIRMED safe (handler gates first; no FKs; orphan rows invisible to every read). 2.2 state-varying accessible name + no-index.css outline = LEGITIMATE. 2.3 fifth-file ripple (WatchedStates.test.tsx) = LEGITIMATE (asserts retargeted, coverage ADDED).

## Archive approval

Operator approved archive at the GATE 2 dialog (2026-11-04): "Approve archive (Recommended)".

Gate anchors at close: full Go suite `go test ./...` — 23 packages ok, zero failures (run before the verdict).
