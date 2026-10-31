# Spec Delta

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Remux-only pack lane

Packaged output SHALL be produced by remuxing only — stream copy, no decode
and no encode, ever — into fMP4-HLS carrying one video stream and the audio
tracks; subtitle and data streams SHALL be dropped. Artifacts SHALL be
published atomically into the server's own data space (written aside, then
moved into place), and each packaging run SHALL publish under a fresh build
directory so a repack never collides with a build still in flight.
Publishing a fresh build for an item SHALL evict that item's previous build
directories immediately — one current build per item — after the document
write that names the new build, so the playback descriptor's integrity guard
never validates a deleted current build; the eviction SHALL never touch an
in-flight `.tmp-*` staging directory, another item's artifacts, or the
freshly published build itself, and SHALL be best-effort (a failed removal
logs a warning and never fails the landed pack). Budget-eviction recency
accounting is a separate signal and stays untouched. A client holding a
superseded build's playlist URL recovers by refetching the playback
descriptor, which answers the new build. Playlists SHALL be byte-identical
for a given published build.

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
- **THEN** the new build publishes at a different location (never into the previous build's directory) and, once the item's document names it, the item's previous build directories are evicted immediately — exactly one build directory remains under the item's artifact root, the superseded playlist URL stops answering, and a descriptor refetch answers the new build

#### Scenario: Publish eviction spares staging and other items

- **WHEN** a publish eviction runs while an in-flight build's `.tmp-*` staging directory and another item's build directory exist on disk
- **THEN** only the publishing item's superseded build directories are removed — the staging directory, the other item's artifacts, and the freshly published build all remain

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
value winning whenever present. A build whose codecs cannot be composed
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
