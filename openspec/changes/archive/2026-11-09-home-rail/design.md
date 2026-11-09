# Design

## Context

`GET /api/v1/home` (internal/api/home.go, browse-scale D5/D7) composes the
rail from the caller's FULL positive-progress set: `recsFactsFor` batches the
ledger reads (internal/api/recs_ordering.go:104-127 — `facts.rows` includes
ledgered-watched rows; the `/progress` default's `withdrawWatched`
(recs_ordering.go:147) deliberately does NOT carry over), `scoreProgress`
scores per row through `scoreItems`, `orderByScoreRecency` orders, the ≤50
`homeBound` (home.go:48) cuts, and `homeRows` composes one `continueRow` per
row — with `Current continueCurrent` a REQUIRED wire member (home.go:71) and
the header comment (:20-26) promising a resume-vs-anchor rendering the wire
cannot express. The SPA renders every row verbatim as a resume point
(Home.tsx `ContinueCard`, five `row.current` derefs) and keys cards on
`row.current.item_id` (:325). The converged design draft
(`.tmp/home-rail-series-grain-design.md`, planner brainstorm → reviewer grill,
verdict HOLDS-WITH-CHANGES, 7 rulings Q1–Q7 adopted) settles the approach;
this document grounds it in the worktree source. Motivation lives in
proposal.md — Why.

## Goals / Non-Goals

**Goals:**

- Both wire lies become impossible by construction: a ledgered row can never
  render as a resume point, and a caught-up series renders exactly one honest
  anchor card (or none when nothing is next).
- One card per touched series at entity grain; the ≤50 bound spends slots on
  cards, not duplicated rows.
- `/progress` (handlers.go:1039) keeps its composition byte-for-byte — the
  withdrawal, the additive `rec_score`, the `sort=recent` opt-out.
- The watch page's nextup.ts tuple parity survives verbatim (the pick is
  untouched).
- Server + SPA ship in one release.

**Non-Goals:**

- No tombstoned-series empty-name fix (separate browse/naming change — the
  per-item honest floor below makes home SAFE under tombstones without
  fixing their naming).
- No ledger-aware next filtering (the toggle-watched-sibling parity corner is
  KEPT — ruling Q6).
- No watched flag on the wire, ever.
- No client-side derivation: the client renders served fields and derives
  nothing (the browse-scale law holds).
- No `/progress` shape change, no `homeNextPick` signature change, no
  internal/recs change (the tier arithmetic at internal/recs/recs.go:17-30 is
  pinned, not edited).

## Decisions

- **D1 — Entity grain over withdrawal (winner SERIES-GRAIN).** One card per
  touched series; the serve law filters at entity grain, with NO input
  withdrawal (`facts.rows` stays the full positive set). Alternatives
  rejected: MIN (pure withdrawal) loses the caught-up surface and would force
  DELETING the locked web-ui clause "a fully-watched series still surfaces
  its next unwatched episode"; per-item + anchor carve-outs pay the scoring
  seam twice and entrench the per-item drift the home-continue Purpose
  already rejects ("per-series rows").
- **D2 — Serve law (entity survival).** A serial series touched by ≥1 row
  serves at most ONE card, present iff it carries an in-progress episode
  (positive progress, not ledgered) OR `homeNextPick` finds a next; survival
  is computed from the SAME pick result the row serves. Caught-up-without-next
  → no row (kills the finale lie); ledgered film/tv item → no card; rows
  without parseable episode facts stay per-item film entities (today's exact
  shape, home.go:274-281 — ruling Q1); a series missing or tombstoned in
  `n.SeriesByPath` floors to the per-item honest entity (series fields "",
  no next) — resolution failure never fabricates a series card.
- **D3 — Resume pick = highest-started IN-PROGRESS episode.** The resume
  body is the max (season, episode) among the entity's touched rows that are
  not ledgered; started-max (the next pick's anchor) spans ALL touched rows
  INCLUDING ledgered. Skip-ahead stays per-fact honest (E04 at 50% + E05
  ledgered → Resume E04 + Next S02E06). Normal case: resume-max equals
  started-max.
- **D4 — Next pick unchanged.** `homeNextPick` (home.go:392) keeps its
  signature and tuple-parity vectors (nextup.ts `nextEpisodeAfter`); the
  toggle-watched sibling offered as Next is a PRE-EXISTING parity corner,
  kept (ruling Q6 — ledger-aware filtering would break nextup.ts parity for
  zero gain).
- **D5 — Existing scorers at entity grain (ruling Q2).** Serial entities
  score through the EXISTING `scoreSeries` (recs_ordering.go:281-308) fed an
  eps map UNIONED with the entity's touched items — zero extra reads, and the
  resume ≥1000 tier holds even under document drift (an eps row whose parsed
  anchor moved would otherwise drop the touched item from the entity's facts;
  the residual inherited-grid corner — an eps row with a foreign parsed
  anchor — is documented, wire honesty unaffected). Films score through the
  EXISTING `scoreItems` (recs_ordering.go:238). `scoreProgress` itself is
  UNTOUCHED. Score-shape law (ruling Q3): a single-row series scores
  identically under `scoreItems` vs `scoreSeries` only WITHOUT an unstarted
  in-window sibling; with one, +500 NewEpisode applies (order-preserving in
  every existing fixture) — tests pin BOTH shapes and never assert equality.
- **D6 — Ordering = `orderByScoreRecency` at entity grain.** Score desc,
  recency = the entity's max touched-row `updated_at` desc, then the
  `ser_`/`itm_` id floor — the total comparator (recs_ordering.go:403)
  re-keyed on entities.
- **D7 — Pre-cut series reads (ruling Q7).** `homeEntities` performs ONE
  GetItem walk over `facts.rows` (the walk `scoreProgress` runs today,
  recs_ordering.go:429) and ONE `QueryItemsBySeries` per touched series
  BEFORE the bound cut — the same full-set-read posture as `allFilteredItems`
  (recs_ordering.go:196); the alternative (score without fresh facts, read
  post-cut) cannot know the +500 NewEpisode tier that orders the cut and
  breaks AC-8. Today's second GetItem walk (home.go:172) dies with the
  per-entity composer; the double `namerFor` dies with namers built once and
  shared.
- **D8 — The ONE wire change.** `Current continueCurrent` →
  `Current *continueCurrent json:"current,omitempty"` (home.go:71). Anchor
  card = current nil + series fields + artwork + Next. Resume card = today's
  row verbatim (AC-4: byte-identical when current is present). No watched
  flag on the wire, ever.
- **D9 — Client branch, zero derivation.** `ContinueCard` branches on
  `row.current`: the anchor branch promotes `series_display_name` to the
  title slot, renders the Next chip as the PRIMARY affordance deep-linking
  `next.item_id`, keeps the library label and the `isServedArtPath` artwork
  rule, and renders no bar/position/Play-into-current; the resume branch is
  today's card verbatim. React key law: `series_id || current?.item_id`
  (collision-free — `ser_`/`itm_` prefixes).
- **D10 — One release (ruling Q5, deploy constraint).** The old SPA derefs
  `row.current` at five points and crashes on anchor rows; the server MUST
  NOT roll out alone. The embedded dist regenerates from the merged tree
  (`make web-build` — swag needs GOPATH/bin on PATH) and ships in the same
  release (the PR #21/#31/#33 idiom).

## Interfaces

The cross-group contract (api-rework → wire-regen → web). Signatures and
types only; the entities live in the api package beside the existing
scorers.

- **Wire (api ↔ SPA):**

      type continueRow struct {
          // ... unchanged fields ...
          Current *continueCurrent `json:"current,omitempty"` // was: Current continueCurrent
          Next    *continueNext    `json:"next,omitempty"`
      }

  Serve law: one row per ENTITY; `current` present iff the entity's resume
  pick resolves (a touched row that is not ledgered); anchor cards carry
  series fields + artwork + next with `current` ABSENT on the wire
  (omitempty — not null, gone).

- **Handler composition (api):**

      facts = a.recsFactsFor(ctx, v)                          // unchanged
      ents  = a.homeEntities(ctx, v, facts)                   // NEW: one GetItem walk,
                                                              // grouping, pre-cut QueryItemsBySeries (D7), serve law (D2)
      a.scoreHomeEntities(ctx, ents, facts, namers)           // NEW: scoreSeries (union, D5) / scoreItems;
                                                              // namers built once, shared downstream
      orderHomeEntities(ents)                                 // D6 law
      ents  = ents[:min(homeBound, len(ents))]                // ≤50 CARDS
      rows  = a.homeRows(ctx, v, ents, namers)                // reworked composer: one row per
                                                              // entity, current ONLY from the resume-max row; per-library legs
                                                              // (batched artwork, storedTitle, episode-title projection,
                                                              // homeDurationSeconds) unchanged

  Entity state carried between the seams: the series' started-max over ALL
  touched rows (incl. ledgered), the resume-max row (not ledgered), the
  entity's max touched-row `updated_at`, the parsed-episode-film fallback
  flag (Q1), the served-series resolution flag (D2 floor).

- **Ordering law (api, pinned by test):** resume cards 1000..1900
  (InProgress 1000 + NewEpisode 500 when a fresh sibling exists + tags ≤400)
  > fresh anchors 500..900 > stale anchors ≤400 — structural under
  internal/recs/recs.go:17-30; an anchor ≥1000 is impossible given the D5
  union. No partition comparator is introduced.

- **Client contract (SPA):** `row.current?: ContinueCurrent` in api.ts
  (hand-mirrored — drift = bug); render branches on presence; key =
  `series_id || current?.item_id`; anchor cards deep-link ONLY through
  `next.item_id`.

## Risks / Trade-offs

- [Old SPA + new server = crash on anchor rows] → ONE-release deploy, dist
  regen from the merged tree (D10); no server-only rollout path exists.
- [Visibility loss: a multi-in-progress household sees only the furthest
  thread on the rail] → ACCEPTED (converged ruling): the other threads remain
  on the series page and `/progress`; the dedup IS the fix. Skip-ahead cards
  show no watched-E05 context — the wire carries no watched flag.
- [Score-shape divergence between scoreItems and scoreSeries for single-row
  series] → pinned BOTH shapes in tests, never equality (D5/Q3); the +500
  NewEpisode divergence is order-preserving in every existing fixture.
- [Inherited grid corner: an eps row with a foreign parsed anchor could score
  into the wrong entity's union] → documented residual (D5); wire honesty
  unaffected; surfaced for the grid's own drift handling, not this change.
- [swag/openapi regen churn] → regenerated artifacts are committed in the
  same change; `make web-build` is the only sanctioned regen path.
- [Unresolvable series fabricating a card] → impossible by D2's honest
  per-item floor; pinned by test.

## Migration Plan

One release: the change lands (server rework + SPA branch + regenerated
openapi/dist committed in the same tree), CI green, then the deploy recipes
the loop already uses (rsync source → docker build on-server; the embedded
dist ships inside the binary). Rollback = revert the release; no data
migrations exist (the rail is read-time composition; the ledger and progress
stores are untouched). Old-client risk window is zero by construction — the
SPA and server deploy as one binary+dist unit.

## Open Questions

None. The converged design's seven rulings (Q1–Q7) are adopted as settled;
its open-question defaults (visibility losses accepted, ride-alongs out,
tombstone/deploy-stamp follow-ups out of scope) are recorded in proposal.md —
Impact. GATE 1 is the human's chance to override any of them.
