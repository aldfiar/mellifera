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
response SHALL carry a Content-Type derived from the file extension, a strong
ETag, and `Cache-Control: private, immutable`; conditional requests
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
