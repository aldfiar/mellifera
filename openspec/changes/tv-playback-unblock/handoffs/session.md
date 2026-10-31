# session — tv-playback-unblock

## State (2026-10-31, post-GATE-1)

- GATE 1 approved by the human, twice: original proposal, then the amendment
  (both via structured answers). Amendment: task 2.1 re-scoped to
  completion-aware watched semantics (>=90% duration OR position >= classified
  credits start; 100% never required; missing facts => NOT watched;
  conservative); the watched-unpackaged carve-out DROPPED — proactive packing
  is unwatched-only, pack-on-play on open (task 4.2) is the watched-content
  path.
- Register: `wf pipeline register` re-run post-amendment, ok (5 groups,
  13 tasks incl. built-in git-check). wf_cmd: `bash "/Users/aldfiar/.claude/bin/wf"`.
- APPLY PROGRESS (receipts in .tmp/tv-playback-unblock/receipts.jsonl):
  - Group 1 COMPLETE, all green: 1.1 (descriptor honesty + state_reason),
    1.2 (dual-credential gate), 1.3 (classified 401 log), 1.4 (decision log
    in cmd closure).
  - FOR GATE-2 REVIEWER (task 1.1 judgment call): fail-safe posture for items
    with ABSENT ffprobe facts = `unsupported`/`codec_unsupported` (runner's
    call — packaging cannot help on unknown facts). If the intent was bare
    `none`, that needs a spec amendment.
  - Concurrent-edit resolution landed: task 1.4's decision_log_test.go was
    adapted to 1.1's honesty states (descriptor state split from persisted
    state in read-only assertions) — keep that split if re-edited.
  - Group 2 COMPLETE, green: 2.1 (completion-aware watched semantics —
    predicate in cmd/mellifera/watched.go, Frontier shapes untouched).
    FOR GATE-2 REVIEWER: (a) comment-only edit in
    internal/orchestrator/frontier.go (FrontierIn.Watched doc now
    completion-aware — prevents a stale doc contradicting the merged spec;
    revert if scope is read strictly); (b) micro-decision: multiple
    classified credits sections → EARLIEST start thresholds (= SPA's
    first-skip-chip semantics).
  - Group 3 COMPLETE, green: 3.1 (beacon route — beaconLimiter per-IP
    fixed-window 30/1m in-process; 400-before-limiter; 429 silent; one INFO
    per accepted; swag @ID playback-event-beacon).
    FOR GATE-2 REVIEWER: rate-limit key = remote IP (Principal carries only
    role; NAT-shared buckets accepted — flood guard, not accounting).
  - 4.1 green (api.ts client: state_reason types, preparing/unsupported
    states, sendPlaybackEvent swallow-everything; red receipt for TS6133
    journaled before the green).
    FOR GATE-2 REVIEWER: beacon 401 currently routes through the shared
    handle401 rotation (INV-401-source-of-truth) — rotation would interrupt
    playback; reviewer to rule whether a beacon-specific channel must
    bypass rotation (one-line change if so).
  - Groups 4+5 COMPLETE, green: 4.1, 4.2, 4.3, 4.4 (commit 7cbc56a —
    generated artifacts ONLY), 5.1, 5.2.
    FOR GATE-2 REVIEWER: (c) 5.1's authorized seam fix —
    internal/api/playback.go wireArray() normalizes nil sections/voiceovers
    to [] on the playback wire (joint caught "sections":null vs SPA's
    unguarded .length reads); (d) 5.1 flagged internal/stream
    TestSections/no_packaging red (stale pre-honesty expectation) — SENT
    BACK to the 1.1 runner for fixture-fix + fresh receipt (in flight);
    confirm its new receipt lands before the gate; (e) 4.1's beacon-401
    rotation question (above) still open for ruling.
  - Next: git-check (built-in last task) once the 1.1 fix receipt lands →
    GATE 2 (@wf-reviewer re-runs every duty + reads six-slot prose).
- Prod context (this incident, already done BEFORE this change):
  - ser_3 ep2 itm_2_e76d698d4a147d7c manually unblocked 2026-10-31 ~11:45 MSK
    (POST /play retry:false → 202 → build complete → descriptor mode=hls).
  - 3 poisoned pack_failed ledger rows deleted via in-container sqlite3
    (files gone from /media/kofe/ongoing); 0 pack_failed rows remain.
  - Token-propagation fix live-verified (sibling packed item plays on TV).
  - Evidence: .tmp/playback-evidence-2026-10-31.md,
    .tmp/tv-playback-bugs-2026-10-31.md.
- Budget: streams lane 58/60 GiB — eviction pressure real; duties never run
  the full suite (baseline/gate only).
- Pending second thread (user-approved, not started): container image slimming
  (813 MB → target ~400/230 MB; static ffmpeg + `-ldflags "-s -w"`, optional
  distroless; dispatch-lane task, separate from this change).
