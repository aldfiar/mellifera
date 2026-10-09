# GATE 2 record — packaged-playback

## Verdict history

1. **Initial review: GATE-FAIL.** Reviewer re-ran all 15 box-linked probes (exit 0 each,
   `-count=1` fresh across all eight touched packages), swept every SHALL in the four
   spec deltas, audited the standards axis, and ruled on five coder judgment calls
   (all PASS). Two FAIL findings:
   - **F1** — `/media` artifact serving rejected the `t/` tail-segment subdirectory
     (`serveArtifact` split `rest` once; `t/seg-*.m4s` failed the charset guard) → every
     tail segment 404'd; any item longer than the 600 s head stopped playing at
     `#EXT-X-DISCONTINUITY`. Probes stayed green because the joints fetched playlists
     but never a tail segment over HTTP.
   - **F2** — the direct-floor scenario's probe (`54f84d49b11d57df`) was vacuous:
     `go test -run TestDirectFloor` matched no test ("no tests to run", exit 0).
   Plus two FLAGs: **F3** doc.go conflated the two `doc["streams"]` persist shapes;
   **F4** `watchState` treated a 0-position progress row as watched, against its own
   comment.
2. **Fixes** (coder return trip, internal/stream + cmd/mellifera only):
   multi-component artifact-name guard (per-component `artifactNameOK`, ext whitelist on
   the final component, Root-prefix check retained; `TestTailSegmentServe` pins
   200/401/404-traversal); named `TestDirectFloor` (206/206/200/416 + nonexistent-ffmpeg
   proving no media process); doc.go shapes corrected; `watchState` watches only
   `PositionSeconds > 0` (recency takes every row).
3. **Re-verify: GATE-PASS.** Both FAILs confirmed fixed on disk with fresh green probes;
   F3/F4 confirmed fixed; no new findings.

## Judgment-call rulings (all PASS)

- Plain-play enqueues packaging for any eligible played item — consistent with the
  frontier SHALLs (movies pack-on-play holds; negatives enforced by eligibility + lease).
- Frontier parks behind an ineligible candidate — conservative, spec-silent, self-heals.
- Mirrored cmd/mellifera snippets in the qa harness — right call (unimportable
  `package main`; drift warnings caught F4).
- chapterTitle tags.title fix — complete, cannot re-mask (unit pins the real shape).
- `streams_enabled` wire field — DTO addition only, mirror verbatim.

## Gate-notes (closed before this record)

- Token-timestamp flake class in the itests (full play-URL comparisons straddling a
  second boundary; over-fails only): fixed in both sites via stripToken pointer compares,
  `-count=3` green.
- `statPending` inflation on a lease-held EnqueuePack drop — pre-existing metadata-lane
  pattern, preserved behavior, not a regression.

## Machine instruments

- `wf change check packaged-playback`: **OK** — 15 done probes re-run green, coverage
  requirements=17 probe_backed=17 gaps=0, 1 pending (4.4, unprobeable by design).
- tasks.md: 15/15 boxes ticked (14 probe-gated + 1 `[unprobeable]`).

## Box 4.4 — manual walkthrough

Inspection-ready (reviewer): section seek = standard `currentTime` seek; chapter jump =
same mechanism over TestSections-pinned projections; eviction log line
`orchestrator: evicted artifact directory` proven by TestBudgetEviction. The
partial-head-first beat is transient by design (D-4) — walk it via the direct playlist
URL during a fresh pack (answers without `#EXT-X-ENDLIST`, then grown with it).
"Continuing past completion" is fully servable after F1 (tail segments under `t/`).

Walkthrough result: the operator approved archive without exercising the beats
individually this session — acceptance rests on the probe floor (TestPlaybackRoundTrip
drives the real graph end to end, including a tail-phase pack; TestTailSegmentServe pins
the F1 surface), the reviewer's static inspection of the four beats, and the
`-count=3`-stable itests. Individual walkthrough beats stand as deferred; the runbook
ffmpeg prerequisite below makes the walkthrough reproducible later.

Archive approval: **APPROVED by the operator, 2026-10-09.**
