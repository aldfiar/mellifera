# Spec Delta

## ADDED Requirements

### Requirement: Embedded build carries the capability-gate surface

The committed embedded build (`internal/web/dist/`) SHALL be regenerated
from this change's `web/src` via the dev-time `make web-build` path and
committed; the regenerated OpenAPI contract
(`internal/web/api/openapi.{json,yaml}`) SHALL list the playback
descriptor's `codecs` field; the Go embed directive and the node-free Go
build gate stay untouched.

#### Scenario: Committed dist is the fresh build of this change's SPA

- **WHEN** the committed `internal/web/dist` bundle is compared against a fresh build of this change's `web/src`
- **THEN** `dist/index.html` and hashed `assets/*.js` exist, the bundle carries the pre-mount capability probe, both OpenAPI files list the descriptor's `codecs` field, and the committed tree stays clean after a fresh `npm run build` — the committed dist IS the current build

## MODIFIED Requirements

### Requirement: Video playback in the SPA

The element page SHALL offer the playback surface for every video item,
derived structurally (any non-image item — never a media_type literal): the
page fetches the playback descriptor for each non-image item and mounts the
player from the descriptor, and the descriptor decides playability. A
`direct` item plays its minted play URL in a native media element; an `hls`
item plays the stream playlist through an HLS client library, attaching
equally to a partial (head-first) and a completed build, with a failed pack
offering a retry affordance wired to the play endpoint with `retry`. Before
mounting the HLS lane, the player SHALL ask the device what it is about to
feed it: when the descriptor carries `codecs`, the player composes ONE
`MediaSource.isTypeSupported` probe from the video codec plus the first
audio codec — the device's default mount — and a probe miss SHALL render an
explicit device-unsupported banner (this device cannot decode this pack's
codecs — never a spinner, never a cryptic fatal) and SHALL send one
best-effort beacon through `POST /api/v1/playback-events` with the closed
vocabulary (`mode: "hls"`, `phase: "video-error"`, the probe's mime as the
`detail`); no HLS lane mounts. A descriptor without `codecs`, or a device
without `MediaSource`, mounts exactly as before; a probe pass mounts with
zero behavior change. Sections from the descriptor SHALL render as a
section list; activating a section SHALL seek the playing media to that
section's start using standard media seeks, so TV remote transport keys
work unchanged. Playback position SHALL keep reporting through the existing
progress endpoint.

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

#### Scenario: A ready serial episode mounts the player

- **WHEN** the operator opens an episode whose stored media_type is `serial` (the value production writes) with status ready and a descriptor answering an `hls` complete build
- **THEN** the page fetches the descriptor and mounts the player with the play affordance — the surface is reachable without any fixture value production never writes

<!-- wf:probe id=572a62bf23c6aeb0 -->
```bash
set -e
grep -q 'media_type: "serial"' web/src/pages/browse/ItemDetail.test.tsx
cd web && npx vitest run src/pages/browse/ItemDetail.test.tsx
```
<!-- /wf:probe -->

#### Scenario: Joint: a scanned serial episode yields a player-capable descriptor

- **WHEN** a hermetic fixture serial library is scanned through the real plugin subprocesses and the stored episode's playback descriptor is fetched through `GET /api/v1/items/{id}/playback`
- **THEN** the stored episode carries media_type `serial` (never `video`), the descriptor answers 200 with mode `direct` or `hls`, a packaging state, a non-empty token-carrying play_url, and sections and voiceovers arrays — the exact shape the SPA's player mounts

<!-- wf:probe id=dbec622421aa3de9 -->
```bash
set -e
go test ./internal/itest -run TestVideoItemPagesJointE2E
```
<!-- /wf:probe -->

#### Scenario: Fixtures carry production-shaped media types

- **WHEN** the SPA's test suites are inspected for the media_type values their fixtures carry
- **THEN** every fixture media_type is a value production writes (`tv`, `serial`, or `image` for image modules) and no `media_type: "video"` fixture remains anywhere in `web/src`

<!-- wf:probe id=f7e4e5f8f6fad844 -->
```bash
set -e
! grep -rn 'media_type: "video"' web/src --include="*.ts" --include="*.tsx"
grep -q 'media_type: "serial"' web/src/pages/browse/ItemDetail.test.tsx
cd web && npx vitest run src/lib/api.test.ts src/pages/home/Home.test.tsx src/pages/collections/Collection.test.tsx
```
<!-- /wf:probe -->

#### Scenario: A device that cannot decode the pack sees the honest banner

- **WHEN** the operator presses play on a packaged item whose descriptor carries `codecs` on a device whose `MediaSource.isTypeSupported` answers false for the video-plus-first-audio probe
- **THEN** the device-unsupported banner renders naming the codecs — no spinner, no hls fatal, no mount — and exactly one best-effort beacon (`mode: "hls"`, `phase: "video-error"`, `code: "device-cannot-decode"`, the probe mime as `detail`) is sent

#### Scenario: Capable devices and codec-less answers mount unchanged

- **WHEN** a capable device plays the same packaged item (probe passes), and a build whose descriptor answers no `codecs` is opened on any device
- **THEN** the first mounts the HLS lane exactly as before the probe existed, and the second skips the probe and mounts as before — no behavior change on either path
