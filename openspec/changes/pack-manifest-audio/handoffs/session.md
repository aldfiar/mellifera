# session — pack-manifest-audio

## State (2026-11-01, apply wave 3 dispatched)

- Seeded from live testing minutes after the playback-capability-gate
  deploy: three evidence-complete pack-lane defects (silent multi-audio
  titles — broken rendition master; honest banner never firing on
  Matroska sources — legacy composition demanded an MP4 tag; HEVC fatal
  on capable desktops — no CODECS anywhere for hls.js buffer
  composition). Full evidence in proposal.md Why (item ids, nonce,
  server traces, the sqlite item doc).
- GATE 1: proposed → human added scope (media-flow debug tracing) and
  answered the default-audio question (embedded) → amended (tracing
  group + lazy repack-on-play for legacy-layout builds) → re-presented
  → **approved by delegation**: "plan is not much different from
  previous, so approve after planner finished, task until gate 2"
  (apply runs unattended; the ARCHIVE approval stays the human's).
- Register: 5 groups, 10 tasks (9 authored + built-in git-check).
  wf_cmd: `bash "/Users/aldfiar/.claude/bin/wf"`. Machine home:
  `.tmp/pack-manifest-audio/`, receipts in its receipts.jsonl.
  Baseline full `go test ./...` green before first dispatch.
- One leaf Open Question: EXT-X-MEDIA CODECS attribute = task 1.1
  judgment (carry-when-composed recommended).
- Apply progress (4/9 authored green):
  - 1.1 green (2 runs — real defect found+fixed: ffprobe hangs on EVENT
    playlists; probeVariants now probes finalized scratch copies).
  - 1.2 green first run (single-variant unified onto rend0/; legacy
    flat-root coexistence pinned; mkdirVariantDirs).
  - 1.3 green (2 runs): 4 expected-red itests re-pointed to the rend0/
    tree incl. two same-ripple extras (TestStreamsJoint,
    TestBrokenBuildRepackSweep) via shared pbVariantPlaylist helper;
    full internal/itest package green.
  - 2.1 green first run: hevcSampleEntry(composeTag) rule split —
    publish verbatim-or-degrade, legacy composes hvc1 for non-sample
    tags; REAL Matroska fact pinned → hvc1.2.4.L120.B0 + deduped
    mp4a.40.2, descriptor-level case through Describe.
- Apply progress (8/9 authored green):
  - 1.1 green (2 runs — real defect found+fixed: ffprobe hangs on EVENT
    playlists; probeVariants now probes finalized scratch copies).
  - 1.2 green first run (single-variant unified onto rend0/; legacy
    flat-root coexistence pinned; mkdirVariantDirs).
  - 1.3 green (2 runs): 4 expected-red itests re-pointed to the rend0/
    tree incl. two same-ripple extras (TestStreamsJoint,
    TestBrokenBuildRepackSweep) via shared pbVariantPlaylist helper;
    full internal/itest package green.
  - 2.1 green first run: hevcSampleEntry(composeTag) rule split —
    publish verbatim-or-degrade, legacy composes hvc1 for non-sample
    tags; REAL Matroska fact pinned → hvc1.2.4.L120.B0 + deduped
    mp4a.40.2, descriptor-level case through Describe.
  - 3.1 green first run: master: true marker at the enrich success
    persist (failed doc stays marker-free); legacyRepackOnPlay in
    cmd/mellifera/playback.go before the OnPlay decision — PackGate
    pre-check, one queued/skipped INFO line, lease absorbs concurrent
    plays. FLAG for GATE 2: one extra line beyond the task prose —
    "orchestrator: legacy repack enqueue deferred" WARN on enqueue
    backpressure, mirroring packOnPlay's identical seam.
  - 4.1 green first run: "streams: pack published" INFO (item, nonce,
    layout, variants, audio, codecs recorded|degraded, probes count) +
    deferred-hook "streams: pack failed" WARN with kebab-stage
    vocabulary (prepare | ffmpeg-head | ffmpeg-tail | head-playlists |
    tail-playlists | master-compose | write | rename | tail-merge).
    FLAG for GATE 2: kebab-case stages (prose said "ffmpeg head") —
    keeps key=value parsing; WARN carries an "error" attr per the
    eviction-WARN precedent.
  - 4.2 green first run: Describe 8th return codecsSrc (recorded |
    legacy | none; direct answers hard-code none); "playback:
    descriptor" line gained codecs_src — one line per GET, INV4 clean;
    25 call sites adapted mechanically (7 in describe_codecs_test.go,
    not the 6 the contract named); go build/vet ./... clean after.
    COVERAGE NOTE routed to 5.1: no direct recorded/legacy src
    assertion existed — leg (c) pins legacy; fresh-pack descriptor
    line pinning recorded is a freebie there.
  - 4.3 green first run: "pack: gate" INFO at the top of PackItem
    (item, class, gate open|refusal-token, codecs rendering via pure
    packGateCodecs — "hevc Main 10, aac LC ×2", absent facts → none).
    JUDGMENT CALL documented: class = stream.Classify(ff, true) — knob
    out of the way so the class stays informative under every knob
    position; the gate field owns the knob's verdict.
- Wave 5 DISPATCHED: 5.1 (wf-qa, the @qa joint — five legs a–e over
  real packs, TestPackManifestAudioJoint; self-checks go build/vet +
  FULL internal/itest package before replying).
- Remaining: built-in git-check → commit + push everything → GATE 2
  (@wf-reviewer re-runs all duties + FULL go test ./...; watch the
  exported-symbol budget — Describe's 8th return is a value, not an
  export, so the packages should hold) → STOP for human archive
  approval.
- In parallel (separate change, held at ITS GATE 1 until this closes):
  the F5 transcode-lane proposal (HEVC-on-TV playback) is authored and
  strict-valid; re-base its two shared-requirement deltas at its GATE 1.
- Dispatch rule: real wf-* agent types on every launch; launch prompts
  carry the LITERAL wf string and zero transcribed code facts.
