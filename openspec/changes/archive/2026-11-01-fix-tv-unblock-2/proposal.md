# Proposal

## Why

Two confirmed production defects in packaged playback, diagnosed to root
cause before this change opened (two debugger rounds on prod alatoic plus
one repro-grounding round on the tree — the seed record at
`handoffs/wf-debugger.md` is authoritative):

- **(A) TV silence on rendition builds.** The SPA lane gate is and always
  was `isHls && Hls.isSupported()` (`Player.tsx:164`) — there is no
  canPlayType anywhere in web/. An MSE-less native-HLS device (the TV's
  YaBrowser WebView) takes the direct floor (`Player.tsx:223`), its native
  pipeline parses the rendition master but never fetches the
  `EXT-X-MEDIA` audio renditions, and the direct floor surfaces no error
  for it — a silent video-only mount, no banner, no beacon.
- **(B) Dual-audio muxed packs are MSE-unfriendly.** The pack-lane layout
  rule keys on resolvable voiceover SIDECARS only
  (`pack.go:98–99` → `variantLayout(len(resolvableVoiceovers(...)))`), so
  a source with two embedded audio streams and no sidecars packs as a
  single-variant build whose one variant muxes BOTH audio streams —
  Chromium's MSE enforces one track per type and fatals on mount
  ("Audio stream codec aac/opus doesn't match SourceBuffer codecs"),
  proven live on the TV's old builds. The marker-version wave below is
  what re-heals every previously-packed build of this shape.

## What Changes

- **Pack-lane layout rule**: rendition layout whenever the TOTAL audio
  streams (embedded audio + resolvable voiceover sidecars) exceed one;
  single-variant stays for one audio stream. The embedded-audio count is
  probed from the original file at build time (the remux mapping must
  match the file being remuxed); a probe failure degrades fail-open to
  the legacy sidecar-count discriminator — never a failed pack.
- **Generalized rendition composition**: N embedded audio streams, one
  audio rendition each (stream copy), ahead of the voiceover sidecar
  renditions; `EXT-X-MEDIA` with unique NAMEs; exactly one `DEFAULT=YES`
  riding the most compatible track — the first AAC track in rendition
  order, ties → source order (the user-approved default-audio decision).
- **Marker versioning**: the streams lane's success persist writes the
  pack-lane RULE VERSION (`master: 2`) instead of the boolean `true`; the
  lazy re-repack gate reads boolean-true as version 1, numbers as their
  version, and re-packs iff stale — driving the lazy re-heal wave for
  every previously-packed build (the known one-play-lag), including
  identical-shape single-audio builds (cheap, correct). Failed docs stay
  marker-free.
- **Descriptor layout field**: the hls answer carries the additive
  `layout` field (`single-variant` | `rendition`), omitted for builds
  predating the record (fail-open, the `codecs` precedent); direct
  answers never carry it. The decision line keeps its pinned shape —
  `codecs_src` stays INV4-clean, no new log fields.
- **SPA direct-floor refusal**: an MSE-less device whose descriptor names
  the rendition layout refuses with the classified banner + one beacon
  (the capability probe's device-cannot-decode surface pattern) instead
  of silently mounting video-only. The flat single-audio direct floor
  stays — it is the MSE-less path's working lane — and stays pinned.
- **Enshrined-bug pins resolved**: Player.test.tsx MSE-less fallback pin
  re-based on the single-variant fixture (the flat path stays pinned);
  the red lane-selection test's descriptor fixture aligned with
  `layout: "rendition"`; rendition_test.go's locked-flags pin EXTENDED
  with the embedded=2 case (the existing 1-embedded flags are
  byte-identical under the generalized mapping and stay green
  unchanged); the pma itest legacy-repack mirror re-based on the version
  predicate.

Out of scope (residue, unchanged): AAC publish-probe profile blindness
(ASC-parse fallback — separate change), opus Classify mix under knob=true,
posters 403 auth gap, the rus ×3 labeling nit for existing builds (the
NAME-uniqueness rider covers future builds only).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `packaged-playback`: a new **Audio layout rule** requirement (the
  total-audio discriminator, the generalized composition, the fail-open
  probe degradation); **Master playlist on every pack** changes (the
  DEFAULT=YES selection rule generalizes from "the embedded audio" to the
  most-compatible track; the single-variant scenario's condition becomes
  the total-audio condition); **Lazy repack of legacy-layout builds**
  changes (the `master` marker becomes a rule version — boolean-true
  reads as v1, stale versions re-pack once, the re-heal wave);
  **Playback descriptor and verb split** changes (the additive `layout`
  field on hls answers, omitted pre-record).
- `web-ui`: **Video playback in the SPA** changes (an MSE-less device
  facing a rendition-layout descriptor refuses with the classified banner
  + beacon and mounts nothing; flat single-audio and pre-record
  descriptors mount the direct floor exactly as before).

## Impact

- `internal/stream`: `pack.go` (variantLayout / renditionArgs /
  renditionMap signatures gain the embedded count; the build-time source
  probe; `Build.Layout`), `master.go` (the DEFAULT selection rule),
  `describe.go` (Describe threads the layout out), tests: the red repro
  `pack_multi_audio_test.go` turns green, `rendition_test.go` pin
  extended.
- `internal/enrich`: `streams.go` — `MasterRuleVersion` const, the
  success persist writes `master: 2` and `layout`; `PackOutcome` gains
  `Layout`.
- `cmd/mellifera`: `playback.go` — the `legacyRepackOnPlay` version
  predicate (both call sites — descriptor closure and play verb — share
  it); `main.go` adapter threading; `decision_log.go` threading only.
- `internal/api`: `playback.go` — `Playback` + `playbackResponse` gain
  `Layout` (`layout`, omitempty).
- `web/`: `lib/api.ts` (`PlaybackDescriptor.layout?`),
  `components/playback/Player.tsx` (the refusal),
  `Player.test.tsx` (pin amendment + red-test fixture alignment).
- `internal/itest`: `pack_manifest_audio_joint_test.go` (mirror
  re-base), a new joint test over real two-embedded-audio fixtures.
- `internal/web`: embedded build + openapi regen (`make web-build`) —
  the descriptor wire gains a field.
