# Proposal

## Why

`GET /api/v1/home` serves the caller's per-item progress rows verbatim, so
ledgered-watched rows render as resume-point lies (live probe 2026-11-08: 16
rows served, 11 with `watched: true`, each rendered with a percent bar and a
Play chip — "98% · Старик S02E02" pointing into a finished episode), and one
fully-watched series fans into N duplicate Next cards (4 identical "Next
S02E06" chips for the same series). Root cause: the route's prose contract
(internal/api/home.go:20-26) promises "a row renders as a resume point or a
next anchor, never both lies at once", but the wire carries no signal
distinguishing the two kinds, and the per-item grain conflates the
recommendation's derivation input with the served set. Governing principle:
progress and recommendation are different logic — recommendation derives
from progress data, and home shows recommendations for the viewer, never raw
watched progress rows.

## What Changes

- **BREAKING** (wire): `continueRow.current` becomes optional —
  `Current *continueCurrent json:"current,omitempty"` (internal/api/home.go:71).
  A caught-up series (every touched progress row ledgered) serves ONE anchor
  card: series fields + artwork + next, no resume body. The deployed SPA
  derefs `row.current` at five render points (web/src/pages/home/Home.tsx),
  so the server and the SPA MUST ship in ONE release — the embedded dist is
  regenerated from the merged tree (`make web-build`; the PR #21/#31/#33
  idiom). No server-only rollout.
- Entity grain: a serial series touched by ≥1 positive-progress row serves at
  most ONE card; films/tv items stay per-item; ledgered films and tv items
  drop (their position is spent — no next concept); a caught-up series with
  no later episode serves no card at all.
- Resume card body = the series' highest-started IN-PROGRESS episode's
  resume facts (skip-ahead stays honest: E04 at 50% with E05 ledgered serves
  Resume E04 + Next S02E06). The next-episode pick is UNCHANGED (tuple parity
  with the watch page's nextup.ts derivation is pinned); the pick's
  started-max spans ALL touched rows, ledgered included.
- Scoring and ordering move to entity grain through the EXISTING scorers
  (`scoreSeries` for serial entities, `scoreItems` for films) and the
  `orderByScoreRecency` law (score desc, recency desc, id floor); the ≤50
  `homeBound` cut counts CARDS, so a multi-row series eats one slot.
- Client: `ContinueCard` branches on `row.current` — anchor cards promote
  `series_display_name` to the title slot with the Next chip as the primary
  affordance (no bar, no position, no Play-into-current); resume cards render
  exactly as today; React key law becomes `series_id || current.item_id`.
- Wire/type artifacts regenerate in the same release:
  `internal/web/api/openapi.{json,yaml}` + the embedded `internal/web/dist/*`
  via `make web-build`.
- Spec deltas on the three locked specs the change touches: home-continue,
  web-ui, recommendation-sorting. The locked web-ui behavior "a fully-watched
  series still surfaces its next unwatched episode" is PRESERVED — via
  anchor cards.

## Capabilities

### New Capabilities

None — the change converges three existing capabilities on entity grain; no
new system behavior is introduced.

### Modified Capabilities

- `home-continue`: `current` optional on the wire + the resume-pick rule
  named (the series' highest-started in-progress episode's resume facts); a
  NEW per-series entity-grain requirement (serve law: one card per touched
  series, ledgered films drop, caught-up-without-next drops, anchor bodies,
  resume-first ordering); the ≤50 bound counts cards; the next pick's
  started-max explicitly spans all touched rows including ledgered ones; the
  caught-up-frontier case serves no row.
- `web-ui`: the Continue-rail Play affordance law (resume rows Play into
  `current`; an anchor row's play affordance IS the served next deep-link);
  the continue-rail withdrawal wording becomes the entity-grain composition
  wording; the stale `?include=watched` scenario is rewritten to the `/home`
  mechanism while keeping the locked fully-watched-series behavior.
- `recommendation-sorting`: the home rail's ordering keeps the same
  comparator (score desc, `updated_at` desc) computed at entity grain
  (serials series-scored, films item-scored); the `/progress`-untouched
  clause survives verbatim.

## Impact

- Code: `internal/api/home.go` (the rework site: entity walk, entity scoring
  and ordering, per-entity composer, wire shape, header contract), 
  `internal/api/recs_ordering.go` (entity helpers beside the existing
  scorers; `scoreProgress` and the `/progress` route stay untouched — its
  caller at internal/api/handlers.go:1039 keeps its composition),
  `internal/api/home_test.go` + `internal/api/browse_scale_joint_test.go`
  (Current pointer derefs + new entity-grain pins),
  `web/src/lib/api.ts` (hand-mirrored type: `current` becomes optional),
  `web/src/pages/home/Home.tsx` + `Home.test.tsx` (anchor branch, key law,
  fixture cases), `internal/web/api/openapi.{json,yaml}` +
  `internal/web/dist/*` (generated artifacts, regenerated and committed).
- No new modules, no schema migrations, no new dependencies.
- Deploy: server + SPA in ONE release (embedded dist); rollback is a tree
  revert — the wire change has no independent server-only deploy path.
- Known follow-ups deliberately OUT of this change (pre-existing looseness or
  separate surfaces): tombstoned-series empty-name rows (affects every
  surface; separate browse/naming change), the rec-sorting `/progress`-as-
  continue-rail naming and the web-ui "lowest-numbered unstarted" wording
  ride-alongs (pre-existing looseness, ruled out by default), the stale SPA
  deploy-skew `.deploy-rev` stamp (ops hygiene).
