# Design

## Context

See proposal.md — Why. The evidence chain is complete: postmortem F5 plus
the "Post-archive findings" (HEVC packs fatal-fail on the TV webview's MSE
while desktop plays them; the AVI/mpeg4-ASP class can never be remux-
playable) plus tonight's mount-time proof (`isTypeSupported` false for the
HEVC mime on the TV — the pre-mount probe from `playback-capability-gate`
now answers the question at the descriptor, not at the fatal). This change
is the F5 lane the postmortem names as the only remaining path.

**Dependency — this change RIDES ON `pack-manifest-audio` (in flight,
uncommitted; GATE 1 of THIS change is HELD until it closes).** Its landed
artifacts are load-bearing here, cited artifact-by-artifact rather than
re-scoped:

- the composed RFC 8216 master with CODECS on every pack (their D1–D3) —
  the transcoded H.264 build mounts with both SourceBuffers composed from
  the playlist (their finding-C fix); without it the transcode alone would
  still fatal on flat playlists;
- the publish-time codec record (their D2) — the transcoded build's
  `avc1`/audio strings are composed by the existing probe + table with
  zero new code; the descriptor answers them; the TV's pre-mount probe
  passes;
- the lazy repack-on-play seam + the build-generation marker (their D5/
  task 3.1) — the codec-superseded healing arm below is a second trigger
  on the SAME one-enqueue path, not a new mechanism;
- the pack-flow log vocabulary (their D7) — the mode field and the
  progress lines extend a pinned vocabulary instead of founding one.

Their proposal's Impact section names this change explicitly ("the F5
transcode lane stays open ... a correct master makes a capable device
play; it does not make an incapable one capable"). Requirements 5 and 6
of this change's delta MODIFY requirements their delta introduces; those
texts are authored against their spec delta and MUST be re-based against
the merged living spec at propose time — the held GATE 1 makes the re-base
automatic rather than hopeful. Same files are touched by their apply
(`describe.go` 8th return, `cmd/mellifera/playback.go` lazy-repack
condition): sequencing resolves the merge, never a parallel edit.

Ground truth this design builds on (verified on the working tree at
`c2e9c5a` through the live wf index + grep, 2026-11-01): `Classify`
(`internal/stream/classification.go:41` — the four classes; hevc/h265
video and ac3/eac3 audio are the `opt_in` facts; mpeg4-ASP and >8-bit
h264 fall to `direct_only`; the knob folds INSIDE Classify), `PackGate`
(`classification.go:119` — judges `Classify(ff, true)` with the knob
folded explicitly, refusals ARE the `state_reason` tokens), the
descriptor's projection (`describe.go:202` — switches on `PackGate(f,
s.OptInCodecs)`), the lane's three arg sites (`internal/stream/pack.go`
:245-248, :274-277, :299-335 — `-c copy` everywhere, one
`exec.CommandContext` site at :365), the knob plumbing
(`cmd/mellifera/main.go:670` `envBool("MELLIFERA_STREAM_OPT_IN_CODECS",
false)`; :1179 `envBool`; `Service` construction :217; the executor gate
`packGateRefusal` `cmd/mellifera/playback.go:114`, called `main.go:220`;
`packOnPlay` `playback.go:55`; the five current `PackGate` call sites:
`describe.go:202`, `playback.go:89`, `:115`, `:346`, `:372`).
`internal/stream` sits at 7 counted exports (warn >8, fail >12 —
`scripts/check.sh` is the arbiter).

Diagram decision: excluded — every interaction below follows an existing
seam (the gate's five consumers, the lane's one exec site, the play
verb's enqueue path); prose reconstructs them in one pass, and the
change-folder precedent carries no mermaid.

## Goals / Non-Goals

**Goals:**

- HEVC titles actually play on MSE-only devices: knob on → the pack is
  H.264+AAC(-family) → the descriptor's codecs pass the TV's pre-mount
  probe → playback works end to end with zero SPA change.
- Knob off (`MELLIFERA_STREAM_TRANSCODE` unset) = today's binary behavior
  byte-for-byte: same refusals, same remux lane, same descriptor answers.
- One build per item preserved: the transcode REPLACES the remux as the
  item's build; desktop plays the H.264 build too.
- The healing path for the already-packed HEVC library is play-triggered,
  one enqueue per item, churn-proof by construction (the 2e5ccff lesson).
- The flow stays honest and bounded: mode on the publish line, bounded
  progress lines for encode builds, INV4 everywhere.

**Non-Goals:**

- No transcode for the AVI/mpeg4-ASP class or >8-bit h264 — they stay
  `direct_only`/`codec_unsupported` under both knobs (the field evidence
  covers HEVC; widening the class later is one predicate change, see Open
  Questions).
- No audio-only transcode arm for h264-video items (an AC-3-audio item
  keeps today's opt-in remux with AC-3 kept).
- No second build per item (desktop keeps the HEVC remux) — rejected: it
  re-creates the multi-build-per-item state the one-build ruling removed
  and doubles disk.
- No new knob beyond `MELLIFERA_STREAM_TRANSCODE`; no budget policy
  change; no cooldown policy change (a real encode failure stays an
  ordinary `pack_failed` content failure — the infra-vs-content
  classification stays the named postmortem follow-up); no SPA or wire
  change; no HDR tone-mapping.

## Decisions

- **D1 — One knob, one gate arm, zero new tokens.**
  `MELLIFERA_STREAM_TRANSCODE` is parsed beside the opt-in knob
  (`envBool`, default false — malformed falls back + warns, the
  `MELLIFERA_ENRICH_*` precedent), rides `cfg.transcode` into
  `stream.Service.Transcode` (a field — no new export), and reaches every
  seam through `PackGate(ff, optInCodecs, transcode)` — the signature
  gains one bool on an existing symbol. The arm: the `ClassOptIn` case
  opens when `optInCodecs` OR (`transcode` AND the video stream is
  hevc/h265) — the same `{hevc, h265}` set `Classify`'s `videoOptIn` arm
  reads, via one unexported `videoTranscodable(ff)` predicate over the
  same stored facts. Refusal tokens are unchanged and still mean what
  they meant: knob-off HEVC answers `codec_not_opted_in`, ASP answers
  `codec_unsupported`, a pack-class item stays open. `Classify` stays the
  primitive and untouched — classes are codec facts, knobs are policy
  (the shipped split; the INV3 fold inside Classify keeps governing the
  class, the gate arm keeps governing permission). The knob alone
  suffices: with transcode on, an HEVC item is packable regardless of the
  opt-in knob — the output is universally decodable, and requiring both
  knobs would make this one unusable alone; the opt-in knob keeps its
  exact shipped meaning for everything else (AC-3-audio items, the remux
  posture). The descriptor's honesty projection follows automatically
  (`describe.go:202` passes `s.Transcode` beside `s.OptInCodecs`): a
  transcodable unpackaged item answers `preparing`, knob-off answers
  today's `unsupported` + `codec_not_opted_in`. Declined: a second judge
  (`PackGateTranscode`) — two sources for one permission is the drift
  D1 of the shipped gate exists to prevent; and threading the knob
  through `Classify` — it would fold hevc items to `opt_in` under a
  policy knob and change every class reader's meaning.
- **D2 — The transcode replaces the remux; the lane stays one machine.**
  The build mode is decided at `Pack` from the same predicate the gate
  arm reads: transcode iff `Service.Transcode && videoTranscodable(ff)`.
  The lane's three arg sites gain the branch: video args become
  `-c:v libx264 -preset veryfast -crf 22 -pix_fmt yuv420p` (crf 22 is the
  default within the requested 21–23 band, a builder constant, no knob;
  veryfast is the latency/cost posture the caller pinned); each audio
  output stream is stream-copied when its codec is aac or mp3 and
  otherwise encoded `-c:a aac` (D4). Mapping (`-map 0:v:0`, `0:a`,
  voiceover inputs), `-movflags`, hls flags, head-first 600s first chunk,
  EVENT playlists, the tail merge, the atomic nonce publish, the composed
  master, the integrity guard, and the tokenized serving are all
  untouched — a transcode build IS a normal build downstream of the args.
  With the knob off, the composed args are byte-identical to today's —
  pinned by the entire existing pack suite staying green untouched. The
  direct floor is never encoded (INV amendment scoped to the pack lane's
  branch alone, D7). Declined: transcoding only when the opt-in knob is
  also on (dead-knob posture, D1); a separate transcode pipeline/worker —
  the enrich queue's lease + the lane's atomic publish already own the
  lifecycle.
- **D3 — The descriptor answers the transcoded build; the TV probe
  passes.** The publish-time codec record (pack-manifest-audio D2) probes
  the published variant playlists — the transcoded artifact carries
  `avc1` sample entries and the copied-or-encoded audio's real entry — so
  `Build.Codecs`, the descriptor's `codecs`, and the composed master's
  CODECS all name the H.264 build with zero new composition code. The
  SPA's pre-mount `isTypeSupported` probe (playback-capability-gate D3)
  then passes on the TV; hls.js composes both SourceBuffers from the
  master's CODECS (their finding-C fix). End to end: descriptor
  `preparing` → pack lands → descriptor `hls` + `codecs:[avc1…,
  mp4a.40.2]` → probe pass → playback. No wire change anywhere.
- **D4 — Audio: copy the MSE-safe set, encode the rest to AAC.** The
  classifier-admitted audio families split at the set every MSE target
  decodes and fMP4 muxes: aac and mp3 are stream-copied (byte-preserved,
  cheapest, exactly today's remux behavior for them); ac3, eac3, opus,
  vorbis, flac are encoded to native-ffmpeg AAC. The rule is judged per
  output stream (the embedded track and each voiceover rendition each get
  their own verdict — a mixed aac+ac3 source copies one and encodes the
  other), table-tested per family. AAC encode needs no new dependency
  (ffmpeg's native encoder). Rationale for copying mp3 alongside aac: it
  is classifier-admitted, MSE-universal, and fMP4-muxable; re-encoding it
  would burn CPU for nothing.
- **D5 — Healing: the frontier opens for future items; play heals
  existing builds.** Unpacked/pending HEVC items flow through the
  frontier the moment the knob is on (`Packable` reads the same gate —
  proactive packing stays unwatched-only, the shipped watched-semantics
  ruling). Already-packed HEVC remux builds (most of the real library —
  the knob gap era) heal through pack-manifest-audio's lazy repack-on-
  play, extended with the **codec-superseded arm**: state `complete` WITH
  the build-generation marker (a current-layout build — the legacy-layout
  arm already covers pre-marker builds, whose gate pre-check now opens
  under the knob) whose RECORDED codec record's first entry names
  `hvc1`/`hev1`, judged while the transcode knob is on → the same
  ONE-enqueue repack: the `PackGate` pre-check runs first (open under the
  knob), the per-item lease absorbs plays that land while the repack
  runs, the fresh transcode build replaces the old at publish (the
  shipped `EvictSuperseded`), and the arm closes itself (the new build's
  recorded codecs name `avc1`). Knob off: the arm is inert — the gate
  pre-check answers `codec_not_opted_in`, ONE INFO refusal line, no
  enqueue, no state change (the shipped refusal, byte for byte). Builds
  whose codecs compose nothing: the arm stays silent (fail-open — never
  requeue on an unjudgeable fact). Declined: a library-wide sweep wave
  requeueing superseded builds — the exact churn shape `2e5ccff`
  removed; and a read-side "superseded" descriptor projection — new
  read-side state to save one banner.
- **D6 — The flow stays honest and bounded.** Three extensions to the
  pinned vocabulary, nothing else: (1) the publish line gains `mode`
  (`remux` | `transcode`) — the flow's reader sees which machine ran;
  (2) transcode builds log ONE `streams: transcode progress` INFO line
  per published chunk — item, nonce, chunk index, percent from the 600s
  chunk boundary against the stored `format.duration` (arithmetic; no
  ffmpeg `-progress` parsing, no per-segment spam) — bounded by the
  segment count (~6 lines per hour of content), INV4-clean (item id and
  nonce are artifact identifiers; no token, no play URL); (3) the
  job-start gate line's `class` renders the codec class with the knobs
  out of the way (`Classify(ff, true)` — `opt_in` for transcodable
  items), so a gate the transcode arm opens can never log the
  contradictory `class=direct_only gate=open` shape. The descriptor
  decision line needs nothing new: a transcode-open item is not a
  refusal. A transcode FAILURE inherits the ordinary lane contract —
  `state: failed`, a `pack_failed` ledger row (a real encode failure is
  content, not policy; the cooldown-classification follow-up stays open),
  the retry affordance, and the F4 tail keeps the reason real — a host
  ffmpeg without libx264 surfaces there honestly ("Unknown encoder
  'libx264'"); the verify duties guard for the encoder explicitly so a
  lacking host fails at the guard, not mid-suite.
- **D7 — Zero new exports; the invariant is amended, not broken.**
  `Service.Transcode` is a field; `videoTranscodable` and the arg
  builders are unexported; `PackGate` grows a parameter on an existing
  symbol. `internal/stream` stays at 7 counted exports —
  `scripts/check.sh` is the backstop. `internal/stream/doc.go`'s
  "no decode/encode anywhere" invariant is amended to the knob-gated
  exception: encoding exists ONLY inside the transcode branch of the pack
  lane; the direct floor stays unconditional and byte-serving; remux
  remains the default build whenever the knob is off. INV2 (pure
  classification, facts never mutated) and INV4 (no token material in
  logs) are untouched and re-pinned by the tasks.

## Interfaces

- **PackGate** — `stream.PackGate(ff map[string]any, optInCodecs,
  transcode bool) Gate` — the ONE signature change; `Gate`, `GateOpen`,
  and the refusal tokens are unchanged. Five existing call sites + pack-
  manifest-audio's lazy-repack pre-check gain the argument.
- **Service field** — `stream.Service.Transcode bool` (zero value off =
  today). cmd parses `MELLIFERA_STREAM_TRANSCODE` and wires it at the
  existing Service construction; every cmd seam carries both knobs beside
  `optInCodecs` (the flat-parameter pattern those helpers already use).
- **Build mode predicate** — transcode iff `Service.Transcode &&
  videoTranscodable(ff)`; `videoTranscodable` is unexported and is the
  ONLY place the `{hevc, h265}` set is named (the gate arm and `Pack`
  both read it — one fact, two readers, no drift).
- **Transcode args (builder constants)** — video: `-c:v libx264 -preset
  veryfast -crf 22 -pix_fmt yuv420p`; audio per output stream: `-c:a
  copy` (aac, mp3) else `-c:a aac`; mapping and container/hls flags
  inherited from the remux builders unchanged.
- **Flow vocabulary additions** — `streams: pack published` gains `mode`
  (remux | transcode); `streams: transcode progress` (transcode builds
  only, one line per published chunk: item, nonce, chunk, percent); the
  `pack: gate` job-start line's class is judged knob-free. No new line
  carries a token or a play URL (INV4).
- **No wire change, no DDL, no new dependency (libx264 is inside the
  existing ffmpeg hard dependency), no new export, no embedded-build or
  openapi regen.**

## Risks / Trade-offs

- [CPU: encode is minutes per episode and saturates cores] → the enrich
  queue's existing concurrency applies: up to `MELLIFERA_ENRICH_WORKERS`
  (default 4) concurrent ffmpeg encodes share the box and can starve
  metadata work; veryfast at 1080p is roughly realtime-per-core, so a
  head chunk (600s) publishes in minutes and the pack-on-play
  `preparing` poll covers the wait honestly. Lease renewal already
  covers multi-minute jobs (packaged-playback). No new knob; an operator
  under pressure lowers workers (the existing env). A dedicated
  one-encode cap is a deliberate leaf (Open Questions).
- [Disk: HEVC→H.264 same-quality typically GROWS the file] → crf-22
  veryfast output lands ≈0.7–1.5× source for 1080p. A knob-flip wave
  (frontier over unwatched HEVC items + play-triggered heals) pressures
  `MELLIFERA_ORCH_BUDGET_GB` (60 on alatoic, ~59 GiB working set
  already). One-build-per-item caps standing disk (the transcode REPLACES
  the remux at publish); the frontier pin and `.tmp-*` immunity (the
  shipped F2/F3 fixes) prevent the churn-poisoning shape; the `budget
  below frontier working set` WARN is the operator signal to raise the
  budget before the wave, and in-flight staging (counted, never
  evictable) can transiently exceed it — bounded by one staging dir per
  running job.
- [First play after the knob flip still shows the device banner] → the
  descriptor answers the current (hvc1) build until the play-triggered
  repack lands; the honest banner fires once, the transcode runs behind
  it, the next play works. Accepted — the alternative (a read-side
  "superseded" projection) adds descriptor state to save one banner.
- [10-bit HEVC (Main10) converts to 8-bit yuv420p] → clean for SDR Main10
  (the observed library shape); BT.2020/HDR sources are NOT tone-mapped —
  washed colors are possible there. Tonemapping is explicitly out (Open
  Questions); nothing in the lane pretends otherwise.
- [Host ffmpeg without libx264] → every transcode fails at the encoder
  with the real tail reason (F4's fix makes it readable); the encode
  duties' guard (`ffmpeg -encoders | grep -q libx264`) fails the task
  honestly at the guard. The deployment image's ffmpeg carries libx264;
  no startup capability probe is added (the failure mode is loud, not
  silent).
- [A knob-flip wave delays metadata enrichment] → the streams lane and
  the metadata sources share the queue; a large unwatched-HEVC library
  drains for hours at 4 workers. Bounded by the budget (jobs stop when
  the budget refuses) and by the flow lines making the drain visible;
  accepted for v1 (Open Questions names the cap leaf).
- [Exported-surface growth] → none by construction (D7 — a field, an
  unexported predicate, unexported builders, one bool parameter on an
  existing symbol); `scripts/check.sh` is the backstop.

## Migration Plan

Deploy is a normal single-binary rollout; knob default off means the new
binary behaves byte-identically to today (the entire existing pack suite
pins the knob-off args). Enabling the lane is an operator act:
`MELLIFERA_STREAM_TRANSCODE=1` (plus budget headroom if the library is
large). Unpacked/pending HEVC items flow through the frontier; packed HEVC
builds heal on their next play; each lands as a normal build (fresh
nonce, previous evicted, descriptor follows). Rollback = unset the knob:
in-flight jobs finish or fail into the ordinary contract, and every
transcoded build keeps playing everywhere (valid H.264 HLS) — no
migration back, no artifacts to clean. No DDL, no wire change, no SPA
regen on either edge.

## Open Questions

None blocking GATE 1's re-presentation; all are deliberate leaves for the
human, each with a recommended default baked into the design as stated:

1. **Knob interplay** — the transcode knob alone opens the HEVC class
   (D1's rationale: the output is universally decodable). Confirm no
   "both knobs required" rule is wanted.
2. **Class width** — mpeg4-ASP and >8-bit h264 stay refused. Widening
   later is one predicate change (`videoTranscodable`) + class tests —
   no new machinery. Recommended: keep HEVC-only now (the proven class).
3. **Audio-gated items** — h264-video + AC-3 items keep today's opt-in
   remux (AC-3 kept). An audio-only arm (copy video, encode audio) is
   the natural follow-up. Recommended: out of scope.
4. **Encode concurrency** — queue workers as-is (recommended) vs a
   dedicated one-encode-at-a-time cap.
5. **crf default** — 22 within the requested 21–23 band (recommended);
   a builder constant, never a knob.
6. **HDR tone-mapping** — out of scope (recommended); yuv420p conversion
   only, HDR sources named in Risks.
