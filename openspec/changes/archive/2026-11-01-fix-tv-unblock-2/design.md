# Design

## Context

Both defects are diagnosed (see proposal.md — Why); this design pins the
fix shapes at the fault sites. Grounded facts this design builds on:

- The lane gate is `isHls && Hls.isSupported()` (`web/src/components/playback/Player.tsx:164`);
  the direct floor sets `video.src = descriptor.play_url` (`:223`) with the
  media-element error listener (`:224–233`) as its only failure signal — it
  never fires for a successful-but-silent native parse.
- The pre-mount capability probe (`Player.tsx:176–192`) is the house
  dead-end pattern: banner (`role=alert` + `data-media-error-class`) + one
  beacon + NO mount. The refusal reuses exactly this surface.
- The layout rule keys on resolvable sidecars only: `pack.go:98–99`
  (`resolved := resolvableVoiceovers(...)`; `vs := variantLayout(len(resolved))`),
  `variantLayout` (`pack.go:147–159`), consumed by the arg builders
  (`packHeadArgs`/`packTailArgs` branch on `len(voiceovers) > 0`,
  `pack.go:386–387, 415–417`) and the rendition composition
  (`renditionArgs` `pack.go:446–489`, `renditionMap` `pack.go:495–502`:
  `-map 0:v:0 -map 0:a:0` + one map per sidecar input; var_stream_map
  `v:0,agroup:aud a:0,agroup:aud` + one `a:k,agroup:aud` per sidecar).
- The master composer hardcodes the default: `master.go:82–86` —
  `if k == 1 { DEFAULT=YES,AUTOSELECT=YES }` (rend1, the embedded audio).
- The success persist writes the boolean marker (`internal/enrich/streams.go:125–136`,
  `"master": true` at `:135`); the re-repack gate reads it as a bool
  (`cmd/mellifera/playback.go:100`, `streams["master"].(bool)`) with two
  call sites sharing the one helper — the descriptor closure
  (`decision_log.go:64`) and the play verb (`playback.go:59`).
- The descriptor wire: `api.Playback` / `playbackResponse`
  (`internal/api/playback.go:39–48, 61–69` — the additive-field
  precedents `state_reason`, `codecs`, both `omitempty`); `Describe`
  (`internal/stream/describe.go:121`) threads mode/state/playURL/
  sections/voiceovers/stateReason/codecs/codecsSrc out of the namespace;
  the SPA type mirrors it (`web/src/lib/api.ts:287–317`).
- Existing helpers this design reuses: `probeMediaStreams(ctx, path)`
  (`internal/stream/codecs.go:273` — generic `ffprobe -show_streams`,
  works on any media path including the source file);
  `videoAudioStreams` (`internal/stream/classification.go:136` — the
  stored-facts shape splitter); `variantCodecs` / `audioLanguage`
  (`internal/stream/master.go`); `layoutName` (`pack.go:163–168`).
- The repro baselines are on the tree, red:
  `internal/stream/pack_multi_audio_test.go` (asserts rendition
  composition for a 2-embedded-audio source whose Pack facts carry NO
  `streams` array) and the second lane-selection test in
  `Player.test.tsx:231–246` (mechanism-free: banner, beacon, or loader —
  any honest surface).

## Goals / Non-Goals

**Goals:**

- MSE-less devices never silently mount a rendition-layout build; the
  flat single-audio direct floor keeps working and stays pinned.
- Dual-audio muxed sources publish the MSE-safe rendition composition;
  every audio stream is reachable, one DEFAULT track, unique NAMEs.
- Every previously-packed build lazily re-heals to the new rule via the
  existing one-play-lag mechanism (marker versioning), with zero sweep
  and zero read-side rewriting of published bytes.
- The descriptor carries the one field the SPA refusal needs; legacy
  builds answer exactly as today until their repack lands.

**Non-Goals:**

- No weakening of the MSE check to `typeof MediaSource` (the debugger's
  rejected alternative — untested error surface on the exotic TV WebView,
  crash-loop risk). No hls.js attempt when `isSupported()` is false.
- No AAC publish-probe profile blindness fix, no opus Classify mix, no
  posters 403 auth gap (residue — separate changes).
- No read-side layout composition from stored voiceover facts for legacy
  builds (rejected: resolvability is a build-time disk fact; the wave
  backfills the record instead).
- No decision-line, publish-line, or observability vocabulary change: the
  publish line already logs `layout`; the decision line keeps its pinned
  shape (`codecs_src` stays, INV4-clean).
- No change for a video-only source plus sidecars (total audio ≤ 1 routes
  to single-variant; that shape fails ffmpeg today on the unmatched audio
  map and fails identically after this change — pre-existing, untouched).

## Interfaces (cross-group contracts)

These pin every seam Group 1 and Group 2 meet at; the tasks cite them.

1. **Descriptor layout field** — JSON `layout` on the hls descriptor,
   values exactly `single-variant` | `rendition`; `omitempty` (absent for
   builds predating the record); hls answers only — direct answers never
   carry it (the `codecs` precedent). Ride points: `stream.Build` gains
   `Layout string` (`service.go:94`); `enrich.PackOutcome` gains
   `Layout string` (`streams.go:37–41`); the success persist writes
   `layout` when non-empty; `Describe` returns it as a 9th named return
   (read from `streams.layout`, hls branch only, empty on direct);
   `api.Playback` + `playbackResponse` gain `Layout string` with
   `json:"layout,omitempty"`; `PlaybackDescriptor` gains
   `layout?: "single-variant" | "rendition"`.
2. **Marker shape + version constant home** — namespace key
   `streams.master`: boolean `true` reads as version 1 (the legacy
   write), a JSON number reads as its integer version, anything else or
   absent reads as 0. The current rule version lives as
   `enrich.MasterRuleVersion = 2` in `internal/enrich` — the writer's
   package, because the write site must not import `internal/stream`
   (the `PackItem` seam boundary) and `cmd/mellifera` already imports
   enrich. The gate is stale iff `version < enrich.MasterRuleVersion`.
3. **Layout-rule signature change** — `variantLayout(n int)` becomes
   `variantLayout(embedded, sidecars int)` (`pack.go:147`): total :=
   embedded + sidecars; total ≤ 1 → `[rend0]` (single-variant), else
   `rend0..rend(total)` (one video variant + one rendition per audio
   stream). `layoutName` unchanged. The embedded count comes from ONE
   build-time source probe — `probeMediaStreams(ctx, absPath)` at pack
   start, counting `codec_type == "audio"` — fail-open to 0 on probe
   failure (the decision degrades to the legacy sidecar discriminator;
   never a failed pack). The probe does NOT ride the publish line's
   `probes` field (that field keeps its per-variant compose-cost
   semantics — the Pack flow observability vocabulary stays
   byte-identical).
4. **DEFAULT-audio selection rule** — exactly one `DEFAULT=YES` riding
   the most compatible audio track: the first audio rendition whose
   probed audio stream carries `codec_name == "aac"` in rendition order
   (embedded streams in source order, then sidecars in document order);
   no AAC anywhere (probe gaps included) → the first rendition (source
   order). Every other audio rendition rides `DEFAULT=NO` with
   `AUTOSELECT=YES`. New pure helper in `master.go` (e.g.
   `defaultAudioRendition(variants [][]map[string]any) int`), replacing
   the `k == 1` hardcode at `master.go:82`.
5. **ffmpeg mapping generalization contract** — against the existing
   `renditionArgs`/`renditionMap` (`pack.go:446–502`):
   `renditionArgs(src string, voiceovers []string, embedded int, head,
   segmentTime time.Duration, outDir string, seek bool)`; maps =
   `-map 0:v:0` + `-map 0:a:i` for i in 0..embedded-1 + `-map (k+1):a:0`
   per sidecar input; `renditionMap(embedded, sidecars int)` =
   `v:0,agroup:aud` followed by `a:j,agroup:aud` for j in
   0..embedded+sidecars-1 (var_stream_map indices are OUTPUT audio
   order = map order: embedded first, then sidecars). Input count
   unchanged (source + sidecars; the tail seek still applies per input).
   `packHeadArgs`/`packTailArgs` gain `embedded` and branch on
   `embedded+len(voiceovers) > 1` (rendition) vs the single-variant args
   (unchanged; on the new rule's reachable path `-map 0:a` maps exactly
   the one stream). The 1-embedded + 2-sidecar case emits BYTE-IDENTICAL
   flags under the generalized builder — the `rendition_test.go:245–300`
   pin holds unchanged and is EXTENDED with an embedded=2 case.
6. **SPA refusal contract** — on the direct-floor path
   (`isHls && !Hls.isSupported()`): a descriptor with
   `layout === "rendition"` renders the classified banner (`role=alert`,
   `data-media-error-class="rendition-layout-unsupported"`, its own
   Russian wording in `errorText`) and sends exactly ONE beacon
   (`mode: "hls"`, `phase: "video-error"`,
   `code: "rendition-layout-unsupported"`, `detail: "rendition"` —
   non-empty per the D7 five-string shape, INV4-clean: no URL, no token)
   and mounts NOTHING (no `video.src`). `layout` of `single-variant` or
   absent → the direct floor mounts exactly as today. Banner clearing on
   re-attach is inherited from the attach effect. The beacon rides the
   closed phase vocabulary (`fatal`/`video-error`/`stalled`) — no server
   change behind it.

## Decisions

- **D1 — the embedded-audio count comes from a build-time source probe,
  not the stored facts** (the mission text said "per stored ffprobe
  facts"; the red repro decides it). The repro — task 1.1's verify
  anchor, authored corrected-post-repro — packs a two-audio fixture
  whose Pack facts carry only `format.duration` and asserts two audio
  renditions; only build-time discovery satisfies it. Deeper reason: the
  mapping (`-map 0:a:i` × N) must match the FILE's real stream count or
  the remux fails — the file is ground truth at build time; the stored
  facts stay the read-side/play-time source (the never-re-probe-at-play
  convention untouched; this is build work, like the per-variant
  probes). One code path, no facts-vs-file drift.
- **D2 — the discriminator is TOTAL audio (embedded + resolvable
  sidecars), not sidecars alone.** `variantLayout(embedded, sidecars)`;
  single-variant keeps exactly its current shape for total ≤ 1 (the
  `rendition_test.go:206` pin — 1 embedded, all sidecars soft-omitted —
  stays green). The embedded=0 + sidecars≥2 shape (a video-only file
  with dubs) falls out of the generalization as sidecars-only renditions
  and incidentally heals a latent pack failure (`-map 0:a:0` on an
  audio-less input fails ffmpeg today) — noted, not a spec goal.
- **D3 — DEFAULT=YES moves from "rend1" to the AAC-preferred rule.**
  The dual-audio production shape is aac ×2 (and opus ×2); "the
  embedded audio" is no longer a single track, so the old hardcode would
  also be arbitrary. AAC-first maximizes device compatibility of the
  default mount; ties → source order keeps it deterministic and
  byte-stable for a given build (the master byte-identity contract).
  Unprobed variants cannot be judged AAC and are skipped in preference —
  fail-open, exactly one DEFAULT=YES always.
- **D4 — the marker becomes a rule version; the const lives in
  enrich.** The gate predicate changes inside the ONE shared helper
  (`legacyRepackOnPlay`), so the descriptor-GET trigger and the play
  verb pick it up together. Boolean-true → v1 keeps the write site's
  history honest (every pre-change build carried the composed master,
  just under the v1 rule); v1 < 2 → the lazy re-heal wave, one repack
  per build, absorbed by the per-item lease. Cheap identical-shape
  single-audio repacks are accepted (the mission rules them in). The
  itest mirror (`pmaLegacyRepack`, `pack_manifest_audio_joint_test.go:280`)
  re-bases on the same predicate — and its seeded namespaces re-base:
  boolean-true seeds are now v1-stale, a version-2 seed stays put.
- **D5 — the descriptor layout field is persisted at publish and
  fail-open absent for legacy builds.** The lane knows the layout at
  publish (`layoutName(vs)` — the publish line already logs it);
  threading it through `Build` → `PackOutcome` → the success persist →
  `Describe` → the wire is the exact `codecs` path shape. Absent field →
  the SPA mounts as today (fail-open, the `codecs` precedent); those
  builds re-heal on the D4 wave, and the descriptor GET that precedes
  mounting is itself the wave's trigger — so the field appears on the
  next fetch. Rejected: read-side composition from stored voiceover
  facts (needs a resolvability disk check on the read path — against the
  stored-facts-only convention; the wave covers it).
- **D6 — the SPA refusal mirrors the capability probe's dead-end
  surface, mechanism-pinned by the red test.** The refusal is a
  pre-mount decision (no mount, banner + beacon), like
  `device-cannot-decode` — not a post-mount error path. The red
  lane-selection test accepts any honest surface; this design names one.
  Flat single-audio (`single-variant`/absent) keeps the direct floor —
  the TV plays those builds well, and the amended
  `Player.test.tsx:207–213` pin re-bases on the explicit single-variant
  fixture to keep pinning exactly that.
- **D7 — no new log fields anywhere.** The decision line keeps its
  pinned shape (the mission's INV4 guard on `codecs_src` is satisfied by
  not touching the line); the publish line already carries `layout`;
  the new beacon reuses the closed vocabulary. The `probes` field keeps
  its per-variant semantics (the layout probe is layout-decision work,
  not compose cost).

## Risks / Trade-offs

- [The wave re-packs every previously-packed build — including
  single-audio builds whose bytes would be identical] → Accepted (the
  mission rules it in): one repack per build, lazily on the next
  descriptor GET / play, lease-absorbed, budget-eviction unaffected.
  Storage and CPU cost is one remux per item, once.
- [First play after deploy on a legacy rendition build still silent-mounts
  (no layout field yet; the GET that would refuse is the one triggering
  the repack)] → Accepted: the known one-play-lag wave; the second fetch
  carries the field and refuses. The alternative (read-side layout
  composition) is rejected in D5.
- [Source-probe failure degrades the layout decision to the legacy
  discriminator — a dual-audio source could still pack single-variant] →
  Bounded: `ffprobe` ships with `ffmpeg` (the lane cannot run without
  it — `runFFmpeg` would fail immediately after), so the window is
  environmental and fail-open keeps the lane's never-fail-the-pack
  posture.
- [The generalized var_stream_map changes ffmpeg's variant splitting for
  multi-embedded sources] → Pinned by the repro (rend1/rend2 carry the
  copied aac streams, rend0 video-only, `ValidateBuild` passes) and by
  the 1-embedded flag pin staying byte-identical.
- [`legacyRepackOnPlay`'s version predicate and the itest mirror could
  drift] → The mirror is amended in the same task (1.3) and the joint
  itest is re-run in that task's verify; the qa task re-anchors the
  whole contract.

## Migration Plan

Deploy is a rolling replacement: existing builds keep serving under the
legacy rules (the integrity guard and serving surface accept them — the
"Master playlist on every pack" legacy clause). The re-heal wave runs
itself: the first descriptor GET (or play) per item enqueues one repack;
the repacked build publishes with `master: 2` + `layout` and the
descriptor thereafter carries the field. Rollback is a binary swap: older
binaries read `master` as a bool (`2` → not-true → marker absent → the
old gate re-enqueues one more repack that re-publishes the same
rule-2 shape; harmless, lease-absorbed). No config, no migration script,
no store rewrite.

## Diagram Decision

exclude — every flow this change adds is a linear additive thread over
existing seams (lane → success persist → Describe → wire → SPA gate; the
marker version → the existing lazy-repack enqueue), already reconstructable
in one pass from the Interfaces section and the grounded fault sites; a
diagram would restate prose.

## Open Questions

none — the seed record's diagnosis, the user-approved scope, and the
repro baselines settle every choice this design needed.
