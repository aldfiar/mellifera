# Handoff — wf-surveyor → wf-reviewer (eviction integration audit)

Written 2026-11-08 after amendment round 1 (initial audit 2026-11-07). This is BELIEF; the evidence is
`openspec/changes/eviction/integration.md` (graph + grounding + verdicts + resolutions) and the map
(211665a, CURRENT — re-checked at re-audit: HEAD unchanged, no code drift, `git status` clean over cmd/ internal/ web/src).
Re-ground everything at the gate against the post-change map.

## Audit summary (post-amendment)

- Nodes 13 (7 production files incl. the NEW `internal/itest/eviction_joint_test.go`; 6+ test files — 4 of them now IN-contract via the amendment), edges 16 (E1–E16), all grounded at 211665a.
- Wiring coverage: COVERED — no orphan nodes; every planned edge has an owning task; the former hidden-scope repairs are owned (Q1/Q2 amendments).
- QA seam coverage: COVERED — every cross-module seam has a unit duty + the Tier-1 joint (5.1 `@qa`, non-empty `qa:` list). Widened duty regexes verified against source: `TestWatchedSemantics` (watched_test.go:77, spans the :216/:234/:256 captures), `TestSweepBudget` (retention_test.go:286, spans :350/:382/:408/:429), `TestRepackSweepGateRefusal` (playback_gate_test.go:175, spans :204) — every -run pattern matches a real test; no silent no-match greens.
- Complexity: one hot file (`cmd/mellifera/playback.go` — tasks 1.1, 1.2, 2.1; apply group 1 serially, file-ownership constraint). Amendment bonus: 1.1's widened duty compiles `./cmd/mellifera`, closing the 1.1→1.2 compile window entirely. Residual: `internal/itest` first compiles at 5.1's duty — the harness fix (owned by 1.1) is caught there; owned repair, deferred catching, tolerated mid-loop.
- Register grammar re-checked post-amendment: all 7 task lines single physical lines at indent 0, field lines at two-space indent, ids unchanged N.M; duties at tasks.md:6, :8, :13, :18, :20, :25, :31 are clean single-line bash. The surveyor independently re-ran `openspec validate eviction --strict` through the pin (1.14.0): valid, rc 0.
- Verified TRUE at source, no question needed: the play verb already emits `queued:false` on deferral today (`packOnPlay` playback.go:78-86 → `playResponse` internal/api/playback.go:88-90); the SPA ignores it (`web/src/lib/api.ts:356` types it, ItemDetail.tsx never reads it) — task 4.1's assumption holds. Budget eviction already unpublishes (playback.go:427-429); `resetStreamsState` is complete-only today (:528-530) exactly as the plan claims; "cmd/mellifera is the only production caller" of `Frontier` holds; nothing outside the three gated seams assumes re-front-after-evict.

## Question frontier: EMPTY (4/4 resolved, amendment round 1)

1. **Q1 — RESOLVED (amend task 1.1):** 1.1's prose now owns `cmd/mellifera/watched_test.go` (:216/:234/:256 captures) + `internal/itest/qa_playback_harness_test.go` (`pbSweep` :236) as signature-only fixes, no behavior change; duty widened to `go test ./internal/orchestrator ./cmd/mellifera -run 'TestFrontier|TestWatchedSemantics'` (tasks.md:5-6).
2. **Q2 — RESOLVED (amend task 2.1):** 2.1's prose now owns `cmd/mellifera/retention_test.go` (:350/:382/:408/:429, new arg passes nil) + `cmd/mellifera/playback_gate_test.go` (:204) as signature-only fixes; duty widened with `TestSweepBudget|TestRepackSweepGateRefusal` (tasks.md:12-13).
3. **Q3 — RESOLVED (amend; the surveyor's recommendation adopted):** the re-arm lives in the `main.go` `Deps.Play` closure BEFORE it delegates to the pack decisions; `packOnPlay`/`retryFailedPack` signatures untouched, their nine direct `playback_gate_test.go` call sites stay compiling. Amended consistently across tasks.md 2.1, design.md D3 (:87) and Interfaces 2 (:144), proposal.md Impact (:90). No edge orphaned: E9's owner and catching duty unchanged in substance (`TestPlayClearsSuppression` asserts the closure re-arm), E13 inherits both the urgent seam and the closure re-arm, and the joint replicates the closure wiring test-side with no production edits (the 5.1 contract's rule stands).
4. **Q4 — RESOLVED (duty unchanged):** task 5.1's duty stands byte-identical (tasks.md:31); ffmpeg present on the gate machine; the strictness is deliberate — the acceptance joint must actually run. GATE 2 note: confirm the 5.1 receipt's stdout shows a RUN, not a skip.

No new contradictions introduced by the amendments: line refs verified against un-drifted source; the one-line prose law re-checked (§ summary above); the closure placement orphans nothing; validate --strict green re-confirmed by the surveyor, not just the planner's claim.

## Waiver list

NONE — nothing was waived; all four questions resolved by amendment (Q1–Q3) or conscious acceptance (Q4).

## Review obligations this record pins

- At GATE 2: re-ground E1–E13 post-change via `wf index query callers Frontier` / `EnqueuePack` / `packOnPlay` (map freshens on read); re-run the orphan check; honor the (empty) waiver list — an unwaived, unimplemented edge is a FAIL; re-run the full 5.1 `qa:` list, not just the joint.
- Verify the suppression set is consulted at all three seams (frontier input, integrity skip with ONE INFO line naming the suppression, marking at BOTH eviction sites — budget and demotion) and that the closure re-arm precedes every play path (plain :372, retry :374, legacy through `packOnPlay` :71).
- The qa: entries' `tests/…` paths are grammar shape, not repo paths — real files land at `cmd/mellifera/…`, `internal/…`.
