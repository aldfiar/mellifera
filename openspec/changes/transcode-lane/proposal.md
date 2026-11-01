# Proposal

## Why

Tonight's field evidence closes the postmortem's F5 case: the user's TV
(Android 14, Chrome 156 webview) cannot decode HEVC through MSE at all —
`isTypeSupported` false, proven at mount time by the shipped pre-mount
probe — so no remux or manifest fix can ever make those titles play there
(`docs/playback-postmortem-2026-10-31.md`, F5 and "Post-archive findings";
`playback-capability-gate` made the refusal honest, `pack-manifest-audio`
makes capable devices play correct manifests — neither can make an
incapable device capable). The only path to HEVC-on-TV playback is
re-encoding the video to H.264.

## What Changes

- **One knob, one gate arm, zero new tokens**: `MELLIFERA_STREAM_TRANSCODE`
  (default off = today's honest-refusal behavior byte-for-byte). When on,
  `PackGate` — the single judge every pack seam already consults — gains
  the transcode knob beside the opt-in knob and opens the HEVC-video class:
  a knob-on HEVC item is packable (the output is universally decodable, so
  the transcode knob alone suffices; the opt-in knob keeps governing
  everything else exactly as shipped). The refusal vocabulary is unchanged
  (`codec_not_opted_in` / `codec_unsupported`) — knob-off answers are
  today's answers. The descriptor's honesty projection rides the same
  judge: a transcodable item answers `preparing`, and an hls answer's
  `codecs` are the TRANSCODED build's (the existing publish-time table
  composes the `avc1` strings from the probed artifact) — the TV's
  pre-mount probe passes and playback works end to end. **No wire change,
  no SPA change**: the descriptor's `codecs` field, the probe, the banner,
  and the beacon all exist; web/ is untouched.
- **The transcode build replaces the remux as that item's build** (one
  build per item preserved; desktop plays the H.264 build too): same lane,
  same machinery — head-first 600s first chunk, atomic build-nonce
  publish, the pack-manifest-audio fMP4-HLS rendition layout (composed
  master with CODECS, `rend0/...`), integrity guard, tokenized serving,
  publish-time eviction. Video: `ffmpeg -c:v libx264` (crf 22 within the
  21–23 band, preset veryfast, `-pix_fmt yuv420p`). Audio: stream-copied
  when aac or mp3, otherwise encoded to aac. No new dependency — libx264
  lives inside the ffmpeg hard dependency; the lane's one exec site gains
  a branch, not a second pipeline.
- **Healing for existing HEVC packs**: the lazy repack-on-play (pack-
  manifest-audio's seam) gains the codec-superseded arm — a complete,
  current-layout build whose RECORDED codecs name hevc repacks on the next
  play while the knob is on (the same one-enqueue path: gate pre-check,
  lease absorption, fresh nonce, shipped eviction); the frontier opens
  proactively for transcodable items (still unwatched-only). Knob-off
  keeps every shipped refusal exactly.
- **Honest flow**: the publish line names the build mode
  (`remux` | `transcode`); transcode builds log one bounded progress line
  per published chunk (pack-manifest-audio's D7 vocabulary, INV4-clean);
  the job-start gate line renders the codec class with the knobs out of
  the way, so a gate the transcode arm opens never logs a
  closed-class-with-open-gate contradiction.
- **Explicit non-changes**: the AVI/mpeg4-ASP class (and >8-bit h264)
  stays REFUSED (`codec_unsupported`) — the transcode arm covers only the
  HEVC video class, the one the field evidence proves; items whose video
  is fine but audio is AC-3 keep today's opt-in remux. No DDL, no
  migrations, no new env knobs beyond the one, zero new exported symbols
  (internal/stream stays at 7 — a field and unexported helpers only).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `packaged-playback`: the pack gate's transcode arm (the knob on every
  pack seam, refusal tokens unchanged); the pack lane's knob-gated
  transcode build mode (video re-encoded to H.264, audio copied-or-
  encoded, same layout and publish machinery); the classification
  requirement's packability condition (the transcode knob opens the HEVC
  class); the descriptor's honesty projection (preparing under the
  transcode arm); the pack-flow observability vocabulary (build mode +
  bounded transcode progress lines); the lazy repack-on-play's
  codec-superseded arm (existing HEVC builds heal on play).

## Impact

- `internal/stream` — the primary package: the gate arm + the
  `videoTranscodable` predicate beside `Classify` (the primitive stays
  untouched), `Service.Transcode` as a field, the unexported transcode
  arg builders, the build-mode branch at the lane's three arg sites, the
  mode field + progress lines on the flow vocabulary, the doc.go
  no-encode invariant amended to the knob-gated exception. Zero new
  exports — the package stays at 7 counted symbols; `PackGate`'s
  signature gains one bool (an existing symbol).
- `cmd/mellifera` — the env knob (`envBool`, the `MELLIFERA_ENRICH_*`
  precedent) beside `MELLIFERA_STREAM_OPT_IN_CODECS`, wired into the
  Service construction and carried by every `PackGate` seam
  (`packGateRefusal`, `packOnPlay`, `retryFailedPack`, the sweep, the
  frontier's `Packable`, pack-manifest-audio's lazy-repack pre-check);
  the play verb's stale-build decision gains the codec-superseded arm;
  the job-start gate line's class renders knob-free.
- `internal/itest` — one joint over real ffmpeg transcodes (committed
  tiny HEVC fixtures under `internal/stream/testdata/`); the encode
  duties guard for ffmpeg WITH libx264 explicitly.
- Untouched: `internal/enrich` (the lane-agnostic queue absorbs the long
  jobs — lease renewal already covers multi-minute packs),
  `internal/orchestrator` (budget/frontier policy unchanged), `internal/
  api` and `web/` (no wire change — no openapi or embedded-build regen),
  `internal/refusal` (no new tokens). CPU/disk posture is stated in
  design.md Risks: encode latency is minutes per episode (veryfast
  1080p), the enrich queue's existing concurrency applies, H.264 output
  lands ≈0.7–1.5× source, and one-build-per-item caps standing disk while
  the budget WARN remains the operator signal.
