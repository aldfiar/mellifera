# media-serving Delta

## ADDED Requirements

### Requirement: Art object endpoint

The API SHALL expose `GET /api/v1/art/object/{oid}` and `HEAD /api/v1/art/object/{oid}` in the browse role group (admin+client) behind the same bearer authentication middleware as every `/api/v1` route. The object id SHALL be `art_` plus a full SHA-256 hex digest, and resolution SHALL be pure path resolution from that hex — content-addressed on disk, with zero document or store reads on the serve path, guarded so only a well-formed id resolves a file. The response SHALL carry a Content-Type derived from the stored bytes' format, a strong ETag taken from the hex in the URL, and `Cache-Control: private, immutable`; conditional requests (`If-None-Match`) SHALL revalidate to 304, and `HEAD` SHALL be answered with the same headers and no body. An object whose bytes are absent SHALL answer 404 `not_found` with the canonical error body, and serving SHALL NEVER trigger an upstream fetch — acquisition happens through the artwork capability's producers, never on the serve path.

#### Scenario: Art objects sit in the browse group
- **WHEN** an art object URL is called with no credentials, with a client-role device token, and with the admin token
- **THEN** the unauthenticated call is rejected 401 while both the client and admin calls answer 200 — paired devices load posters

#### Scenario: Immutable bytes with strong ETag
- **WHEN** an authorized caller requests a materialized art object, then re-requests conditionally with the returned ETag in `If-None-Match`, and sends a `HEAD` for the same URL
- **THEN** the first response is 200 with the exact bytes, a strong ETag, and `Cache-Control: private, immutable`; the conditional re-request answers 304; the HEAD repeats the headers with no body

#### Scenario: Unknown object answers 404 without fetching
- **WHEN** an authorized caller requests an id that is well-formed but unmaterialized, and a malformed id
- **THEN** the unmaterialized id answers 404 not_found with the canonical body and no upstream request is started, and the malformed id is rejected without resolving any path
