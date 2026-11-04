# wf-surveyor handoff — collections-ux

To: wf-reviewer (read before GATE 2; belief — `integration.md` and the receipts are the evidence).
From: wf-surveyor · **post-amendment re-audit (round 1)** · worktree HEAD 949f39a · map fingerprint 4e5dac5e…, CURRENCY: CURRENT.

## Audit summary

Planned integration graph grounded: **19 nodes, 21 edges** — the route→handler→store chain
(`r.Put("/items/{id}/state")` browse group → `putItemState` → `GetItem`/`photoModuleID`/
`InsertWatched`/`DeleteWatched`/post-write `GetProgress` read), the SPA chain (`putItemState`
client → `useSetItemState` (retry:0) → five invalidation families → the toggle → three mount
sites + MarkWatchedRow deletion), the clamp law at both altitudes (`.scard-title` CSS rule +
Tailwind `line-clamp-2` sites + the `Synopsis` `clamped` prop at Collection.tsx:1807 only), and
the closeout regen. Method note: the map carries zero symbol rows for go/ts (backend richness) —
every node/edge grounded by grep/sed at 949f39a with file:line evidence. All six planned-new
symbols confirmed absent today (no phantoms); every cited line target verified exact
(router.go:343, handlers.go:789/:838, progress.go:33/:60, watch_detect.go:67/:87, api.ts:1192,
index.css:482/496–535/771, Collection.tsx:1588/1261/1806/1807, ItemDetail.tsx:1247).

**Amendment round 1 re-verified on disk** (the change folder is untracked at HEAD — compared
against the first-pass reads in full):

- **Q1 landed**: web-ui delta "Watched element states" — Sites list ends at the element page
  heading + "Continue-rail rows render no mark — watched rows are withdrawn from the rail by
  default"; the toggle mandate now reads "On exactly three mounted surfaces" == task 2.3's
  three mounts, one-to-one. No residual "every VIDEO element"/rail-toggle language remains.
- **Q2 landed**: task 2.1 + design D6 read "the union of the watched-flag readers (the five
  query families whose served rows carry the watched flag)".
- **Q3 landed**: task 1.2 pins the post-write `GetProgress` read — no-row →
  `position_seconds: 0`, never an error, swag-noted; wire tests gain
  `TestPutItemStateWatchedFreshItem` (the unchanged 1.2 duty `-run 'TestPutItemState'`
  prefix-matches it); playback-progress delta gains the SHALL sentence + fifth scenario
  "A watched write on a never-started item reads position zero" (grammar-valid: 4-hashtag,
  WHEN/THEN); design D5 pins the same mapping.
- **Q4 WAIVED (reason recorded)**: scenario headings immutable under pinned openspec 1.14.0
  (planner proved from the pinned tool's dist source). Heading "Mark watched is gated on a
  known duration" verified unchanged on disk (web-ui delta:150); the rewritten body carries
  the operator's intent.

## Coverage verdicts (post-amendment — all stand)

- **Wiring coverage: PASS** — no orphan nodes; every new node has an owner task's edge into the
  live system; group order is a valid DAG order (1.1→1.2, 2.1→2.2→2.3, 1.x/2.x/3.x→4.1/4.2).
- **QA seam coverage: PASS** — 1.2 wire tests now four (Watched / WatchedFreshItem / Unwatched /
  Validation) covering the route seams incl. the absence-mapping; 4.1 `TestQaItemStateRoundtrip`
  @qa (store↔ledger↔backfill joint; `qa:` shape matches house convention); 2.2/2.3 mutation and
  no-navigation seams; 3.1+3.2 two-layer clamp pin.
- **Blast radius: PASS** — re-censused on the three changed seams: fresh-item surface (handler→
  GetProgress absence path, progress.go:60–71), narrowed scope vs 2.3 mounts (one-to-one), fresh-
  item test seam (prefix-match, route-level logic — 4.1 keeps the ledger/backfill loop). Standing
  census unchanged: four live `WatchedMark` mounts accounted (Collection.tsx:1676 SeriesCard
  stays passive); ledger readers (handlers.go:880/1193/1592, recs_ordering.go:116,
  recs_backfill.go:35) change outputs by design; `CardActions rows?:` stays live (Постер row);
  only `position=duration` caller is the deleted row; route namespace collision-free;
  zero-upsert legal against `CHECK (position_seconds >= 0)`.
- **Open questions: 0** — frontier EMPTY (3 resolved-by-amendment + re-verified, 1 waived with
  reason). New questions from the amendments: none.

## Waiver list

- **Q4 (stale CardActions scenario heading)** — waived: un-amendable under the pinned openspec
  1.14.0 (no scenario-level RENAMED; MODIFIED must carry every current heading; archive refuses
  otherwise). The scenario body carries the operator's intent. Reviewer: honor this waiver at
  GATE 2; the merged living spec will carry the heading with the retirement body.

## Re-check pointers for GATE 2

Re-ground the planned edges against the post-change map (`wf index query callers
InsertWatched` — expect the handler beside recs_backfill.go:73 / watch_detect.go:67;
`MarkWatchedRow` and its Collection.test describe block gone; `putProgress`'s only remaining
SPA callers the Player edges; the state route in the browse group beside router.go:343).
Re-run the orphan check on `CardActions`' `rows` prop and on `Synopsis`'s `clamped` (must stay
consumed at Collection.tsx:1807). Verify the fresh-item mapping lands in the swag annotations
(regen at 4.2). Labeling caution for review.md: design.md's "Q1–Q6" are the planner's operator
questions — unrelated to the surveyor's Q1–Q4 in integration.md.
