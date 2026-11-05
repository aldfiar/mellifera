# Spec Delta

## ADDED Requirements

### Requirement: Playback visibility pre-check

The playback surfaces SHALL gate BEFORE minting: `POST /api/v1/items/{id}/play`
and `GET /api/v1/items/{id}/playback` SHALL resolve the named item through
the CALLER's Viewer (a viewer-scoped GetItem pre-check) before either the
media token mint or the playback descriptor closure runs. An item that is
unknown OR INVISIBLE to the caller SHALL answer 404 `not_found` with the
canonical error body — no media token is ever minted, no manifest is ever
composed, and the closure signatures are untouched (the pre-check rides the
handler). Existing responses for visible items SHALL be unchanged.

#### Scenario: No token is minted for a hidden item

- **WHEN** a scoped user posts `/play` (or requests `/playback`) for an item inside a library their groups do not carry
- **THEN** the answer is 404 `not_found` — identical to the unknown-item answer, no media token exists for the item, and no playback closure ran

#### Scenario: Visible items keep today's flow

- **WHEN** a caller whose viewer carries the item's library posts `/play` and requests `/playback`
- **THEN** the responses are byte-identical to today's — the pre-check is invisible on the allowed path
