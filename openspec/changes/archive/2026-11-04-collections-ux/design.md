# Design — collections-ux

## Context

The watched feature is live (watched-states archived 3 Nov; HEAD 949f39a):
tri-state presentation from served `watched` flags
(`web/src/components/WatchedStates.tsx`), rail withdrawal + scored defaults,
and a completion ledger (`watched_items`, recommendation-sorting) fed by the
progress-write detector and reconciled once per boot by the recs backfill
(`internal/store/progress.go:79` `ListProgressAll` scans positive positions
only). The ONLY manual mark path today is the card menu's Mark watched row
(`MarkWatchedRow`, `web/src/pages/collections/Collection.tsx:1588`) which
PUTs `/progress` with `position=duration` — gated on a known duration, and
it leaves the item resuming at ~100%. No unwatch exists anywhere. All facts
below are verified against the worktree at HEAD 949f39a. See proposal.md for
motivation; the deltas for behavior.

## Goals / Non-Goals

**Goals:**

- One-click watched/unwatched on video elements, backed by a state route
  that cannot poison resume or re-ledger across boots.
- Retire the `position=duration` manual path and its duration gate.
- The 2-line title clamp law with the two-layer test pin (house law).

**Non-Goals:**

- Series-card bulk toggle (v1.1 — series cards keep the passive mark).
- `in_progress` as a settable state — position-derived stays; the enum
  carries only `watched`/`unwatched` (operator Q6).
- TV remote-key work (the draft's P3 — gated on a `?tvdebug=1` field
  measurement; separate change).
- Multi-profile ledgers, watched filters/sorts on grids (draft non-goals).
- Font step-down for the flow header (operator Q4 dropped — clamp-2 only).

## Decisions

- **D1 — Route shape and parse posture.** `PUT /api/v1/items/{id}/state`
  registered in the browse group beside the progress write
  (`internal/api/router.go:343` block). Body `{"state": "..."}` parsed into
  a typed string (Go constants + an exhaustive switch); an unknown string is
  400 `bad_request` — the same strict parse the sort/include grammar serves
  (`internal/api/handlers.go:838`). The route is named for state, not
  `watched`, so the closed set can grow without a second endpoint.
  Alternative rejected: a boolean `watched: true|false` — no room to name a
  third state, and a false that means "unwatched" reads as a flag flip, not
  a state write.

- **D2 — Unwatch is one store transaction.** New primitive
  `DeleteWatched(ctx, itemID) error` in `internal/store/recs.go` (a method —
  outside the file's 12/12 exported-symbol budget per its own header law;
  signature stays primitive-shaped: strings and ctx). One transaction:
  delete the `watched_items` row AND upsert `playback_progress` to position
  0 (the `PutProgress` statement shape, `internal/store/progress.go:33`).
  Zero-upsert over row-delete: the row's existence is invisible to every
  read anyway (`ListProgress`/`ListProgressAll` both filter
  `position_seconds > 0`), so both are observationally identical — the
  upsert reuses the table's own idiom and a rewatch overwrites the same row.
  Alternative rejected: two handler-level store calls — the torn window
  between them is exactly the boot-backfill re-ledger bug (a still-positive
  position re-ledgers on next boot), so the pairing must be transactional.
  Handler branches: `watched` → `InsertWatched(itemID, it.LibraryID,
  seriesPath, now)` with position untouched; `unwatched` → `DeleteWatched`.

- **D3 — The watched branch resolves exactly like the detector.**
  `GetItem` carries `LibraryID` and the stored document; seriesPath is read
  from `parsed.series_relative_path` — the detector's resolution
  (`cmd/mellifera/watch_detect.go:67,87`). The handler mirrors the three
  typed reads inline (the shape is the media-data-convention, a store
  contract, not a cmd private). An unreadable document degrades to
  `seriesPath ""` (film semantics): the explicit intent write must succeed,
  and learning degrades to the honest-absence rule the tag-source
  requirement already pins (the janitor resolves no tags → no learning) —
  the detector's own log-and-skip posture is NOT copied here because the
  route is load-bearing (the user clicked).

- **D4 — No janitor wake poke from the route.** The detector pokes the wake
  channel after insert because completions should learn now; the state route
  skips it in v1 — the manual mark's tag learning waits out the janitor's
  60 s tick, and threading a new `Deps` closure into `internal/api` for one
  poke is not worth the seam. The WATCHED FLAG itself is read-time derived
  (the ledger is consulted at serve), so the SPA's post-toggle invalidation
  shows the state change instantly regardless.

- **D5 — Response echoes the settled state plus cache seeds.**
  `itemStateDTO{item_id, state, position_seconds, completed_at,omitempty}`:
  `position_seconds` from the post-write progress read — `GetProgress`
  (progress.go:60) wraps `sql.ErrNoRows` on a missing row, so a `watched`
  write on a never-started item maps no-row → `position_seconds: 0` instead
  of an error (pinned in the swag annotations); `completed_at` is
  the write's own stamp (an idempotent re-mark keeps the ledger's FIRST
  stamp but the response echoes now — cosmetic drift, not worth a ledger
  read primitive for). Swag annotations on the handler; the OpenAPI/dist
  regen is the closeout task (4.2), not per-task.

- **D6 — SPA toggle home and disclosure law.** `WatchedToggle` lives in
  `web/src/components/WatchedStates.tsx` beside the tri-state leaves it
  composes. It is a `<button>` — a TvFocusRoot walker target for free. The
  unwatched outline reuses the cardact-trigger disclosure law exactly
  (`web/src/styles/index.css:496-535`: hover/focus-within reveal on fine
  pointers and the `@media (pointer: coarse)` persistence, plus the
  `html.tv .cardact-trigger` twin at index.css:771); the watched fill is
  always visible. Click picks the target state
  from the served `watched` flag (no client derivation — the tri-state
  law), `stopPropagation` keeps the card navigation dead, and the mutation
  (`useSetItemState`, retry: 0) invalidates `["items"]`, `["series"]`,
  `["series-episodes"]`, `["item"]`, `["progress"]` — the union of the
  watched-flag readers (the five query families whose served rows carry
  the watched flag). Mount sites: item-grid cards
  (Collection.tsx ~1241), episode rows (~1903), the element page heading
  (`web/src/pages/browse/ItemDetail.tsx:1247-1252`). `MarkWatchedRow` and
  its Collection.test.tsx block are deleted (operator Q3: one path, quiet
  UI).

- **D7 — Clamp law lands at two altitudes.** `.scard-title` gets the clamp
  in CSS (`web/src/styles/index.css:482` — one point for every poster-card
  title; the rule sits beside the existing `overflow-wrap: anywhere`), the
  Tailwind sites (flow-header `h2` Collection.tsx:1806, item-card title
  span ~1242, episode-row titles, the ItemDetail `h1`:1247) get
  `line-clamp-2` + the `title` attribute (the Identify overlay idiom,
  `IdentifySeries.tsx:205-206`). The flow-header Synopsis is capped through
  a `clamped` prop on the shared `Synopsis` component (`Synopsis.tsx`),
  set ONLY at the Collection flow-header mount (Collection.tsx:1807) — the
  watch-view info column keeps its full paragraph. Alternative rejected:
  measured font step-down (Q4) — resize remeasure, unpredictable geometry;
  clamp-2 matches the house precedent.

- **D8 — Tests pin the law twice and the joint once.** The clamp law gets
  the two-layer pin: a DOM/vitest layer asserting the clamp class +
  `title` attribute, and an fs-reading CSS contract
  (`web/src/lib/clampCssContract.test.ts`, the `tvCssContract.test.ts`
  readFileSync idiom) pinning the `.scard-title` rules. The route gets wire
  tests plus one Tier-1 joint itest
  (`internal/itest/qa_item_state_joint_test.go`, the `qa_recs_roundtrip`
  precedent) covering the backfill-vs-unwatch invariant on a real store:
  an unwatched item (row deleted, position zeroed) is never re-ledgered by
  a boot backfill.

- **Diagram decision: exclude** — the route→store→ledger/backfill flow and
  the toggle→mutation→invalidation chain are linear and fully carried by
  the delta prose; a diagram would restate it.

## Risks / Trade-offs

- [Unwatch vs boot backfill re-ledger] → the zero-reset rides the same
  transaction as the ledger delete (D2), the positive-only scan makes the
  state permanent, and the joint itest (4.1) pins it on a real store.
- [Manual mark's tag learning waits ≤ 60 s (no wake poke, D4)] → accepted:
  rec_score ordering reflects the watched partition instantly; only the tag
  term lags one tick.
- [Re-mark watched echoes `completed_at = now` while the ledger keeps the
  first stamp (D5)] → cosmetic; the SPA uses the stamp for display only.
- [Collection.test.tsx churn — the Mark-watched block (1071-1180) retargets
  to the toggle] → scoped in task 2.3; the suite's mounting helpers are
  reused, no new harness.
- [The stale "server has no watched concept" prose dies with the Mark
  watched paragraph] → the CardActions MODIFIED block replaces the whole
  requirement, so the merge cannot leave the stale sentence behind.

## Migration Plan

Additive only — no DDL (the ledger table and progress table already exist;
the zero-upsert rides the existing CHECK `position_seconds >= 0`), no data
migration. Existing `position=duration` marks are already ledgered and
stamped — they keep their rows and their learning; nothing re-derives. The
menu row's removal is a UI-only retirement; the progress route keeps its
`completed` intent (the player's edge). Rollback = revert the route + the
toggle; the ledger state is untouched by the route's absence.

## Open Questions

None — Q1 (series bulk toggle → v1.1), Q2 (unwatch resets position to 0),
Q3 (drop the menu row), Q4 (no font step-down), and Q6 (`in_progress` stays
position-derived) are settled with the operator; P3 is excluded from this
change entirely.
