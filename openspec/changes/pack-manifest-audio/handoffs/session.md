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
- Apply progress (10/10 green — ALL tasks incl. git-check):
  - 5.1 green first wf-run: TestPackManifestAudioJoint, five legs over
    real packs (a rendition master shape + codecs_src=recorded,
    b single-variant partial+byte-identical master, c Matroska legacy
    read side hvc1.2.4.L120.B0 + codecs_src=legacy, d flow line
    sequence, e lazy repack once-only with publish replacement); full
    internal/itest package self-check green (243s); OptInCodecs=true
    world documented; legs a+d share one real job (richest flow shape).
- Close sequence: committed 54350fa (the change, 41 files) + e36faac
  (transcode-lane F5 proposal folder, HELD at its GATE 1), pushed to
  origin. git-check verified green at 01:13:57Z. Pipeline 10/10.
- GATE 2 DISPATCHED (@wf-reviewer): re-runs all 10 duties --by
  wf-reviewer + FULL go test ./... -count=1 (the exported-symbol budget
  gate lives only there) + vitest + budget greps + diff-vs-delta
  traceability + the five documented flags + standards axis + handoff
  threads. Writes review.md (verdict; human-approval section stays
  pending).
- GATE 2 VERDICT: PASS-WITH-FLAGS (reviewer's own shell): 9/10 duty
  re-runs green (git-check red = uncommitted gate artifacts — by
  design); FULL go test ./... -count=1 rc 0 243.8s WITH the ac7
  exported-budget gate green inside; vitest 416 tests rc 0; validate
  --strict zero failures; budget api 12/12, enrich 11/11, stream 7/7,
  ZERO new exports; all five flags ruled OVERRIDE (evidence in
  review.md §5); standards P3-only; INV4 verified; threads clean.
  Record: review.md in this folder.
- HUMAN ARCHIVE APPROVAL: "Approve — archive & close (Recommended)"
  2026-11-01 — recorded in review.md's approval section.
- Close IN PROGRESS: artifact commit → git-check green → pinned
  archive (delta merge) → TBD police → @wf-docs → close-out notes →
  pipeline clean → deploy to alatoic (user asked mid-close: "update
  server with new version") → TV/desktop retest.
- In parallel (separate change, held at ITS GATE 1 until this closes):
  the F5 transcode-lane proposal is authored, strict-valid, committed
  at e36faac; re-base its two shared-requirement deltas at its GATE 1.
- Dispatch rule: real wf-* agent types on every launch; launch prompts
  carry the LITERAL wf string and zero transcribed code facts.
