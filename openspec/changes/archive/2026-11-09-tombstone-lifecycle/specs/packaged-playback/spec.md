# Spec Delta

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
