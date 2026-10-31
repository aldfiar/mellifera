# Proposal

## Why

`tv-playback-unblock`'s honesty worked exactly as designed — and its beacon
evidence named what it could not fix (postmortem "Post-archive findings",
2026-10-31 evening, live-verified on the real TV). A `hev1` pack fatal-fails
on the TV webview's MSE — hls.js probing builds a SourceBuffer whose codec
set drops audio, the append dies ("Audio stream codec aac/opus doesn't match
SourceBuffer codecs"), hls.js answers fatal `mediaError`/
`mediaSourceRequiresReset` — while the same pack plays on desktop Chrome.
Nothing on the wire told the SPA what it was about to feed the device: the
manifests carry no CODECS attribute (bare media playlists), so the webview
guesses from the init segment and the SPA mounts hls.js blind. Two
incoherences compound the gap: the `OptInCodecs` knob (`internal/stream/
service.go:71`) is honored at DESCRIBE time only — prod runs knob-off yet
carries HEVC packs built while it was on, and three pack seams never consult
the gate at all (the play verb's retry re-enqueue `cmd/mellifera/main.go:317`,
the integrity repack enqueue `cmd/mellifera/playback.go:288`, the build
executor `cmd/mellifera/main.go:215`) — and a repack leaves the item's
previous build directories in place until budget eviction, so one episode
can hold several builds at once.

## What Changes

- **The descriptor carries the pack's codecs** (additive wire): an hls
  answer gains `codecs` — the RFC 6381 codec strings of the published
  build, video first, then audio in rendition order — recorded at publish
  by probing each variant playlist of the published build with ffprobe
  (the D2 amendment: a bare init segment cannot resolve profile/level)
  and composing through
  one pure table; builds predating the record compose the same strings
  read-side from the item's stored source ffprobe facts (a remux carries
  the source's streams). Direct answers stay byte-unchanged. An hls answer
  whose codecs cannot be composed carries none — the SPA mounts as today.
- **The SPA probes before mounting**: with the descriptor's codecs in hand,
  the Player's hls branch runs `MediaSource.isTypeSupported` on the
  video-plus-first-audio combination before `new Hls()`. A probe miss
  renders an honest per-device banner — this device cannot decode this
  pack's codecs; never a spinner, never the cryptic fatal — and sends ONE
  best-effort beacon through the existing `POST /playback-events` (the
  closed vocab fits: mode `hls`, phase `video-error`). Capable devices see
  zero behavior change; an answer without codecs mounts as today.
- **The packer honors the opt-in knob — one source of truth**: a single
  `PackGate` judge in `internal/stream` (refusals carrying exactly the
  descriptor's `state_reason` tokens) drives the descriptor's honesty
  projection, the frontier's packability, the play verb's retry (400 with
  the gate token), the integrity repack (one logged refusal, no enqueue,
  no ledger row), and the build executor (a policy refusal records
  `failed` WITHOUT a `pack_failed` ledger row — a knob flipped between
  enqueue and build never poisons a 30-day cooldown, and flipping the knob
  on heals through the frontier with no manual step).
- **One current build per item**: publishing a fresh build for an item
  evicts that item's previous build directories immediately, after the
  document write that names the new build — the descriptor's integrity
  guard never validates a deleted current build. In-flight `.tmp-*`
  staging stays untouchable (the F2 lesson, institutionalized); budget
  recency accounting is untouched. The merged spec's cached-playlist
  continuity on a superseded build is consciously replaced by this rule
  (the human's ruling, 2026-10-31): a client holding a stale playlist URL
  recovers by refetching the descriptor.
- **Living docs**: the postmortem's Post-archive findings are routed to
  this change; the F5 transcode lane stays open.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `packaged-playback`: the descriptor's additive `codecs` field (with the
  publish-time record and the read-side legacy composition); the opt-in
  gate enforced on every pack seam with honest, non-poisoning refusals;
  the play verb's gate-refused retry answer; per-item artifact
  replacement at publish.
- `web-ui`: the pre-mount MSE capability probe in the Player, the
  device-unsupported banner, the gate-edge beacon, the descriptor type's
  `codecs` field; the embedded build regen carrying the new surface.

## Impact

- `internal/stream` — a new gate (pure `PackGate` over the existing
  `Classify` primitive, `describe.go`'s floorReason refactored onto it);
  publish-time codec recording (probe the published init segments, pure
  composition table shared with the read-side fallback); `Describe`'s 7th
  return value (the stateReason pattern); `EvictSuperseded(itemID,
  keepNonce)`. Tests ride the existing suites plus targeted new ones.
- `internal/enrich` — `PackOutcome.Codecs`; the streams lane persists
  `codecs` at the completion write, calls the post-persist eviction seam,
  and branches a new exported policy-refusal error into
  failed-without-ledger. One optional `Deps` func field; the lane's lease,
  cooldown, and persist paths otherwise untouched.
- `internal/api` — additive `Codecs` on the Playback wire (wireArray
  guard); a typed play-refusal error mapped to 400 with the gate token as
  the error code. No new routes; swag annotations updated by the regen.
- `cmd/mellifera` — the retry closure's gate check; the repack sweep's
  logged refusal; the PackItem closure's build-time gate and the eviction
  seam wiring. No new config, no env changes.
- `web/src` — `lib/api.ts` descriptor type; `components/playback/
  Player.tsx` probe gate + banner + beacon edge; vitest coverage.
- `internal/web/dist` + `internal/web/api/openapi.{json,yaml}` —
  regenerated via the dev-time `make web-build` and committed
  (established pattern); the node-free Go build gate stays untouched.
- No DDL, no migrations, no new dependencies; every wire change is
  additive; Describe stays a pure read-side projection (the legacy codec
  composition reads the same stored document); INV4 holds everywhere (no
  token material anywhere new; the beacon stays fire-and-forget).
