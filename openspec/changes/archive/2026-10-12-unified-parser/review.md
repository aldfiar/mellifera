# Gate record: unified-parser

Date: 2026-10-12
Reviewer: @wf-reviewer (GATE 2), independent re-runs by the session.

## Verdict

**PASS-with-FLAGs** — all 8 requirements PASS on the spec axis; probe axis green;
standards axis clean. Two title-field FLAGs adjudicated NON-blocking and routed
to `docs/backlog.md` (combined row "tv-parser title edges around the shared
Result"). The operator approved archive on 2026-10-12.

## Probe evidence

- `wf change check unified-parser` rc=0: probes **9 done (re-run), 0 pending**;
  coverage requirements=8 probe_backed=8 unprobeable=0 gaps=0.
- Probe ids, all re-run EXIT=0 by wf check and spot-re-run by reviewer/session:
  499a5238610f2219 (1.1 shared grammar), 65f00f37dc65e786 (1.2 emission),
  a5362e81143f9a52 (2.1 serial adapter), 7646c4fa3a9bee99 (2.2 namespace
  emission), ce462e11edef346d (2.3 tv adapter), ebe5aa0c28353849 (2.4 sidecar
  dissolution), efa169055d999c81 (3.1 season_episode composite),
  ea1eb2c2f359f9a5 (4.1 mirror corpus), 16778b8ef0faece4 (4.2 joint e2e —
  ffprobe-gated, real subprocess graph).
- Probe-id integrity: 22/22 scenario ids across the three deltas recompute to
  their markers (wf-native walk_requirements + scenario_sha256). NOTE: 9 ids
  were RE-MINTED mid-loop by the session — the planner reworded ADDED scenario
  text after minting; pre-apply `change check` showed OK only because wf fails
  id desyncs on DONE boxes. The re-mint (specs' `id=` markers + tasks.md refs,
  then reopen+retick) left zero desyncs. Recorded as a loop-recipe lesson:
  re-run the id audit after ANY post-mint scenario edit, before ticks.

## Corrections applied during apply

- None required post-review. The qa group added adversarial pins rather than
  patching code; the reviewer adjudicated their findings (below).
- Coder deviations adjudicated: (1) episode namespace exact-count row 2→3 keys
  — ACCEPT (D-2 emission supersedes; leak-guard kept); (2) end-anchored
  release_group window — covered by FLAG-1; (3) sidecar bracket-only flip
  serial-level → episode-linked — ACCEPT (spec-mandated by the sidecar delta);
  (4) token-only stem title fallback — covered by FLAG-2.

## FLAGs (non-blocking → backlog)

- **FLAG-1 tv dash-forms**: `Show.S01E01-E02.mkv` → title "Show -E" (shared
  episodeTitle cuts trailing "02" but not the dash-letter prefix);
  `Show-S01E02.mkv` fabricates release_group "S01E02" (end-anchored window).
  Pinned in `TestMatchAdversarialEdges`; season/episode/apply/confidence all
  correct. Fix is adapter-local (~10 lines).
- **FLAG-2 tv token-only stems**: `Show/S01E01.mkv` → title "S01E01" (shared
  token-echo fallback pre-empts the parent-dir fallback; confidence 1.0).
  The more impactful of the two (flat layouts are common). Adapter-local fix:
  token echo → titleless → restore parent-dir fallback.

## Standards

- File budgets respected (largest touched 463 < 500; pkg/releasename/parse.go
  391). gofmt/vet/go build clean. Brand-neutrality probe-enforced in pkg/.
- INV-namespace preserved (parsers Merge into sources[id] only; core untouched).
- P3 nits (non-blocking): serial-parser/releasetags.go is a 12-line pointer
  comment (delete on next plugin touch); parse_test.go unused tc.backing field;
  pre-existing stale doc comment serial-parser/parser.go:45.

## Approval

Operator approval for archive recorded 2026-10-12 ("approve" on the GATE 2
summary). Archive executes `openspec archive unified-parser --yes` after this
record; `release-name-parsing` becomes a living spec.
