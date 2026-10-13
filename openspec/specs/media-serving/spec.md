# media-serving Specification

## Purpose
Serves item media bytes over HTTP — photo originals and frame-grabber
thumbnails resolved from the stored item document — so the SPA can render real
images instead of placeholders, with caching semantics and an explicit
downloads-not-streams boundary for video.

## Requirements

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

### Requirement: Media resolution from the stored document

The media path SHALL be resolved only from the stored item document — the
scan-stamped `parsed.absolute_path` and the frame-grabber
`sources["frame-grabber"].thumbnail_path` — never from a client-supplied
value, and the items table SHALL gain no path column. An unknown item id, a
document lacking the requested variant's path fact, and a path fact whose file
is missing or unreadable on disk SHALL all answer 404 `not_found` with the
canonical error body; an unknown `variant` value SHALL answer 400
`bad_request`; no request SHALL ever serve a file other than one resolved from
the stored document.

#### Scenario: Canonical errors and no client-steered paths
- **WHEN** the media endpoint is called for an unknown item id, for an item whose document lacks the variant's path fact, for a path fact whose file is missing on disk, with an unknown `variant` value, and with a client-supplied path-like parameter attempting to steer resolution
- **THEN** the first three cases answer 404 not_found with the canonical error body, the unknown variant answers 400 bad_request, and no request ever serves a file other than one resolved from the stored document

<!-- wf:probe id=c304fabeb94884e4 -->
```bash
set -e
go test ./internal/api -run TestItemMediaErrors
```
<!-- /wf:probe -->

### Requirement: Sidecar serving

The item media endpoint SHALL accept `?variant=sidecar` with an `n` query
parameter: it SHALL serve the bytes of the sidecar at zero-based index `n` of
the episode document's `parsed.sidecars` list, resolved ONLY from the stored
document — an index, never a client-supplied path. The response SHALL carry a
Content-Type derived from the sidecar file's extension, a strong ETag, and
`Cache-Control: private, immutable`; `HEAD` SHALL be answered with the same
headers and no body. A missing, non-integer, or negative `n` SHALL be `400
bad_request`; an index at or beyond the document's sidecar list, a document
without sidecar facts, an unknown item, and a resolved file missing on disk
SHALL all be `404 not_found` with the canonical error body. No request SHALL
ever serve a file other than one resolved from the stored document's sidecar
facts.

#### Scenario: Sidecar bytes serve by index

- **WHEN** an authorized caller requests `?variant=sidecar&n=0` and `n=1` for an episode whose document carries two sidecar facts pointing at existing files
- **THEN** each response serves the exact bytes of the indexed sidecar with its extension-derived Content-Type, a strong ETag, and `Cache-Control: private, immutable`, and a conditional re-request with the ETag answers 304

<!-- wf:probe id=9af98ae2a9d7cc4b -->
```bash
set -e
go test ./internal/api -run TestItemMediaSidecar
```
<!-- /wf:probe -->

#### Scenario: Sidecar error edges

- **WHEN** the sidecar variant is requested with `n` missing or non-integer or negative, with an index beyond the document's sidecar list, for an episode without sidecar facts, and for a resolved file that is missing on disk
- **THEN** the first three answer `400 bad_request` and the last two answer `404 not_found`, each with the canonical error body, and no response ever serves a file outside the stored document's sidecar facts

<!-- wf:probe id=1484c98853a70d0e -->
```bash
set -e
go test ./internal/api -run TestItemMediaSidecar
```
<!-- /wf:probe -->
