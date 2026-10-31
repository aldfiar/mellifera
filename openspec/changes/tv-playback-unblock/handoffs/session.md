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
- GIT STATE: branch feature/tv-playback-unblock (cut from the deployed
  hotfix branch), pushed to origin. Commits: 7cbc56a (embedded artifacts),
  c46a3de (the change, 48 files), 6c74af0 (recommendation-sorting proposal
  recorded per user choice). git-check duty GREEN (clean tree, upstream
  even). All 13 receipts green. GATE 2 review COMPLETE: PASS-WITH-CHANGES —
  12/12 duties re-run green by the reviewer (plus full `go test ./...` and
  `openspec validate --strict`), all five flags a–e ruled PASS; the single
  change was the P2 beacon empty-detail seam (fixed below, fresh receipts).
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

## Post-GATE-2: live-TV incident and the fix (2026-10-31 ~18:30–19:00 MSK)

The user played an unpackaged episode (itm_2_ab305a2eea05b6d4) on the TV
immediately after the deploy: descriptor poll fired the pack-on-play
end-to-end (build ~14 s, playlist/init/seg 200s), then the player died with
hls.js fatal `mediaSourceRequiresReset` — and the failure beacons BOUNCED
400 (server: five-non-empty-strings; client sent detail ""). Log evidence
(docker logs) pinned three defects, all fixed client-side within 4.2/4.3:

1. `play_url`'s query token is re-minted per GET (per-second expiry + HMAC),
   so the D6 instance key `state|play_url` rotated every poll → SIX
   POST /play for one page-open (orchestrator deduped the build). Fix:
   `descriptorInstanceId` (api.ts) = state + tokenless path; ItemDetail keys
   the POST guard on it.
2. The Player attach effect keyed on `descriptor.play_url` → every refetch
   (incl. the flip-adjacent invalidations at poll cadence) tore down
   hls.js/MSE and rebuilt ~2s apart; the TV webview's MSE ended up poisoned
   → the fatal. Desktop Chrome survived the same churn silently (already-
   packaged items never exercised the preparing→flip path at all). Fix:
   attach + voiceover effects key on `playPath` (tokenless path); a re-mint
   never rebuilds (regression test pins it).
3. hls fatal detail was `status === null ? "" : String(status)` — media
   errors carry no HTTP status → detail "" → the server's D7 five-non-empty
   shape 400'd the exact beacon we needed. Fix: fall back to
   `data.error?.message` (slice 200) or "no transport status"; direct lane
   falls back to "no media error message". This IS the reviewer's P2.

Tests: two new regression tests (rotating-token one-POST in ItemDetail.test;
no-rebuild-on-re-mint in Player.test); the old "destroys the loader on
re-mint" and "clears banner on token-only change" tests rewritten to pin the
correct semantics (path change = re-attach; re-mint = survive). FRESH
receipts post-fix: 4.1 (27 tests + tsc), 4.2 (47), 4.3 (32) all green;
4.4 re-verified after the dist regen + commit. Design.md D6 carries the
amendment note. Pack itself verified healthy on the box: init.mp4 = avc1
(H.264, avcC) + 2× AAC — TV-decodable; the failure was pure client churn.
