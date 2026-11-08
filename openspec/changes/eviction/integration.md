# Integration audit — eviction

Surveyor: @wf-surveyor · initial audit 2026-11-07 · **re-audit (amendment round 1) 2026-11-08** · worktree `feature/eviction` @ 211665a (no code drift — HEAD unchanged, `git status` clean over cmd/ internal/ web/src) · map CURRENT (fingerprint 234bf79a…) · `openspec validate eviction --strict` re-run by the surveyor through the pin (1.14.0): **valid, rc 0**.
Read-only audit of the PLANNED integration graph. Findings cite `file:line` or the map; recommendations only — amend-or-waive is the human's call at GATE 1.
**Question frontier after amendment round 1: EMPTY** (Q1–Q4 resolved-by-amendment / resolved-unchanged; no new contradictions introduced — §4).

## 1. Nodes (planned surface, grounded)

Production files the tasks touch — every one verified on disk at 211665a:

| # | Node | Grounding | Owning task(s) |
|---|---|---|---|
| N1 | `internal/orchestrator/frontier.go` — `FrontierIn` (:43), `Frontier` (:75, today `([]Job, map[string]bool)`) | def + grep; exported surface ≤8 unchanged (doc.go:30) | 1.1 (+ `Suppressed` field in 2.1) |
| N2 | `cmd/mellifera/playback.go` — `newSweep` (:304), `sweepFrontier` (:321), `sweepBudget` (:376), `evictDir` (:496), `resetStreamsState` (:521, complete-only today :528-530), `sweepIntegrity` (:561), `dirSize` (:684), `watchState` (:650, returns `(positions, recency)`), `packOnPlay` (:69), `legacyRepackOnPlay` (:112), `retryFailedPack` (:158) | defs via grep | 1.1 (composition site), 1.2, 2.1 |
| N3 | `cmd/mellifera/main.go` — `Deps.Play` closure (:362-375), `newSweep` wiring (:512), `Playback` closure (:356) | grep | 2.1 (suppression wiring + re-arm), 3.2 (urgent swap) |
| N4 | `internal/enrich/queue.go` — `work chan laneTask` (:111), `sendMu` (:117), `Start` (:156, re-makes the channel), `Stop` (:186-199, close under sendMu), `worker` (:313-322) | defs via grep | 3.1 |
| N5 | `internal/enrich/streams.go` — `EnqueuePack` (:39-52: sendMu guard, not-running error, select/default drop-on-full), `laneTask` (:56) | defs via grep | 3.1 (adds `EnqueuePackUrgent` + `urgent` field) |
| N6 | `web/src/pages/browse/ItemDetail.tsx` — preparing law (:126), `PreparingSurface` (:1605, `{stalled}`), poll logic; `ItemDetail.test.tsx` exists | grep + ls | 4.1 |
| N7 | `internal/itest/eviction_joint_test.go` — NEW | plan (tasks 5.1, contract 5.1) | 5.1 |

Test files named by tasks (post-amendment): `internal/orchestrator/frontier_test.go` (`TestFrontier` :34, `TestFrontierJobShape` :173, `TestFrontierWorkingSet` :199 — all exist; + 2 new tests); `cmd/mellifera/watched_test.go` (`TestWatchedSemantics` :77 — signature-only fix, task 1.1); `internal/itest/qa_playback_harness_test.go` (`pbSweep` :236 — signature-only fix, task 1.1); `cmd/mellifera/retention_test.go` (`TestSweepBudget` :286 — signature-only fix, task 2.1); `cmd/mellifera/playback_gate_test.go` (`TestRepackSweepGateRefusal` :175 — signature-only fix, task 2.1); `cmd/mellifera` new tests (qa list names a future `playback_test.go`); `internal/enrich/streams_test.go` (`TestStreamsLane` :84 stays green); `ItemDetail.test.tsx`.

## 2. Edges (planned seams, grounded)

| # | Edge (from → into) | Grounding | Owner | Catching duty |
|---|---|---|---|---|
| E1 | `sweepFrontier` builds `FrontierIn{Recency, BuildBytes, PinCapBytes, …}` (`playback.go:330` today `{Watched, Now}`) | playback.go:328-330; `watchState` returns recency (discarded today, :328) — `sweepBudget` already reads it (:384) | 1.1 | 1.1 (`TestFrontier*` + `TestWatchedSemantics`, both packages — duty compiles `cmd/mellifera` at 1.1, closing the mid-group red window there) |
| E2 | `sweepFrontier` consumes `Frontier`'s 3-value return `(jobs, pinned, demote)` | signature change per tasks 1.1 / design Interfaces 1; consumers `watched_test.go:216,234,256` + `qa_playback_harness_test.go:212,236` owned as signature-only fixes by 1.1 (amendment Q1) | 1.1 | 1.1 duty (`cmd/mellifera` leg) + 5.1 duty (first compile of `internal/itest` — owned repair, deferred catching) |
| E3 | pinned set → `sweepBudget(fronted)` (:308→:376) → `Evictions` pin carve-out (:419) + loud pinned WARN (:425) | playback.go:306-309, :419-426 | 1.1 | 1.1/1.2 |
| E4 | newSweep pass order becomes frontier → **demotion** → retention → budget → integrity | newSweep today :305-310; design §Interfaces, contract 5.1 design pin | 1.2 | 1.2 (`TestSweepDemotion`) |
| E5 | demotion executor → `evictDir` (:496) + `resetStreamsState` extended complete→**partial** (:528-530 is complete-only today — plan's claim verified TRUE) | playback.go:496-546 | 1.2 | 1.2 |
| E6 | demotion marks suppression (no-op hook from day one → real set in 2.1) | tasks 1.2→2.1; design D3 | 1.2 stub, 2.1 real | 2.1 |
| E7 | suppression threaded `newSweep` → `sweepFrontier`/`sweepBudget`/`sweepIntegrity`: frontier consult via `FrontierIn.Suppressed`; integrity consult skips the repack with ONE INFO (gate-refusal precedent :598-601); marking at evictions (:427-429 already unpublishes — insertion point verified); threading's signature-only test fixes owned by 2.1 (amendment Q2) | tasks 2.1; design D3 | 2.1 | 2.1 duty (3 new tests + `TestSweepBudget` + `TestRepackSweepGateRefusal` re-runs) |
| E8 | `main.go:512` `newSweep` wiring gains the suppression set | design Interfaces 2 | 2.1 | 2.1 compile |
| E9 | play re-arm: the `main.go` `Deps.Play` closure (:362-375) clears the suppression BEFORE delegating to the pack decisions — `packOnPlay`/`retryFailedPack` signatures UNTOUCHED (their nine `playback_gate_test.go` direct-call sites stay compiling); covers all three play paths (plain :372, retry :374, legacy through `packOnPlay` :71) | tasks.md 2.1 (amended); design.md:87 (D3) + :144 (Interfaces 2); proposal.md:90 — all three amended consistently; production callers of the two functions verified: only `main.go:372/:374` | 2.1 | 2.1 (`TestPlayClearsSuppression` — asserts the closure re-arms) + 5.1 joint play leg |
| E10 | `EnqueuePackUrgent` mirrors `EnqueuePack`'s drop contract on `q.urgent` (cap 16), never spills; `Stop` closes both under sendMu; workers prefer urgent (non-blocking receive before the range) | streams.go:39-52 (the contract to mirror); queue.go:186-199, :313-322 | 3.1 | 3.1 (2 new tests + `TestStreamsLane` still green) |
| E11 | `Start` (:156-170) constructs the second channel per Start (nil-channel sends error via the `running` guard, as today) | queue.go:156-170 | 3.1 | 3.1 |
| E12 | `main.go:372/374` swap `enrichQueue.EnqueuePack` → `EnqueuePackUrgent` (same `func(string) error` seam type); `:356` descriptor re-heal and `:512` sweep KEEP plain `EnqueuePack` | main.go:356, :372, :374, :512; design D4 | 3.2 | 3.2 (`TestPlayUsesUrgentLane`) |
| E13 | `legacyRepackOnPlay` inherits urgent through `packOnPlay` (:71 passes its own `enqueue`) — and inherits the closure re-arm (E9 clears before the delegation) | playback.go:69-73 | 3.2 (no edit); 2.1 (no edit) | 3.2 / 2.1 |
| E14 | Wire contract UNCHANGED — **verified TODAY**: `packOnPlay` answers `(false, nil)` on deferral (playback.go:78-86) → `api.Deps.Play` bool → `playResponse{Queued bool \`json:"queued"\`}` (internal/api/playback.go:88-90), 200/202 at `itemPlay` :211 ff. Task 4.1's assumption HOLDS; no api edit needed | playback.go, api/playback.go | none (no-op) | — |
| E15 | SPA reads `queued`: the client type already parses it (`web/src/lib/api.ts:354-356`) — ItemDetail.tsx never reads it today (grep: no `queued` in the tsx); adds the not-queued `PreparingSurface` variant + retry control, poll suppressed while deferred | api.ts:356; ItemDetail.tsx:440-445, :590-598, :1605 | 4.1 | 4.1 vitest duty |
| E16 | Joint: new itest walks real `newSweep` composition + real `enrich.Queue` (saturated shared buffer, urgent preference asserted) and replicates the `Deps.Play` closure wiring test-side (the re-arm is main.go code — package main — replicable in the harness without production edits; the 5.1 contract's no-production-edit rule stands) | contract 5.1; tasks.md 5.1 (amended) | 5.1 | 5.1 duty (ffmpeg-gated) |

Verified non-edges (plan claims checked against source, all hold):
- **"cmd/mellifera is the only production caller" of `Frontier`** (design Interfaces 1) — TRUE: the only non-test call site is `playback.go:350`.
- **Nothing else assumes re-front-after-evict** — the three re-enqueue seams are the frontier (:350-358), the integrity sweep (:597-607), and the lazy re-heal family (descriptor :356 / `packOnPlay` :71); all three are gated by the design. The restart wave is bounded by the pin cap (design Risks) — consistent.
- **Demotion-before-budget accounting** — holds: `sweepBudget` re-walks the disk (:380) after demotion runs in the same pass, and fully-watched serials are never in the pinned set (watched_test.go:216-232 asserts fronted=∅ for fully-watched), so demotion never evicts a pinned build.
- **Urgent drop contract** — mirrorable exactly (streams.go:45-51 select/default; no fallback send); "never spills" is implementable as written.
- Superseded change folder `2026-10-30-frontier-pinned-eviction/` exists as described; this change neither edits nor deletes it.

## 3. Coverage verdicts (post-amendment)

**Wiring coverage — COVERED.** Every new node (N4 urgent lane, N5 `EnqueuePackUrgent`, N7 joint, the suppression set, the demotion executor) has an owning task and an edge into the live system implemented by a task; no orphan nodes. The former hidden-scope findings (Q1/Q2) are resolved: all four broken test files are now owned as signature-only fixes by the tasks that break them (1.1: `watched_test.go`, `qa_playback_harness_test.go`; 2.1: `retention_test.go`, `playback_gate_test.go`). Residual tolerance note (not a finding): `qa_playback_harness_test.go`'s fix lands at 1.1 but the first duty compiling `./internal/itest` is 5.1's — a mid-loop compile-red window, owned repair, catching deferred; the loop tolerates scoped-duty red between tasks.

**QA seam coverage — COVERED.** Cross-module seams each land in a unit duty plus the Tier-1 joint: policy↔shell (1.1 + 5.1), shell↔lanes (3.1, 3.2 + 5.1 saturated-buffer preference), suppression across passes (2.1 ×3 + 5.1), wire↔SPA (4.1; wire unchanged — E14 verified). Task 5.1 carries `@qa` with a non-empty `qa:` list (grammar shape `tests/…::node` honored; existence unchecked by design — the contract's acceptance routes the other entries' existence to their own tasks + the reviewer's gate re-run). The widened duties' regexes verified against source: `TestWatchedSemantics` (watched_test.go:77 — spans the three `Frontier` captures :216/:234/:256; only test in that file), `TestSweepBudget` (retention_test.go:286 — spans the four `sweepBudget` calls :350/:382/:408/:429), `TestRepackSweepGateRefusal` (playback_gate_test.go:175 — spans the `sweepIntegrity` call :204). Every widened -run pattern matches at least one existing test in its target package — no silent no-match greens.

**Complexity / blast radius — one hot file; hidden scope cleared.** `cmd/mellifera/playback.go` remains the change's hot file (tasks 1.1, 1.2, 2.1 all edit it — group order is the DAG; within group 1, 1.1∥1.2 concurrent apply must respect file ownership — execution constraint, not a contradiction; apply group 1 serially). The four formerly-hidden-scope files are now in-contract (signature-only). Bonus from the amendment: 1.1's widened duty compiles `./cmd/mellifera`, so the `cmd/mellifera` compile window between 1.1 and 1.2 is closed entirely. No production file outside the plan's list is touched by any planned edge.

**Register grammar (one-line prose law) — re-checked post-amendment.** All seven task lines are single physical lines at indent 0; all field lines sit at exactly two-space indent (`grep -n '^  verify:'` returns the seven duties, each clean single-line bash — line refs tasks.md:6, :8, :13, :18, :20, :25, :31; `file:` :30 and `qa:` :32 two-space). Duplicate ids: none; `- [ ]` unchecked everywhere; ids unchanged N.M (no renumbering). The surveyor's validate re-run (pin 1.14.0, `openspec validate eviction --strict`) is rc 0 valid — independently confirmed, not just the planner's claim.

## 4. Questions — ALL RESOLVED in amendment round 1 (frontier EMPTY)

**Q1 — the `Frontier` signature change breaks test callers no task names. RESOLVED: AMENDED (task 1.1).**
Was: `watched_test.go:216,234,256` + `qa_playback_harness_test.go:212,236` broke unowned. Now: task 1.1's prose explicitly owns both files as "signature-only fixes, no behavior change" (tasks.md:5 — the `TestWatchedSemantics` captures and `pbSweep`'s `jobs, _ :=` capture, line refs preserved), and the duty widened to `go test ./internal/orchestrator ./cmd/mellifera -run 'TestFrontier|TestWatchedSemantics'` (tasks.md:6). Verified: both regex alternatives match real tests; the harness-file scope rider ("signature fix only, never new behavior; ffmpeg stays 5.1-only") keeps the 5.1 contract's no-production-edit rule intact.

**Q2 — suppression threading changes sweep signatures; direct test callers unnamed. RESOLVED: AMENDED (task 2.1).**
Was: `retention_test.go:350,382,408,429` + `playback_gate_test.go:204` broke unowned. Now: task 2.1's prose owns both files as signature-only fixes (tasks.md:12 — four `sweepBudget(...)` calls with the new arg passing nil, and the `TestRepackSweepGateRefusal` call), duty widened to include `TestSweepBudget|TestRepackSweepGateRefusal` (tasks.md:13). Verified both names at source (§3). The nine `packOnPlay`/`retryFailedPack` call sites in `playback_gate_test.go` are untouched BY DESIGN under the Q3 resolution — see Q3.

**Q3 — where the play re-arm lives. RESOLVED: AMENDED — the `main.go` `Deps.Play` closure (the surveyor's recommendation, adopted).**
tasks.md 2.1, design.md D3 (:87) and Interfaces 2 (:144), and proposal.md Impact (:90) all now state the re-arm lives in the `Deps.Play` closure before it delegates; `packOnPlay`/`retryFailedPack` signatures untouched, their nine direct test call sites stay compiling. Orphan check: no edge orphaned — E9's owner and catching duty are unchanged in substance (2.1 / `TestPlayClearsSuppression`, asserting the closure re-arm); E13 now inherits BOTH the urgent seam and the closure re-arm; the joint's play leg replicates the closure wiring test-side without production edits (contract stands). No play path bypasses the re-arm (the closure is the only production caller of both functions — verified last round, still true at 211665a).

**Q4 — task 5.1's duty makes ffmpeg-absence RED. RESOLVED: UNCHANGED (conscious acceptance).**
The duty stands as authored (tasks.md:31, byte-identical); the planner resolved it as "ffmpeg present on gate machine" — the strictness is deliberate (the acceptance joint must actually run at the gate). The repo precedent (skip-green, `integration_async_test.go:69-70`) remains on record should the environment ever lack ffmpeg; GATE 2's reviewer should confirm the receipt stdout shows a RUN, not a skip.

No new contradictions introduced by the amendments: the widened duties match the register grammar (§3, re-checked); the prose's line refs (:216/:234/:256, :236, :350/:382/:408/:429, :204) verified against un-drifted source; the closure placement orphans nothing; validate --strict green re-confirmed by the surveyor.

Minor observations (no question; carried for the reviewer):
- Task 4.1 names the vitest tests Go-style (`TestPreparingDeferredShowsRetry`); the file uses `it()/describe()` strings. The duty runs the whole file, so coverage is caught regardless — naming is shorthand.
- Task 1.1's "watchState's stamps it already reads" is slightly off: `sweepFrontier` reads `positions` and DISCARDS the recency return today (`playback.go:328`); the recency map is one `_` away. Trivial.
- The phrase "lazy re-heal" names two distinct paths: the descriptor GET's heal (`main.go:356`, stays plain per spec) and `legacyRepackOnPlay` (play-time, rides urgent per D4). The design is explicit; implementers should not conflate them.
- The `qa:` entries' `tests/`-prefixed paths (e.g. `tests/cmd/mellifera/playback_test.go`) are grammar shape, not repo paths — the real files will be `cmd/mellifera/…`. Register checks shape only; harmless.

## 5. Resolutions (recorded at GATE 1 input — amendment round 1, 2026-11-08)

| Q | Resolution | By |
|---|---|---|
| Q1 | AMEND — task 1.1 prose owns `watched_test.go` + `qa_playback_harness_test.go` signature-only fixes; duty widened to `TestFrontier|TestWatchedSemantics` over both packages | planner, amendment round 1 |
| Q2 | AMEND — task 2.1 prose owns `retention_test.go` + `playback_gate_test.go` signature-only fixes; duty widened with `TestSweepBudget|TestRepackSweepGateRefusal` | planner, amendment round 1 |
| Q3 | AMEND — re-arm moved to the `main.go` `Deps.Play` closure across tasks.md 2.1, design.md D3/Interfaces-2, proposal.md Impact; pack signatures untouched | planner, amendment round 1 |
| Q4 | UNCHANGED — resolved: ffmpeg present on the gate machine; strict duty intentional | planner, amendment round 1 |
