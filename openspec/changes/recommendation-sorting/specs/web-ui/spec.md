# web-ui Delta

## ADDED Requirements

### Requirement: Continue and Next up consume served scores

The SPA's Continue row SHALL render the served `GET /progress` order
(rec_score descending) without client-side scoring, and the Next up
derivation SHALL order its entries by the served `rec_score` of the series'
progress rows, ties by recency — the served-names-only rule extends to
ordering: the SPA SHALL NOT re-implement the score model. Collection grids
SHALL remain served-order renderers (now recommendation order by default)
with no new affordances, no score chips, and no sort toggles in v1.

#### Scenario: Continue follows the served order

- **WHEN** the progress endpoint serves a scored order that differs from
  recency order
- **THEN** the Continue row renders the served order and performs no
  client-side re-sorting

#### Scenario: Next up orders by served score

- **WHEN** two started series hold next-up episodes and their progress rows
  carry different rec_scores
- **THEN** the Next up row lists the higher-scored series' episode first,
  ties falling to recency

#### Scenario: Grids change nothing client-side

- **WHEN** a collection grid renders against the reordered series listing
- **THEN** the component code is unchanged from today (it already renders
  served order) and no score value appears on any card
