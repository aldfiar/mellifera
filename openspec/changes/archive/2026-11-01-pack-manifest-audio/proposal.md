# Proposal

## Why

Live testing minutes ago (2026-11-01) surfaced three evidence-complete
defects in the pack lane's manifest shape, all with the same user-visible
family: packs that play wrong or fatal on devices that can actually decode
them. (A) The rendition build's master playlist breaks audio — every
multi-audio title plays video-only, silently, on every device: the master of
nonce `07c5a00111e41597` (item `itm_4_4abdae6f23167012`, built 23:16 Oct 30)
lists four `EXT-X-MEDIA TYPE=AUDIO` entries ALL `DEFAULT=YES` and ALSO lists
rend1–4 as `EXT-X-STREAM-INF` variants (rend1 with no CODECS, no
RESOLUTION); hls.js selected rend0 — a video-only variant — and the server
trace shows it never requested any audio rendition (master 200 →
rend0/index.m3u8 200 → rend0 segments only; zero 4xx). (B) The legacy
read-side codec composition fails on Matroska sources, so the honest
device-cannot-decode banner never fires on the TV for pre-record packs:
`internal/stream/codecs.go` `codecString`'s hevc branch requires
`codec_tag_string ∈ {hvc1, hev1}` — an MP4-artifact fact — while the stored
source facts for the prod items are Matroska (`itm_2_e76d698d4a147d7c`: tag
`[0][0][0][0]`, hevc profile "Main 10", level 120, two aac LC streams), so
`legacyCodecs` degrades to nil for every Matroska-sourced pack and the
descriptor answers no codecs and the SPA probe is skipped. (C) HEVC flat
packs fatal even on capable desktops — "Audio stream codec aac doesn't match
SourceBuffer codecs" beacons from BOTH desktop Chrome 155 and the TV (phase
fatal, code mediaError/mediaSourceRequiresReset, detail verbatim
`PipelineStatus::CHUNK_DEMUXER_ERROR_APPEND_FAILED`): flat single-variant
packs (index.m3u8 IS a media playlist, no master) carry no CODECS anywhere,
so hls.js builds the SourceBuffer without the audio codec and every audio
append mismatches — the mount-level descriptor probe (playback-capability-
gate) cannot prevent it, because the buffer is composed from the playlist's
CODECS, not the descriptor's field.

## What Changes

- **Every pack publishes a master playlist** (findings A + C): the pack
  lane composes the build root's `index.m3u8` itself, per RFC 8216 —
  `EXT-X-STREAM-INF` variants are the VIDEO renditions only, each carrying
  a CODECS attribute; audio renditions appear ONLY as `EXT-X-MEDIA` group
  members with unique NAMEs and exactly one `DEFAULT=YES` (the embedded
  audio — the pack's primary track). Rendition builds replace ffmpeg's
  double-listed master with this shape; single-variant builds gain a master
  whose one variant line carries `CODECS="<video>,<audio>"`, with the media
  playlist, init segment, and segments publishing beneath it (`rend0/`).
  The play URL keeps naming `index.m3u8` — now the master — on both
  shapes, and the master is composed at the head-first publish so partial
  builds mount with audio too. Existing published builds keep their legacy
  layout on disk: they heal only by repack (fresh nonces through the
  frontier, integrity repack, retry — and now play, below — the eviction
  machinery from playback-capability-gate already enforces one current
  build per item), while the read-side legacy codec composition keeps them
  at least banner-honest; the integrity guard validates both layouts.
- **The legacy read-side codec composition composes the HEVC sample entry
  itself** (finding B): a source stream whose `codec_tag_string` already
  names a sample entry (`hvc1`/`hev1` — an MP4 source whose entry survives
  the stream-copy remux) composes verbatim; anything else (a Matroska
  source's `[0][0][0][0]` — a container artifact, not a sample entry)
  composes as `hvc1`, the de-facto widely-accepted entry — an honest
  approximation, since which entry the muxer actually wrote is unknowable
  from stored source facts. The publish-time path keeps reading the tag
  from the probed artifact verbatim (foreign tags there still degrade —
  fail-open). The Matroska packs now answer `codecs`, the SPA probe runs,
  and the TV's pre-record HEVC items show the honest device banner instead
  of a cryptic fatal.
- **The pack flow reads from logs alone** (GATE 1 scope addition): one
  stable INFO-line vocabulary per media type's journey, riding the
  decision-log pattern (the binary has no log-level knob — default slog
  INFO is the audience): the pack job's start line names the Classify
  outcome, the gate verdict (`open` or the refusal token), and one compact
  rendering of the stored codec facts; the lane's publish line names the
  layout decision (`single-variant` | `rendition`), variant and
  EXT-X-MEDIA member counts, the nonce, whether codecs were recorded or
  degraded, and the ffprobe per-variant cost; the descriptor's existing
  decision line gains `codecs_src` (`recorded` | `legacy` | `none`) so a
  missing codecs answer is distinguishable from a bug without opening
  sqlite (the 2026-11-01 debugging session needed three ssh round-trips
  to learn "recorded absent, legacy failed"). No token values, no play
  URLs in any new line (INV4); the eviction lines keep their existing
  shape.
- **Legacy-layout builds repack lazily on play** (GATE 1 scope addition):
  builds published before this rule never requeue on their own — the
  integrity sweep only requeues unhealthy builds, the frontier only
  failed/pending, retry only failed states — so today's silent titles
  (state `complete`, legacy layout; finding A's item is exactly one) would
  stay silent forever. The pack/build decision gains one condition: when
  the play verb answers an item whose current build is complete but
  predates the composed master — detected from the build-generation marker
  the success persist writes into the packaging namespace (`master: true`),
  not by re-reading the published playlist — it enqueues exactly ONE repack
  through the ordinary EnqueuePack path and PackGate semantics (a knob-off
  HEVC item still refuses honestly: one INFO line, no enqueue, no state
  change), the lane's per-item lease absorbs concurrent plays while the
  repack runs, and the old build keeps serving until the fresh nonce
  replaces it. No library-wide sweep wave, no serve-time rewriting of
  published bytes, no per-tick re-enqueues.
- **No SPA surface, no wire change**: the descriptor's `codecs` field, the
  SPA probe, the banner, and the beacon all exist and keep their shapes —
  codecs simply start flowing (for Matroska sources once B lands; for
  capable devices C's master lets hls.js compose the buffer with audio).
  No openapi regen, no embedded-build regen.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `packaged-playback`: the pack lane's master-playlist composition (the
  RFC 8216 master on every pack — rendition shape, single-variant shape,
  legacy-layout coexistence), the descriptor's read-side legacy codec
  composition (the HEVC sample-entry rule for source-fact builds), the
  pack-flow log vocabulary (the job-start, publish, and descriptor-read
  lines, INV4-clean), and the lazy repack-on-play of legacy-layout builds
  (the namespace's build-generation marker, the play verb's one-enqueue
  condition).

## Impact

- `internal/stream` — the primary package. A new unexported master
  composer beside the playlist surgery in `pack.go`/`master.go`; the
  single-variant build's ffmpeg output moves under `rend0/`
  (`variantLayout(0)`, the single-variant arg builders); the publish-time
  codec probing moves from after-publish to the head playlists (one ffprobe
  per variant per Pack, same fail-open, same table — `buildCodecs`
  reshaped, `Build.Codecs` semantics unchanged); `codecString`'s hevc tag
  rule splits into the publish-path read (verbatim artifact tag) and the
  legacy-path composition (verbatim sample entry, else `hvc1`); the
  publish flow line rides `Pack` (one INFO at completion, one WARN on the
  error path) and `Describe` threads the codecs source out as an 8th
  return value (a plain string — the stateReason pattern, no new exported
  identifier). Zero new exports — the package sits at 7 against the repo
  gate's warn bar at >8 and every addition is an unexported helper, a
  return value, or a test.
- `cmd/mellifera` — the `PackItem` closure logs the flow's start line
  (`pack: gate` — Classify outcome, gate verdict, compact codec-facts
  rendering via an unexported helper) and the descriptor decision line
  (`decision_log.go`) gains the `codecs_src` field from Describe's new
  return; the play verb's existing `!retry` branch (`playback.go`
  `packOnPlay`) gains the lazy-repack condition — state `complete` with a
  nonce but no build-generation marker runs the PackGate pre-check and
  enqueues exactly one repack through the same `packOnPlay` path, with ONE
  INFO refusal line when the gate is closed. No new wiring: the enqueue
  and its dedup stay the enrich lane's.
- `internal/enrich` — one map key: the streams lane's success persist
  records the build-generation marker (`master: true`) in the packaging
  namespace — every build this lane publishes carries the composed master,
  so the marker is honest by construction. No exports, no DDL, no
  behavior change to EnqueuePack or the lease.
- `internal/itest` — the two artifact-layout assertions re-point to the
- `internal/itest` — the two artifact-layout assertions re-point to the
  `rend0/` tree (`qa_playback_roundtrip_test.go`, the codecs-joint probe in
  `playback_capability_gate_joint_test.go`); one new joint pins the served
  master shapes, the Matroska read-side composition, the flow lines, and
  the lazy repack-on-play over real packs.
- No wire change (the descriptor keeps its exact shape), no DDL, no
  migrations, no new dependencies, no config change. INV4 untouched (no
  token material anywhere new — the master rides the existing
  self-authorizing playlist rewrite). The F5 transcode lane stays open as
  the only path for actually-incapable devices — a correct master makes a
  capable device play; it does not make an incapable one capable.
