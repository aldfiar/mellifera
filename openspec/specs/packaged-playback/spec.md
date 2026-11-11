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
directory so a repack never collides with a build still in flight.
Publishing a fresh build for an item SHALL NOT delete any of the item's
previous build directories at publish time: the document write that names
the new build makes it the item's one CURRENT build, and every superseded
build directory SHALL remain in place at its own path and keep serving
through the media surface for a retention grace window (10 minutes, locked
— repo precedent: locked defaults, no env knob by design), so a live
session holding the superseded build's playlist and segment URLs keeps
playing through a re-heal. Reclamation is the periodic sweep's decision,
never a publish side effect: the sweep SHALL reclaim a build directory
exactly when it is neither the document-named build nor `.tmp-*` staging,
and its age is past the grace measured on the directory itself AND — when
the item's row exists — on the document's last write, so an in-flight pack
(a fresh, growing directory under a document that does not yet name it) and
a just-superseded build (a fresh document write over an old directory) are
both safe for the full window; an item whose row is gone has no document
anchor and is judged on the directory age alone. Reclamation SHALL reuse
the budget sweep's move-aside-then-delete vocabulary and is best-effort (a
failed reclaim logs a warning and is retried by a later tick — it never
fails anything). The move-aside step exists for the client mid-fetch (an
atomic rename hides the deletion from a live session holding the tree's
segment URLs) and applies to a directory NOT already carrying the
`.trash` suffix: a directory that already carries the suffix — stranded
trash, whether crash hygiene or an earlier pass's removal-failure leftover —
SHALL be deleted on sight, never renamed again, so a failed reclaim retries
the SAME directory under the SAME name on a later tick and a `.trash`
suffix never grows beyond the stranded one; a stranded stale trash
directory is reclaimed like any other stale directory the moment its
removal can succeed, whatever its suffix depth. The retention SHALL never
touch `.tmp-*` staging whose directory is still fresh (a live pack's
staging grows and is never reclaimed; stalled staging past the grace is),
another item's artifacts, or the document-named build itself — for any
packaging state, including `failed` and after a budget unpublish. Budget
pressure may reclaim retained superseded builds before their grace passes
(Budget-capped artifacts owns that precedence). A client holding a
superseded build's playlist URL keeps serving through the grace window and
recovers by refetching the playback descriptor, which answers the new
build. Playlists SHALL be byte-identical for a given published build.

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
- **THEN** the new build publishes at a different location (never into the previous build's directory) and, once the item's document names it, the previous build directory remains on disk and its playlist URL keeps answering through the retention grace while a descriptor refetch answers the new build

#### Scenario: A live session survives the re-heal that supersedes its build

- **WHEN** a play arms the lazy re-heal on an item with a complete pack and the session's next loader requests under the superseded nonce land after the fresh build publishes
- **THEN** the superseded nonce directory still exists and its playlist still answers 200 through the media surface with the session's token — publish never deletes a build a session may be reading

#### Scenario: Publish eviction spares staging and other items

- **WHEN** a publish lands while an in-flight build's `.tmp-*` staging directory and another item's build directory exist on disk
- **THEN** nothing is deleted at publish — the staging directory, the other item's artifacts, the freshly published build, and the superseded build all remain, and only the sweep past the grace may reclaim the superseded one

#### Scenario: The sweep reclaims superseded builds after the grace

- **WHEN** a build directory is neither the document-named build nor in-use staging and its age is past the grace on the directory and on the document's last write
- **THEN** the periodic sweep moves it aside and deletes it with the existing eviction vocabulary, the document-named build and fresh staging remain, and a failed reclaim only logs and waits for a later tick

#### Scenario: Stranded trash never gains a suffix across passes

- **WHEN** a stale directory already carrying the `.trash` suffix sits under an item's artifact directory and its removal fails (a subtree the sweep cannot unlink), and the sweep passes it again and again
- **THEN** every pass logs the removal warning and leaves the directory under its existing name — no pass renames it aside, no `.trash.trash` name ever appears, and a later pass whose removal succeeds reclaims it outright

#### Scenario: Deeper stranded suffixes are reclaimed on sight

- **WHEN** the sweep passes a stale directory whose name already carries grown `.trash` suffixes (any depth) and its removal can succeed
- **THEN** the directory is deleted outright that pass — no rename-aside, no deeper name, and no trash-bearing residue remains under the item's artifact directory

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
SHALL re-enqueue a failed packaging run unless the pack gate refuses the
item (answering 400 with the gate's token — the "Opt-in gate on the pack
lane" requirement), and `from_seconds` SHALL be accepted and reserved (no-op)
in v1; `retry` on an item with no failed packaging run SHALL answer 400, and
an unknown item SHALL answer 404. The descriptor SHALL trust a stored
complete build only as far as it verifies: when the item's published build
fails integrity validation — a playlist-referenced file missing at its
resolved path, or a complete playlist omitting published segments — the
descriptor SHALL answer the direct floor (mode `direct`, the original's play
URL) rather than hand the player an unplayable playlist URL; the check is
read-only and never writes packaging state.

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

The descriptor SHALL also be honest about a direct floor whose original file
is absent at descriptor time: when the direct answer's resolved original does
not exist on disk — one stat over the same resolved path the floor serves
through, taken where the descriptor is composed, never a re-probe and never a
stored flag — the state SHALL read `missing` with `state_reason`
`file_missing`, and the answer SHALL carry NO playable address (the play URL
field empty or omitted — never a URL that 404s behind a mounted player). The
check SHALL gate direct answers only: an hls answer's playable truth is its
published build (whose integrity validation already guards it) and SHALL NOT
stat the source file — a verified pack stays playable over a stale source.
`missing` is a read-side projection exactly like `preparing`/`unsupported` —
never stored state, never written to the packaging namespace — and it carries
no retry affordance: nothing failed that a retry could fix. The composition
logs the answer through the same decision-log fields (state and reason
verbatim). A stale document's absent codec facts (`codecs_src=none`) are NOT
addressed by this state — the file-missing answer replaces the failed-direct
chain before any codec judgment matters.

An hls answer SHALL carry the additive `codecs` field — the RFC 6381 codec
strings of the published pack, video first, then audio in the pack lane's
rendition order — so a client can ask the device before mounting. The
strings SHALL be recorded at publish by probing each variant playlist of
the published build with ffprobe (the D2 amendment: a bare `EXT-X-MAP`
init segment cannot resolve profile/level — SPS/PPS live in the codec
description box and need media present) and persisted in the packaging
namespace; a build predating the
record SHALL compose the same strings read-side from the item's stored
source ffprobe facts (a remux carries the source's streams), the recorded
value winning whenever present. The read-side composition SHALL judge the
HEVC sample-entry tag as a source-container artifact: a source stream whose
`codec_tag_string` already names a sample entry (`hvc1` or `hev1` — an MP4
source whose entry the stream-copy remux preserves) SHALL compose verbatim,
and any other value (a Matroska source's `[0][0][0][0]` — the container's
tagging convention, not a sample entry) SHALL compose as `hvc1`, the
de-facto widely-accepted entry — an honest approximation, since which
sample entry the muxer writes is unknowable from stored source facts. The
publish-time composition SHALL keep reading the tag from the probed
artifact verbatim, degrading on a foreign tag there (fail-open). A build
whose codecs cannot be composed
either way SHALL answer no `codecs` field — the client mounts as before
(fail-open). Direct answers SHALL never carry `codecs`; the field describes
the pack, and every other field of every answer keeps its current shape.

An hls answer SHALL additionally carry the additive `layout` field —
`single-variant` or `rendition`, the build's audio layout the pack lane
decided at publish (the Audio layout rule) and persisted in the packaging
namespace — so a client without a usable MSE media-source stack can refuse
a rendition-layout master instead of silently mounting it video-only (its
native parse renders the video variant alone and never fetches the
EXT-X-MEDIA audio renditions). The field rides hls answers only — direct
answers never carry it — and a build predating the layout record SHALL
answer no `layout` field (fail-open: the client mounts as before; the lazy
rule-version wave backfills the record on the build's next repack).

#### Scenario: Retry is the only playback mutation and GET never mutates

- **WHEN** a failed packaging run is re-requested via POST with retry, a GET descriptor is fetched for the same item, and a retry POST is sent for an item whose packaging never failed
- **THEN** the retry POST re-enqueues the failed run, the GET returns the descriptor without changing packaging state, and the second POST answers 400

#### Scenario: Broken build answers the direct floor

- **WHEN** the playback descriptor is fetched for an item whose stored packaging state is complete but whose published build fails integrity validation
- **THEN** the descriptor answers mode direct with the original's token-carrying play URL instead of the broken playlist URL, and the stored packaging state is unchanged

#### Scenario: Non-native container answers preparing with a reason

- **WHEN** the playback descriptor is fetched for an unpackaged Matroska (MKV) item whose classification permits packaging
- **THEN** the descriptor answers mode `direct`, state `preparing`, `state_reason` `non_native_container`, with the direct floor's play URL still present — and the fetch changed no packaging state

#### Scenario: A vanished file answers missing, never a codec claim

- **WHEN** the playback descriptor is fetched for an unpackaged item whose resolved original file no longer exists on disk
- **THEN** the answer carries mode `direct`, state `missing`, `state_reason` `file_missing`, and no playable address — not a codec `unsupported`/`failed` claim and not a play URL that would 404 — while an item whose file exists keeps today's answer byte-identical and an hls item with a verified published build answers hls without any source stat

#### Scenario: Packaging-hopeless codec answers unsupported until the knob flips

- **WHEN** the descriptor is fetched for a `direct_only` item, for an `opt_in` item while the opt-in codec knob is off, and again for that same `opt_in` item after the knob is enabled
- **THEN** the first answer carries state `unsupported` with `state_reason` `codec_unsupported`, the second carries `unsupported` with `codec_not_opted_in`, and after the knob flips the same item answers state `preparing` — packaging has become possible

#### Scenario: Native container keeps the classic descriptor

- **WHEN** the playback descriptor is fetched for an unpackaged mp4 item whose codecs are browser-decodable
- **THEN** the descriptor answers mode `direct`, state `none`, with no `state_reason` and a playable play URL — byte-compatible with the pre-honesty descriptor shape

#### Scenario: Packaged descriptor carries the pack's codecs

- **WHEN** the playback descriptor is fetched for an item whose pack has just published
- **THEN** the answer carries mode `hls` with a `codecs` array naming the pack's video codec first, then each audio rendition's codec in rendition order — matching the published init segment's sample entries — while a direct answer for another item in the same session carries no `codecs` field

#### Scenario: Legacy build answers codecs composed from stored facts

- **WHEN** the playback descriptor is fetched for an item whose hls build was published before codec recording existed and whose document carries the source's ffprobe facts
- **THEN** the answer carries `codecs` composed from those stored facts through the same table the publish path uses — no re-probe, no repack — while a build whose facts compose nothing answers no `codecs` field and keeps its playable play_url

#### Scenario: Matroska-sourced HEVC answers the composed sample entry

- **WHEN** the playback descriptor is fetched for an item whose hls build predates codec recording and whose stored source facts are the real prod shape — hevc with `codec_tag_string` `[0][0][0][0]`, profile `Main 10`, level 120, two aac LC audio streams
- **THEN** the answer carries `codecs` composed read-side as `hvc1.2.4.L120.B0` followed by the deduped `mp4a.40.2` — the sample entry composed, the SPA's device probe runs, and an incapable device meets the honest banner instead of a skipped probe

#### Scenario: Packaged descriptor names the build's layout

- **WHEN** the playback descriptor is fetched for an item whose published build carries the layout record, and for an item whose build predates it
- **THEN** the first hls answer carries `layout` naming the build's audio layout (`single-variant` or `rendition`) beside its `codecs`, and the second answers hls with no `layout` field and its playable play_url unchanged — the client mounts as before until the repack backfills the record

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
episode while the working set below has room for it; a movie packages only
when played, never pre-warmed. Items already packaged, currently packaging,
or inside their packaging failure cooldown SHALL NOT be re-enqueued. An item
whose stored packaging state is complete but whose published build fails
integrity validation — a playlist-referenced file missing at its resolved
path, or a complete playlist omitting published segments — SHALL be treated
as not packaged: the sweep re-enqueues it for repackaging into a fresh build
directory.

The frontier's working set — the frontier-position item of every gated,
not-fully-watched serial — SHALL be BOUNDED, because an unbounded pin set on
a large library pins more bytes than the storage budget holds and turns the
budget sweep into the churn's engine. Serials SHALL be ordered by watch
recency — the most recent playback-progress stamp among the serial's
episodes, a serial with no stamps sorting oldest, the sweep's input order
breaking ties — and the working set SHALL be the PREFIX of frontier
positions whose accumulated on-disk build bytes fit the pin cap: a locked
fraction of the existing storage budget (never a second budget knob, and
never a reason to raise the budget). A serial whose position would overflow
the cap SHALL NOT be fronted: no job is enqueued for it, it is not pinned,
and its path to a pack is play. Watching an episode stamps the recency that
orders this set, so the serial being watched is always at the front of it.

A build removed by a policy sweep SHALL NOT be silently rebuilt: an item
whose document-named build was evicted by the budget sweep or the
completion-driven demotion (that requirement) is EVICTION-SUPPRESSED until
its next real play (POST /play — plain or retry). A suppressed frontier
position SHALL emit no job, SHALL join no working set, and SHALL consume
none of the pin cap; the integrity sweep SHALL NOT re-enqueue a suppressed
item's repack (one INFO line names the suppression — the gate-refusal
pattern); a real play clears the suppression, and the item's pack then
dispatches through the play-priority seam (the async-enrichment
requirement).

#### Scenario: Watching an episode fronts the next one

- **WHEN** the frontier sweeps a serial whose episode K carries watch progress and episode K+1 is not packaged
- **THEN** episode K+1 is enqueued for packaging and no other episode of the serial is

#### Scenario: Fresh serial fronts its pilot and movies wait for play

- **WHEN** the frontier sweeps a serial with no watch progress and a movie library with untouched container-hostile items, and the working-set cap has room for the pilot
- **THEN** the serial's first episode is enqueued while no movie is enqueued until its play is requested

#### Scenario: The working set is a recency-ordered byte-capped prefix

- **WHEN** the frontier sweeps a library whose serials' positions carry on-disk builds whose accumulated bytes exceed the pin cap, the serials ordered by their most recent episode stamp with a stampless serial last
- **THEN** exactly the cap-fitting prefix of positions is pinned and enqueued for proactive packaging, the pin cap is a locked fraction of the storage budget, and the set never exceeds the cap in build bytes

#### Scenario: A serial beyond the cap is not fronted until its recency earns a pin

- **WHEN** an old never-watched serial's position falls outside the cap prefix, and later a watch on that serial stamps a recency newer than a pinned serial's
- **THEN** the position is not fronted and not pinned while it sits beyond the cap, and after the watch re-orders the prefix the serial's frontier position is pinned and its next episode enqueued — recency, never age alone, decides

#### Scenario: A budget-evicted build is not re-fronted until a real play

- **WHEN** the budget sweep evicts a document-named build, and the frontier sweeps on each of the following ticks while the item receives no play
- **THEN** the first post-eviction sweep emits no job for the item, joins it into no working set, and the integrity sweep skips its repack with one INFO line naming the suppression — and a POST /play for the item clears the suppression so the pack enqueues through the play-priority seam

#### Scenario: Streams-disabled library is skipped at the gate

- **WHEN** a library's streams-enabled state is switched off and the frontier sweeps that library
- **THEN** nothing in it is enqueued for packaging while its items keep the direct floor

#### Scenario: Broken build is re-enqueued at the sweep

- **WHEN** the sweep passes an item whose stored packaging state is complete but whose published build fails integrity validation, alongside healthy packaged items, in-flight packaging, and cooldown-gated failures
- **THEN** only the broken item is re-enqueued for packaging, and the repack publishes a fresh build directory whose playlists satisfy the complete-build contract

#### Scenario: Sweep healing repacks a corrupted build end to end

- **WHEN** the joint harness packages an episode through the real pack lane, corrupts its published complete build (a deleted tail segment file and a playlist truncated to its last window), and the integrity snapshot drives the repack judge into the real packaging enqueue
- **THEN** the descriptor answers the direct floor while the build is corrupt, and after the repack lands the fresh build directory satisfies the complete-build contract and the descriptor answers hls again

### Requirement: Budget-capped artifacts

Stored packaging artifacts SHALL live under a storage budget (default 32 GB,
`0` disables the cap). Accounting SHALL read the artifact directories on disk
as the truth — including directories orphaned by moved or deleted library
files — and eviction SHALL be least-recently-watched first (by playback
progress recency), moving the artifact aside before deleting it — the aside
step skipped for a directory already carrying the `.trash` suffix, which is
deleted on sight under the same stranded-trash law the Remux-only pack lane
requirement defines. Originals SHALL never be evicted. Retained superseded
build directories count against the budget like any other artifact directory
and SHALL be reclaimed before current builds when the budget demands space —
stale nonces first, ahead of watch recency, regardless of their retention
grace — because reclaiming a superseded directory unpublishes nothing while
reclaiming a current build forces a re-pack; only a build directory that is
not the item's document-named build (and any directory of an item whose row
is gone or deleted) is stale for this precedence.

The frontier's working set (the bounded pin set the Watch-driven packaging
frontier requirement defines) SHALL be eviction's last resort: pinned builds
fall to eviction only when the budget cannot be met from every non-pinned
artifact alone, whatever their recency — the churn break — and the sweep
SHALL log one loud warning naming the pinned eviction (the operator's signal
that the disk holds more than the budget plus the working set). A budget
eviction of a document-named build SHALL eviction-suppress the item (the
Watch-driven packaging frontier requirement) so the eviction is not silently
undone by a re-pack on the next tick.

#### Scenario: Over-budget eviction reaps least-recently-watched and orphans

- **WHEN** artifact directories on disk exceed the budget, including one orphaned by a moved library file, and the least-recently-watched item's artifact and the orphan are oldest by watch recency
- **THEN** eviction removes those artifact directories first and accounting afterwards reports within budget

#### Scenario: Budget pressure reclaims retained builds before current ones

- **WHEN** the budget demands space and a recently watched item still holds a retained superseded build directory past its grace eligibility while an unwatched item's current build is next by recency
- **THEN** eviction takes the retained superseded directory first — the grace never shields an artifact from budget pressure — and the current build is evicted only if the budget still cannot be met

#### Scenario: A pinned eviction is the last resort, warned and suppressed

- **WHEN** the budget cannot be met from non-pinned artifacts alone and the sweep must evict a pinned build
- **THEN** the sweep evicts it last, logs one loud warning naming the pinned item, suppresses re-fronting of the item until its next real play, and unpublishes the build record so the descriptor answers the direct floor instead of a gone playlist

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
The line SHALL additionally name WHICH codecs source served the answer:
`recorded` (the namespace the lane persisted at publish), `legacy` (the
read-side composition from stored source facts), or `none` (no codecs
answer) — so a missing codecs answer is distinguishable from a defect
without querying the store; the field names the source, never the codec
strings themselves. Token values and play URLs SHALL NEVER appear in the
line (INV4: the reason is data, never credentials), and the logging SHALL
remain side-effect free — the descriptor read stays read-only, never
mutating packaging state.

#### Scenario: Descriptor GET logs one decision line

- **WHEN** playback descriptors are fetched in one session for a packaged item, an unpackaged MKV item, a `direct_only` item, and an item with a live pack-failed cooldown row
- **THEN** each fetch logs exactly one INFO line carrying the item id and mode, with reasons `packaged`, `non_native_container`, `codec_unsupported`, and `cooldown` respectively

#### Scenario: Playback logs never carry token values

- **WHEN** descriptor reads and /media rejections are logged with logging captured
- **THEN** no captured line carries a media token value, a play URL, or any credential material

#### Scenario: Descriptor GET names the codecs source

- **WHEN** playback descriptors are fetched in one session for an item whose namespace carries the codec record persisted at publish, an item whose build predates the record but whose stored source facts compose the strings, and an item whose codecs compose nothing
- **THEN** the three decision lines name the codecs source `recorded`, `legacy`, and `none` respectively — one added field on the same single line, never the codec strings, never a token value

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

### Requirement: Opt-in gate on the pack lane

The opt-in codec knob SHALL be honored on EVERY pack seam, judged by one
source of truth — the same judge the descriptor's honesty projection uses —
so the descriptor's `codec_not_opted_in` promise and the packer's refusal
always carry the same token. A `POST /items/{id}/play` `retry` request for a
failed run whose item the gate refuses SHALL answer 400 with the gate's
token (`codec_not_opted_in`, or `codec_unsupported` for codecs no remux can
serve) instead of re-enqueueing; a capable or knob-enabled item retries
exactly as before. The integrity repack sweep SHALL skip a gate-refused
item with one INFO refusal log line and SHALL NOT enqueue it and SHALL NOT
write a packaging-failure ledger row. The build executor SHALL refuse a
gate-closed item (the knob flipped between enqueue and build) by recording
the persisted packaging state `failed` with the policy reason — WITHOUT a
`pack_failed` ledger row, so a knob setting never charges the flat 30-day
cooldown — and enabling the knob SHALL heal the item through the ordinary
frontier with no manual step.

#### Scenario: Retry refused by the gate answers the descriptor's own token

- **WHEN** the play verb's retry is requested for an item with a failed packaging run whose codecs the gate refuses while the opt-in knob is off, and again after the knob is enabled
- **THEN** the first retry answers 400 carrying `codec_not_opted_in` and enqueues nothing, and the second retry re-enqueues the failed run and answers 202

#### Scenario: Repack sweep refuses without enqueue or ledger row

- **WHEN** the integrity sweep passes a gate-refused item whose stored packaging state is complete but whose published build fails validation
- **THEN** the sweep logs one INFO refusal line naming the gate token, enqueues nothing, and writes no packaging-failure ledger row

#### Scenario: Build-time refusal fails without poisoning the ledger

- **WHEN** a packaging job enqueued while the opt-in knob was enabled reaches the build executor after the knob was disabled
- **THEN** the run records the persisted state `failed` with the policy reason, writes no `pack_failed` ledger row, and — the knob enabled again — the frontier re-enqueues the item with no manual step

#### Scenario: Descriptor and packer refuse with the same token

- **WHEN** an opt-in item is judged while the knob is off — by the descriptor's honesty projection, by the play verb's retry, and by the repack sweep
- **THEN** all three carry the same refusal token `codec_not_opted_in`, judged from one shared predicate over the item's stored ffprobe facts

### Requirement: Pack flow observability

The pack flow SHALL be traceable from the server log alone, riding the
decision-log pattern — compact INFO lines with stable prefixes at the
moments that matter, never per segment, never a new log-level system (the
binary serves the default slog INFO level): a packaging job SHALL log ONE
job-start line at the build executor carrying the item id, the playback
classification outcome (`direct` | `pack` | `opt_in` | `direct_only`), the
gate verdict (`open` or the refusal token), and one compact rendering of
the stored codec facts (the video codec and profile, the audio codecs with
multiplicity); the pack lane SHALL log ONE publish line per successful
pack carrying the item id, the build nonce, the layout decision
(`single-variant` | `rendition`), the variant count, the audio
(EXT-X-MEDIA member) count, whether the codec record was `recorded` or
`degraded`, and the ffprobe probe count (the per-variant cost); a failed
pack SHALL log ONE warning line naming the failing stage; a gate-refused
job SHALL log the refusal token on its job-start line and no publish line.
Publishing SHALL NOT log an eviction line — deletion is never a publish
act; the eviction line keeps its existing vocabulary and shape and rides
the sweep that owns the decision (publish-time retention and budget
reclamation alike). No new line SHALL carry a media token value or a play
URL (INV4 — item ids and build nonces are artifact identifiers, not
credentials), and the flow SHALL cost a bounded number of lines: one per
job plus one on failure, regardless of segment count or build size.

#### Scenario: A pack job logs the flow line sequence

- **WHEN** a packaging job runs from enqueue through publish with the server log captured
- **THEN** the captured log carries the job-start line (classification outcome, gate `open`, the codec-facts rendering) followed by the publish line (layout `single-variant` or `rendition` with variant and audio member counts, the nonce, `codecs` `recorded` or `degraded`, the probe count) and no eviction line — the eviction line, when a sweep later reclaims a superseded build, names the reclaimed path from the sweep, not from a pack job

#### Scenario: A gate-refused pack names the token and stops

- **WHEN** a packaging job reaches the build executor after the opt-in codec knob was disabled and the gate refuses the item
- **THEN** the job-start line carries the refusal token as the gate verdict and the flow ends there — no publish line exists for the job, and no packaging-failure ledger row is charged

#### Scenario: A failed pack logs its stage

- **WHEN** a packaging job's remux fails partway (the build never publishes)
- **THEN** exactly one warning line names the failing stage, the flow shows the job-start line followed by the warning, and the persisted state records the failure as before

### Requirement: Master playlist on every pack

Every pack the lane publishes SHALL carry a master playlist at the build
root named `index.m3u8`, composed by the lane per RFC 8216 — never ffmpeg's
generated master: the `EXT-X-STREAM-INF` variants SHALL be the VIDEO
renditions only (the lane publishes exactly one), each carrying a CODECS
attribute composed through the publish-time codec table when the pack's
codecs are composable, a BANDWIDTH attribute (probed, else a conservative
fallback), and RESOLUTION when probed; the audio renditions SHALL appear
ONLY as `EXT-X-MEDIA:TYPE=AUDIO` members of one group with unique NAME
attributes (the stream's language fact when present, else a stable
ordinal), `LANGUAGE` when known, and exactly one `DEFAULT=YES` — riding
the pack's most compatible audio track, the first AAC audio track in
rendition order (the embedded audio streams in source order, then the
voiceover sidecars in document order), falling back to the first rendition
in rendition order when no track composes AAC; every other audio rendition
rides `DEFAULT=NO` with `AUTOSELECT=YES`. A single-variant pack SHALL
publish the same master shape — one variant line whose CODECS names the
video and the muxed audio — with its media playlist, init segment, and
segments beneath it, so the build root holds only the master; the item's
play URL keeps naming `index.m3u8`, now the master, on both shapes. The
master SHALL be composed at the head-first publish from the head playlists
(the probe facts are the init segments' streams, identical across phases),
so a partial build mounts with the master from its first served byte, and
it SHALL be byte-identical for a given published build. When the pack's
codecs cannot be composed, the master SHALL still publish with the
corrected shape minus the CODECS attribute (fail-open — never a failed
pack). A build published before this rule keeps its on-disk layout: the
integrity guard and the serving surface SHALL accept both the legacy
layouts (a root media playlist, or ffmpeg's generated rendition master)
and the composed master, and a legacy build heals only by repack — fresh
nonce, one current build per item — never by a read-side rewrite of
published bytes.

#### Scenario: Rendition pack serves a video-only variant master with an audio group

- **WHEN** a pack with embedded audio plus voiceover sidecars is published and its build root playlist is read
- **THEN** the playlist carries exactly one `EXT-X-STREAM-INF` variant — the video rendition, with a CODECS attribute naming the video codec — and the audio renditions appear only as `EXT-X-MEDIA:TYPE=AUDIO` group members with unique NAMEs and exactly one `DEFAULT=YES`, with no audio rendition listed as a variant

#### Scenario: Single-variant pack serves a master carrying the pack's codecs

- **WHEN** a single-variant pack (a single audio track — one embedded audio stream and no resolvable voiceovers) is published and its build root playlist is read
- **THEN** `index.m3u8` is a master whose single variant line carries `CODECS` naming the video and audio codecs and references the media playlist beneath the build root, the item's play URL still names `index.m3u8`, and an HLS client composing its source buffers from the playlist's CODECS builds both the video and the audio buffer on a capable device

#### Scenario: Partial build mounts with the master from the first byte

- **WHEN** a pack's head chunk has published and a client fetches the play URL before the tail completes
- **THEN** the fetched playlist is already the composed master and the variant media playlist it references grows as segments land, so the partial build mounts with the pack's codecs exactly as the completed one does

#### Scenario: Uncomposable codecs keep the corrected master shape

- **WHEN** a pack publishes whose codec record composes to nothing (a probe failure or a stream outside the composition table)
- **THEN** the pack still lands and the build root still serves the composed master — video-only variant, `EXT-X-MEDIA` audio group, one `DEFAULT=YES` — minus the CODECS attribute, and the build mounts exactly as an attribute-less build always has

#### Scenario: Legacy-layout builds keep validating and serving until repack

- **WHEN** the descriptor or the media surface serves an item whose published build predates this rule — a root media playlist, or a generated rendition master
- **THEN** the build validates, serves, and describes exactly as before under its published layout, and it is replaced only when a repack publishes a fresh nonce — at which point exactly one build directory remains under the item's artifact root and it carries the composed master

#### Scenario: The default audio track is the first AAC in rendition order

- **WHEN** a rendition pack whose source carries a FLAC embedded audio stream followed by an AAC embedded audio stream is published
- **THEN** the master's EXT-X-MEDIA group carries both audio renditions with unique NAMEs and the single `DEFAULT=YES` rides the AAC track's rendition — the FLAC rendition stays selectable with `DEFAULT=NO` — and a pack whose audio tracks compose no AAC at all puts the single `DEFAULT=YES` on the first rendition in rendition order

### Requirement: Lazy repack of legacy-layout builds

A published build predating the composed master SHALL heal by repack, and
the playback descriptor GET SHALL be its trigger: when the playback
descriptor is served for an item (`GET /items/{id}/playback` — the verb
every playback actually hits, since the SPA mounts the player from the
descriptor's play_url and `POST /play` is only the failed-state retry
affordance) whose packaging state is `complete` with a build nonce but
whose namespace carries a STALE build-rule version — the `master` value
the lane's success persist writes as the pack-lane RULE VERSION number (a
build predating versioning answers no value and reads as version 0; the
legacy boolean `true` reads as version 1; the value is honest by
construction — every build this lane publishes carries the composed
master — and the playlist is never re-read to decide), and a build is
stale exactly when its recorded version is older than the lane's current
rule version, so each rule bump re-heals every previously-packed build
lazily — the descriptor closure SHALL enqueue exactly ONE
repack through the ordinary enqueue path and its per-item lease, judging
the same stale-build condition the play verb runs, and SHALL still answer
the descriptor for the current old build unchanged — the GET never mutates
packaging state and never blocks on the decision. Repeated GETs while the
repack runs SHALL be lease-absorbed, not re-enqueued per request; the play
verb SHALL keep its own lazy-repack wiring unchanged. The enqueue SHALL
ride the pack gate unchanged: an item the gate refuses SHALL NOT enqueue,
SHALL keep answering its existing build, and SHALL log one INFO refusal
line — no packaging-state change, no ledger row. A build whose recorded
rule version equals the current rule version SHALL NOT re-enqueue, and a
failed lazy repack SHALL inherit the lane's ordinary failure contract —
the persisted `failed` state and its retry affordance — never a retry
loop. No library-wide sweep SHALL requeue legacy builds, and no serving
path SHALL rewrite published bytes.

#### Scenario: A complete legacy-layout build repacks on play

- **WHEN** the playback descriptor GET is served for an item whose packaging state is complete with a build nonce whose namespace predates the build-generation marker, and the pack gate is open
- **THEN** the descriptor closure enqueues exactly one repack through the ordinary enqueue path while still answering the descriptor for the current old build, a repeated GET while the repack runs enqueues nothing (the lane's per-item lease absorbs it), and the repacked build publishes a fresh nonce carrying the composed master and the current rule version

#### Scenario: A current-layout build does not re-enqueue

- **WHEN** the playback descriptor GET is served for an item whose namespace records the current rule version — and repeatedly while any repack it triggered is still running
- **THEN** the descriptor closure enqueues nothing: the recorded version closes the decision window once the build publishes, and the descriptor answers per the ordinary flow

#### Scenario: A gate-closed legacy build keeps playing and skips the repack

- **WHEN** the playback descriptor GET is served for a legacy-layout item the pack gate refuses (the opt-in codec knob disabled on an HEVC item)
- **THEN** the descriptor closure logs one INFO refusal line naming the item and the gate token, enqueues nothing, changes no packaging state, charges no ledger row, and the item keeps answering its existing build

#### Scenario: A version-1 build joins the re-heal wave exactly once

- **WHEN** the playback descriptor GET is served for an item whose complete build's namespace carries the legacy boolean `true` (version 1) under the current rule version 2, and again after the repack it triggered lands
- **THEN** the first GET enqueues exactly one repack while answering the old build, and the repacked build publishes with the rule-version record set to the current version — every later GET enqueues nothing, so the wave re-heals each previously-packed build once

### Requirement: Audio layout rule

The pack lane SHALL decide the published build's audio layout from the
TOTAL audio streams the build will carry — the original's embedded audio
streams plus the resolvable voiceover sidecars: a rendition-layout build
(one video variant, every audio stream its own audio rendition) whenever
the total exceeds one, a single-variant build (the audio muxed into the
sole variant) when the total is at most one. The embedded-audio count
SHALL be judged at build time from the original file itself — the lane
probes the source as build work (the remux mapping must match the file
being remuxed); the stored ffprobe facts stay the play-time/read-side
source and are never re-probed for this. On a rendition build each
embedded audio stream SHALL be remuxed as its own audio rendition by
stream copy, in source order, ahead of the voiceover sidecar renditions
in document order. A failed source probe SHALL degrade the decision
fail-open to the legacy discriminator (the resolvable-sidecar count
alone) — never a failed pack.

#### Scenario: A dual-embedded-audio source publishes the rendition layout

- **WHEN** a source carrying two embedded audio streams and no voiceover sidecars is packaged
- **THEN** the published build is the rendition composition — one video-only variant and both audio streams as EXT-X-MEDIA audio renditions, one per rendition, copied without decoding or encoding — never the single-variant build whose one variant muxes both streams, the shape a one-track-per-type MSE client fatals on

#### Scenario: A single-audio source stays single-variant

- **WHEN** a source carrying exactly one embedded audio stream with no resolvable sidecars is packaged
- **THEN** the published build is the single-variant degenerate — the audio muxed into the sole variant, no EXT-X-MEDIA group — exactly as before this rule existed

#### Scenario: A failed source probe degrades the decision fail-open

- **WHEN** the build-time source probe fails for an item carrying resolvable voiceover sidecars
- **THEN** the layout decision falls back to the resolvable-sidecar count alone — the pack still publishes under the legacy discriminator rather than failing

### Requirement: Self-authorizing playlists

The token-gated playback surface SHALL serve playlists with every URI they
reference — segment and init-segment URI lines, rendition playlist lines, and
`URI="..."` attributes on tag lines (including `EXT-X-MAP` and
`EXT-X-MEDIA`) — carrying the serving request's validated media token as a
`token` query parameter, so that playback never depends on the client
attaching the media-token cookie (clients may split HLS fetching across HTTP
stacks with no shared cookie jar). URIs that are absolute or already carry a
`token` parameter SHALL be left untouched; the rewrite SHALL be serve-time
only — the published artifact bytes on disk SHALL remain token-free — and the
token requirement on every request SHALL be unchanged (propagation removes
the cookie dependency, not the gate).

#### Scenario: A cookie-less client plays a served playlist end to end

- **WHEN** a playlist is served under a valid media token delivered as a query parameter (no cookie jar), and every URI the playlist references is then requested verbatim — resolved against the playlist's own directory, with no cookie and no other credential
- **THEN** every referenced URI serves its published bytes and playback completes without an authorization failure

#### Scenario: The gate stays for credential-less requests

- **WHEN** a segment or init segment is requested with neither the media-token cookie nor a token parameter
- **THEN** the request is rejected, exactly as before

#### Scenario: The rewrite never reaches the artifacts

- **WHEN** a playlist carrying tokenized URIs is served twice under the same token, and the build directory's playlist file is read back from disk
- **THEN** the two served bodies are identical and the on-disk file carries no token — tokenization happens per response, never in storage

### Requirement: Completion-driven demotion

When a serial becomes fully watched — every one of its episodes counts as
watched under the completion-aware predicate (the Completion-aware watched
semantics requirement) — the sweep SHALL evict the serial's remaining pack
builds on its next tick, unconditionally: demotion is never gated on budget
pressure and never waits for the budget to demand space. The demotion SHALL
run ahead of the budget pass in the same sweep so the bytes it frees count
in that pass's accounting. Each evicted build SHALL move aside and delete
with the existing eviction vocabulary, and the evicted item's packaging
record SHALL be unpublished — a document-named build in state complete OR
partial SHALL reset the streams record so it no longer names a build the
disk lacks; a fully-watched serial with a partial build therefore replays
through pack-on-play exactly like one with a complete build. Demotion SHALL
eviction-suppress the items it evicts (the Watch-driven packaging frontier
requirement). A serial with at least one unwatched episode SHALL NOT be
demoted, whatever its builds' size; the direct floor serves every item
throughout, and a demoted episode's packaging path stays pack-on-play —
never a sweep enqueue.

#### Scenario: A fully-watched serial's builds die on the next tick

- **WHEN** a serial's every episode counts as watched under the completion-aware predicate and the serial still holds published builds, while the disk sits within budget
- **THEN** the next sweep tick evicts those build directories, unpublishes their packaging records, and the budget accounting of the same pass reflects the freed bytes — the cleanup is fast, never queued behind budget pressure

#### Scenario: A demoted episode replays through pack-on-play

- **WHEN** a demoted episode's item is opened for play (POST /play)
- **THEN** the stored packaging state is none, the play enqueues the pack through the play-priority seam, and the fresh build publishes — the replay does not meet a stale record naming a gone directory

#### Scenario: A serial with an unwatched tail is never demoted

- **WHEN** a serial's episodes count as watched through K but episode K+1 does not, and the serial holds builds
- **THEN** demotion touches nothing of the serial — its unwatched tail's packaging is the frontier's business under the bounded working set, not the demotion's
