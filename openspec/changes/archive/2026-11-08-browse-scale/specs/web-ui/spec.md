# web-ui Delta

## MODIFIED Requirements

### Requirement: Continue and Next up surfaces

The home surface SHALL render the Continue rail from `GET /api/v1/home` in a
single request: one row per served continue entry, showing the series' served
`display_name`, its source collection name, a progress bar for the row's
current item rendered ONLY when the row carries `duration_seconds` (honest
absence — no duration, no bar), a remaining-time or percent label, and the
item's frame-grabber thumb preview loaded through the authenticated media
fetch (the same pattern as the collection card's preview); an item whose
document carries no thumb fact SHALL keep the honest badge-only row — never a
broken-image state. When a row carries a served `next` entry, the row SHALL
render its next-episode affordance — the served `label` (e.g. `S02E06`)
verbatim — navigating to `next.item_id`; when `next` is absent, no such
affordance SHALL render. The client MUST NOT re-derive next-up, re-implement
name composition, or carry per-surface copies of either chain: the home
surface's per-series episode fan-out (`GET /series/{id}/episodes` per started
series), the client started-series grouping, and the `module_id === "tv"`
gate are removed from it — films surface as continue rows without a next
offer. Each row keeps a Play affordance for its current item with the same
navigation the Continue cards use today. The home surface SHALL render the
shared empty state when the `/home` response carries no rows. The watch
page's next-episode derivation is a different surface and is untouched by
this requirement.

#### Scenario: Continue renders in-progress items with progress

- **WHEN** the home response carries continue rows whose current items have
  positive positions
- **THEN** the Continue rail renders exactly those rows in the served order
  with progress bars and Play affordances, from the single `/home` request

#### Scenario: Next up derives the next unstarted episode

- **WHEN** a continue row's series holds later unstarted episodes
- **THEN** the row itself carries the server-served next offering the
  lowest-numbered unstarted episode with a Play affordance, a row whose series
  has nothing later renders no next affordance, and the shared empty state
  still renders when the whole rail is empty

#### Scenario: Continue cards carry the stop-frame thumb and the series-named title

- **WHEN** the home surface renders an in-progress serial episode whose
  document carries the thumb fact, alongside an episode with no thumb fact
  and a tv-module film
- **THEN** the serial episode row shows the thumb preview and its served
  `display_name` (the composed `<series title> · SxxEyy`), the no-thumb item
  keeps the honest badge-only row, and the film renders as a continue row
  without a next offer

#### Scenario: Next up derives from series records and their episode lists

- **WHEN** the server composes a row's next pick
- **THEN** it offers the lowest `(season, episode)` strictly after the
  highest-started one — the same reading the client derivation used to apply
  over series records and their episode lists — while the SPA performs no
  episode-list fetches, no started-series grouping, and no `module_id`
  gating itself

#### Scenario: Single-request home render

- **WHEN** the home surface mounts with several started series
- **THEN** exactly one `GET /api/v1/home` request fires — no `/progress`
  listing and no per-series episode fetches — and the rows render the served
  fields verbatim

#### Scenario: Honest progress bar

- **WHEN** a continue row arrives without `duration_seconds`
- **THEN** that row renders without a progress bar, its label and thumb
  otherwise intact

#### Scenario: Next affordance comes from the server

- **WHEN** one row carries `next` and another does not
- **THEN** the first row shows the served label navigating to `next.item_id`
  and the second renders no next affordance — the client composed neither
  label nor pick

#### Scenario: Empty home is a shared empty state

- **WHEN** `GET /api/v1/home` returns no continue rows
- **THEN** the home surface renders the shared empty state in place of the
  rail

### Requirement: Continue and Next up consume served scores

The served-scores rule SHALL hold on the surfaces that keep client
derivations. The watch page's Next up derivation SHALL order its entries by
the served `rec_score` of the series' progress rows, ties by recency,
through its `nextEpisodeAfter` derivation — the SPA SHALL NOT re-implement
the score model on any surface. Collection grids SHALL remain served-order
renderers (recommendation order by default) with no new affordances, no
score chips, and no sort toggles in v1. The home surface is superseded by
`GET /api/v1/home`: its Continue rail SHALL render the single `/home`
response (the single-request home contract above) instead of the served
`GET /progress` order — the `/progress`-ordering clause no longer applies
to the home surface.

#### Scenario: Continue follows the served order

- **WHEN** the home response carries continue rows whose served order
  differs from recency order
- **THEN** the Continue rail renders the served `/home` order and performs
  no client-side re-sorting — the score model stays server-side

#### Scenario: Next up orders by served score

- **WHEN** two started series hold next-up episodes and their progress rows
  carry different rec_scores
- **THEN** the watch page's nextEpisodeAfter derivation lists the
  higher-scored series' episode first, ties falling to recency, with no
  client-side scoring

#### Scenario: Grids change nothing client-side

- **WHEN** a collection grid renders against the reordered series listing
- **THEN** the component code is unchanged from today (it already renders
  served order) and no score value appears on any card

#### Scenario: Home renders the /home response, not the progress listing

- **WHEN** the home surface mounts with started series
- **THEN** the Continue rail renders the single `GET /api/v1/home` response
  per the single-request home contract and no `/progress` fetch backs the
  home rail
