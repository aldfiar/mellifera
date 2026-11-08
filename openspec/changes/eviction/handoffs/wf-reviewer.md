# Handoff — wf-reviewer → session (eviction GATE 2 verdict)

Written 2026-11-08, gate run at HEAD e6ab4a2 (branch feature/eviction, pushed). Replaces the
surveyor's dispatch record (latest-wins per role file; the surveyor's audit remains durable in
`integration.md`, committed). BELIEF — the evidence is the receipts, the diff, and the fresh
re-runs cited below.

## Verdict: APPROVED — 8 PASS, 1 FLAG (process residue), 0 FAIL

Gate line: **Approved** — conditional only on the session-owned git-check re-green below
(the close order already mandates it: git-check green → archive).

### Anchors (all run fresh in the reviewer's shell, not trusted from receipts)

- All 9 duties re-run `--by wf-reviewer`: 1.1, 1.2, 2.1, 3.1, 3.2, 3.3, 4.1, 5.1 GREEN;
  git-check RED solely on ` M openspec/changes/eviction/handoffs/session.md` (see FLAG).
- Full-suite anchor: `go test ./...` exit 0 (itest 340s real lane, enrich 8.1s, cmd 1.7s,
  orchestrator 0.44s). Web: `npx vitest run` 50 files / 706 tests passed + `npx tsc --noEmit`
  clean. `make check` → check.sh: OK exit 0 (lint + exported-symbol budget; the store/sdk >8
  WARNs are pre-existing, gate-OK).
- `openspec validate eviction --strict` re-run by the reviewer through the pin (1.14.0):
  valid, rc 0.
- Handoff inbox for wf-reviewer: 0 open items.

### Per-task table

| Task | Verdict | Evidence (fresh re-run + file:line) |
|---|---|---|
| 1.1 | PASS | duty green 2.2s; `frontier.go:46-66` FrontierIn gains Recency/BuildBytes/PinCapBytes/Suppressed, `:102` 3-value return, `:113-141` serial-recency order + byte-capped PREFIX (overflow ends the walk) + demote fully-watched in input order; cap = `budgetBytes*3/5` locked at `playback.go:461`, no env knob; owned signature fixes byte-verified (watched_test 3× `jobs, fronted, _ :=`, pbSweep `jobs, _, _ :=`); `TestFrontierBoundedPinSet` + `TestFrontierDemote` exist (no silent no-match greens); fully-watched fronted=∅ law intact (watched_test:216-242) |
| 1.2 | PASS | duty green; `newSweep:422-427` pass order frontier → demotion → retention → budget → integrity, demotion before budget in the SAME pass (freed bytes count in accounting — sweepBudget re-walks disk at :543); `sweepDemotion:505-519` unconditional, evictDir per nonce, `sup.mark` after; `resetStreamsState:709-719` complete always / partial when demoted, nonce-guarded, resets to none; `TestSweepDemotion` asserts all four contract points (demotion_test.go:124-198 incl. budget accounting ≤ budget) |
| 2.1 | PASS | duty green; `suppressionSet:349-403` mutex-guarded, nil-safe (nil reads as nothing-suppressed — makes the signature-only nil-arg test fixes behave byte-identically); three seams verified: frontier consult (`:462` snapshot → `frontier.go:144-151` no job/pin/bytes), integrity skip with ONE INFO (`:787-793`, one-line + zero-ledger-rows asserted in test), mark at BOTH eviction sites (budget `:594-601` document-named-only via the `named` map; demotion `:518`); closure re-arm `:209-211` AFTER the 404 check, BEFORE packOnPlay/retryFailedPack — all three play paths (plain/retry/legacy-through-packOnPlay) pass through the one closure; signature fixes byte-verified (retention_test 4× `..., nil, nil)`, playback_gate_test 1× `..., nil)`). **Session review note (a) resolved**: the garbling was transcript-side, not disk — seams re-read BY INSPECTION and coherent with D3 (in-memory set, restart re-fronts once, snapshot keeps the policy pure) |
| 3.1 | PASS | duty green; `streams.go:66-79` EnqueuePackUrgent is EnqueuePack's exact contract mirror (sendMu, running-guard, non-blocking select/default → "urgent lane full", never spills into the shared buffer); `queue.go:45` urgentCapacity=16 locked; `:168` Start creates the channel, `:194-203` Stop closes both under sendMu; doc.go stale "streams lane's dispatch entry" comment fixed (byte-verified diff: now "shared (background) dispatch entry — a play-requested pack rides EnqueuePackUrgent") |
| 3.2 | PASS | duty green; `main.go:376` Deps.Play rides `newPlayClosure(st, enrichQueue.EnqueuePackUrgent, …)`; `:366` descriptor lazy re-heal and `:513` newSweep keep plain EnqueuePack; legacyRepackOnPlay inherits through packOnPlay (playback.go:77); TestPlayUsesUrgentLane: queued=true under a saturated shared buffer, sweep enqueue honestly refused in the same state |
| 3.3 | PASS | duty green; `queue.go:330-353` ONE blocking select, urgent case FIRST, shared second, NO default; **session review note (b) resolved**: the 5.1 joint finding's amended mechanism is on disk (worker comment :316-327 carries the idle-queue invariant), the red-first evidence trail holds (waitWorkerParked :738-763 scans runtime.Stack for `[chan receive]` OR `[select]` — the barrier is correct against BOTH loop shapes; the failure message names the joint 5.1 finding; the red-first proof ran pre-register as a finding demonstration, so its absence from receipts is grammar-coherent), and the register trail is coherent (tasks.md 3.3 + receipts 10:57:08 3.1-re-run + 10:57:15 3.3 + git-check 10:59:14; design.md D4 heading byte-verified amended; delta's idle-queue scenario on disk). The noted Stop-semantics deviation (shared-closed case drains the urgent lane's residual buffered tasks, :341-350) is FAITHFUL — Go's select picks among ready cases, the drain preserves "workers drain both" |
| 4.1 | PASS | duty green (54 tests in the file); both contract tests byte-present as it-name prefixes (:1601, :1648); deferred test asserts the not-queued variant, the ABSENCE of the auto-update promise, retry re-firing POST /play {retry:false} once per activation, and the descriptor fetch count FROZEN across intervals; queued test asserts one POST + bounded poll + no retry control. **Session review note (c) resolved**: deviation #1 (test ids as it-name prefixes) is cosmetic naming — the duty runs the whole file so coverage lands regardless, and the contract names appear verbatim; deviation #2 (onSuccess invalidation gated to queued:true, ItemDetail.tsx:462-470) is FAITHFUL to the web-ui delta's SHALL lines (:23-32): queued:true still invalidates → poll resumes unchanged; queued:false invalidates nothing ("a refused enqueue changed nothing server-side") and the poll effect is gated on packDeferred (:491) — the observable contract is exactly the delta's |
| 5.1 | PASS | duty green as a RUN (6.8s wall, 4.07s test time, no SKIP in the receipt — Q4 obligation met, ffmpeg present); the joint asserts all three contract legs with falsifiable controls: no-requeue-after-evict (unmarked control fronts the same fixture, so only the suppression explains the silence), play-clears-suppression through the replicated Deps.Play closure, urgent-lane preference under a SATURATED shared buffer (saturators park inside PackItem; dispatch-before-state discriminator); NO production edits — internal/itest diff = 2 new test files + the owned 2-line harness signature fix |
| git-check | FLAG | the journaled green (10:59:14Z) was true at its time; the FRESH re-run is red solely on ` M openspec/changes/eviction/handoffs/session.md` — the session's GATE-2 record written after git-check closed, pending human approval. Expected gate ordering, not a change defect. Session must commit (session.md + this record + review.md) and re-run `verify eviction git-check` before `openspec archive` |

### Spec axis (delta → code, all landed)

packaged-playback delta: 14 scenarios, all with landed code — bounded pin set (frontier.go cap
walk), eviction-suppression (both mark sites + frontier/integrity consults), budget-is-last-resort
with the loud pinned WARN (playback.go:587-592), completion-driven demotion (sweepDemotion +
resetStreamsState partial). async-enrichment delta: 4 scenarios incl. the amendment's idle-wake
(:29-30) — EnqueuePackUrgent + blocking select. web-ui delta: 5 scenarios incl. queued:false —
ItemDetail not-queued variant. Wire contract untouched (no internal/api files in the diff —
E14's no-op holds). Strict validate re-run valid rc 0.

### Integration re-grounding (post-change map)

No symbol was removed or renamed (the six "removed" decls in the diff are same-name signature
changes, re-verified byte-exactly). All callers of every touched seam are inside the diff:
`Frontier` (playback.go:483 + owned test sites incl. the joint's shell mirror), `EnqueuePackUrgent`
(main.go:376 + tests), `EnqueuePack` method-values (main.go:366/:513 + background tests),
`packOnPlay`/`retryFailedPack` (closure :217/:219 only), sweep* (newSweep :423-427 only).
Orphan check: every new node is wired — suppressionSet methods, sweepDemotion, EnqueuePackUrgent,
buildBytes (sweepFrontier:460), newPlayClosure (main.go:376), drainShared/dispatch (worker), the
urgent channel (Start:168/Stop:203). **No orphans; waiver list empty — no unimplemented edge.**
E1–E16 all grounded in the diff (E13 legacy inheritance verified at playback.go:77).
Tool note: `wf index query callers` returned "none in map" for every symbol — the map auto-built
with symbols=0 in this worktree (tool quirk, recorded here); grep grounding substituted per the
map's own instruction, byte-exact and complete.

### Standards axis (judgement calls only — no hard violations)

- P3 — `cmd/mellifera/urgent_lane_test.go:29-30`: header comment still describes the pre-3.3
  mechanism ("the worker's non-blocking urgent receive before the shared range"). The test is
  mechanism-agnostic and green, but the comment contradicts the amended design D4. Fix: update
  the comment at the docs/close-out pass.
- P3 (sanctioned duplication) — `internal/itest/eviction_shell_test.go` mirrors the package-main
  shell composition (evSweep/evBudget/evDemotion/evIntegrity/evResetNone/evPlayClosure). Forced
  by Go's package boundary (internal/itest cannot import package main) and disclosed in
  session.md + the joint test's header comment. Drift risk: a future pass-order change in
  playback.go can silently diverge the mirror — a future refactor may extract the sweep
  composition into an importable package (out of this change's scope).
- P3 — `resetStreamsState(ctx, st, itemID, nonce, demoted bool)`: boolean-flag param, two call
  sites, documented contract — KISS-acceptable, note only.
- P3 (belief-record hygiene) — `handoffs/session.md` (superseded content): its 1.2/2.1 summary
  blocks were swapped and one date read 2026-11-07 for a 2026-11-08 receipt; the receipts and
  the diff prove the right code landed under the right ids. Evidence governs; no action.
- Positive notes: control-paired falsifiable tests throughout (suppression, integrity, joint);
  the nil-safe suppression set is pit-of-success design; the drop-on-full contract is mirrored
  exactly with honest errors end to end; gofmt clean; the full suite, lint budget, and race run
  (session) all green.

### Reader advisory (do NOT "fix" these files)

My prose reads of design.md / integration.md / the spec deltas / session.md garbled in-flight
(same phenomenon as the session's 2.1 transcript report). Every load-bearing fact was
re-verified byte-exactly via `git show` blobs and grep: the committed artifacts are CLEAN
(proposal.md, 28/8/10 clean-shaped WHEN/THEN bullets across the three deltas, design.md D2/D4
intact, strict validate valid). No artifact defect exists; no prose repair is warranted.

### Follow-ups (none block the archive)

1. Session: commit the gate residue and re-run `verify eviction git-check` before archive.
2. Docs pass: fix the urgent_lane_test.go:29-30 stale mechanism comment.
3. On the radar: the itest shell-mirror drift risk (see Standards axis).
