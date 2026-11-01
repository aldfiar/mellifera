# Design

## Context

See proposal.md — Why. The diagnosis is complete (live testing 2026-11-01,
minutes before this change was authored); this design grounds the seams on
the working tree at `c2e9c5a` (verified through the live wf index, 2026-11-01).

The lane publishes two shapes today (`internal/stream/pack.go`
`variantLayout`): a legacy single-variant build whose `index.m3u8` at the
build root IS the media playlist (segments and `init.mp4` beside it), and a
rendition build where ffmpeg writes the root master
(`-master_pl_name index.m3u8`) plus one variant playlist per `rendK/`
directory. Neither shape is correct HLS for a player that composes its
MSE SourceBuffers from playlist attributes:

- **Finding A — the rendition master is double-listed.** ffmpeg's
  `-var_stream_map` master writes EVERY `%v` output as an
  `EXT-X-STREAM-INF` variant (rend0 video-only, rend1–4 audio-only, rend1
  with no CODECS/RESOLUTION) AND ALSO emits the audio group as four
  `EXT-X-MEDIA TYPE=AUDIO` entries all `DEFAULT=YES`. Evidence: nonce
  `07c5a00111e41597`, item `itm_4_4abdae6f23167012` (built 23:16 Oct 30);
  hls.js picked variant rend0 — a video-only media playlist — and the
  server trace shows master 200 → rend0/index.m3u8 200 → rend0 segments
  only, zero 4xx: the player never requested any audio rendition. Every
  multi-audio title plays video-only, silently.
- **Finding B — the legacy codec composition dies on Matroska facts.**
  `codecs.go` `codecString`'s hevc branch (`:75-88`) requires
  `codec_tag_string ∈ {hvc1, hev1}` — the MP4 sample-entry tag. The stored
  SOURCE facts for the prod items are Matroska: item
  `itm_2_e76d698d4a147d7c` carries tag `[0][0][0][0]` (hevc profile
  "Main 10", level 120 as a JSON number, two aac LC streams), so
  `legacyCodecs` composes nil for every Matroska-sourced pack → the
  descriptor answers no `codecs` → the SPA's pre-mount probe (playback-
  capability-gate D3) is skipped → the TV keeps meeting its cryptic fatal
  instead of the honest banner.
- **Finding C — flat single-variant packs carry no CODECS anywhere.** A
  single-variant build's `index.m3u8` is a bare media playlist; hls.js then
  builds the SourceBuffer without the audio codec for HEVC media playlists
  and every audio append mismatches → fatal
  (`mediaError`/`mediaSourceRequiresReset`, detail
  `PipelineStatus::CHUNK_DEMUXER_ERROR_APPEND_FAILED`) on EVERY device —
  desktop Chrome 155 and the TV alike. This falsifies the closed design
  playback-capability-gate's deferral (below).

Playback effect, stated once (the GATE 1 question "does this fix video
playback"): the fix's gains are BY DEVICE CAPABILITY. Capable devices —
desktop, and the TV for H.264/AAC titles — get full video+audio from the
corrected manifests; the TV's HEVC titles are unplayable by ANY remux and
keep the honest device banner; the F5 transcode lane remains the only path
to TV HEVC playback. The lazy repack below (GATE 1 scope addition) exists
because the silent titles' builds would otherwise NEVER repack: the
integrity sweep only requeues unhealthy builds (legacy layouts validate
fine), the frontier only requeues failed/pending, and retry only answers
failed states — `itm_4_4abdae6f23167012` would stay video-only forever.

The publish-time codec record (playback-capability-gate D2, `buildCodecs`)
probes each variant playlist after the build completes and composes the
RFC 6381 strings through a pure, strictly fail-open table; `Build.Codecs`
rides to the descriptor, which also keeps the read-side `legacyCodecs`
fallback for pre-record builds. The logging landscape this change's
observability half rides (GATE 1 scope addition, 2026-11-01): the binary
uses slog's DEFAULT logger — no `slog.SetDefault`, no log-level knob, no
`MELLIFERA_LOG_LEVEL` (grounded by grep over `cmd/mellifera` and
`internal/`) — so the flow rides compact INFO lines with stable prefixes,
exactly the decision-log pattern (`cmd/mellifera/decision_log.go`: ONE
`playback: descriptor` INFO line per descriptor GET, item/mode/state/
reason, INV4-clean, emitted in the composition root because the closure
already holds the values). `Describe` has exactly ONE production caller
(`decision_log.go:47`) plus mechanical test call sites; the eviction lines
already exist (`streams: evicted artifact directory`,
`orchestrator: evicted artifact directory`) and keep their shape. The
integrity guard (`validate.go`)
walks every published `.m3u8` and resolves every referenced URI relative to
its own playlist — layout-agnostic by construction. The serving surface
(`serve.go` + `tokenizePlaylist`) rewrites plain URI lines and `URI="…"`
attributes alike — a master's variant refs and `EXT-X-MEDIA` URIs tokenize
with zero code change. `internal/stream` sits at 7 exported symbols against
the repo gate's warn (>8) / fail (>12) bars.

## Goals / Non-Goals

**Goals:**

- Every pack serves a master playlist a compliant player composes
  correctly: video-only variants with CODECS, audio ONLY as an
  `EXT-X-MEDIA` group with unique NAMEs and exactly one `DEFAULT=YES`.
- No capable device ever fatal-fails on a fresh pack because the playlist
  omitted the codecs its buffer needs (finding C dies at the source).
- Pre-record Matroska packs answer honest `codecs` read-side (finding B),
  so the SPA probe runs and incapable devices see the banner, not a fatal.
- The pack flow is traceable from logs alone (GATE 1 scope addition): one
  stable line vocabulary names the classify/gate verdict, the codec facts,
  the layout decision, the publish result, and — on the descriptor read —
  WHICH codecs source served, so `codecs: none` is distinguishable from a
  bug without opening sqlite (the 2026-11-01 debugging session needed
  three ssh round-trips to learn "recorded absent, legacy failed").
- Existing published builds keep playing and keep validating during the
  transition (repack heals them; nothing rewrites published bytes).

**Non-Goals:**

- No transcode lane (F5 stays open): the master makes capable devices play;
  an actually-incapable device still gets the honest banner + beacon. F5
  remains the only path to actually playing on those.
- No SPA change: the descriptor's `codecs`, the pre-mount probe, the
  banner, and the beacon keep their shapes; no openapi or embedded-build
  regen (no wire change — `codecs` already exists on the descriptor).
- No read-side rewriting of legacy builds' playlists: published bytes stay
  published; the integrity guard and the serving surface simply keep
  accepting both layouts.
- No budget, cooldown, knob, or ledger change; no enrichment or cmd change
  (`Pack`'s signature and `Build`'s shape are untouched).

## Decisions

- **D1 — The lane composes the master; ffmpeg's never survives to a
  published build.** A new unexported composer (beside the lane's existing
  playlist surgery) renders the build root's `index.m3u8` from the variant
  layout plus the probed facts: exactly one `EXT-X-STREAM-INF` line (the
  lane always publishes exactly one video variant — `-map 0:v:0`) carrying
  `CODECS` (composed through the existing publish-time table), `BANDWIDTH`
  (probed bit_rate, a conservative constant fallback), and `RESOLUTION`
  (carried when probed), followed by the audio renditions as
  `EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud"` entries — unique NAMEs (the
  stream's language fact when present, else a stable `Audio K` ordinal),
  `LANGUAGE` when known, `URI="rendK/index.m3u8"`, `DEFAULT=YES` on the
  embedded audio alone — **settled at GATE 1 (2026-11-01): the embedded
  audio is the pack's primary track and the sole default; language-based
  defaulting was declined** — the voiceovers
  `AUTOSELECT=YES,DEFAULT=NO`. The single-variant master is the degenerate
  case: one `EXT-X-STREAM-INF` whose CODECS names video and muxed audio
  (`CODECS="<video>,<audio>"`), no `EXT-X-MEDIA` group. Declined:
  post-processing ffmpeg's master line by line — the double-listing is
  ffmpeg's shape, and parsing it back is more code than composing the
  known truth directly.
- **D2 — The master composes at the head-first publish, from the head
  playlists.** `packInto` already reads every head playlist into memory
  before publishing; the same moment probes them (one ffprobe per variant
  — the probe target moves from the completed build to the head playlists
  in tmp; the streams are identical, the init segments and muxer settings
  do not change between phases) and composes BOTH the `Build.Codecs`
  record and the master. The master is written into tmp before the atomic
  rename (overwriting ffmpeg's rendition master), so the partial build
  mounts with audio from its first served byte; the tail merge keeps
  rewriting only the variant playlists — the master is complete at birth
  and byte-identical for a given published build (the merged spec's
  byte-identity rule). `buildCodecs` reshapes accordingly; `Build`'s
  contract (fail-open nil record, pack never fails) is unchanged. When the
  probe or the table composes nothing, the master still publishes with the
  corrected SHAPE minus the CODECS attribute — finding A is fixed even for
  an unprobeable build, and an attribute-less master degrades to exactly
  today's mount behavior (fail-open, never a failed pack).
- **D3 — The single-variant build publishes the rendition shape's
  directory layout.** `variantLayout(0)` returns `rend0` and the
  single-variant arg builders write the media playlist, `init.mp4`, and
  segments under `rend0/`; the build root holds ONLY the composed master.
  One layout for every fresh pack — the guard, the serving surface, and
  the rendition plumbing (`../t/rend0/` tail prefix) already speak it, and
  the master-vs-media ambiguity at the build root disappears by
  construction. Declined: keeping segments at the root and renaming the
  media playlist — a second layout to teach every consumer, for one less
  `filepath.Join`. `play_url` keeps naming `index.m3u8` (now the master);
  hls.js loads the master, then `rend0/index.m3u8`, and live-polls the
  growing media playlist exactly as the head-first contract requires.
- **D4 — The legacy read-side composition composes the sample entry;
  the publish path keeps reading it.** `codecString`'s hevc branch splits:
  the publish-time table reads `codec_tag_string` from the PROBED ARTIFACT
  verbatim (`hvc1`/`hev1` accepted; a foreign tag there still degrades —
  on a real fMP4 artifact a foreign tag means something is genuinely
  wrong, and fail-open remains the rule). The LEGACY path (stored SOURCE
  facts) composes the tag itself: a source whose tag already names a
  sample entry (`hvc1`/`hev1` — an MP4 source whose entry stream-copy
  preserves) rides verbatim; anything else composes as **`hvc1`** — the
  de-facto widely-accepted entry. The approximation is honest because the
  fact it replaces is not knowable: a Matroska stream's `codec_tag_string`
  (`[0][0][0][0]`) is the Matroska container's tagging convention, not a
  sample entry, and which entry the muxer will actually write is decided
  at remux time. `hvc1` is the safe default — both entries decode the same
  bitstream, `hvc1` is what Apple/most toolchains emit, and a wrong guess
  between the two costs a strict player nothing (both are declared HEVC
  Main-profile entries); the alternative — answering no codecs for every
  Matroska pack — is precisely the finding-B defect. Table-tested with the
  REAL Matroska fact shape: hevc, tag `[0][0][0][0]`, profile "Main 10",
  level 120 (JSON number), two aac LC streams → `hvc1.2.4.L120.B0` +
  `mp4a.40.2` (deduped).
- **D5 — Repack heals; the read side keeps legacy builds honest.** Builds
  published before this change keep their on-disk layout (flat
  single-variant root, or ffmpeg's double-listed rendition master). The
  lane never rewrites published bytes; `ValidateBuild` and the serving
  surface already accept both layouts (the guard walks every playlist and
  resolves per-playlist; tests pin it). Old builds heal only by repack —
  the frontier's watch re-enqueue, the integrity sweep, or a manual retry
  publish a fresh nonce in the new shape, and the eviction machinery from
  playback-capability-gate (one current build per item) retires the old
  layout atomically with the document write. Meanwhile the descriptor's
  legacy composition (D4) keeps pre-record Matroska items banner-honest,
  and ffmpeg-master items (finding A) stay broken-but-playing until their
  repack — accepted: silent video-only is today's state for those, and the
  alternative (serve-time rewriting) breaks the published-bytes-are-
  published discipline the token/eviction design rests on.
  **GATE 1 scope addition — the lazy repack-on-play half (D8's mechanism,
  kept in D5 because it completes this heal story):** left there, the
  silent builds would never heal — no automatic path requeues a healthy
  complete build. The play verb's pack-on-play decision (the `!retry`
  branch of the Play closure, `cmd/mellifera/main.go` beside `packOnPlay`)
  gains one condition: an item whose stored namespace is `state: complete`
  with a nonce but WITHOUT the build-generation marker is a legacy build →
  the play enqueues exactly ONE repack through the ordinary
  `EnqueuePack`/`PackGate` path. The marker: `doc["streams"].master ==
  true`, written by the streams lane's success doc (`workStreams` — every
  build this lane publishes carries the composed master, so the key is
  honest by construction; one map key in enrich, no `Build`/`PackOutcome`
  field, no exports). Chosen over re-reading the playlist at play time
  (the coordinator's preference, and honest: absence of the marker ⇔
  predates the master lane, by construction) and over a library-wide
  sweep wave (declined — the churn lesson `2e5ccff`: one enqueue per
  stale build, keyed on the token-stable descriptor identity; plays
  landing while the repack is pending or running are absorbed by the
  lane's per-item lease, and the marker flips at the success persist,
  closing the window). A gate-closed legacy item (knob-off HEVC) does NOT
  demote: the decision pre-checks `PackGate` (the retry-path precedent)
  and a closed verdict skips the enqueue with ONE INFO refusal line (the
  sweep-refusal pattern) — the old build keeps serving, no state change,
  no ledger row; the residual knob-flip-between-decision-and-build race
  is the closed change's accepted D4 story (recovery: the frontier/retry
  once the knob opens). A repack FAILURE inherits the lane's ordinary
  failure contract (state `failed` + retry affordance; the old build's
  directory is orphaned until budget eviction) — accepted and named in
  Risks. No serve-time rewriting, no sweep wave, zero exports; the
  flow's log line rides the D7 vocabulary ("orchestrator: legacy repack
  queued", beside "orchestrator: pack-on-play").
- **D6 — Zero new exports.** The composer, the per-variant probe
  collector, and the legacy tag rule are unexported helpers; `Pack`,
  `Build`, and every other public signature are untouched.
  `internal/stream` stays at 7 exported symbols (warn bar >8) — the repo
  gate (`make check`, exported-symbol count per package) is the backstop.
  The one deliberate exception shape is Describe's own signature: D7
  threads the codecs source through it as an 8th return value — a plain
  string, no new exported identifier, the exact pattern the closed change
  used for `stateReason`.
- **D7 — The pack flow reads from logs alone (GATE 1 scope addition).**
  No log-level knob exists, so the flow rides the decision-log pattern:
  compact INFO lines with stable prefixes, one per moment that matters,
  never per segment. The vocabulary, pinned end to end:
  - **Job start — `pack: gate`** (the cmd `PackItem` closure, the seam
    already holding ffprobe + the knob): item, `class` (a fresh
    `stream.Classify` outcome — direct | pack | opt_in | direct_only —
    all already exported), `gate` (`open` or the refusal token), and one
    compact rendering of the stored codec facts (video codec/profile,
    audio codecs with multiplicity — an unexported cmd helper; pure string
    building). A refusal logs the token here and the flow ends; enrich
    stays line-silent as today (the persisted failed state is its record).
  - **Publish — `streams: pack published`** (inside `Pack`, at the success
    return, where layout and probe facts are in hand): item, nonce,
    `layout` (`single-variant` | `rendition`), `variants` (count),
    `audio` (EXT-X-MEDIA member count), `codecs` (`recorded` |
    `degraded`), `probes` (the ffprobe invocation count — the per-variant
    cost the flow's reader can weigh). `Pack`'s error path logs one WARN
    (`streams: pack failed`, the stage) so a flow never dies silently
    between the gate line and the persist.
  - **Descriptor read — the existing `playback: descriptor` line gains
    `codecs_src`** (`recorded` | `legacy` | `none`): Describe threads the
    source out as an 8th return value (`describeCodecs` reports which half
    answered — the recorded namespace, the read-side legacy composition,
    or neither), the closure logs it, and `codecs: none` becomes
    distinguishable from a bug. Declined: re-deriving the source in cmd
    from the raw doc (a second copy of the recorded-wins rule — the drift
    the closed change's one-vocabulary decision warns against).
  - **Eviction** — the existing lines keep their shape; their vocabulary
    is already aligned (`streams:`/`orchestrator:` prefixes, path naming
    the nonce).
  INV4 holds everywhere: no token value, no play URL — item ids and nonces
  are artifact identifiers (the eviction lines already log full paths),
  and the descriptor line names the SOURCE, never the codec strings'
  consumers' credentials. No per-segment, no per-request-extra lines: the
  flow costs one line per pack job, one WARN on failure, and one field on
  the existing descriptor line.

## Interfaces

No wire, signature, or cross-package contract changes. The change's whole
surface is inside `internal/stream` plus the `internal/itest` assertions
that observe it:

- **Build-root playlist shape (published bytes)** — every fresh pack's
  `index.m3u8` at `Root/<itemID>/<nonce>/` is a master: one
  `EXT-X-STREAM-INF` variant (the video rendition; single-variant builds:
  the video+audio muxed variant, `CODECS="<video>,<audio>"`; rendition
  builds: video-only, `CODECS="<video>"`), `BANDWIDTH` always present,
  `RESOLUTION` when probed, `CODECS` when composable; the audio renditions
  ONLY as `EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud"` members with unique
  NAMEs and exactly one `DEFAULT=YES` (the embedded audio). Media
  playlists, `init.mp4`, and segments live under `rendK/` on every fresh
  build (single-variant included); the tail merge keeps its `../t/rendK/`
  prefix mechanics.
- **`Build` / `PackOutcome` / descriptor** — unchanged. `Build.Codecs`
  keeps its order (video first, then audio in rendition order, deduped)
  and its fail-open nil; the probing moment moves from after-publish to
  the head playlists (D2).
- **Legacy layout acceptance** — a build directory whose root playlist is
  a media playlist (or whose root master is ffmpeg-shaped) keeps
  validating, serving, and describing exactly as today; nothing
  distinguishes it on the wire.
- **Pack-flow log vocabulary (GATE 1 addition)** — three seams, stable
  prefixes, INV4-clean:
  - `pack: gate` (cmd, per pack job): `item`, `class`
    (direct|pack|opt_in|direct_only), `gate` (open|<refusal token>),
    `codecs` (compact stored-facts rendering).
  - `streams: pack published` (stream, per successful Pack): `item`,
    `nonce`, `layout` (single-variant|rendition), `variants`, `audio`,
    `codecs` (recorded|degraded), `probes`; the error path logs one
    `streams: pack failed` WARN.
  - `playback: descriptor` (cmd, existing line) gains `codecs_src`
    (recorded|legacy|none); `Describe` grows the 8th return value (plain
    string, the stateReason pattern — the ONE production caller is
    `decision_log.go`, plus mechanical test call sites).
  - No wire change: log lines carry no token, no play URL, and no new
    descriptor field.

## Risks / Trade-offs

- [The head-playlist probe could behave differently from the
  completed-build probe] → the probed facts are the init segments' streams,
  identical across phases; the EVENT playlist (no ENDLIST) is a normal
  ffprobe input. If a probe ever fails, the record degrades to nil and the
  master publishes attribute-less — exactly today's fail-open, never a
  failed pack.
- [ffmpeg's tail-phase master lands under `t/` via `moveTree`] → harmless
  today (nothing references it; the guard validates its refs, which
  resolve); the lane MAY remove it for hygiene — a task-level judgment,
  either way validated.
- [`hvc1` might differ from the artifact's actual entry on legacy
  Matroska packs] → accepted by design (D4): both entries decode the same
  bitstream; the approximation only feeds the SPA's mount probe and the
  master's CODECS on future repacks, and a mismatch degrades playback
  nowhere — an incapable device was already fatal-ing, and the banner is
  strictly more honest than today's silent skip.
- [Layout move re-points on-disk assertions in tests] → bounded and named:
  `internal/itest` roundtrip + codecs-joint artifact assertions, plus the
  stream package's own pack/codecs tests (duties name them); serving,
  validation, and descriptor code are layout-agnostic and unchanged.
- [Exported-surface growth] → none by construction (D6 — Describe's 8th
  return is a plain string, no new exported identifier); the gate's
  per-package count is the backstop.
- [Log volume / noise from the flow lines] → bounded by construction:
  one INFO line per pack job (plus one WARN on failure), one added field
  on the existing per-GET descriptor line, nothing per segment or per
  request; the default slog INFO level is exactly the audience these
  lines serve.
- [A failed lazy repack demotes a playing item to `failed`] → inherited
  from the lane's ordinary failure contract (`persistStreams` replaces
  the namespace; the old build's pointer drops): the item answers
  `failed` with its retry affordance instead of silent video-only, the
  old directory is orphaned until budget eviction, and a retry heals.
  Accepted — the alternative (keep-previous-on-failure) changes the
  lane's failure contract for every pack path and is out of scope; a
  repack failure is a content fact, not a layout fact.
- [Plays during a running repack re-enqueue per tick] → absorbed twice:
  the lane's per-item lease silently drops a task whose item is in
  flight, and the success persist flips the marker, closing the decision
  window — one effective repack per stale build (the 2e5ccff churn
  lesson), no new state.
- [Multi-audio titles mid-flight during the head window of a repack] → the
  partial build now mounts with audio from the first byte (D2) — strictly
  better than today, where even the partial window served the broken
  master (rendition) or the flat playlist (single-variant).

## Migration Plan

Deploy is a normal single-binary rollout; no DDL, no data migration, no
config, no wire change. Fresh packs publish the new shape immediately;
existing builds keep serving under their legacy layout until their repack
(frontier watch re-enqueue, integrity sweep, or retry — each publishing a
fresh nonce and evicting the old build per the one-current-build rule).
Matroska-sourced items gain honest descriptor `codecs` the moment the new
binary serves (read-side composition, no repack needed). Rollback =
redeploy the previous binary; fresh nonces in the new layout keep playing
(they are valid HLS masters), legacy layouts never stopped playing.

## Open Questions

None blocking the re-presented GATE 1. One deliberate leaf:

1. **`EXT-X-MEDIA` CODECS attributes** — carrying each audio rendition's
   composed codec on its `EXT-X-MEDIA` line is optional per RFC 8216 and
   helps strict players preselect; the design leaves it to the applying
   task's judgment (carry-when-composed recommended), since the finding's
   fix requires only the variant-line CODECS. (Former Open Question 1 —
   the `DEFAULT=YES` rendition — was RESOLVED at GATE 1: the embedded
   audio, folded into D1.)
