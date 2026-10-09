## MODIFIED Requirements

### Requirement: SPA consumes only pre-existing endpoints

The SPA SHALL be a pure HTTP client over the versioned API — calling only
`GET /api/v1/libraries`, `POST /api/v1/libraries`, `PATCH
/api/v1/libraries/{id}`, `GET /api/v1/libraries/{id}/summary`,
`GET /api/v1/libraries/{id}/folders`, `POST /api/v1/libraries/{id}/scan`,
`GET /api/v1/items`, `GET /api/v1/items/{id}`, `GET /api/v1/items/{id}/media`,
`GET /api/v1/items/{id}/playback`, `POST /api/v1/items/{id}/play`,
`GET /api/v1/series`, `GET /api/v1/series/{id}`, `GET
/api/v1/series/{id}/episodes`, `GET /api/v1/progress`, `PUT
/api/v1/progress/{item_id}`, and `GET /api/v1/admin/status` — with wire shapes
mirrored verbatim. Image media loads SHALL go through the authenticated fetch
wrapper into object URLs (an `<img>` channel cannot carry the bearer header),
keeping the media endpoint's bearer gate intact. Video playback loads SHALL go
through the token-gated playback surface (cookie or query token, never the
bearer credential) at the play URLs minted by the playback descriptor. Every
new SPA consumer SHALL keep the byte-identical Go contract posture: no
client-side shaping that the server does not send.

#### Scenario: No off-contract calls

- **WHEN** the SPA's network calls are audited and the Go tree is built
- **THEN** every app call targets one of the allowlisted `/api/v1` routes or the token-gated playback surface, and `go build ./...` succeeds

<!-- wf:probe id=a237658c3f429594 -->
```bash
set -e
go build ./...
violations=$(grep -rnE "fetch\(|['\"]/api/" web/src --include="*.ts" --include="*.tsx" \
  | grep -v "\.test\." \
  | grep -vE "/(items|libraries|series|progress|admin/status)" \
  | grep -vE "fetch\(path") || true
test -z "$violations"
```
<!-- /wf:probe -->

#### Scenario: Items client mirrors the wire contract
- **WHEN** the SPA's API client is inspected for the items endpoints
- **THEN** listItems and getItem target the pre-existing `/api/v1/items` routes and the ItemDTO fields match the Go JSON tags verbatim

<!-- wf:probe id=b60a9bba64675000 -->
```bash
set -e
grep -q "listItems" web/src/lib/api.ts
grep -q "getItem" web/src/lib/api.ts
grep -q "schema_version" web/src/lib/api.ts
grep -q "relative_path" web/src/lib/api.ts
grep -q "media_type" web/src/lib/api.ts
```
<!-- /wf:probe -->

## ADDED Requirements

### Requirement: Video playback in the SPA

The element page SHALL play video through the playback descriptor: a `direct`
item plays its minted play URL in a native media element; an `hls` item plays
the stream playlist through an HLS client library, attaching equally to a
partial (head-first) and a completed build, with a failed pack offering a
retry affordance wired to the play endpoint with `retry`. Sections from the
descriptor SHALL render as a section list; activating a section SHALL seek
the playing media to that section's start using standard media seeks, so TV
remote transport keys work unchanged. Playback position SHALL keep reporting
through the existing progress endpoint.

#### Scenario: Packaged item plays via the stream playlist and sections seek

- **WHEN** the operator presses play on a packaged episode whose descriptor carries sections, and activates one section while it plays
- **THEN** the player attaches to the stream playlist and the media element seeks to that section's start

<!-- wf:probe id=09c51040619755c7 -->
```bash
set -e
grep -rnqiE "hls" web/src/components/playback/ web/src/pages/browse/ItemDetail.tsx
grep -rnq "sections" web/src/components/playback/
grep -rnqiE "seek|currentTime" web/src/components/playback/
```
<!-- /wf:probe -->

#### Scenario: Direct item plays natively with progress reporting intact

- **WHEN** the operator presses play on a direct (browser-decodable) item and watches past the resume point
- **THEN** the native media element plays the minted play URL and the playback position keeps reporting through the existing progress endpoint

<!-- wf:probe id=387dd052d5bc3e83 -->
```bash
set -e
grep -rnqiE "<video|createElement\(.video" web/src/components/playback/
grep -rnq "progress" web/src/components/playback/
grep -rnqiE "retry" web/src/pages/browse/ItemDetail.tsx
```
<!-- /wf:probe -->
