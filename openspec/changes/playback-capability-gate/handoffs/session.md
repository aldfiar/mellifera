# session — playback-capability-gate

## State (2026-10-31, post-apply — all authored tasks green)

- GATE 1 approved by the human (structured answer): "Approve — register &
  apply". Retry-refusal HTTP shape stays **400** (the planner default; the
  409 alternative was declined by silence).
- Register: 5 groups, 11 tasks (10 authored + built-in git-check).
  wf_cmd: `bash "/Users/aldfiar/.claude/bin/wf"`. Machine home:
  `.tmp/playback-capability-gate/`, receipts in its receipts.jsonl.
- **Apply complete: 10/10 authored tasks green** (receipts 17:38–19:27Z):
  1.1 PackGate judge + floorReason/episodeFromDoc refactors; 1.2 retry +
  sweep-site gates (PlayRefusal 400 / sweep INFO-skip); 1.3 build-time gate
  (PolicyRefusal, no ledger row); 2.1 publish-time codecs record (variant-
  playlist probe — the D2 amendment); 2.2 end-to-end projection (7th
  Describe return, doc["streams"].codecs, wire, legacy composition);
  3.1 SPA pre-mount probe + honest device banner + beacon edge; 3.2
  embedded regen (committed separately as 6efa768); 4.1 EvictSuperseded +
  AfterPackPersist seam; 5.1 joint itest (three legs, real instances,
  ffprobe oracle, zero production defects — both reds were test bugs);
  5.2 postmortem routing (F5 + manifest-CODECS stay open).
- Known pre-existing residue (NOT this change's, queued for the docs pass):
  gofmt-dirty internal/itest/qa_display_naming_joint_test.go and
  qa_episode_titles_joint_test.go. Harness note from 5.1: pbNewWorld's
  Playback closure drops Describe's Codecs (green today — no existing
  test asserts codecs through it); fold in a later harness touch.
- Next: commit + push → verify git-check → GATE 2 (@wf-reviewer re-runs
  every duty + FULL `go test ./...` + delta-vs-diff + standards) → human
  archive approval → close (archive deltas, police TBDs, @wf-docs,
  close-out notes, `wf pipeline clean`).
- Dispatch rule (operator catch 2026-10-31): wf-coder launches MUST set the
  REAL `wf-*` agent type parameter — never role text pasted into a
  default-type prompt (5.2 ran as wf-docs per this rule).
