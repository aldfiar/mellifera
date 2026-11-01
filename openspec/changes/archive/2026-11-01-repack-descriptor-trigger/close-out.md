# close-out — repack-descriptor-trigger (2026-11-01)

Dispatch-lane one-task change, opened and closed the same hour. Fixed
the production gap the wf-debugger verification of pack-manifest-audio
exposed: the shipped lazy repack-on-play was wired to POST /play, but
the SPA calls that verb ONLY for the failed-state retry affordance
(Player.tsx) — it mounts the player straight from the playback
descriptor's play_url, so the trigger was unreachable in production
and the 39 legacy packs stayed silent (the TV reproduced the
CHUNK_DEMUXER fatal on itm_3 with no heal).

## What shipped

- The playback descriptor closure (`playbackDescriptor`,
  cmd/mellifera/decision_log.go) now runs the SAME `legacyRepackOnPlay`
  decision the play verb runs, before composing the answer —
  byte-for-byte semantics, play-verb wiring untouched: state complete +
  a build nonce + no `master: true` marker → PackGate pre-check → ONE
  `orchestrator: legacy repack queued` (or `skipped` with the gate
  token) line and the enqueue through the shared `EnqueuePack` seam.
  The GET never blocks on the decision and still answers the current
  old build while the repack runs; the lane's per-item lease +
  EnqueuePack dedup absorb repeated GETs (never re-enqueued per
  request). Signature gained `enqueue func(string) error` and
  `optInCodecs bool` — the same seam and knob the Play closure uses.
- Spec delta: MODIFIED "Lazy repack of legacy-layout builds" — the
  trigger re-based from POST /play to `GET /items/{id}/playback`
  (merged into the living spec at archive).
- Tests: TestDescriptorLazyRepack (stale enqueues once and still
  answers; current never; gate-closed answers without enqueue + zero
  ledger rows; INV4 hard-negative), TestPlayLazyRepack green unchanged,
  TestPlaybackDecisionLog's caller asserts the decision-log GET stays
  enqueue-free.

## Receipt record (machine home `.tmp/repack-descriptor-trigger/`, wiped at clean)

| Task | Outcome |
|------|---------|
| 1.1 descriptor-path trigger | green first run (2759ms) |
| git-check | green at 83e6593 |

Deviation en route (benign, journaled): the dispatch init shorthand
scaffolded the change folder but the machine home had never been
registered — the runner ran the derived-state verb
`wf pipeline register --from tasks.md` itself (1 group, 2 tasks), then
verify went green. No hand-edited machine state.

Spot-check (session, per dispatch-lane close): diff reviewed — 1-line
call-site change, trigger before `Describe` (orchestrator line, then
the decision line), return values dropped, honest doc-comment update,
delta covers the living spec's three scenario headings, strict-valid.

Commits: 83e6593. Delta merged: packaged-playback ~1.

## Follow-ups opened by the verification (not this change's scope)

- Opus-audio item under knob=true would gate-open a hevc+opus repack —
  Classify semantics untested for that mix (check before users hit it).
- Cosmetic: three LANGUAGE="rus" audio members share NAMEs-adjacent
  labels in itm_4's master (RFC-compliant, labeling nit);
  internal/api/playback.go's INV4 wording comment claims the descriptor
  carries no token while play_url does.
- Coverage gap noted by the debugger: no integration test for "client
  never POSTs /play → healing still happens" — now moot for the
  descriptor path (TestDescriptorLazyRepack pins it at the orchestrator
  level), worth a joint later.
