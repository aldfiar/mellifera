# Spec Delta

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
zero behavior change. An MSE-less device — one whose HLS support check
answers false, taking the plain media-source path — SHALL NOT silently
mount an `hls` descriptor whose `layout` names the rendition layout: its
native parse renders the master's video variant alone and never fetches
the EXT-X-MEDIA audio renditions (the silent video-only mount). It SHALL
refuse honestly instead: the classified banner surface renders (this
device cannot play this pack's multi-audio layout — the
`rendition-layout-unsupported` class, distinct from the media-error
classes and from `device-cannot-decode`) and exactly one best-effort
beacon (`mode: "hls"`, `phase: "video-error"`,
`code: "rendition-layout-unsupported"`, a non-empty `detail`) is sent,
with NO media source mounted. An `hls` descriptor whose `layout` names the
single-variant layout, or which predates the layout record, mounts the
plain media source exactly as before — the flat single-audio direct floor
stays the MSE-less path's working lane. Sections from the descriptor SHALL
render as a section list; activating a section SHALL seek the playing
media to that section's start using standard media seeks, so TV remote
transport keys work unchanged. Playback position SHALL keep reporting
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

#### Scenario: An MSE-less device refuses a rendition master with banner and beacon

- **WHEN** a device whose HLS support check answers false (no usable MSE) opens an `hls` descriptor whose `layout` names the rendition layout
- **THEN** the `rendition-layout-unsupported` banner renders on the classified banner surface, exactly one best-effort beacon (`mode: "hls"`, `phase: "video-error"`, `code: "rendition-layout-unsupported"`, a non-empty `detail`) is sent, and no media source mounts — no silent video-only playback, no spinner

#### Scenario: Flat single-audio builds keep the direct floor on MSE-less devices

- **WHEN** the same device opens an `hls` descriptor whose `layout` names the single-variant layout, and one whose descriptor predates the layout record
- **THEN** both mount the plain media source on the descriptor's play URL exactly as before the refusal existed — the flat single-audio direct floor keeps playing, and no beacon fires for either
