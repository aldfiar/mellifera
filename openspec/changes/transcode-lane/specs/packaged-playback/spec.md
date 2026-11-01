# Spec Delta

## MODIFIED Requirements

### Requirement: Playback classification

The system SHALL classify each item for playback from the ffprobe facts
already stored in its document — never from client input — into exactly one
of: `direct` (browser-decodable codec in a browser-acceptable container —
serve the original), `pack` (browser-decodable codec in a hostile container —
packaging permitted), `opt_in` (codec many targets cannot decode — packable
while a knob permits it: the opt-in codec knob for any `opt_in` item, or —
for an `opt_in` item whose video stream is HEVC — the transcode knob), and
`direct_only` (no browser can decode the stream and remuxing cannot change
that — never packaged). While no knob permits packaging, an `opt_in` item
SHALL behave as `direct_only`: direct floor only, never packaged — the
opt-in codec knob disabled for a non-HEVC-video item, or both knobs
disabled for an HEVC-video item. The transcode posture is a packaging-mode
decision, not a new class: an item packaged under the transcode knob keeps
its `opt_in` classification.

#### Scenario: Codec-fine container-hostile item classifies for packaging

- **WHEN** an item's stored ffprobe facts carry an h264 video stream and AAC audio inside an MKV container
- **THEN** the item classifies `pack` and packaging is permitted for it

#### Scenario: Opt-in codecs stay unpackaged while the knob is off

- **WHEN** an item carries an HEVC video stream with both knobs at their defaults (off), and separately an item carries a >8-bit h264 video stream regardless of either knob
- **THEN** neither item is ever packaged — the HEVC item behaves as direct_only until a knob opens it (the transcode knob for its video, the opt-in knob for the remux posture) while the high-10 item is direct_only unconditionally — and both keep the direct floor

#### Scenario: The transcode knob opens the HEVC class without the opt-in knob

- **WHEN** an HEVC-video MKV item is judged while the transcode knob is enabled and the opt-in codec knob is not, and an h264 item carrying an AC-3 audio track is judged under the same knobs
- **THEN** the HEVC item is packable — packaging is permitted and its descriptor answers preparing before any pack lands — while the AC-3-audio item is not packable under either knob's absence and keeps the direct floor with reason `codec_not_opted_in`

### Requirement: Remux-only pack lane

Packaged output SHALL be produced by remuxing only — stream copy, no decode
and no encode — except for the knob-gated transcode build: while
`MELLIFERA_STREAM_TRANSCODE` is enabled, an item whose video stream is HEVC
SHALL be packaged with the video stream re-encoded to H.264 (8-bit 4:2:0,
constant-quality, fast preset) and each audio track stream-copied when it
is AAC or MP3 and otherwise encoded to AAC; with the knob at its default
(disabled), packaging SHALL stream-copy every stream with no encode
anywhere. Both build modes land in the same fMP4-HLS layout carrying one
video stream and the audio tracks; subtitle and data streams SHALL be
dropped. Artifacts SHALL be published atomically into the server's own data
space (written aside, then moved into place), and each packaging run SHALL
publish under a fresh build directory so a repack never collides with a
build still in flight. Publishing a fresh build for an item SHALL evict
that item's previous build directories immediately — one current build per
item, whatever the build mode — after the document write that names the new
build, so the playback descriptor's integrity guard never validates a
deleted current build; the eviction SHALL never touch an in-flight
`.tmp-*` staging directory, another item's artifacts, or the freshly
published build itself, and SHALL be best-effort (a failed removal logs a
warning and never fails the landed pack). Budget-eviction recency
accounting is a separate signal and stays untouched. A client holding a
superseded build's playlist URL recovers by refetching the playback
descriptor, which answers the new build. Playlists SHALL be byte-identical
for a given published build.

#### Scenario: Remux drops subtitles without decoding

- **WHEN** an MKV carrying h264 video, AAC audio, and PGS subtitles is packaged
- **THEN** the produced playlist and segments are fMP4-HLS carrying video and audio only — no subtitle or data tracks — and the packaging invocation copies streams without decoding or encoding

#### Scenario: Repack never collides with a cached playlist

- **WHEN** an already-packaged item is packaged again while a client still holds the previously served playlist URL
- **THEN** the new build publishes at a different location (never into the previous build's directory) and, once the item's document names it, the item's previous build directories are evicted immediately — exactly one build directory remains under the item's artifact root, the superseded playlist URL stops answering, and a descriptor refetch answers the new build

#### Scenario: Publish eviction spares staging and other items

- **WHEN** a publish eviction runs while an in-flight build's `.tmp-*` staging directory and another item's build directory exist on disk
- **THEN** only the publishing item's superseded build directories are removed — the staging directory, the other item's artifacts, and the freshly published build all remain

#### Scenario: The transcode build re-encodes video and copies MSE-safe audio

- **WHEN** an HEVC-video MKV carrying AAC audio is packaged while the transcode knob is enabled
- **THEN** the published build's video stream is H.264 (8-bit 4:2:0) and its AAC track is stream-copied, the build lands in the same fMP4-HLS layout with a composed master carrying the build's CODECS, exactly one build directory remains under the item's artifact root, and a device that cannot decode HEVC plays the build end to end

#### Scenario: Non-universal audio encodes to AAC in a transcode build

- **WHEN** a source whose audio track is AC-3 is packaged under the transcode knob
- **THEN** the published build's audio track is AAC — encoded, not copied

#### Scenario: Knob off keeps the lane encode-free

- **WHEN** any item is packaged while the transcode knob is at its default (disabled)
- **THEN** the packaging invocation stream-copies every stream and encodes nothing, byte-identical to the lane's behavior before the knob existed

### Requirement: Opt-in gate on the pack lane

The pack gate SHALL be honored on EVERY pack seam, judged by one source of
truth — the same judge the descriptor's honesty projection uses — so the
descriptor's refusal promise and the packer's refusal always carry the same
token. The gate SHALL judge two knobs: the opt-in codec knob, which permits
packaging any `opt_in`-class item (the remux posture), and the transcode
knob, which permits packaging an `opt_in`-class item whose video stream is
HEVC (the transcode posture); neither knob changes the refusal vocabulary —
a refused item answers `codec_not_opted_in` (opt-in-class codecs with no
knob open) or `codec_unsupported` (codecs no packaging can serve) exactly
as before. A `POST /items/{id}/play` `retry` request for a failed run whose
item the gate refuses SHALL answer 400 with the gate's token
(`codec_not_opted_in`, or `codec_unsupported` for codecs no packaging can
serve) instead of re-enqueueing; a permitted item retries exactly as before.
The integrity repack sweep SHALL skip a gate-refused item with one INFO
refusal log line and SHALL NOT enqueue it and SHALL NOT write a
packaging-failure ledger row. The build executor SHALL refuse a gate-closed
item (a knob flipped between enqueue and build) by recording the persisted
packaging state `failed` with the policy reason — WITHOUT a `pack_failed`
ledger row, so a knob setting never charges the flat 30-day cooldown — and
enabling a permitting knob SHALL heal the item through the ordinary
frontier with no manual step.

#### Scenario: Retry refused by the gate answers the descriptor's own token

- **WHEN** the play verb's retry is requested for an item with a failed packaging run whose codecs the gate refuses while both knobs are off, and again after a permitting knob is enabled
- **THEN** the first retry answers 400 carrying `codec_not_opted_in` and enqueues nothing, and the second retry re-enqueues the failed run and answers 202

#### Scenario: Repack sweep refuses without enqueue or ledger row

- **WHEN** the integrity sweep passes a gate-refused item whose stored packaging state is complete but whose published build fails validation
- **THEN** the sweep logs one INFO refusal line naming the gate token, enqueues nothing, and writes no packaging-failure ledger row

#### Scenario: Build-time refusal fails without poisoning the ledger

- **WHEN** a packaging job enqueued while a permitting knob was enabled reaches the build executor after both knobs were disabled
- **THEN** the run records the persisted state `failed` with the policy reason, writes no `pack_failed` ledger row, and — a permitting knob enabled again — the frontier re-enqueues the item with no manual step

#### Scenario: Descriptor and packer refuse with the same token

- **WHEN** an opt-in item is judged while both knobs are off — by the descriptor's honesty projection, by the play verb's retry, and by the repack sweep
- **THEN** all three carry the same refusal token `codec_not_opted_in`, judged from one shared predicate over the item's stored ffprobe facts

#### Scenario: The transcode arm opens every seam without the opt-in knob

- **WHEN** an HEVC-video item is judged on every pack seam — the descriptor's honesty projection, the play verb's retry, the integrity sweep, the frontier's packability, and the build executor — while the transcode knob is enabled and the opt-in codec knob is not
- **THEN** every seam permits the item (the descriptor answers preparing, an enqueue proceeds), and with the transcode knob disabled again the same item answers `codec_not_opted_in` on every seam exactly as shipped

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
classification permits packaging now: `pack`, or `opt_in` while a knob opens
it — the opt-in codec knob, or the transcode knob for an item whose video
stream is HEVC) and nothing is published yet, `unsupported` when packaging
cannot help (`direct_only`, or `opt_in` with no knob open for it). Both
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

An hls answer SHALL carry the additive `codecs` field — the RFC 6381 codec
strings of the published pack, video first, then audio in the pack lane's
rendition order — so a client can ask the device before mounting. The
strings SHALL be recorded at publish by probing each variant playlist of
the published build with ffprobe (a bare `EXT-X-MAP` init segment cannot
resolve profile/level — SPS/PPS live in the codec description box and need
media present) and persisted in the packaging namespace; a build predating
the record SHALL compose the same strings read-side from the item's stored
source ffprobe facts (a remux carries the source's streams — a transcode
build's recorded probe of its own artifact always wins, and names the
transcoded streams), the recorded value winning whenever present. The
read-side composition SHALL judge the HEVC sample-entry tag as a
source-container artifact: a source stream whose `codec_tag_string` already
names a sample entry (`hvc1` or `hev1` — an MP4 source whose entry the
stream-copy remux preserves) SHALL compose verbatim, and any other value (a
Matroska source's `[0][0][0][0]` — the container's tagging convention, not
a sample entry) SHALL compose as `hvc1`, the de-facto widely-accepted entry
— an honest approximation, since which sample entry the muxer writes is
unknowable from stored source facts. The publish-time composition SHALL
keep reading the tag from the probed artifact verbatim, degrading on a
foreign tag there (fail-open). A build whose codecs cannot be composed
either way SHALL answer no `codecs` field — the client mounts as before
(fail-open). Direct answers SHALL never carry `codecs`; the field describes
the pack, and every other field of every answer keeps its current shape.

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

- **WHEN** the descriptor is fetched for a `direct_only` item, for an `opt_in` item while both knobs are off, and again for that same `opt_in` item after a permitting knob is enabled
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

#### Scenario: The transcode knob turns an HEVC item's unsupported into preparing

- **WHEN** the descriptor is fetched for an unpackaged HEVC-video item while the transcode knob is enabled and the opt-in codec knob is off, and again for the same item with the transcode knob disabled
- **THEN** the first answer carries state `preparing` with the direct floor's play URL still present, and the second carries `unsupported` with `state_reason` `codec_not_opted_in` — exactly the answer shipped before the transcode knob existed

#### Scenario: A transcoded pack's codecs pass the incapable device's probe

- **WHEN** the descriptor is fetched for an item whose pack published under the transcode knob from an HEVC source with AAC audio
- **THEN** the answer's `codecs` name the TRANSCODED build — an `avc1` video string recorded from the published artifact, then the audio — so a client whose device cannot decode HEVC passes its pre-mount capability probe on the same answer that fails it for a remuxed HEVC pack

### Requirement: Pack flow observability

The pack flow SHALL be traceable from the server log alone, riding the
decision-log pattern — compact INFO lines with stable prefixes at the
moments that matter, never per segment, never a new log-level system (the
binary serves the default slog INFO level): a packaging job SHALL log ONE
job-start line at the build executor carrying the item id, the playback
classification outcome judged with the knobs out of the way (`direct` |
`pack` | `opt_in` | `direct_only` — a gate a knob opens never logs a class
that reads closed), the gate verdict (`open` or the refusal token), and one
compact rendering of the stored codec facts (the video codec and profile,
the audio codecs with multiplicity); the pack lane SHALL log ONE publish
line per successful pack carrying the item id, the build nonce, the build
mode (`remux` | `transcode`), the layout decision (`single-variant` |
`rendition`), the variant count, the audio (EXT-X-MEDIA member) count,
whether the codec record was `recorded` or `degraded`, and the ffprobe
probe count (the per-variant cost); a transcode build SHALL additionally
log ONE progress line per published chunk — the item id, the build nonce,
the chunk index, and the percent of the item's stored duration — bounded by
the segment count, and a remux build SHALL log no progress lines; a failed
pack SHALL log ONE warning line naming the failing stage; a gate-refused
job SHALL log the refusal token on its job-start line and no publish line.
The eviction lines keep their existing vocabulary and shape. No new line
SHALL carry a media token value or a play URL (INV4 — item ids and build
nonces are artifact identifiers, not credentials), and the flow SHALL cost
a bounded number of lines: one per job plus one on failure plus, for a
transcode build, one per published chunk, regardless of build size.

#### Scenario: A pack job logs the flow line sequence

- **WHEN** a packaging job runs from enqueue through publish and the item's superseded build is evicted on a repack, with the server log captured
- **THEN** the captured log carries the job-start line (classification outcome, gate `open`, the codec-facts rendering), then the publish line (build mode, layout with variant and audio member counts, the nonce, `codecs` `recorded` or `degraded`, the probe count), and the eviction line naming the superseded path — one line per moment, and no per-segment lines anywhere in the flow

#### Scenario: A gate-refused pack names the token and stops

- **WHEN** a packaging job reaches the build executor after both knobs were disabled and the gate refuses the item
- **THEN** the job-start line carries the refusal token as the gate verdict and the flow ends there — no publish line exists for the job, and no packaging-failure ledger row is charged

#### Scenario: A failed pack logs its stage

- **WHEN** a packaging job's remux fails partway (the build never publishes)
- **THEN** exactly one warning line names the failing stage, the flow shows the job-start line followed by the warning, and the persisted state records the failure as before

#### Scenario: A transcode build logs bounded progress

- **WHEN** an HEVC item is packaged under the transcode knob and its chunks publish one by one
- **THEN** each published chunk logs exactly one progress line carrying the item id, the nonce, the chunk index, and the percent of the stored duration, the publish line names the build mode `transcode`, no further line exists per segment, and a remux build in the same session logs no progress lines at all

### Requirement: Lazy repack of legacy-layout builds

A published build predating the composed master SHALL heal by repack, and
so SHALL a current-layout build whose recorded codecs the transcode knob
supersedes: when `POST /play` without `retry` answers an item whose
packaging state is `complete` with a build nonce whose build either
predates the build-generation marker — `master: true`, written by the
lane's success persist (every build this lane publishes carries the
composed master, so the marker is honest by construction; the playlist is
never re-read to decide) — or carries a recorded codec record whose first
entry names an HEVC sample entry (`hvc1`/`hev1`) while the transcode knob
is enabled, the play verb SHALL enqueue exactly ONE repack through the
ordinary enqueue path and its per-item lease, then answer per the existing
pack-on-play flow; concurrent plays while the repack runs SHALL be
lease-absorbed, not re-enqueued per tick. The old build SHALL keep serving
until the repack publishes a fresh nonce. The enqueue SHALL ride the pack
gate unchanged: an item the gate refuses SHALL NOT enqueue, SHALL keep
answering its existing build, and SHALL log one INFO refusal line — no
packaging-state change, no ledger row. A current-layout build with codecs
the knob does not supersede (an `avc1`-named record, or a record that
composes nothing — never requeue on an unjudgeable fact) SHALL NOT
re-enqueue on the superseded arm, and a failed lazy repack SHALL inherit
the lane's ordinary failure contract — the persisted `failed` state and its
retry affordance — never a retry loop. No library-wide sweep SHALL requeue
legacy or superseded builds, and no serving path SHALL rewrite published
bytes.

#### Scenario: A complete legacy-layout build repacks on play

- **WHEN** POST /play without retry is answered for an item whose packaging state is complete with a build nonce whose namespace predates the build-generation marker, and the pack gate is open
- **THEN** the play verb enqueues exactly one repack through the ordinary enqueue path and answers per the pack-on-play flow, the old build keeps serving while the repack runs, and the repacked build publishes a fresh nonce carrying the composed master and the marker

#### Scenario: An HEVC build repacks into a transcode build on play

- **WHEN** POST /play without retry is answered for an item whose complete current-layout build's recorded codec record names an HEVC sample entry, while the transcode knob is enabled — and again after the repack publishes
- **THEN** exactly one repack is enqueued while the knob is on, the published replacement's recorded codecs name H.264 (a transcode build), the item answers the new build, and the further play enqueues nothing — and with the transcode knob disabled the first play enqueues nothing, logs one INFO refusal line, and the existing build keeps serving

#### Scenario: A current-layout build does not re-enqueue

- **WHEN** POST /play is answered again for the repacked item — and repeatedly while any repack it triggered is still running
- **THEN** the play verb enqueues nothing: the marker closes the legacy arm's decision window once the build publishes, the replacement's H.264 codecs close the superseded arm, and the lane's per-item lease absorbs the plays that arrive during the run

#### Scenario: A gate-closed legacy build keeps playing and skips the repack

- **WHEN** POST /play is answered for a legacy-layout item the pack gate refuses (both knobs disabled on an HEVC item)
- **THEN** the play verb logs one INFO refusal line, enqueues nothing, changes no packaging state, charges no ledger row, and the item keeps answering its existing build
