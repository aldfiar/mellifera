## MODIFIED Requirements

### Requirement: Item media endpoint

The API SHALL expose `GET /api/v1/items/{id}/media` in the browse role group
(admin+client) behind the same bearer authentication middleware as every
`/api/v1` route; the endpoint SHALL NOT serve bytes without a resolved
principal. Without a `variant` parameter the endpoint SHALL serve the item's
original file bytes from the document's `parsed.absolute_path`; with
`?variant=thumb` it SHALL serve the frame-grabber JPEG at the document's
`sources["frame-grabber"].thumbnail_path` when the document carries one. The
response SHALL carry a Content-Type derived from the file extension and a
strong ETag; the cache policy SHALL be per-variant — the write-once `original`
and `sidecar` variants keep `Cache-Control: private, immutable`, while the
re-grabbable `thumb` variant SHALL carry `Cache-Control: private, no-cache`
(an `immutable` thumb would pin stale bytes in the browser cache forever after
a stop-frame re-grab) with its strong ETag still answering an unchanged
`If-None-Match` with 304; conditional requests
(`If-None-Match`) SHALL revalidate to 304, and `HEAD` SHALL be answered with
the same headers and no body. Non-image content SHALL carry
`Content-Disposition: attachment` — through this endpoint video files
download, they are not presented inline. The endpoint serves static bytes
only: no transcoding, no adaptive streaming on this surface — in-browser
video playback is served by the packaged-playback capability's token-gated
playback surface, not here.

#### Scenario: Media sits behind the bearer gate
- **WHEN** `/api/v1/items/{id}/media` is called with no credentials, and then with a valid bearer token
- **THEN** the unauthenticated call is rejected with 401 and the authenticated call is 200 — the endpoint never serves bytes without a resolved principal

<!-- wf:probe id=896f7266e42721c6 -->
```bash
set -e
go test ./internal/api -run TestItemMediaAuth
```
<!-- /wf:probe -->

#### Scenario: Original bytes served with caching headers
- **WHEN** an authorized caller requests `GET /api/v1/items/{id}/media` for an item whose document carries `parsed.absolute_path` pointing at an existing file, and then re-requests conditionally with the returned ETag in `If-None-Match`
- **THEN** the first response is 200 carrying the file's exact bytes, a Content-Type derived from the file extension, a strong ETag, and `Cache-Control: private, immutable`, and the conditional re-request answers 304

<!-- wf:probe id=0023777e45c1b1b9 -->
```bash
set -e
go test ./internal/api -run TestItemMediaOriginal
```
<!-- /wf:probe -->

#### Scenario: Thumb variant serves the frame-grabber grab
- **WHEN** an authorized caller requests `GET /api/v1/items/{id}/media?variant=thumb` for an item whose document carries `sources["frame-grabber"].thumbnail_path` pointing at an existing JPEG, and sends a `HEAD` request for the same URL
- **THEN** the GET answers 200 with that JPEG's exact bytes and the HEAD answers with the same headers and no body

<!-- wf:probe id=8fa5a1f368863c7f -->
```bash
set -e
go test ./internal/api -run TestItemMediaThumb
```
<!-- /wf:probe -->

#### Scenario: Thumb serves no-cache while original and sidecar stay immutable

- **WHEN** an authorized caller requests the `thumb`, `original` (no variant), and `sidecar` variants of an item whose document resolves all three
- **THEN** the thumb response carries `Cache-Control: private, no-cache` with a strong ETag that still answers an unchanged `If-None-Match` with 304, while the original and sidecar responses keep `Cache-Control: private, immutable`

<!-- wf:probe id=ae26726f293257a2 -->
```bash
set -e
go test ./internal/api -run 'TestItemMediaThumb|TestItemMediaOriginal|TestItemMediaSidecar'
```
<!-- /wf:probe -->
