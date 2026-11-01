# Spec Delta

## ADDED Requirements

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
The eviction lines keep their existing vocabulary and shape. No new line
SHALL carry a media token value or a play URL (INV4 — item ids and build
nonces are artifact identifiers, not credentials), and the flow SHALL cost
a bounded number of lines: one per job plus one on failure, regardless of
segment count or build size.

#### Scenario: A pack job logs the flow line sequence

- **WHEN** a packaging job runs from enqueue through publish and the item's superseded build is evicted on a repack, with the server log captured
- **THEN** the captured log carries the job-start line (classification outcome, gate `open`, the codec-facts rendering), then the publish line (layout `single-variant` or `rendition` with variant and audio member counts, the nonce, `codecs` `recorded` or `degraded`, the probe count), and the eviction line naming the superseded path — one line per moment, and no per-segment lines anywhere in the flow

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
ordinal), `LANGUAGE` when known, and exactly one `DEFAULT=YES` — the
embedded audio, the pack's primary track; the voiceover renditions ride
`AUTOSELECT=YES` with `DEFAULT=NO`. A single-variant pack SHALL publish the
same master shape — one variant line whose CODECS names the video and the
muxed audio — with its media playlist, init segment, and segments beneath
it, so the build root holds only the master; the item's play URL keeps
naming `index.m3u8`, now the master, on both shapes. The master SHALL be
composed at the head-first publish from the head playlists (the probe facts
are the init segments' streams, identical across phases), so a partial
build mounts with the master from its first served byte, and it SHALL be
byte-identical for a given published build. When the pack's codecs cannot
be composed, the master SHALL still publish with the corrected shape minus
the CODECS attribute (fail-open — never a failed pack). A build published
before this rule keeps its on-disk layout: the integrity guard and the
serving surface SHALL accept both the legacy layouts (a root media
playlist, or ffmpeg's generated rendition master) and the composed master,
and a legacy build heals only by repack — fresh nonce, one current build
per item — never by a read-side rewrite of published bytes.

#### Scenario: Rendition pack serves a video-only variant master with an audio group

- **WHEN** a pack with embedded audio plus voiceover sidecars is published and its build root playlist is read
- **THEN** the playlist carries exactly one `EXT-X-STREAM-INF` variant — the video rendition, with a CODECS attribute naming the video codec — and the audio renditions appear only as `EXT-X-MEDIA:TYPE=AUDIO` group members with unique NAMEs and exactly one `DEFAULT=YES`, with no audio rendition listed as a variant

#### Scenario: Single-variant pack serves a master carrying the pack's codecs

- **WHEN** a single-variant pack (no voiceovers) is published and its build root playlist is read
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

### Requirement: Lazy repack of legacy-layout builds

A published build predating the composed master SHALL heal by repack, and
the play verb SHALL be its trigger: when `POST /play` without `retry`
answers an item whose packaging state is `complete` with a build nonce but
whose namespace lacks the build-generation marker — `master: true`, written
by the lane's success persist (every build this lane publishes carries the
composed master, so the marker is honest by construction; the playlist is
never re-read to decide) — the play verb SHALL enqueue exactly ONE repack
through the ordinary enqueue path and its per-item lease, then answer per
the existing pack-on-play flow; concurrent plays while the repack runs
SHALL be lease-absorbed, not re-enqueued per tick. The old build SHALL
keep serving until the repack publishes a fresh nonce. The enqueue SHALL
ride the pack gate unchanged: an item the gate refuses SHALL NOT enqueue,
SHALL keep answering its existing build, and SHALL log one INFO refusal
line — no packaging-state change, no ledger row. A current-layout build
(marker present) SHALL NOT re-enqueue, and a failed lazy repack SHALL
inherit the lane's ordinary failure contract — the persisted `failed`
state and its retry affordance — never a retry loop. No library-wide
sweep SHALL requeue legacy builds, and no serving path SHALL rewrite
published bytes.

#### Scenario: A complete legacy-layout build repacks on play

- **WHEN** POST /play without retry is answered for an item whose packaging state is complete with a build nonce whose namespace predates the build-generation marker, and the pack gate is open
- **THEN** the play verb enqueues exactly one repack through the ordinary enqueue path and answers per the pack-on-play flow, the old build keeps serving while the repack runs, and the repacked build publishes a fresh nonce carrying the composed master and the marker

#### Scenario: A current-layout build does not re-enqueue

- **WHEN** POST /play is answered again for the repacked item — and repeatedly while any repack it triggered is still running
- **THEN** the play verb enqueues nothing: the marker closes the decision window once the build publishes, and the lane's per-item lease absorbs the plays that arrive during the run

#### Scenario: A gate-closed legacy build keeps playing and skips the repack

- **WHEN** POST /play is answered for a legacy-layout item the pack gate refuses (the opt-in codec knob disabled on an HEVC item)
- **THEN** the play verb logs one INFO refusal line, enqueues nothing, changes no packaging state, charges no ledger row, and the item keeps answering its existing build

## MODIFIED Requirements

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

#### Scenario: Matroska-sourced HEVC answers the composed sample entry

- **WHEN** the playback descriptor is fetched for an item whose hls build predates codec recording and whose stored source facts are the real prod shape — hevc with `codec_tag_string` `[0][0][0][0]`, profile `Main 10`, level 120, two aac LC audio streams
- **THEN** the answer carries `codecs` composed read-side as `hvc1.2.4.L120.B0` followed by the deduped `mp4a.40.2` — the sample entry composed, the SPA's device probe runs, and an incapable device meets the honest banner instead of a skipped probe

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
