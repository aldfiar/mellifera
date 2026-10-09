# packaged-playback Specification

## Purpose
Delivers fast in-browser video playback on weak headless servers without ever
encoding: every item keeps a zero-work direct floor playable at its original
bytes, and items whose codecs the browser can decode but whose container it
cannot get remux-only fMP4-HLS packaging produced off the play path under a
storage budget — so TV-remote scrubbing is a structural segment fetch, and
play time is static token-gated file serving with no sessions and no media
processes.

## Requirements

### Requirement: Direct playback floor

Every item SHALL be playable at its original file bytes through the
token-gated playback surface, with byte-range request support and zero
transform work at play time — the direct floor is available for every item
regardless of classification. The playback surface SHALL never write inside
library directories; originals are read-only forever.

#### Scenario: Direct item plays original bytes with range support

- **WHEN** the playback descriptor of a browser-decodable item is fetched and the returned play URL is requested with a valid media token, including a byte-range request
- **THEN** the original file's bytes are served statically with range support and no media process is spawned to answer any of it

<!-- wf:probe id=54f84d49b11d57df -->
```bash
set -e
go test ./internal/stream -run TestDirectFloor
```
<!-- /wf:probe -->

### Requirement: Playback classification

The system SHALL classify each item for playback from the ffprobe facts
already stored in its document — never from client input — into exactly one
of: `direct` (browser-decodable codec in a browser-acceptable container —
serve the original), `pack` (browser-decodable codec in a hostile container —
packaging permitted), `opt_in` (codec many targets cannot decode — packable
only while the opt-in codec knob is enabled, default disabled), and
`direct_only` (no browser can decode the stream and remuxing cannot change
that — never packaged). While the opt-in knob is disabled an `opt_in` item
SHALL behave as `direct_only`: direct floor only, never packaged.

#### Scenario: Codec-fine container-hostile item classifies for packaging

- **WHEN** an item's stored ffprobe facts carry an h264 video stream and AAC audio inside an MKV container
- **THEN** the item classifies `pack` and packaging is permitted for it

<!-- wf:probe id=6c39c5af9b9e07fb -->
```bash
set -e
go test ./internal/stream -run TestClassification
```
<!-- /wf:probe -->

#### Scenario: Opt-in codecs stay unpackaged while the knob is off

- **WHEN** an item carries an HEVC video stream with the opt-in codec knob at its default (off), and separately an item carries a >8-bit h264 video stream regardless of the knob
- **THEN** neither item is ever packaged — the HEVC item behaves as direct_only while the knob is off and the high-10 item is direct_only unconditionally — and both keep the direct floor

<!-- wf:probe id=5bc2a17243374141 -->
```bash
set -e
go test ./internal/stream -run TestClassification
```
<!-- /wf:probe -->

### Requirement: Remux-only pack lane

Packaged output SHALL be produced by remuxing only — stream copy, no decode
and no encode, ever — into fMP4-HLS carrying one video stream and the audio
tracks; subtitle and data streams SHALL be dropped. Artifacts SHALL be
published atomically into the server's own data space (written aside, then
moved into place), and each packaging run SHALL publish under a fresh build
directory so a repack never collides with a client's cached playlist;
playlists SHALL be byte-identical for a given published build.

#### Scenario: Remux drops subtitles without decoding

- **WHEN** an MKV carrying h264 video, AAC audio, and PGS subtitles is packaged
- **THEN** the produced playlist and segments are fMP4-HLS carrying video and audio only — no subtitle or data tracks — and the packaging invocation copies streams without decoding or encoding

<!-- wf:probe id=f9e6ec5d9a440008 -->
```bash
set -e
command -v ffmpeg >/dev/null || { echo "ffmpeg is required to verify the pack lane"; exit 1; }
go test ./internal/stream -run TestPackLane
```
<!-- /wf:probe -->

#### Scenario: Repack never collides with a cached playlist

- **WHEN** an already-packaged item is packaged again while a client still holds the previously served playlist URL
- **THEN** the new build publishes at a different location and the client's cached playlist URL keeps answering with the old build's bytes

<!-- wf:probe id=ddd8d55c027579ca -->
```bash
set -e
command -v ffmpeg >/dev/null || { echo "ffmpeg is required to verify the pack lane"; exit 1; }
go test ./internal/stream -run TestPackLane
```
<!-- /wf:probe -->

### Requirement: Head-first partial packaging

The first chunk of a packaging run (600 seconds, fixed in v1) SHALL be
published and playable while the remainder packages; the playlist SHALL grow
as segments land, and the closing ENDLIST tag SHALL mark a complete build —
its absence marks a partial one that clients natively live-poll.

#### Scenario: Partial build plays before completion

- **WHEN** packaging has published only the first chunk and a client fetches the playlist, then packaging completes and the client refetches
- **THEN** the first fetch answers a playable playlist without ENDLIST and the refetch answers the grown playlist with ENDLIST

<!-- wf:probe id=750761395b927c06 -->
```bash
set -e
command -v ffmpeg >/dev/null || { echo "ffmpeg is required to verify the pack lane"; exit 1; }
go test ./internal/stream -run TestHeadFirst
```
<!-- /wf:probe -->

#### Scenario: Human walkthrough of packaged playback end to end

- **WHEN** the operator walks a packaged item end-to-end in a real browser — playback starting from the partial head-first build and continuing past completion, a TV-remote-style transport-key seek within a section, a chapter-section jump, and an observed over-budget eviction
- **THEN** playback holds throughout without stalling on packaging, seeks land structurally, and the eviction is observable in logs

UNPROBEABLE

### Requirement: Token-gated playback serving

Playlist, segment, and original-file playback responses SHALL be static file
serving from disk — byte-identical responses, no sessions, no media processes
at play time. The surface SHALL be gated by a short-lived HMAC media token
that is never the admin credential, delivered cookie-first with a
query-parameter fallback for cookie-less clients; the token SHALL default to
a 4-hour TTL and SHALL never appear in logs. Playback requests without a
valid media token SHALL be rejected.

#### Scenario: Playback requires the media token

- **WHEN** a playback URL is requested with no token, with a token signed by a foreign key, with the admin bearer credential, and then with a valid media token delivered first as a cookie and then as a query parameter
- **THEN** the first three are rejected and the two valid-token forms both serve the same bytes

<!-- wf:probe id=bd3cab860208a495 -->
```bash
set -e
go test ./internal/stream -run TestMediaToken
```
<!-- /wf:probe -->

#### Scenario: Tokens stay out of logs

- **WHEN** playback requests are served and rejected with logging active
- **THEN** no log line carries the media token value

<!-- wf:probe id=07d7ee1176505151 -->
```bash
set -e
go test ./internal/stream -run TestMediaToken
```
<!-- /wf:probe -->

### Requirement: Playback descriptor and verb split

`GET /api/v1/items/{id}/playback` in the browse role group SHALL be the
read-only playback descriptor — current mode (`direct` or `hls`), packaging
state, sections, and the play URL — and SHALL answer 404 for an unknown item;
it SHALL never mutate packaging state. `POST /api/v1/items/{id}/play` in the
browse role group SHALL be the only playback mutation: a `retry` request
SHALL re-enqueue a failed packaging run, and `from_seconds` SHALL be accepted
and reserved (no-op) in v1; `retry` on an item with no failed packaging run
SHALL answer 400, and an unknown item SHALL answer 404.

#### Scenario: Retry is the only playback mutation and GET never mutates

- **WHEN** a failed packaging run is re-requested via POST with retry, a GET descriptor is fetched for the same item, and a retry POST is sent for an item whose packaging never failed
- **THEN** the retry POST re-enqueues the failed run, the GET returns the descriptor without changing packaging state, and the second POST answers 400

<!-- wf:probe id=0e71a0af8e1c3eb0 -->
```bash
set -e
go test ./internal/api -run TestPlaybackVerbs
```
<!-- /wf:probe -->

### Requirement: Sections from container chapters

Container chapters read by the scanner SHALL surface on the playback
descriptor as sections of the shape `{kind, start, end?, title?}` with
`kind: "chapter"`, so a viewer can jump straight to a section. The `marker`
kind SHALL remain reserved for future plugin-detected boundaries and SHALL
NOT be produced in v1.

#### Scenario: Chapters ride the stored ffprobe facts

- **WHEN** a movie or episode file carrying container chapters is scanned
- **THEN** the stored ffprobe facts include the chapters with their start, end, and title, so sections project from stored facts without re-probing at play time

<!-- wf:probe id=f6d562ae89f4c360 -->
```bash
set -e
grep -q -- "-show_chapters" plugins/base-scanner/ffprobe.go
grep -q -- "-show_chapters" plugins/serial-scanner/ffprobe.go
go build ./...
```
<!-- /wf:probe -->

#### Scenario: Chapters become sections on the descriptor

- **WHEN** the playback descriptor is fetched for an item whose stored ffprobe facts carry three chapters
- **THEN** the descriptor lists three sections of kind chapter with start, end, and title carried through

<!-- wf:probe id=6421225686465940 -->
```bash
set -e
go test ./internal/stream -run TestSections
```
<!-- /wf:probe -->

### Requirement: Watch-driven packaging frontier

Packaging work SHALL be decided off the play path by a watch-driven frontier,
swept periodically and at boot per library gated on that library's
streams-enabled state (default enabled): the next episode of a serial packages
once its predecessor is watched (episodes ordered exactly as the episodes
listing orders them); a serial with no watch progress packages its first
episode; a movie packages only when played, never pre-warmed. Items already
packaged, currently packaging, or inside their packaging failure cooldown
SHALL NOT be re-enqueued.

#### Scenario: Watching an episode fronts the next one

- **WHEN** the frontier sweeps a serial whose episode K carries watch progress and episode K+1 is not packaged
- **THEN** episode K+1 is enqueued for packaging and no other episode of the serial is

<!-- wf:probe id=329a4f043a1380c3 -->
```bash
set -e
go test ./internal/orchestrator -run TestFrontier
```
<!-- /wf:probe -->

#### Scenario: Fresh serial fronts its pilot and movies wait for play

- **WHEN** the frontier sweeps a serial with no watch progress and a movie library with untouched container-hostile items
- **THEN** the serial's first episode is enqueued while no movie is enqueued until its play is requested

<!-- wf:probe id=f8cc8d126bc39aab -->
```bash
set -e
go test ./internal/orchestrator -run TestFrontier
```
<!-- /wf:probe -->

#### Scenario: Streams-disabled library is skipped at the gate

- **WHEN** a library's streams-enabled state is switched off and the frontier sweeps that library
- **THEN** nothing in it is enqueued for packaging while its items keep the direct floor

<!-- wf:probe id=3711aba0eccd5a69 -->
```bash
set -e
go test ./internal/orchestrator -run TestFrontier
go build ./...
```
<!-- /wf:probe -->

### Requirement: Budget-capped artifacts

Stored packaging artifacts SHALL live under a storage budget (default 32 GB,
`0` disables the cap). Accounting SHALL read the artifact directories on disk
as the truth — including directories orphaned by moved or deleted library
files — and eviction SHALL be least-recently-watched first (by playback
progress recency), moving the artifact aside before deleting it. Originals
SHALL never be evicted.

#### Scenario: Over-budget eviction reaps least-recently-watched and orphans

- **WHEN** artifact directories on disk exceed the budget, including one orphaned by a moved library file, and the least-recently-watched item's artifact and the orphan are oldest by watch recency
- **THEN** eviction removes those artifact directories first and accounting afterwards reports within budget

<!-- wf:probe id=afb6d2ff79cb0935 -->
```bash
set -e
go test ./internal/orchestrator -run TestBudgetEviction
```
<!-- /wf:probe -->

### Requirement: Packaged state survives re-scan

A re-scan whose identity-bearing base (parsed + ffprobe) is unchanged SHALL
carry the item's packaged state forward unchanged — the artifact stays
playable and is not re-packaged; a re-scan whose base changed SHALL drop the
packaged state so the changed media repackages under the frontier.

#### Scenario: Unchanged re-scan keeps playback, changed re-scan drops it

- **WHEN** a library is re-scanned once with an item's file untouched and once after the file's media changed
- **THEN** the untouched item keeps its packaged state with its artifact still playable, while the changed item's packaged state is dropped for repackaging

<!-- wf:probe id=80a987cfa7028716 -->
```bash
set -e
go test ./internal/scan -run TestRescanCarryForward
```
<!-- /wf:probe -->

### Requirement: Packaged playback round trip

The system SHALL turn a scan of a container-hostile item into playable
packaged video without manual steps: the frontier enqueues it, packaging
completes, the playback descriptor answers with mode `hls` and a play URL,
and requesting that URL with a valid media token serves the packaged playlist
and segments statically.

#### Scenario: Scan to served playlist round trip

- **WHEN** a library containing a container-hostile serial is scanned, its pilot episode is enqueued by the frontier and packaged, and the pilot's playback descriptor is fetched and its play URL requested with a valid media token
- **THEN** the descriptor answers mode hls with a play URL, and the URL serves the packaged playlist and segments statically

<!-- wf:probe id=fd57f27e12ae6ebe -->
```bash
set -e
command -v ffmpeg >/dev/null || { echo "ffmpeg is required to verify the pack lane"; exit 1; }
go test ./internal/itest -run TestPlaybackRoundTrip
```
<!-- /wf:probe -->
