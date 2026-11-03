# Proposal

## Why

Every list surface today is alphabetical-by-path: `GET /series` orders by
`relative_path`, item grids by `id`/path, and the Continue rail is pure
recency. On a live serial library that means an ongoing series the operator
watched yesterday sits between two unstarted ones whose names happen to sort
nearby, and nothing on the grid says "this has a new episode" or "you were
mid-episode here". The operator's interests are already in the database —
`playback_progress` rows say what is partially watched and where, item
`created_at` says when a new episode landed, and the media-data convention's
`genres` field (shikimori today, TMDB later) carries per-title tags — but no
surface reads them together. This change turns those existing facts into one
internal recommendation score and orders the collections and continue
surfaces by it, with the alphabetical order kept as the deterministic
tiebreak and explicit opt-out.

## What Changes

- NEW pure scoring package `internal/recs`: a read-time score per entity =
  context bonuses (partially watched, new episode) + a capped sum of tag
  weights, where every parsed tag carries an equal base weight that interest
  learning raises. No score is ever persisted — like the enrichment queue,
  the score is derived at read time from stored facts.
- NEW two additive store tables: `watched_items` (item_id PK, completed_at,
  applied_at — the completion ledger and, by `applied_at IS NULL`, the
  derived janitor work queue) and `tag_weights` (tag PK, weight). No user/
  profile column — roles arrive later and are a stated migration point.
- Completion detection rides the existing `Deps.OnProgress` seam (fanned out
  beside the thumb re-grab in `cmd/mellifera`): a progress write reaching
  ≥ 90% of the item's stored `ffprobe.format.duration` inserts one
  idempotent `watched_items` row — "watched to the end" — and pokes the recs
  janitor task. No duration ⇒ no auto-completion (honest absence).
- NEW janitor task `recs` (the artwork-D8 named registry): sweep unapplied
  watched rows, resolve each entity's tags (an episode's tags are its
  SERIES document's `genres`; a film/tv item's are its own), increment each
  tag's weight by 1, mark applied. Boot-run + tick + wake-channel; survives
  restarts; idempotent. Rewatching an item never double-counts (PK).
- Ordering lands server-side: `GET /series?library=N` and the item listing
  default to score-desc with `sort=path` restoring today's order; `GET
  /progress` rows gain an additive `rec_score` field and the list orders by
  score desc then recency (`sort=recent` restores pure recency). Served
  DTOs (`seriesDTO`, `itemDTO`, progress rows) gain `rec_score,omitempty`.
- SPA: collection grids already render served order (no grid change);
  Continue re-orders by served `rec_score`, and Next up (client-derived)
  orders by its entries' served scores. No new UI affordances.

## Capabilities

### New Capabilities

- `recommendation-sorting`: the score model (context tiers, equal-base tag
  component, cap below the context bonuses), the completion ledger and its
  detection rule, the tag-weight learning loop as a janitor task, and the
  served ordering contract for collections and continue surfaces.

### Modified Capabilities

- `playback-progress`: progress writes now also feed completion detection
  through the existing `OnProgress` seam; the progress list serves
  `rec_score` and orders by it by default with a recency opt-out.
- `web-ui`: Continue and Next up consume the served `rec_score` ordering;
  collection grids remain served-order renderers (now recommended order).

## Impact

- Code: `internal/store` (two additive tables, primitive-signature methods,
  budget-dodging idiom), `internal/recs` (new pure package, ≤ 8 exports),
  `internal/api` (series/items/progress ordering + additive field, zero new
  exports), `cmd/mellifera` (OnProgress fan-out, recs janitor task + wake),
  `web/src` (Continue/NextUp ordering + tests).
- Wire: additive `rec_score` fields and a `sort` query param on three GET
  routes; no existing field changes shape; default ordering of those three
  routes changes (the point of the change) with explicit opt-outs.
- Docs: `GLOSSARY.md` gains **Recommendation score** and **Watched
  (completed)**; committed OpenAPI + SPA dist regenerated inside the change.
- Not touched: per-series episode tables keep narrative order (a series page
  is a playlist, not a recommendation surface); photo libraries keep path
  order; no user/role dimension anywhere (single implicit profile — the
  later roles change migrates `watched_items`/`tag_weights` with a profile
  column).
