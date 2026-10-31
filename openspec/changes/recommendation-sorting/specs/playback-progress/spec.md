# playback-progress Delta

## ADDED Requirements

### Requirement: Progress writes feed completion detection

The composition root SHALL fan the existing `Deps.OnProgress` closure out to
a watch detector beside the thumb re-grab executor: after a successful
`PutProgress`, the detector loads the item, reads the stored
`ffprobe.format.duration`, and when the written position reaches ≥ 90% of
that duration inserts one idempotent `watched_items` row (see the
recommendation-sorting capability for the ledger contract) and pokes the
recs janitor task's wake channel. The detector SHALL be log-and-skip on
every failure, SHALL NOT change any PUT response, and a nil fan-out SHALL be
a silent no-op (the existing seam contract unchanged).

#### Scenario: The detector fires beside the re-grab and is nil-safe

- **WHEN** a valid PUT lands at ≥ 90% of duration with the fan-out wired,
  and again with it nil
- **THEN** the wired run inserts exactly one watched row and pokes the wake
  channel, the nil run is a silent no-op, and both PUTs return the same 200

## MODIFIED Requirements

### Requirement: Progress read endpoints

The API SHALL expose `GET /api/v1/progress` (browse role group) returning
`{items:[{item_id, position_seconds, updated_at, rec_score?}]}` — rows with
`position_seconds > 0` joined to existing items, ordered by `rec_score`
descending then `updated_at` descending by default, with `sort=recent`
restoring pure `updated_at` descending order, limited by `limit` (default
20, max 100, non-integer → 400) — and `GET /api/v1/progress/{item_id}`
returning the single record or 404 `not_found` when absent (or the item is
gone). `rec_score` SHALL be the entity's recommendation score
(recommendation-sorting capability) carried additively, omitted when scoring
is not computable. Reads SHALL NOT require or imply playback capability.

#### Scenario: Recent progress list

- **WHEN** three items hold positive positions and `GET /api/v1/progress` is called
- **THEN** the response lists exactly those items scored-first with recency
  as the tiebreak, `sort=recent` lists them newest-first, an item without a
  record is absent from the list and yields 404 on its single-item route,
  and `limit=abc` is 400
