# session — playback-capability-gate

## State (2026-10-31, post-apply — all authored tasks green; GATE 2 F1/F2 discharged)

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
- **GATE 2 findings discharged (2026-10-31, single fix commit):**
  - F1 (exported budget, gate-blocking): internal/api sat at 13 exported
    symbols (>12 fail bar) — the delta was exactly `PlayRefusal`. Fixed by
    re-homing BOTH refusal types into the new `internal/refusal` package
    (2 exports; names/shapes/semantics unchanged, all `errors.As` targets
    and constructor sites re-pointed): api back to 12, enrich 12 → 11,
    refusal 2. check.sh green.
  - F2a: tasks/5.1.md Audit now names the REAL test nodes
    (internal/itest/playback_capability_gate_joint_test.go::
    TestPlaybackCapabilityGateJoint; TestPlayGateRefusal inside
    internal/api/playback_test.go). tasks.md's `qa:` line keeps the
    `tests/...::node` shape — the register grammar demands it
    (QA_ENTRY_RE `^tests/\S+::\S+$`); the real nodes are named in the
    task file.
  - F2b: the bare-init-probe wording drift fixed in all three homes the
    reviewer named (packaged-playback delta "recorded at publish"
    sentence, tasks.md 2.1 title — re-registered with --reason,
    proposal.md "What Changes") to match design.md D2's variant-playlist
    probe. tasks/2.1.md, the delta scenario value-claims ("matching the
    init segment's sample entries"), and proposal Impact prose untouched
    (value claims still hold; not in the named scope).
  - design.md Interfaces carries the dated GATE-2 amendment note (the
    D2-amendment pattern); openspec validate --strict rc 0 after the
    edits.
- Known pre-existing residue (NOT this change's, queued for the docs pass):
  gofmt-dirty internal/itest/qa_display_naming_joint_test.go and
  qa_episode_titles_joint_test.go. Harness note from 5.1: pbNewWorld's
  Playback closure drops Describe's Codecs (green today — no existing
  test asserts codecs through it); fold in a later harness touch.
- Next: fix commit + push → re-verify touched receipts (1.2, 1.3, 5.1) →
  GATE 2 re-verdict (@wf-reviewer re-runs every duty + FULL
  `go test ./...`) → human archive approval → close (archive deltas,
  police TBDs, @wf-docs, close-out notes, `wf pipeline clean`).
- Dispatch rule (operator catch 2026-10-31): wf-coder launches MUST set the
  REAL `wf-*` agent type parameter — never role text pasted into a
  default-type prompt (5.2 ran as wf-docs per this rule).
