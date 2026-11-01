# wf-debugger — fix-tv-unblock-2 seed record (2026-11-01, corrected post-repro)

Diagnosis COMPLETE before this change opened (two debugger rounds on prod
alatoic + one repro-grounding round on the tree @ 567a31c, index CURRENT).
This record supersedes the original seed; the apply tasks re-ground every
symbol through the live index.

## Root cause A — TV silence on rendition builds (client lane, CORRECTED)

Gate fact (git -S verified across all history): the SPA lane gate is and
always was `isHls && Hls.isSupported()` (Player.tsx:117, 164) — there is
NO canPlayType anywhere in web/. The TV (YaBrowser TV WebView, no usable
MSE) took the DIRECT FLOOR (`Player.tsx:219–238`, `video.src =
descriptor.play_url`) because **`Hls.isSupported()` returned false** —
not because of a native-HLS preference. Its native pipeline parses the
rendition master but never fetches EXT-X-MEDIA audio renditions →
video-only silent mount, and the direct floor surfaces no error for it
(no banner, no beacon — media-element error listener at 224–232 only
fires on actual media errors).

So "prefer hls.js" is a NO-OP — the code already prefers hls.js whenever
isSupported() is true. The real (A) design decision: what an MSE-less
device should get for a rendition-layout build instead of a silent mount.
Direct floor must stay (the TV plays single-audio flat builds well on
it). Recommended shape: honest refusal — descriptor carries the build
layout; direct floor refuses rendition masters with the classified
banner + beacon (same surface as the capability probe's device-cannot-
decode path, which is a dead-end too, at 176–192). Weakening the MSE
check to `typeof MediaSource` is the rejected alternative (untested
error surface on an exotic WebView; could crash-loop).

- Fault sites: Player.tsx lane gate 164 + direct floor 219–238; probe
  dead-end 176–192 (NOT implicated in the silence — a device that fails
  isSupported never reaches it; do not add a direct-floor fallback
  there, it recreates the silent-TV behavior).
- Server rider: the descriptor needs a layout field (single-variant |
  rendition) for the SPA to refuse on — publish already knows it
  (variantLayout result; log line layout=).

## Root cause B — dual-audio muxed packs are MSE-unfriendly (pack lane)

Layout rule today (pack.go:98–99, 147–159, 213–221):
`variantLayout(len(resolvableVoiceovers(voiceovers)))` — keys ONLY on
resolvable VOICEOVER SIDECAR count. itm_4 (3 sidecars) → rendition;
itm_3 (2 embedded aac, 0 sidecars) → single-variant with BOTH audio
streams muxed (`-map 0:a` maps ALL) — the MSE one-track-per-type fatal
shape ("Audio stream codec aac/opus doesn't match SourceBuffer codecs"),
proven live on the TV's old builds of itm_2_e76d698d (aac ×2) and
itm_2_ec59950c514f9e87 (opus ×2). The healed itm_2_e76d build
(a6eea9d2542e0170, codecs=recorded) kept single-variant → still fatal on
next play.

Fix shape: rendition whenever TOTAL audio streams > 1 (embedded audio
count from the stored ffprobe facts + resolvable sidecars); 1-audio
stays single-variant (MSE-safe, pinned by rendition_test.go:206 whose
fixture has exactly 1 audio — stays green). Extend the rendition
composition to N embedded audio: rend1..rendK each one embedded stream
(`-map 0:a:i` per stream; renditionArgs/renditionMap pack.go:446–495
generalize from the current `-map 0:a:0` + 3-input var_stream_map) then
voiceovers; EXT-X-MEDIA per audio rendition with UNIQUE NAMEs within
GROUP-ID (disambiguate same-language tracks — the itm_4 rus ×3 labeling
nit is precedent); exactly one DEFAULT=YES riding the most compatible
track (prefer an aac over flac/other when both exist; ties → source
order) — this is the user-approved default-audio decision.

## Marker versioning (re-repack story)

Marker write: internal/enrich/streams.go:125–136 writes `"master": true`
(bool) at success persist. Re-repack gate: cmd/mellifera/playback.go:96–102
reads `streams["master"].(bool)` with ok-fallback — ANY non-bool shape
reads false → stale → one repack. Design: write the pack-lane RULE
VERSION (`"master": 2`) instead of bool; gate reads bool-true as v1,
numbers as their version, re-packs iff version < current rule const.
This re-heals every previously-packed item lazily on next play (the
known one-play-lag wave) — including identical-shape single-audio
builds (cheap, correct). Failed docs stay marker-free (unchanged).

## Repro state (red baselines on the tree, uncommitted)

- (B) internal/stream/pack_multi_audio_test.go (NEW):
  TestPackMultiAudioRenditionLayout — h264+aac+aac MKV, nil voiceovers,
  asserts rendition composition. RED verbatim:
  `layout=single-variant variants=1 audio=0 codecs=recorded` …
  `master EXT-X-MEDIA URIs = [], want [rend1/index.m3u8 rend2/index.m3u8]`
  (composed master carries `CODECS="avc1.64000A,mp4a.40.2,mp4a.40.2"`).
- (A) web/src/components/playback/Player.test.tsx (+33): two tests in
  "Player — lane selection (native-HLS claiming browsers)": (1) hls
  loader taken when isSupported true despite native claim — PASSES
  today (anti-regression pin); (2) "does not mount the direct floor
  silently on an MSE-less native-HLS device" — RED (`surfaced=false`:
  zero hls instances, zero banner, zero beacon). Mechanism-free: any
  honest surface (banner/beacon/loader) satisfies it; the planner must
  align its descriptor fixture with the chosen design (rendition-layout
  descriptor).
- Web infra EXISTS: vitest ^2.1.9 + @testing-library/react + jsdom,
  Player.test.tsx 659-line harness with FakeHls.isSupported mock,
  renderPlayer/theVideo helpers, api spies. No harness task needed.

## Pins the tasks must resolve (existing tests enshrining the bugs)

1. Player.test.tsx:207–213 "falls back to the native src when MSE is
   unavailable (native-HLS browsers)" — pins the silent direct-floor
   fallback as CORRECT. Must be amended to the new contract (MSE-less +
   rendition master → refusal, not silent mount); flat single-audio
   direct-floor playback stays correct and pinned.
2. rendition_test.go:245–300 — pins the rendition arg-builder flags
   (`-map 0:a:0`, 3-input var_stream_map). A multi-embedded-audio build
   needs `-map 0:a:i` per stream — amend/extend for the generalized
   mapping (keep the 1-embedded case's flags if unchanged).

## Out of scope (residue, unchanged)

AAC publish-probe profile blindness (itm_3 degraded record; ASC-parse
fallback proposed separately). Opus Classify mix under knob=true. Posters
403 auth gap. Cosmetic INV4 comment + rus ×3 labeling nits (the NAME
uniqueness rider in B covers future builds only).
