# Design

## Context

See proposal.md — Why. Ground truth this design builds on (verified on the
working tree at `7ab5d4b`, 2026-10-31; field evidence in the postmortem's
"Post-archive findings" and the archived review/close-out of
`tv-playback-unblock`):

- The pack lane is remux-only fMP4-HLS (`internal/stream/pack.go`); the
  single-variant and rendition builds publish under
  `data/streams/<item_id>/<nonce>/` with `EXT-X-MAP` init segments and no
  CODECS attributes on any playlist. `Pack` runs once per job and returns
  `Build{Playlist, Nonce}`; the streams lane's `workStreams`
  (`internal/enrich/streams.go:95-109`) persists `{state, playlist, nonce}`
  into `doc["streams"]` AFTER `PackItem` returns, and records a
  `pack_failed` ledger row (flat 30-day cooldown) on ANY error.
- The knob is folded at exactly two judge sites today: `Describe`'s
  `floorReason` (`internal/stream/describe.go:141-166`, knob judged
  explicitly for the opt-in class) and `episodeFromDoc`'s `Packable`
  (`cmd/mellifera/playback.go:305`, `Classify(ff, optInCodecs)`). Three
  pack seams never consult it: the play verb's retry re-enqueue
  (`cmd/mellifera/main.go:317-342` — `state == failed` → `EnqueuePack`,
  no classification), the integrity repack sweep
  (`cmd/mellifera/playback.go:288-294` — unhealthy complete build →
  enqueue, no classification), and the build executor itself
  (`cmd/mellifera/main.go:215-218` — `PackItem` → `mediaSvc.Pack`, no
  gate). A knob flipped between enqueue and build builds anyway.
- The SPA's hls mount is `if (isHls && Hls.isSupported())` —
  `web/src/components/playback/Player.tsx:164` — no knowledge of the
  pack's codecs; the descriptor wire
  (`internal/api/playback.go:33-41,54-61`, `web/src/lib/api.ts:287-308`)
  carries `state_reason` but no codec facts. The banner/beacon machinery
  from tv-playback-unblock is in place (`PlayerError`, `beacon` helper,
  `sendPlaybackEvent` swallow-everything client).
- Budget eviction (`internal/orchestrator/budget.go`) owns cross-item
  pressure by watch recency and never selects `.tmp-*` directories; it is
  the ONLY remover of published build directories today. A repack
  publishes to a fresh nonce and the superseded dirs linger until budget
  pressure removes them.
- Exported-symbol budget: the touched packages sit at/below the warn bar;
  every addition here is a const-block member, a struct field, an
  unexported function, a method, or a single func-field seam — counted in
  Risks.

## Goals / Non-Goals

**Goals:**

- No device ever meets a pack its decoder cannot take as a cryptic fatal:
  the wire names the pack's codecs, the SPA asks the device before
  mounting, and the refusal is an honest banner plus one beacon line.
- One source of truth for "may this codec be packed": the descriptor's
  `codec_not_opted_in` promise and the packer's refusal are the same
  tokens from the same judge, on every seam (describe, retry, repack,
  build).
- A policy refusal never poisons: no `pack_failed` ledger row carries a
  knob setting as a 30-day content failure.
- One episode, one build: publishing replaces.

**Non-Goals:**

- No transcode lane (postmortem F5 stays open): a pack the device cannot
  decode stays unplayable there; this change makes that honest, not
  playable. The AVI/mpeg4-ASP refusal (`codec_unsupported`) is untouched.
- No manifest/master-playlist CODECS attributes in this change (deliberate
  — see Open Questions; the probe rides the descriptor).
- No knob policy change: `MELLIFERA_STREAM_OPT_IN_CODECS` keeps its
  default and its meaning; only its enforcement reaches every seam.
- No budget policy change: eviction-on-publish is per-item replacement,
  not budget pressure; recency accounting and the LRU clock are untouched.
- No beacon persistence or vocab growth: the gate edge rides the closed
  `{mode, phase}` vocabulary with a new free-text `code` value.
- No cooldown policy change (infra-vs-content classification stays the
  named postmortem follow-up).

## Decisions

- **D1 — One gate, one vocabulary.** `internal/stream` gains the single
  judge: `PackGate(ff map[string]any, optInCodecs bool) Gate` — pure over
  stored ffprobe facts (the same facts `Classify` reads; `Classify` stays
  the primitive, untouched). `Gate` is a string type whose zero/allowed
  value is `""` and whose refusals ARE the descriptor's `state_reason`
  tokens: `codec_not_opted_in` (opt-in codecs, knob off) and
  `codec_unsupported` (nothing remuxable). Five consumers ride it:
  `floorReason` (refactored onto it — answers byte-identical,
  `TestDescribeHonesty` pins that), `episodeFromDoc`'s `Packable`
  (`GateOpen` ⇔ today's `pack || opt_in-with-knob`), the retry closure,
  the repack sweep, and the build executor. Agreement is by construction,
  not convention. Alternative declined: a second vocabulary of gate codes
  — two token sets for one fact is the incoherence this change removes.
- **D2 — Codec strings are the pack's truth, recorded at publish.** At
  publish, `Pack` probes each distinct `EXT-X-MAP` init segment of the
  published build with ffprobe (the same binary the scanners use; one
  invocation per init; **apply-time amendment, task 2.1:** ffprobe of a
  BARE fMP4 init cannot resolve h264/hevc profile and level — SPS/PPS live
  in the codec description box and ffprobe reports level -99 / no profile
  without media present, which would fail-open every real pack — so the
  probe reads each VARIANT PLAYLIST of the published build instead, one
  invocation per variant, same artifact truth, same table, same
  fail-open) and composes the RFC 6381 codec parameter strings
  through one pure table keyed on the probe facts (codec_name, profile,
  level) over exactly the classifier-admitted families: avc1, hvc1/hev1,
  mp4a.40.2, opus, flac, ac-3, ec-3, mp3, vorbis. The deduped strings —
  video first, then audio in the pack lane's pinned rendition order —
  ride `Build` → `PackOutcome.Codecs` → the completion write's
  `doc["streams"].codecs`. Why probe the artifact instead of deriving
  from the source document: the MP4 muxer (not the source) decides the
  sample entries, and rendition builds carry per-rendition audio the
  source facts never describe. **Legacy fallback:** an hls answer whose
  namespace carries no recorded codecs (every build published before this
  change) composes the same strings read-side from the item's stored
  source ffprobe facts via the same table — a remux carries the source's
  streams, so the composition is honest up to the muxer's sample-entry
  choice; the recorded value wins whenever present. A build whose codecs
  cannot be composed either way answers none, and the SPA mounts as
  today (fail-open — the beacon still catches what the probe misses).
  Declined: a migration repack wave to backfill records (heavy, and the
  knob-off reality would refuse half of it); manifest CODECS attributes
  (Open Questions).
- **D3 — The probe is the descriptor's list, judged at the mount point.**
  `codecs` is an ordered `string[]` (video first, then audio in rendition
  order). The SPA's hls branch, before `new Hls()`, composes ONE probe —
  `MediaSource.isTypeSupported('video/mp4; codecs="<video>,<first
  audio>"')`, the device's default mount — and on a miss renders the
  device-unsupported banner and sends ONE best-effort beacon
  `{item_id, mode:"hls", phase:"video-error", code:"device-cannot-decode",
  detail:"<the probe mime>"}`. The closed beacon vocabulary fits (this is
  a video-capability error surfaced before any hls fatal exists; a
  `phase` extension would grow the server contract for no information the
  free-text `code` doesn't carry) — declined the extension. Absent/empty
  codecs, or no `MediaSource`, mount exactly as today; a probe pass mounts
  with zero behavior change. The probe judges the DEFAULT mount only: a
  mid-play voiceover switch to a rendition the device cannot take stays
  on today's fatal+beacon path (Risks).
- **D4 — The gate closes every pack seam; a policy refusal is never a
  pack failure.** Retry (`POST /play {retry:true}`): the closure checks
  `PackGate` before `EnqueuePack` and returns a typed refusal the api
  handler maps to 400 with the gate token as the error code — the same
  token the descriptor answers, so the SPA's inline canonical-error
  rendering needs no new shape. Integrity repack: a gate-closed item is
  skipped with ONE INFO refusal line (the decision-log pattern); no
  enqueue, no ledger row — the sweep must not loop on a refusal it can
  never heal. Build time (the knob flipped between enqueue and build):
  the `PackItem` closure wraps the `PackGate` verdict in an exported
  enrich `PolicyRefusal` error; `workStreams` branches it BEFORE
  `recordPackFailure` — the lane records `state: failed` with the policy
  reason and NO `pack_failed` ledger row, so no 30-day cooldown is
  charged to a knob setting, and flipping the knob on heals through the
  frontier with no manual step (no ledger to clear). Declined: recording
  the refusal as a (short-cooldown) ledger row — still poisons while the
  knob is off, and cooldown classification is the separate open
  follow-up.
- **D5 — Publish replaces; the doc write orders the eviction.** The
  streams lane, immediately AFTER the success `persistStreams`, calls a
  new optional `Deps` seam (`AfterPackPersist func(itemID, keepNonce
  string)`, nil = no-op) wired flat in cmd to
  `stream.Service.EvictSuperseded(itemID, keepNonce)`: every directory
  under the item's artifact root except `keepNonce` is removed at once —
  `.tmp-*` staging names never touched (the F2 lesson, now a rule), other
  items never touched (budget LRU still owns cross-item pressure), one
  log line per removal (the `evicted artifact directory` observability
  pattern), best-effort (a failed removal logs WARN and never fails the
  landed pack). The ordering is load-bearing: eviction runs only after
  the document names the new build, so the descriptor's integrity guard
  never validates a deleted current build. The merged spec's
  cached-playlist continuity ("the client's cached playlist URL keeps
  answering with the old build's bytes") is consciously REPLACED by the
  human ruling (2026-10-31): one current build per item; a client
  holding a superseded URL recovers by refetching the descriptor. The
  anti-collision half survives: a new build never publishes into a
  previous build's directory. Declined: evicting inside `Pack` (the doc
  still names the old build at that point — a descriptor GET in the
  window would validate a deleted build).
- **D6 — The wire stays additive end to end.** `Describe` grows a 7th
  return value (the `stateReason` pattern — no struct refactor of the hot
  path in this change); `api.Playback`/`playbackResponse` gain
  `Codecs []string` (`codecs,omitempty`, through the `wireArray`
  null-guard so hls answers never answer `null`); `PlaybackDescriptor`
  gains `codecs?: string[]`. Direct answers carry no `codecs` — the field
  describes the pack, and the probe gates only the hls mount. The
  decision-log line is untouched (no new log surface, INV4).

## Interfaces

Cross-group contracts this change adds (the single home for their shapes;
specs carry the behavior, tasks carry the file map):

- **Descriptor wire, additive** — `GET /api/v1/items/{id}/playback`:
  - `codecs?: string[]` — present on hls answers whose codecs could be
    composed (recorded at publish, else the read-side legacy
    composition); absent on direct answers and on uncomposable builds.
    Order: video first, then audio in the pack lane's rendition order
    (embedded audio first, then voiceover sidecars in document order).
    Entries are RFC 6381 codec parameter strings (e.g. `avc1.640028`,
    `hvc1.2.4.L153.B0`, `mp4a.40.2`), one per distinct stream, deduped.
  - Plumb: `stream.Describe` 7th return → `api.Playback.Codecs` →
    `playbackResponse.codecs` (wireArray guard) → `PlaybackDescriptor.
    codecs`.
- **Persisted codec record** — the streams lane's completion write gains
  one key: `doc["streams"].codecs` (array of strings, the same order).
  Nothing else in the namespace changes; `preparing`/`unsupported` remain
  read-side projections; the failure doc's shape is untouched.
- **Pack gate** — `stream.PackGate(ff map[string]any, optInCodecs bool)
  Gate`; `type Gate string`; `GateOpen Gate = ""` (empty string — allowed);
  refusal values exactly `stream.ReasonCodecNotOptedIn` /
  `stream.ReasonCodecUnsupported`. Pure over stored facts; `Classify`
  stays the primitive.
- **Publish replacement** — `enrich.Deps` gains the optional func field
  `AfterPackPersist func(itemID, keepNonce string)` (nil = no-op);
  `workStreams` calls it once after the success `persistStreams`, never
  on the failure path; cmd wires it to `mediaSvc.EvictSuperseded`, which
  removes every non-`keepNonce` directory under the item's artifact root,
  never a `.tmp-*` name, one log line per removal.
- **Policy refusal (build time)** — enrich gains the exported error type
  `PolicyRefusal struct{ Reason string }`; the cmd `PackItem` closure
  returns it when `PackGate` refuses; `workStreams` branches it before
  `recordPackFailure` → `persistStreams(failed, reason=<token>)`, no
  ledger row.
- **Play refusal (retry time)** — api gains the exported error type
  `PlayRefusal struct{ Reason string }`; the cmd retry closure returns it
  when `PackGate` refuses; `itemPlay` maps `errors.As` → 400 with
  `code = Reason` (`codec_not_opted_in | codec_unsupported`),
  `retryable: false` — the same 400 family as `nothing_failed`, the same
  tokens as `state_reason`.
- **Probe beacon edge** — the existing closed-vocab beacon, one call:
  `{item_id, mode: "hls", phase: "video-error", code:
  "device-cannot-decode", detail: "<probe mime>"}`; fire-and-forget,
  never load-bearing, INV4 clean.

## Risks / Trade-offs

- [A capable device is blocked because the probe string over-answers] →
  the composition table is table-tested per admitted family; the probe is
  exactly the default mount's codec set (video + first audio — voiceover
  renditions never enter it), and `isTypeSupported` is the same oracle
  hls.js trusts for its own MSE probing: a false there predicts precisely
  the append failure this change exists to prevent. Fail-open on absent
  codecs keeps unprobeable builds on today's path.
- [A mid-play voiceover switch to an undecodable rendition still fatal-
  fails] → accepted: the switch is explicit, the banner+beacon machinery
  names it, and gating every rendition switch would probe combinations
  the default mount never builds. The descriptor's ordered list keeps the
  facts available for a future per-rendition probe.
- [Legacy packs answer codecs composed from SOURCE facts — the muxer's
  sample entry could differ from the composition] → the table is the same
  one the publish path uses, and both judge the same admitted families; a
  mismatch would have to start with a stream the classifier already
  admits but the table cannot compose — which degrades to absent
  (fail-open), never to a wrong refusal.
- [Immediate eviction strands a slow client mid-repack] → accepted by the
  human ruling: one current build per item is the storage posture; the
  client's next descriptor fetch answers the new build. The linger
  alternative recreates the multi-build-per-item state the ruling
  removes.
- [Eviction races a descriptor GET that just validated the OLD nonce] →
  the same bounded race budget eviction has today (validate-then-vanish
  before the player mounts); the doc-write ordering removes the worse
  direction (validating a deleted CURRENT build). Accepted.
- [Knob-flip mid-queue leaves `state: failed` whose retry now 400s] →
  honest by design: the retry affordance renders the canonical 400 token
  inline, and flipping the knob on heals (no ledger, frontier re-enqueues)
  with no manual step.
- [Exported-surface growth] → `Gate` + `PackGate` + `PolicyRefusal` +
  `PlayRefusal` + `AfterPackPersist` + two struct fields + one method +
  one return value. Each is the minimal seam shape at an anti-corruption
  boundary; the reviewer's exported-budget check at the gate is the
  backstop, and no package crosses the warn bar on these alone.
- [`preparing` items under a knob-off operator now refuse retry loudly] →
  that is the point: today the same item 202s, builds (or sits failed),
  and the descriptor's `codec_not_opted_in` promise is silently false.
  The refusal and the promise are the same token from the same judge.

## Migration Plan

Deploy is a normal single-binary rollout; no DDL, no data migration, no
config change. All wire changes are additive (old clients keep parsing;
`index.html` is no-cache so devices pick the new bundle immediately).
Existing published builds gain probeability through the read-side legacy
composition the moment the new binary serves — no repack wave, including
the knob-off HEVC packs in prod today (the TV moves from cryptic fatal to
honest device banner; desktop keeps playing). New packs record their
codecs at publish. Rollback = redeploy the previous binary; the `codecs`
field, the refusal codes, and the eviction seam simply go quiet. The
embedded build lands committed in the same change per the established
pattern (dev-time `make web-build`).

## Open Questions

None blocking GATE 1. Three deliberate leaves:

1. **Manifest / master-playlist CODECS attributes** — deliberately not a
   task: the probe rides the descriptor and never fetches the playlist,
   so attributes are redundant for this change's gate; they would serve
   native-HLS clients and the future F5 lane. Recommend routing to the
   F5 design as a named line, not carrying them here.
2. **The exact HEVC composition (hvc1 vs hev1, profile/level hex)** —
   D2 pins the table approach and the admitted families; the precise
   per-family constants (including the hvc1/hev1 sample-entry choice the
   muxer makes) are the applying task's judgment, table-tested per
   family.
3. **The retry refusal's HTTP shape** — 400 in the `nothing_failed`
   family with the gate token as the error code is the default; if GATE 1
   prefers a distinct status (409), it is a one-line delta amendment
   before approval, not a design change.
