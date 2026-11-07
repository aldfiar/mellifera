# recommendation-sorting Delta

## ADDED Requirements

### Requirement: Home continue rail serves scored, server-composed rows

The home continue rail SHALL be served by `GET /api/v1/home` — rows composed
server-side in one round-trip and ordered recommendation score descending
then `updated_at` descending, the same contract the `/progress` listing
serves — superseding the home surface's client-side derivation over the
`/progress` listing (the watch page's `nextEpisodeAfter` derivation is
untouched). The `/progress` route itself keeps its contract unchanged
(additive `rec_score`, scored order, `sort=recent` opt-out); this requirement
adds only the home rail's serving shape.

#### Scenario: The home rail serves composed rows in scored order

- **WHEN** the home surface loads
- **THEN** one `GET /api/v1/home` round-trip returns the continue rows
  composed server-side in score-descending order with the recency tiebreak,
  and the SPA renders them with no client-side re-sorting or derivation

#### Scenario: The progress contract is untouched

- **WHEN** a client fetches `GET /api/v1/progress` after this change
- **THEN** the response still carries `rec_score` per row in score-descending
  order with the recency tiebreak, and `sort=recent` still restores pure
  recency — the home rail's existence changed no `/progress` behavior
