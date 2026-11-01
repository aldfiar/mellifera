# close-out — pack-manifest-audio (2026-11-01)

Seeded from live testing minutes after the playback-capability-gate
deploy; closed the same day. Three evidence-complete pack-lane defects
(all user-visible as silent or fatal playback), one GATE 1 scope
addition, applied and gated in one session under the human's delegation
through GATE 2; the archive approval stayed the human's and was given.

## What shipped

- **Master on every pack** (findings A + C): the pack lane composes the
  RFC 8216 master at every build root — rendition builds: ONE
  EXT-X-STREAM-INF video variant with CODECS/BANDWIDTH/RESOLUTION, audio
  ONLY as EXT-X-MEDIA GROUP-ID="aud" members (unique NAMEs, exactly one
  DEFAULT=YES on the embedded audio); single-variant builds unified onto
  the rend0/ tree, root = master with muxed CODECS; the master is
  written into tmp before the atomic rename so ffmpeg's double-listed
  master never survives; the codec probe moved to head-first publish
  over finalized scratch copies (fixing ffprobe's indefinite hang on
  EVENT playlists); the play URL keeps naming index.m3u8; legacy
  flat-root layouts still validate and serve untouched.
- **Legacy HEVC sample-entry composition** (finding B): publish path
  reads the probed artifact's tag verbatim-or-degrade; the legacy
  read-side composes the sample entry itself — verbatim hvc1/hev1, else
  hvc1 (the Matroska artifact `[0][0][0][0]` → `hvc1.2.4.L120.B0` +
  deduped `mp4a.40.2`). Matroska packs now answer codecs, the SPA probe
  runs, and the TV's pre-record HEVC items show the honest banner.
- **Lazy repack-on-play** (GATE 1 addition): `master: true` recorded at
  the enrich success persist (failed docs marker-free — absence is the
  signal); the play verb's `legacyRepackOnPlay` enqueues exactly ONE
  PackGate-pre-checked repack for `complete + nonce + no marker`
  builds; the lane lease absorbs concurrent plays; the old build keeps
  serving until the fresh nonce replaces it (publish-replacement
  eviction); no sweep wave, no serve-time rewriting.
- **Pack flow observability** (GATE 1 addition): `pack: gate` INFO
  (item, class via Classify with the knob held open, gate open|token,
  compact codec rendering e.g. `hevc Main 10, aac LC ×2`); `streams:
  pack published` INFO (item, nonce, layout, variants, audio,
  codecs recorded|degraded, probes count); `streams: pack failed` WARN
  with kebab-case stage (prepare | ffmpeg-head | ffmpeg-tail |
  head-playlists | tail-playlists | master-compose | write | rename |
  tail-merge); `orchestrator: legacy repack queued/skipped/deferred`;
  `playback: descriptor` gained `codecs_src` (recorded | legacy |
  none). INV4 verified with poisoned-filename pins. NO wire change, no
  SPA change, no openapi or embedded-build regen.

## Receipt record (machine home `.tmp/pack-manifest-audio/`, wiped at clean)

| Task | Outcome |
|------|---------|
| 1.1 rendition master | green (2 runs — first red on a REAL defect: ffprobe hangs on EVENT playlists; fixed via finalized scratch probes) |
| 1.2 single-variant master | green first run |
| 1.3 itest re-points | green (2 runs, both green — re-run after a helper refactor; 4 expected-red itests re-pointed + 2 same-ripple extras) |
| 2.1 legacy HEVC composition | green first run |
| 3.1 lazy repack-on-play | green first run |
| 4.1 publish flow line | green first run |
| 4.2 codecs_src on decision line | green first run |
| 4.3 job-start gate line | green first run |
| 5.1 joint itest | green first wf-run (pre-duty direct run red on a test bug — nonce-await; zero production defects; full itest package self-check 243s) |
| git-check | green; red once on the unpushed gate-record commit — pushed, green |

GATE 2: **PASS-WITH-FLAGS** — the reviewer re-ran every duty
(`--by wf-reviewer`), ran the FULL `go test ./... -count=1` (rc 0,
243.8s, the ac7 exported-budget gate green inside), vitest 416 tests
rc 0, `openspec validate --strict` zero failures; exported-symbol
budget api 12/12, enrich 11/11, stream 7/7 — ZERO new exports; all
five documented flags ruled OVERRIDE with line-level evidence (3.1's
enqueue-deferred WARN mirror; 4.1's kebab stages + error attr; 4.3's
knob-open Classify; 4.2's seven-vs-six call-site prose miscount with
the coverage note discharged by joint legs a/c; 5.1's knob-on world +
shared a/d job); standards findings P3-only (function-length register
matching the package's existing style); handoff threads clean. Human
archive approval recorded in review.md ("Approve — archive & close",
2026-11-01).

Commits: 54350fa (the change, 41 files) → e36faac (transcode-lane F5
proposal folder, held at its own GATE 1) → 81466b7 (gate record +
approval). Spec deltas merged: packaged-playback +3/~2.

## Known residue (for future passes)

- Pre-existing: gofmt-dirty internal/itest qa_display_naming_joint_test.go
  and qa_episode_titles_joint_test.go; docs debt pass (api-reference
  depth, project_structure thinness) still queued; P3 function-length
  register in internal/stream (composeMaster 45, packGateCodecs 46,
  Pack 62 — consistent with renditionArgs 44 / sweepIntegrity 49 that
  predate this change).
- Open follow-ups: **transcode-lane (F5)** — the only path to
  HEVC-on-TV playback; proposal authored and committed (e36faac), HELD
  at its GATE 1 until presented to the human; its two shared-requirement
  deltas need re-basing against the now-merged living spec.
  Infra-vs-content cooldown classification (older residue).
