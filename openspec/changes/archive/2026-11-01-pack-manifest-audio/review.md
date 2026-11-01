# GATE 2 review — pack-manifest-audio

Reviewer: @wf-reviewer · 2026-11-01 · HEAD e36faac (branch feature/tv-playback-unblock), change commit 54350fa (diffed c2e9c5a..54350fa; e36faac is the separate held transcode-lane proposal, not part of this diff).

## Overall verdict: PASS-WITH-FLAGS

All five pre-declared flags ruled OVERRIDE (accepted judgement calls, no code change
required); every axis green. The only red anywhere is the git-check re-run, which is
gate-ceremony residue, not change content (see its section). Nothing blocks archive
approval.

## 1. Duty re-runs (wf pipeline verify … --by wf-reviewer)

| Task | Result | Evidence |
|---|---|---|
| 1.1 | green | `verify: ok - task 1.1 [exit 0 in 6525ms]` |
| 1.2 | green | `verify: ok - task 1.2 [exit 0 in 3733ms]` |
| 1.3 | green | `verify: ok - task 1.3 [exit 0 in 6937ms]` |
| 2.1 | green | `verify: ok - task 2.1 [exit 0 in 3132ms]` |
| 3.1 | green | `verify: ok - task 3.1 [exit 0 in 2362ms]` |
| 4.1 | green | `verify: ok - task 4.1 [exit 0 in 3188ms]` |
| 4.2 | green | `verify: ok - task 4.2 [exit 0 in 1244ms]` |
| 4.3 | green | `verify: ok - task 4.3 [exit 0 in 306ms]` |
| 5.1 | green | `verify: ok - task 5.1 [exit 0 in 365ms]` (cache hit — inputs unchanged since acceptance) |
| git-check | RED — gate-ceremony residue only | see §8 |

Post-re-run `wf pipeline status`: 9/10 green + git-check red as above; all authored
rows cmd-match green.

## 2. Full suite (the gate anchor)

- `go test ./... -count=1` → **rc 0**, 243.8 s wall. Carries the exported-budget gate
  (`TestWeb_Integration`/ac7 via the full suite, per loop memory) — it ran and passed
  inside this suite.
- `cd web && npx vitest run` → **rc 0**, 31 files / 416 tests, 5.95 s. web/ is
  untouched by this diff (confirmed: no web/ path in `git diff --stat c2e9c5a..54350fa`).
- `openspec validate pack-manifest-audio --strict` (pin 1.14.0) → "Change
  'pack-manifest-audio' is valid", rc 0, zero failures.

## 3. Exported-symbol budget

`grep -E '^[[:space:]]*(func|type|var|const) [A-Z]'` over non-test, non-generated
files: **internal/api 12 (≤12), internal/enrich 11 (≤11), internal/stream 7 (≤7),
cmd/mellifera 0**. The diff adds **zero** exported symbols (grep over
`git diff c2e9c5a..54350fa -- '*.go' ':(exclude)*_test.go'` for added exported
decls: no matches). Describe's 8th return is a value (`codecsSrc string`,
internal/stream/describe.go:121 — a method, not a new export); the source tokens
`codecsSrcRecorded/Legacy/None` are unexported consts (describe.go:152-156).

## 4. Delta traceability (every promised scenario → code + pinning test)

ADDED "Master playlist on every pack" (internal/stream/master.go new, pack.go):
- Rendition master: `composeMaster` (master.go:52) — pinned by
  internal/stream/master_test.go (one EXT-X-STREAM-INF, EXT-X-MEDIA "aud" group,
  unique NAMEs, exactly one DEFAULT=YES on line 0, BANDWIDTH/RESOLUTION/CODECS/AUDIO
  attrs) + joint leg (a) over served bytes.
- Single-variant master: `variantLayout(0)` → rend0 (pack.go:143-148), muxed CODECS
  via `muxedCodecs` (master.go:180) — pinned pack_test.go TestPackLane + joint leg (b)
  (root master over rend0/, play URL unchanged).
- Partial build mounts with the master from the first byte: composed into tmp before
  the publish rename (pack.go:265-268) — pinned TestHeadFirst + joint leg (b)
  (partial master 200 with tail blocked; byte-identical across the merge).
- Uncomposable codecs keep the shape: `codecs == nil` branch drops CODECS only
  (master.go:57-61, 87-91) — pinned master_test.go degraded subtest + flow-log
  `codecs=degraded` case (mpeg4 fixture).
- Legacy layouts keep validating and serving: ValidateBuild/tokenizePlaylist
  untouched — pinned media_test.go:777 `legacy_flat_root_layout_keeps_validating_and_serving`
  (validates, serves tokenized, bytes never rewritten) + joint leg (e) replacement arc.

ADDED "Lazy repack of legacy-layout builds":
- Marker written on success persist only: internal/enrich/streams.go:126-133 — pinned
  internal/enrich streams_test.go TestStreamsMasterMarker (success carries master:true;
  BOTH failure persists — real failure and policy refusal — stay marker-free).
- Play-verb trigger: `legacyRepackOnPlay` (cmd/mellifera/playback.go:96) reads only the
  stored doc; one enqueue through the ordinary path; lease absorption unchanged —
  pinned playback_gate_test.go TestPlayLazyRepack (stale enqueues once + ONE queued
  line; current never; gate-closed ONE skip line, no enqueue, no ledger row) + joint
  leg (e) end to end (202 queued:true → old build serves while the tail is gate-blocked
  → fresh nonce + marker + exactly one build dir → second play: 200, queued:false, zero
  log lines, packCalls==1, queue idle, nonce unmoved).

ADDED "Pack flow observability":
- Job-start line: `logPackGate` (cmd/mellifera/playback.go:178) — pinned
  cmd/mellifera/pack_gate_log_test.go (6 knob×class cases incl. knob-off
  opt_in/gate=codec_not_opted_in; poisoned-filename INV4 negative; pure-render edge
  table).
- Publish line: pack.go:107-117 — pinned internal/stream/pack_flow_log_test.go
  (single-variant: variants=1 audio=0 probes=1 codecs=degraded AND whole-capture
  one-line count; rendition: variants=4 audio=3 probes=4 codecs=recorded).
- Failure WARN with stage: deferred WARN + `stageErr` (pack.go:64-72, stage-tagged
  returns) — pinned pack_flow_log_test.go failed subtests (stage=ffmpeg-head,
  stage=ffmpeg-tail; no published line on failure).
- Gate-refused stops: PackGate pre-check before Pack (main.go:220-226) — pinned
  TestPackItemGateRefusal (Pack never called ⇒ no publish line; PolicyRefusal token).
- Sequence/order + INV4 negatives: joint leg (d) (gate before publish, 1/1 lines, no
  "seg-" chatter, no token=/media prefix in the window).

MODIFIED "Playback descriptor and verb split" — the delta's new content is the HEVC
sample-entry rule + its scenario:
- `hevcSampleEntry` (codecs.go:116): publish path verbatim (foreign tag degrades —
  codecs_test.go:51), legacy path composes hvc1 (codecs_test.go:97 REAL Matroska
  shape "[0][0][0][0]" Main 10 level 120 → hvc1.2.4.L120.B0; :104 Rext still
  degrades; :105 missing level degrades); descriptor-level in describe_codecs_test.go;
  joint leg (c) over a real pack whose namespace is rewound to pre-record
  (codecs == [hvc1.2.4.L120.B0, mp4a.40.2] deduped, build still serves).

MODIFIED "Playback decision log" — the codecs_src field:
- Describe 8th return threaded through the ONE production caller
  (cmd/mellifera/decision_log.go:47-51) onto the same single line
  (decision_log.go:85-91) — pinned decision_log_test.go (codecs_src per case, incl.
  none; one-line-per-GET count kept) + joint: leg (a) pins codecs_src=recorded
  (joint_test:790), leg (c) pins legacy (:1102).

No code behavior beyond the delta exists outside the five flags below.

## 5. Flags — rulings

1. **3.1 extra WARN "orchestrator: legacy repack enqueue deferred" — OVERRIDE
   (accepted).** Mirror of packOnPlay's identical seam verified:
   playback.go:70-74 `slog.Warn("orchestrator: pack-on-play enqueue deferred", "item", …, "error", err)`
   vs the new playback.go:103-105 — same family, same attrs, same contract comment.
   Without it a queue-full legacy repack is silent, breaking "the flow reads from
   logs alone".
2. **4.1 kebab-case stages — OVERRIDE (accepted).** Stage values are log vocabulary,
   not wire contract; kebab keeps `stage=` single-token parseable (pinned:
   stage=ffmpeg-head / ffmpeg-tail in pack_flow_log_test.go). The WARN carries an
   "error" attr per the eviction-WARN precedent. Spec says only "naming the failing
   stage".
3. **4.3 `Classify(ff, true)` — OVERRIDE (accepted).** Knob-open class keeps the
   class field informative under both knob positions (knob-off reads class=opt_in
   gate=codec_not_opted_in — pinned hevc_knob_off case, pack_gate_log_test.go:62);
   the gate field owns the knob's verdict; documented in logPackGate's comment
   (playback.go:163-175) and the test's.
4. **4.2 seven Describe sites vs six named — OVERRIDE (accepted).** Mechanically:
   describe_codecs_test.go had 6 `.Describe(` sites before, 7 after; zero test
   functions added or removed — an existing site the prose miscounted, adapted for
   arity only ("assertions green unchanged apart from the arity" holds; 4.2 duty
   green). Coverage note discharged: recorded pinned by joint leg (a) (:790) +
   decision-log table; legacy by leg (c) (:1102); none by decision_log_test.go.
5. **5.1 OptInCodecs=true + legs (a)/(d) sharing one job — OVERRIDE (accepted).**
   Both documented in-file: the knob comment at the assignment ("leg (c)'s pack runs
   through the gate over the Matroska HEVC facts, which only the opt-in knob admits;
   the h264 legs are open under either position") and the shared-window comment at
   the flowWindow capture ("leg (d) asserts over this same job's captured log
   window"). The knob is required (hevc facts through PackGate); sharing the job
   exercises the flow lines over the exact build leg (a) asserts; the window is
   scoped by log.mark().

## 6. Standards axis (code-smells / coding-principles over the diff)

No P0/P1 findings. INV4 verified across every new log line and capture test
(poisoned-filename pin; token=/media-prefix negatives in all flow/decision
assertions). One-line-per-moment rules pinned incl. a whole-capture line count.
Dead code: none — buildCodecs fully replaced by the pure composeCodecs (probe I/O
moved to probeVariants; pure-core/thin-shell improved); probe scratch copies and the
tail-phase master are removed, never published. DRY done right: hevcSampleEntry /
hevcCodecString extraction actually shrank codecString (47 → 39 lines) while sharing
the table across publish and legacy paths. No new exports; no stubs.

Judgement-call findings (P3, no action required at gate):
- **Function length** (code-quality 30-line guideline): composeMaster 45 (new),
  packGateCodecs 46 (new), Pack 62 (was 41 — grew by the defer WARN + publish line),
  packInto 44, packTail 39, composeCodecs 31. Cohesive orchestration/formatting
  bodies; the file's existing register already runs long (renditionArgs 44,
  sweepIntegrity 49 pre-existing). Consistent with the package's baseline.
- **PackGate computed twice per pack job** (main.go closure: once for the log line,
  once inside packGateRefusal; mirrored in the itest harness). Pure function over map
  facts — negligible; matches the task prose's "a fresh stream.Classify outcome".
- **itest mirrors of the cmd closures** (pmaPackOnPlay/pmaLegacyRepack/pmaPlaybackGET/
  pmaGateLine): duplicated knowledge bounded by an import constraint (cmd/main is
  unimportable from internal/itest), each mirror names its production twin, and the
  cmd-side slog pins catch drift — the repo's established joint pattern
  (TestPlaybackCapabilityGateJoint precedent).

## 7. @qa check

Task 5.1's `qa:` entry names
tests/internal/itest/pack_manifest_audio_joint_test.go::TestPackManifestAudioJoint.
The file exists (internal/itest/pack_manifest_audio_joint_test.go, 1273 lines) and
TestPackManifestAudioJoint ran green in this review's own 5.1 re-run (and inside the
full suite). The register's `tests/…` spelling is the grammar's shape; the six-slot
file documents the real node path.

## 8. Threads and git-check

- Handoff inboxes (pack-manifest-audio): wf-coder, wf-qa, wf-reviewer, wf-planner —
  all `0 open item(s)`, rc 0. No blocking threads.
- git-check re-run: RED — `tree not clean (untracked included): M
  openspec/changes/pack-manifest-audio/handoffs/session.md`. Ruling: **not a defect
  of the change.** The dirt is the session's own GATE-2 cadence write to the handoff
  record (plus this review.md, which by loop design is written before close); the
  change itself is fully committed at HEAD, and upstream sync was verified
  independently: `git rev-list --count @{u}..HEAD` = 0 against
  origin/feature/tv-playback-unblock. The last green git-check receipt (01:13:57Z,
  pre-cadence-write) stands for the committed tree. The close sequence re-runs
  git-check after committing review.md + session.md and will go green — no action
  beyond the ordinary close.

## Human archive approval

Approved — "Approve — archive & close (Recommended)" (2026-11-01,
AskUserQuestion answer). The close proceeds: archive, delta merge,
docs pass, close-out, pipeline clean, deploy.
