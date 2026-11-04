# Proposal — collections-ux

## Why

The watched feature is live, but its only write path is three presses deep
(card ⋯ → Mark watched → a `position=duration` progress write) and there is
no unwatch at all: a mis-marked item is permanently watched, and the
duration hack leaves it resuming at ~100% (rewatch-hostile). Separately,
long served titles wrap unbounded — the series flow header pushes the
episode table down the page and 3+ line card titles silently break the
density budget's card-body assumption. Both fixes are small, additive, and
ride infrastructure that already shipped (watched-states, rec-sorting).

## What Changes

- **New backend route** `PUT /api/v1/items/{id}/state`, body
  `{"state": "watched" | "unwatched"}` — a playback-state endpoint named for
  state so the closed set can grow. `watched` inserts the ledger row exactly
  like the detector path (idempotent, `completed_at` = now, position NOT
  touched); `unwatched` deletes the ledger row AND resets the playback
  position to 0 (one store transaction), which retires the `position=duration`
  manual mark path. Strict parse: an unknown state string is 400
  bad_request. Photo-module items are 400 (no watched concept on photos).
  PUT /progress's own `completed` intent stays the player's completion
  signal, additive to this route.
- **New store primitive** `DeleteWatched` beside `InsertWatched`
  (internal/store/recs.go) — ledger delete + position zero-upsert in one
  transaction; positive-positions-only reads (including the boot backfill's
  `ListProgressAll`) make the zeroed state permanent across boots.
- **SPA toggle** — the ✓ mark on video elements becomes a `WatchedToggle`
  button in the same top-left slot: watched = filled accent ✓ clickable;
  unwatched = quiet outline ✓ revealed on hover/focus on fine pointers,
  persistent under `pointer: coarse` and tv mode (the ⋯ trigger disclosure
  law). One click toggles the served state via the new route
  (`stopPropagation` — the card click navigates), then invalidates the
  items/series/progress queries. Sites: episode cards (tv grid), episode
  rows (series flow), the element page heading. Series cards keep the
  passive mark (the bulk toggle is v1.1). The ⋯ menu's "Mark watched" row is
  dropped — one path, quiet UI.
- **Title clamp law (pure SPA)** — titles on user surfaces clamp at 2 lines
  with ellipsis; the full name rides the native `title` attribute; chrome
  never shrinks. Sites: the series flow header `h2`, card titles
  (`.scard-title` in CSS — one point for every poster card — and the
  Tailwind title spans), the element page heading, and the flow-header
  Synopsis description (capped so the header can never tower).
- **Semantic note**: `unwatched` never rolls back tag weights the janitor
  already applied — a completion is consumed exactly once; a still-unapplied
  row simply never learns.

Out of scope (settled with the operator): series-card bulk toggle (v1.1),
`in_progress` as a settable state (stays position-derived; the enum carries
only `watched`/`unwatched`), TV remote-key work (P3 — gated on a field
measurement with the tvdebug overlay, separate change).

## Capabilities

### New Capabilities

(none — the change extends three existing capabilities)

### Modified Capabilities

- `web-ui`: the tri-state ✓ presentation gains the clickable toggle
  affordance (MODIFIED "Watched element states"); the CardActions menu loses
  the Mark-watched row and its stale "no watched concept" prose (MODIFIED
  "CardActions element menu"); the 2-line title clamp law lands (ADDED
  "Title clamp law").
- `playback-progress`: the item state write endpoint — closed-set state
  parse, watched insert without position touch, unwatched delete + position
  reset, photo gate, response echo (ADDED "Item state write endpoint").
- `recommendation-sorting`: the completion ledger's lifecycle gains the
  unwatched deletion leg — deleted rows never re-ledger through the boot
  backfill, applied tag weights never roll back (MODIFIED "Completion ledger
  and detection").

## Impact

- `internal/store/recs.go` (+ `recs_test.go`): the `DeleteWatched` primitive
  (a method — sits outside the file's 12/12 exported-symbol budget by the
  header's own law).
- `internal/api`: `putItemState` handler + route beside the progress write
  (`internal/api/router.go` browse group), `itemStateDTO`, swag annotations;
  `photoModuleID` reused for the gate.
- `web/src/lib/api.ts` + `web/src/lib/queries.ts`: `putItemState` client +
  `useSetItemState` mutation (invalidates items/series/series-episodes/
  item/progress keys).
- `web/src/components/WatchedStates.tsx` (the WatchedToggle),
  `web/src/pages/collections/Collection.tsx` (mount sites, MarkWatchedRow
  removed, flow header + Synopsis clamp),
  `web/src/pages/browse/ItemDetail.tsx` (heading toggle + clamp),
  `web/src/styles/index.css` (`.scard-title` clamp).
- Tests: `internal/api/item_state_test.go` (new), `internal/store/recs_test.go`,
  `internal/itest/qa_item_state_joint_test.go` (new — the backfill-vs-unwatch
  joint), `web/src/components/WatchedStates.test.tsx`,
  `web/src/pages/collections/Collection.test.tsx` (Mark-watched block
  retargeted + clamp pins), `web/src/pages/browse/ItemDetail.test.tsx`,
  `web/src/lib/clampCssContract.test.ts` (new, the `tvCssContract`
  readFileSync idiom).
- OpenAPI/wire docs + dist regen at closeout (`make web-build`).
