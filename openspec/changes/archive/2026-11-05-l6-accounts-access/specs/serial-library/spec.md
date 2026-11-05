# Spec Delta

## MODIFIED Requirements

### Requirement: Series API surface

The API SHALL expose, in the browse role group (admin+client, read-only):
`GET /api/v1/series?library={id}` (integer `library` required — a missing or
non-integer value SHALL yield `400 bad_request`), `GET /api/v1/series/{id}`
(full serial-level document, opaque on the wire; an unknown id SHALL yield `404
not_found` with the canonical error body), and `GET /api/v1/series/{id}/episodes`
(the series' episode items, mirroring the item shape). Every series read SHALL
be viewer-scoped: a series inside a library outside the caller's visible set —
and the episode listing of such a series — SHALL yield the SAME `404
not_found` as an unknown id (hidden ≡ unknown, never 403, never an empty
marker); the library-scoped listing SHALL omit invisible libraries' series
entirely. Handlers SHALL be pure
delegation; the admin mutating group SHALL be unchanged; no write endpoint for
series or item documents SHALL be added by this change.

#### Scenario: Series endpoints sit in the browse group

- **WHEN** the route table is inspected and requests hit the series routes without a valid token
- **THEN** the three series routes are mounted in the browse role group and unauthenticated calls yield `401` with the canonical error body and no side effect

<!-- wf:probe id=e2feb234c74967df -->
```bash
set -e
go test ./internal/api -run TestSeriesRoutesBrowseGated
```
<!-- /wf:probe -->

#### Scenario: Episodes listing and 404 edges

- **WHEN** a client lists the episodes of an existing series and then requests an unknown series id
- **THEN** the episodes endpoint returns the series' episode items in the item wire shape, and the unknown id yields `404 not_found`

<!-- wf:probe id=18b31cb62db7ceff -->
```bash
set -e
go test ./internal/api -run TestSeriesEpisodesAndNotFound
```
<!-- /wf:probe -->

#### Scenario: An invisible series is indistinguishable from an unknown one

- **WHEN** a scoped user requests a series from a library their groups do not carry — by id, its episode listing, and its library-scoped listing
- **THEN** the direct routes answer `404 not_found` with the canonical body and the listing omits the series — identical to the unknown-id answers, no existence signal
