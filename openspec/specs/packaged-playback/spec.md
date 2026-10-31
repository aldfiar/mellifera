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
its absence marks a partial one that clients natively live-poll. A complete
build SHALL be whole: the playlist SHALL list every media segment published
under the build directory (the tail phase's playlist is never a sliding
window), and every URI any published playlist references — segment and
EXT-X-MAP init alike — SHALL resolve to an existing file relative to that
playlist's own location, for the single-variant build and every rendition
variant alike. A build whose whole file fits within the head chunk SHALL
publish its segments together with the playlist that references them — no
referenced segment stranded in a staging directory that is discarded after
publish.

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

#### Scenario: Complete build lists every published tail segment

- **WHEN** a file whose duration exceeds the head chunk is packaged — long enough that the tail phase publishes more segments than a sliding window holds — and the build completes
- **THEN** the complete playlist lists every tail segment published under the build's tail tree, so the reported duration and the reachable content cover the whole file rather than only its last window

<!-- wf:probe id=8a43dcee929d1c7d -->
```bash
set -e
command -v ffmpeg >/dev/null || { echo "ffmpeg is required to verify the pack lane"; exit 1; }
go test ./internal/stream -run TestReproTailSegmentsPlayable
```
<!-- /wf:probe -->

#### Scenario: Every playlist URI resolves at its own path

- **WHEN** a build completes — single-variant, or a rendition build carrying embedded audio plus voiceover sidecars — and any of its published playlists is read
- **THEN** every URI the playlist references, including the tail splice's segments and the EXT-X-MAP init, resolves to an existing file relative to that playlist's own directory, so the player never meets a playlist reference that answers 404

<!-- wf:probe id=bd900d78dfa06dfb -->
```bash
set -e
command -v ffmpeg >/dev/null || { echo "ffmpeg is required to verify the pack lane"; exit 1; }
go test ./internal/stream -run TestReproTailSegmentsPlayable
```
<!-- /wf:probe -->

#### Scenario: Head-only build publishes its segments

- **WHEN** a file whose whole duration fits within the head chunk is packaged
- **THEN** the published playlist and every segment it references land together in the build directory — every reference resolves relative to the playlist and no referenced segment is removed with the staging directory

<!-- wf:probe id=3694483270be0ea8 -->
```bash
set -e
grep -q "func TestHeadOnlySegmentsPublished" internal/stream/pack_test.go
command -v ffmpeg >/dev/null || { echo "ffmpeg is required to verify the pack lane"; exit 1; }
go test ./internal/stream -run TestHeadOnlySegmentsPublished
```
<!-- /wf:probe -->

### Requirement: Token-gated playback serving

Playlist, segment, and original-file playback responses SHALL be static file
serving from disk — byte-identical responses, no sessions, no media
processes at play time. The surface SHALL be gated by a short-lived HMAC
media token that is never the admin credential; a request SHALL present the
token as the media cookie and/or the query parameter, and SHALL be granted
when EITHER credential verifies as naming the path item (a stale cookie
naming a different item never shadows a valid query token, and vice versa);
the token SHALL default to a 4-hour TTL and SHALL never appear in logs.
Playback requests without any valid media token SHALL be rejected with 401
and a static body. Every rejection SHALL log ONE diagnostic line — the
credential kind seen (`none`, `cookie`, or `query`), the reason class
(`missing`, `malformed`, `expired`, or `wrong-item`), and the client
User-Agent — never the token value; the client-facing rejection body stays
static (no reason echo).

#### Scenario: Playback requires the media token

- **WHEN** a playback URL is requested with no token, with a token signed by a foreign key, with the admin bearer credential, and then with a valid media token delivered first as a cookie and then as a query parameter
- **THEN** the first three are rejected and the two valid-token forms both serve the same bytes

#### Scenario: Tokens stay out of logs

- **WHEN** playback requests are served and rejected with logging active
- **THEN** no log line carries the media token value

#### Scenario: A stale wrong-item cookie never shadows a valid query token

- **WHEN** a playback URL for item A is requested with a cookie carrying a valid token naming item B alongside a query parameter carrying a valid token naming item A — and, separately, with that stale cookie alone
- **THEN** the dual-credential request serves item A's bytes (the query token grants), while the stale cookie alone is rejected 401

#### Scenario: A wrong-item credential is rejected with a classified log line

- **WHEN** a playback URL is requested with a valid-format token naming a different item, once via cookie and once via query parameter
- **THEN** both are rejected 401 with the static body, and each rejection logs one line naming the credential kind (`cookie`, then `query`), the reason class `wrong-item`, and the client User-Agent — with no token value anywhere in the line

### Requirement: Playback descriptor and verb split

`GET /api/v1/items/{id}/playback` in the browse role group SHALL be the
read-only playback descriptor — current mode (`direct` or `hls`), packaging
state, sections, and the play URL — and SHALL answer 404 for an unknown item;
it SHALL never mutate packaging state. `POST /api/v1/items/{id}/play` in the
browse role group SHALL be the only playback mutation: a `retry` request
SHALL re-enqueue a failed packaging run, and `from_seconds` SHALL be accepted
and reserved (no-op) in v1; `retry` on an item with no failed packaging run
SHALL answer 400, and an unknown item SHALL answer 404. The descriptor SHALL
trust a stored complete build only as far as it verifies: when the item's
published build fails integrity validation — a playlist-referenced file
missing at its resolved path, or a complete playlist omitting published
segments — the descriptor SHALL answer the direct floor (mode `direct`, the
original's play URL) rather than hand the player an unplayable playlist URL;
the check is read-only and never writes packaging state.

The descriptor SHALL be honest about a direct floor the requesting client
cannot decode, judged from stored facts only (the ffprobe container fact —
never a re-probe, never client input): when the floor's source container is
not `<video>`-native (mp4/webm; everything else, Matroska included, is not),
the state SHALL carry one of two descriptor-only values instead of the bare
packaging state — `preparing` when a pack can land for the item (its
classification permits packaging now: `pack`, or `opt_in` while the opt-in
codec knob is enabled) and nothing is published yet, `unsupported` when
packaging cannot help (`direct_only`, or `opt_in` with the knob off). Both
values SHALL ride an additive `state_reason` field naming why the floor is
not `<video>`-playable — `non_native_container`, `codec_not_opted_in`, or
`codec_unsupported` — while the descriptor keeps answering the direct floor's
play URL: every item keeps the direct floor and its address, and the state
disclaims its playability (the byte-serving gate is unchanged). A `failed`
state keeps its value and its retry affordance, and MAY carry
`state_reason` when the floor itself is not `<video>`-native. A
`<video>`-native floor keeps today's descriptor exactly: state as persisted
(`none`/`failed`), no `state_reason`. The changes are additive fields and
values only — existing clients keep working — and the persisted packaging
namespace never carries the new values: `preparing`/`unsupported` are
read-side projections, never stored state.

#### Scenario: Retry is the only playback mutation and GET never mutates

- **WHEN** a failed packaging run is re-requested via POST with retry, a GET descriptor is fetched for the same item, and a retry POST is sent for an item whose packaging never failed
- **THEN** the retry POST re-enqueues the failed run, the GET returns the descriptor without changing packaging state, and the second POST answers 400

#### Scenario: Broken build answers the direct floor

- **WHEN** the playback descriptor is fetched for an item whose stored packaging state is complete but whose published build fails integrity validation
- **THEN** the descriptor answers mode direct with the original's token-carrying play URL instead of the broken playlist URL, and the stored packaging state is unchanged

#### Scenario: Non-native container answers preparing with a reason

- **WHEN** the playback descriptor is fetched for an unpackaged Matroska (MKV) item whose classification permits packaging
- **THEN** the descriptor answers mode `direct`, state `preparing`, `state_reason` `non_native_container`, with the direct floor's play URL still present — and the fetch changed no packaging state

#### Scenario: Packaging-hopeless codec answers unsupported until the knob flips

- **WHEN** the descriptor is fetched for a `direct_only` item, for an `opt_in` item while the opt-in codec knob is off, and again for that same `opt_in` item after the knob is enabled
- **THEN** the first answer carries state `unsupported` with `state_reason` `codec_unsupported`, the second carries `unsupported` with `codec_not_opted_in`, and after the knob flips the same item answers state `preparing` — packaging has become possible

#### Scenario: Native container keeps the classic descriptor

- **WHEN** the playback descriptor is fetched for an unpackaged mp4 item whose codecs are browser-decodable
- **THEN** the descriptor answers mode `direct`, state `none`, with no `state_reason` and a playable play URL — byte-compatible with the pre-honesty descriptor shape

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
SHALL NOT be re-enqueued. An item whose stored packaging state is complete but
whose published build fails integrity validation — a playlist-referenced file
missing at its resolved path, or a complete playlist omitting published
segments — SHALL be treated as not packaged: the sweep re-enqueues it for
repackaging into a fresh build directory.

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

#### Scenario: Broken build is re-enqueued at the sweep

- **WHEN** the sweep passes an item whose stored packaging state is complete but whose published build fails integrity validation, alongside healthy packaged items, in-flight packaging, and cooldown-gated failures
- **THEN** only the broken item is re-enqueued for packaging, and the repack publishes a fresh build directory whose playlists satisfy the complete-build contract

<!-- wf:probe id=e3a94ff9390eec25 -->
```bash
set -e
grep -q "func TestRepacks" internal/orchestrator/frontier_test.go
go test ./internal/orchestrator -run TestRepacks
```
<!-- /wf:probe -->

#### Scenario: Sweep healing repacks a corrupted build end to end

- **WHEN** the joint harness packages an episode through the real pack lane, corrupts its published complete build (a deleted tail segment file and a playlist truncated to its last window), and the integrity snapshot drives the repack judge into the real packaging enqueue
- **THEN** the descriptor answers the direct floor while the build is corrupt, and after the repack lands the fresh build directory satisfies the complete-build contract and the descriptor answers hls again

<!-- wf:probe id=bcc5c7c2ba0aedea -->
```bash
set -e
grep -qr "func TestBrokenBuildRepackSweep" internal/itest/
go test ./internal/itest -run TestBrokenBuildRepackSweep
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

### Requirement: Voiceover renditions in the pack lane

When packaging an episode whose document carries episode-linked audio
sidecars (`parsed.sidecars` with kind `audio`), the pack lane SHALL remux
each resolvable sidecar into the fMP4-HLS build as an alternate audio
rendition alongside the embedded audio tracks — stream copy only, no decode
and no encode, ever. A sidecar's absolute path SHALL be derived from the
episode's own stored facts (the episode's `parsed.absolute_path` and
`parsed.relative_path` joined with the sidecar's stored relative path); the
lane SHALL NOT accept client-supplied paths. The build's audio rendition
order SHALL be the embedded audio first, then the episode-linked audio
sidecars in document order. A sidecar that cannot be resolved or read at
build time SHALL be omitted from that build while the rest publishes
(soft-omit); a build that fails outright remains on the shipped
`pack_failed` path. The direct floor and every existing classification rule
are unchanged.

#### Scenario: Packaged episode carries alternate audio renditions

- **WHEN** an episode with embedded audio and two resolvable `.mka` voiceover sidecars is packaged
- **THEN** the published master playlist declares the embedded audio plus two alternate audio renditions in document order, every stream is copied without decoding or encoding, and the direct floor still serves the original bytes

<!-- wf:probe id=99170732b4589948 -->
```bash
set -e
command -v ffmpeg >/dev/null || { echo "ffmpeg is required to verify the pack lane"; exit 1; }
go test ./internal/stream -run TestPackRenditions
```
<!-- /wf:probe -->

#### Scenario: Unreadable voiceover soft-omits and the rest publishes

- **WHEN** one of the referenced sidecar files is missing on disk at build time while the other is present
- **THEN** the build publishes with the remaining renditions and is playable, instead of failing the whole pack

<!-- wf:probe id=c8cb3c70656c2c4b -->
```bash
set -e
command -v ffmpeg >/dev/null || { echo "ffmpeg is required to verify the pack lane"; exit 1; }
go test ./internal/stream -run TestPackRenditions
```
<!-- /wf:probe -->

### Requirement: Voiceover tracks on the playback descriptor

The playback descriptor SHALL project the episode document's episode-linked
audio sidecars as `voiceovers`, ordered by document order, each entry
carrying the sidecar's document index and a display label resolved as the
language fact when present, else the containing folder name, else the sidecar
file name. An episode whose document carries no audio sidecars SHALL carry an
empty list. The projection SHALL read stored facts only — never a re-probe,
never client input — and the descriptor SHALL stay read-only: the read half
SHALL never mutate packaging state.

#### Scenario: Descriptor lists voiceovers from stored facts

- **WHEN** the playback descriptor is fetched for an episode whose document carries two audio sidecars — one with a language fact, one without but under a named folder — and for an episode whose document carries none
- **THEN** the first descriptor lists two voiceover entries in document order with the language-then-folder label resolution and their document indexes, the second lists an empty `voiceovers`, and neither fetch changed packaging state

<!-- wf:probe id=61ba379799f368ce -->
```bash
set -e
go test ./internal/stream -run TestVoiceoverTracks
```
<!-- /wf:probe -->

### Requirement: Completion-aware watched semantics

The packaging frontier's watched signal SHALL be completion-aware — bare
any-positive-position SHALL never count as watched. An item counts as
watched exactly when its stored position has reached the main content's
end, judged as: the stored duration is known AND the position is at least
90% of that duration, OR the item's stored sections classify a
credits/ending section AND the position has reached that section's start.
The credits classification is the SPA skip-range classifier's rule applied
to stored facts: a chapter-kind section whose trimmed, lowercased title is
in the credits lexicon (credits / титры / ending / outro / ed) with start
and end present and end after start; its start is the credits threshold.
Watching up to the ending-credits start — or near it — counts as watched;
100% completion is NEVER required. A position below the credits start AND
below the 90% floor SHALL NOT count as watched; likewise an item whose
stored facts carry neither a usable duration nor a classifiable
credits/ending section SHALL NOT count as watched — both conservative: the
serial stays fronted and its unwatched tail is proactively built.
Proactive (frontier) packaging stays UNWATCHED-ONLY: a serial whose every
episode counts as watched under this predicate stays skipped by the
frontier even when nothing is published, and nothing of it joins the
working set — watched content's packaging path is pack-on-play when its
item is opened for play (POST /play with retry false), never a sweep
enqueue and never a budget-eviction pin. Budget-eviction recency is a
separate signal and stays any-progress-based.

#### Scenario: Reaching the credits start counts watched below the 90% floor

- **WHEN** an episode with a known duration and a classified credits section starting before the 90% point carries a position at or past that section's start but below 90% of the duration
- **THEN** the episode counts as watched and the serial's frontier position advances past it

#### Scenario: Ninety percent of a known duration counts watched without credits

- **WHEN** an episode with a known duration and no classified credits section carries a position at or past 90% of that duration
- **THEN** the episode counts as watched — a near-complete watch never waits for 100%

#### Scenario: Mid-episode below both does NOT count — the tail stays fronted

- **WHEN** a serial's episode carries a position below both its credits start (or it classifies none) and the 90% floor, or its stored facts carry neither a usable duration nor a classifiable credits section
- **THEN** the episode does not count as watched and the serial's unwatched tail stays fronted for proactive packaging — any-positive-position no longer excludes a serial from packaging

#### Scenario: Fully watched zero-build serial stays skipped; pack-on-play is its path

- **WHEN** the frontier sweeps a serial whose every episode counts as watched under the predicate and which has zero published builds
- **THEN** nothing is enqueued and nothing of the serial joins the working set — its packaging path is pack-on-play when its item is opened for play, never a sweep enqueue

#### Scenario: Mixed serial fronts its unwatched tail

- **WHEN** a serial's episodes through K count as watched under the predicate and episode K+1 does not
- **THEN** the frontier position is episode K+1 and it is proactively packaged when eligible (packable, not already packaged, outside its failure cooldown)

### Requirement: Playback decision log

Every successful playback descriptor read SHALL log exactly ONE INFO line —
the item id, the mode, the state, and, when the answer is mode `direct`, the
gating reason: `unpackaged`, `cooldown` (a live packaging-failure ledger row
gates the item), `non_native_container`, `codec_not_opted_in`,
`codec_unsupported`, or `failed`; an `hls` answer logs reason `packaged` —
correlating with the request-log middleware's line for the same request.
Token values and play URLs SHALL NEVER appear in the line (INV4: the reason
is data, never credentials), and the logging SHALL remain side-effect free —
the descriptor read stays read-only, never mutating packaging state.

#### Scenario: Descriptor GET logs one decision line

- **WHEN** playback descriptors are fetched in one session for a packaged item, an unpackaged MKV item, a `direct_only` item, and an item with a live pack-failed cooldown row
- **THEN** each fetch logs exactly one INFO line carrying the item id and mode, with reasons `packaged`, `non_native_container`, `codec_unsupported`, and `cooldown` respectively

#### Scenario: Playback logs never carry token values

- **WHEN** descriptor reads and /media rejections are logged with logging captured
- **THEN** no captured line carries a media token value, a play URL, or any credential material

### Requirement: Playback event beacon

`POST /api/v1/playback-events` in the browse role group (admin+client) SHALL
accept a best-effort playback-telemetry beacon with the JSON body
`{item_id, mode, phase, code, detail}` — all plain data strings; `mode` one
of `direct` or `hls`, `phase` one of `fatal`, `video-error`, `stalled`; no
credential field exists in the shape. The endpoint SHALL be fire-and-forget:
a well-formed beacon SHALL answer 204 with no body and SHALL be persisted
nowhere — its entire effect is ONE INFO log line carrying the beacon fields
with `detail` truncated to a bounded length, plus the client User-Agent,
correlating with the request log. A malformed body SHALL answer the
canonical 400 `bad_request`; a client over its per-client rate limit SHALL
answer 429 `rate_limited` with no log line. The endpoint SHALL perform no
store reads (an unknown `item_id` is accepted verbatim — the beacon is never
load-bearing) and SHALL never log token values (INV4).

#### Scenario: Beacon accepted and logged

- **WHEN** an authenticated client posts a well-formed beacon naming an item that does not exist in the store
- **THEN** the answer is 204 with no body, no store lookup happened, and exactly one INFO line logs the beacon fields (detail truncated) with the client User-Agent

#### Scenario: Malformed body and rate limit

- **WHEN** a beacon arrives with a malformed body, and further well-formed beacons arrive from the same client beyond its rate limit
- **THEN** the malformed beacon answers the canonical 400, the over-limit beacons answer 429 and log nothing, and a beacon from a pairing-minted client-role session is accepted like an admin one
