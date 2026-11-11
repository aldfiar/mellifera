# Integration survey — watch-scan (propose phase)

Surveyor: wf-surveyor · Date: 2026-11-11 · Baseline: 689a323 (full go suite green per proposal)
Amendment re-run (§7): 2026-11-11 — GATE 1 answered Q1–Q4/Q6/Q7 and waived Q5; the
planner's amendments verified in-tree (§7); baseline unchanged at 689a323, all graph
anchors re-grounded, planned-new nodes still absent from disk. Question frontier EMPTY.
Live map: `wf index query status` → `MAP: 689a323 … CURRENCY: CURRENT` (585 files).
Method note: the Go map backend is file-level (`stats … symbols=0`) — no def/caller rows —
so per code-search G6 every def/caller grounding below fell back to live-source grep with
`file:line` citations, taken in the worktree at 689a323. The map remains the currency anchor.

## 1. Planned graph

### Nodes (new + touched)

| # | Node | Kind | Grounding | Task |
|---|------|------|-----------|------|
| N1 | `internal/watch` — NEW pure-leaf package: `Library`, `Deps`, `Config`, `Service`, `NewService` (exported tier, 5), unexported engine (`observe`/`dueFires`/`completed`) + fsnotify adapter | new package | absent from disk and map (verified: `ls internal/watch` → no such dir; proposal.md:59-61, design D1 tasks.md:5) | 1.1, 1.2 |
| N2 | `cmd/mellifera/scanflight.go` — NEW: unexported `scanFlight` + `run(ctx, libraryID, fn)` | new file | absent from disk (verified; design D4 tasks.md:14) | 2.1 |
| N3 | `cmd/mellifera/main.go` — MODIFIED: two knob resolvers, one `scanFlight` instance, `api.Deps.Scan` re-route, `watch.Deps` build, watcher launch | modified file | exists; closure at main.go:403-405, launch region main.go:665-668, knob region main.go:765-843 (tasks.md:16) | 2.2 |
| N4 | `cmd/mellifera/main_test.go` — NEW (task 2.2 names it without "NEW"; absent at propose time — verified) | new file | absent from disk (verified `ls cmd/mellifera/main_test.go`) | 2.2 |
| N5 | `go.mod`/`go.sum` — fsnotify require | modified | x/image+x/sync at go.mod:12-13; no fsnotify line (verified) | 1.2 |
| N6 | `NOTICE` — attribution line beside Swagger UI entry | modified | Swagger UI entry NOTICE:22-24 (Apache-2.0) | 1.2 |
| N7 | `docs/operator-runbook.md` — §2 knob rows + §8 troubleshooting row | modified | §2 at :75, `MELLIFERA_ART_INTERVAL` row shape :94, §8 at :252 | 3.1 |
| N8 | `internal/itest/qa_watch_scan_joint_test.go` — NEW joint (3 legs) | new file | absent from disk (verified; tasks.md:23) | 3.2 |
| N9 | attach: `scan.Run` + `scan.Result` | existing, untouched | internal/scan/run.go:75 `func Run(ctx context.Context, deps Deps, libraryID int64) (Result, error)`; `type Result` run.go:52 | — |
| N10 | attach: `api.Deps.Scan` field + `scanLibrary` handler | existing, untouched | internal/api/router.go:30 `Scan func(ctx context.Context, libraryID int64) (scan.Result, error)`; internal/api/handlers.go:1188 `func (a *app) scanLibrary`, sole consumer call handlers.go:1194 | — |
| N11 | attach: `st.ListLibraries` + `access.System()` | existing, untouched | internal/store/libraries.go:349 `func (s *Store) ListLibraries(ctx context.Context, v access.Viewer) ([]Library, error)`; internal/access/viewer.go:45 `func System() Viewer` | — |
| N12 | attach: janitor registry (launch precedent) | existing, untouched | cmd/mellifera/janitor.go:17 `janitorTask`, :47 `runBoot`, :58-79 `run` (per-task goroutine + ticker + wake; `interval <= 0` → "task disabled") | — |
| N13 | attach: knob pattern (`envDuration`, `envInt`, floor law) | existing, untouched | cmd/mellifera/main.go:834-843 `envDuration` (malformed → default + Warn naming key); :808 `envInt`; :828-830 `max(1, envInt(...))` floor; knob region :765 (`MELLIFERA_ART_INTERVAL`), :797-801 (enrich knobs) | — |

### Edges (planned relations, each with wiring + what catches it unwired)

| # | Edge | Grounding | Wired by | Caught unwired by |
|---|------|-----------|----------|-------------------|
| E1 | engine due-fire → `watch.Deps.Scan` closure (in-package) | design D1/D3, mermaid (design.md:116-125) | 1.2 (adapter select → fire) | unit: TestRunInstallsRecursiveWatches / TestRunMapsEventsToOwningLibrary / TestRunReconcileTickTriggersScans; joint legs (a)/(b) end-to-end |
| E2 | `watch.Deps.Scan` closure → `scanFlight.run` (same instance as E3) | design D4 (main builds both over one flight) | 2.2 | duty `grep -c 'flight.run' main.go ≥ 2` (weak — count-based, see W2); joint legs (a)/(b) run the automatic path through the flight at runtime |
| E3 | `api.Deps.Scan` closure re-route → `scanFlight.run` | main.go:403-405 existing closure; design D4 | 2.2 | same grep duty; joint leg (c) exercises manual POST through the flight (disabled-watcher boot) |
| E4 | `scanFlight.run` → `fn` → `scan.Run` (existing cmd closure) | fn signature `func(ctx, int64) (scan.Result, error)` matches router.go:30 field and main.go:403-405 closure; `scan.Result` run.go:52 | 2.1 (type) + 2.2 (fn identity preserved) | unit TestScanFlight* (synthetic fn); joint legs exercise real `scan.Run` end-to-end |
| E5 | `scanLibrary` handler → `api.Deps.Scan` (EXISTING — untouched) | handlers.go:1194 sole consumer (grep `.Scan(` across cmd+internal: one real hit; the other is sql `Rows.Scan` browse_wiring.go:178) | no task (untouched by design) | existing api tests (scan_inline_test.go); joint leg (c) manual POST still scans |
| E6 | reconcile tick → `Deps.Libraries` closure → `st.ListLibraries(ctx, access.System())` | design D6; store/libraries.go:349 + access/viewer.go:45 | 2.2 (closure) + 1.2 (tick diff) | unit TestRunReconcileRefreshesLibrarySet + TestRunReconcileDropsDeletedLibrary (Q6 amendment); spec scenarios new-library-becomes-watched / deleted-library-stops-autoscan (Q3/Q6 resolved — §6) |
| E7 | env knobs → `envDuration` resolvers → `watch.Config` | design D5; envDuration main.go:834-843; art precedent main.go:765 | 2.2 | unit TestWatchKnobs (defaults/malformed/floor/disable) |
| E8 | main launch → `go Service.Run(ctx)` beside janitor | launch site main.go:665-668 (`jan.runBoot(ctx)` / `go jan.run(ctx)`); design D5 | 2.2 | no cmd-side unit test; joint legs (a)/(b) fail if the watcher never launches (file change never triggers) |
| E9 | fsnotify adapter → fs events → `engine.observe` (recursive install, longest-prefix map, dir Create/Remove set maintenance) | design D3; tasks.md:8 | 1.2 | unit: TestRun* suite (7 tests over real fsnotify + t.TempDir — TestRunReconcileDropsDeletedLibrary added by the Q6 amendment) |
| E10 | joint harness → standalone env block boot → server with WATCH knobs → fs ops → HTTP polling | tasks.md:23; harness precedent: `startServer` builds its env internally (integration_test.go:246-258) so a standalone block is required — direct precedent qa_acceptance_test.go:320-336 builds its own `exec.Command` + env; plugin-bin helpers are package-local (integration_test.go:151-157 `tmdbBin`; `serialPluginBins`); guard precedent qa_tombstone_adoption_joint_test.go:761 (-short), :764 (ffprobe skip) | 3.2 | joint duty `go test ./internal/itest -run 'TestQAWatchScan'` |
| E11 | runbook rows → knob names + troubleshooting | tasks.md:21; runbook §2 :94 row shape, §8 :252 | 3.1 | duty greps both knob names in the runbook |

## 2. Check 1 — Wiring coverage

**Verdict: COVERED — every planned edge has an implementing task; no orphan nodes.**
`watch.Service` is consumed by main.go alone (N3), `scanFlight` by both closures (E2/E3),
the joint consumes the whole chain (E10). No planned edge lands in a file no task touches.

Duty-strength observations (not questions; recorded for the reviewer):

- **W1 — NOTICE pin.** Task 1.2's verify greps only `go.mod` for fsnotify; the NOTICE
  attribution line (tasks.md:8) has no duty assertion. The edit could be dropped and the
  duty stays green. Trivial to strengthen (`grep -q fsnotify NOTICE`).
- **W2 — both-sides re-route pin is count-based.** `grep -c 'flight.run' ≥ 2` counts
  occurrences, not closures — it could pass with one real route plus a comment. Runtime
  coverage compensates across legs (E2 via legs a/b, E3 via leg c), but no single test
  pins the BOTH sides of the join — folded into Q5, now WAIVED at unit tier
  (human-approved at GATE 1 — §6).
- **W3 — TestWatchKnobs is vacuous until authored.** No `main_test.go` exists (N4 is
  new); `go test -run TestWatchKnobs` with no matching test exits 0. The duty's grep half
  gives it teeth today; the qa-style existence gap is the normal new-module posture.

## 3. Check 2 — QA seam coverage

Named qa entries: 5 engine tests (tasks.md:6), 7 adapter tests (tasks.md:9 —
TestRunReconcileDropsDeletedLibrary added by the Q6 amendment), 3 joint legs
(tasks.md:24). Self-authored test duties (no `@qa`): scanflight 3 tests
(tasks.md:14-15), TestWatchKnobs (tasks.md:16). Note for the GATE 1 human's mandate
check: tasks 2.1/2.2 are new-file tasks without `@qa` — the house mandate reads
"new-module"; whether a new file in an existing package counts is the human's call;
their coverage is in-task and their duties have teeth, so the surveyor raises no refusal.

Spec-scenario → coverage map:

| Spec scenario | Covered by | Tier |
|---|---|---|
| created-file-triggers-scan | joint leg (a) | joint |
| renamed-replacement-tombstones-old-row (the incident) | joint leg (b) — end-to-end, no manual request | joint |
| mid-run-changes-schedule-one-trailing-scan | TestEngineCompletedRefiresOnDirty + TestRunReconcileTickTriggersScans | unit only |
| manual-joins-automatic / automatic-joins-manual | TestScanFlightJoinsInFlightRun (synthetic fn) + grep duty | unit + structural only — **Q5 WAIVED at unit tier (GATE 1)** |
| distinct-libraries-run-independently | TestScanFlightDistinctLibrariesIndependent + TestEngineDistinctLibrariesIndependent | unit |
| quiet-period-still-rescans | joint leg able to observe it + TestRunReconcileTickTriggersScans | unit + joint |
| reconcile-coalesces-with-running-scan | engine dirty law (unit) | unit only |
| new-library-becomes-watched | TestRunReconcileRefreshesLibrarySet; joint leg (a) also covers it if the library is created post-boot (task text ambiguous on boot order) | unit (+ joint implicitly) |
| deleted-library-stops-autoscan | TestRunReconcileDropsDeletedLibrary + qa entry (tasks.md:8-9 — Q6 amendment) | unit |
| disabled-watcher-restores-manual-only | joint leg (c) | joint |
| malformed-knob-falls-back-with-warning | TestWatchKnobs | unit |

**Verdict (re-run): COVERED.** Both cross-module gaps closed at GATE 1: Q6 by
amendment (drop-side named test + qa entry — verified at tasks.md:8-9, §7) and
Q5 by human-approved waiver at unit tier (unit + -race + structural pin + both
trigger paths covered end-to-end separately — recorded §6, honored at GATE 2).
The tombstone-on-rename incident leg
is covered end-to-end (joint leg b). Join-ctx semantics were audited and are NOT a
question: D4's starter-ctx + abandon-wait + `completed(ok=false)` → trailing re-arm is
internally consistent and grounded (scan.Run hard-fails on ctx cancel — run.go docstring
68-70; the watcher's triggers use the process ctx).

## 4. Check 3 — Complexity / blast radius

**Verdict: CLEAN — the zero-touch claim holds.**

- `scan.Run` production callers: exactly one — main.go:404 (grep across cmd/internal/plugins,
  non-test). Claim confirmed (proposal.md:70-72).
- Test-side direct `scan.Run` callers exist in two itest harness worlds
  (qa_playback_harness_test.go:134, qa_recs_roundtrip_test.go:316 — each builds its OWN
  `api.Deps` with a direct closure) and one comment (integration_test.go:35). They bypass
  the flight by construction and are untouched by the plan — consistent, no hidden scope.
- `api.Deps.Scan` consumers: exactly one — handlers.go:1194. Sole production builder of
  `api.Deps`: main.go:397. The re-route keeps the field's signature (flight fn type
  matches router.go:30), so internal/api needs zero edits — claim confirmed.
- proto untouched: the scan protos are plugin/scanner/metadata RPCs (proto/mellifera/…);
  no REST scan surface lives there — claim holds.
- store untouched: `scan_jobs` remains reserved — its only references are schema
  (store/open.go:117), delete-cascade (store/libraries.go:136), docs (store/doc.go:113).
  No scan/api/cmd reader/writer — design Non-Goal claim grounded.
- Edge fan-out is small: internal/watch fan-in 1 (cmd), fan-out 2 closures; scanflight
  fan-in 2, fan-out 1; no planned cycles; every edge lands in a file a task touches.
- Cost grounding for the 1h default: toDiscovered probes every file per walk
  (plugins/base-scanner/walk.go:102-129 — probe/probeImage per entry, no mtime skip) —
  design claim grounded.

## 5. Numbered questions (recommended answers; the human decides at GATE 1)

All seven questions were ruled at GATE 1 — the recorded resolutions live in §6,
the amendment-round landing verification in §7. Text below is the original
propose-phase record, kept as the historical question set.

**Q1 — Knob shape (carried from design.md Open Questions, converged).** Disable =
`MELLIFERA_WATCH_INTERVAL ≤ 0` per the janitor off-position law (janitor.go:62-64,
runbook :94 wording), no separate `MELLIFERA_WATCH_ENABLED` boolean.
**Recommendation: keep the two-knob surface as specified** (the design's own
recommendation; a boolean can be added later without touching the spec).

**Q2 — Fire-path dispatch semantics (under-specified; the dirty-mid-run law depends on it).**
D3 requires the engine to observe events and mark libraries dirty WHILE a scan runs, and
task 1.2 fires `Deps.Scan` on quiet-window expiry — but neither design nor tasks states
whether the fire is awaited inside Run's single select loop or dispatched. Awaited in-loop
would stall event ingestion + debounce + dirty marking for the scan's whole duration (the
janitor precedent gives each task its own goroutine loop — janitor.go:63-79 — so it does
not transfer "await in loop is fine").
**Recommendation: pin dispatch in design D3/D4 or task 1.2 — each fire (and each
reconcile trigger) runs on its own goroutine; concurrency stays bounded by the
single-flight.** Cheap amendment; the current text risks an in-loop await implementation
that silently breaks the trailing-scan law's trigger path (it would still converge, but
via post-completion event replay, not the specced dirty mechanism).

**Q3 — Deleted-library stop-triggering bound (spec wording vs D6 tick diff).**
The spec's deleted-library-stops-autoscan says changes under the former root "SHALL stop
triggering any scan" with no time bound, while D6 drops the root only at the next
reconcile tick — between deletion and tick, events under the former root still fire
`Deps.Scan`, which fails cleanly (GetLibrary error → WARN; scan.Run resolves the library
first, run.go:75-78). Behaviorally nil (no scan executes), but the spec as written is
unsatisfiable within one interval.
**Recommendation: amend the spec scenario wording to mirror the creation bound —
"within one reconcile interval" — and note the transient WARN-only fires in the runbook
row.** (Alternative: accept failed-trigger attempts as compliant and record a waiver.)

**Q4 — First-scan-after-boot gap (spec pins no-boot-scan).** The watcher starts at boot
with no boot scan; the first reconcile fires one interval after start (default 1h) —
changes made while the server was DOWN surface up to 1h after boot. Identical to today's
manual-only posture (no regression), but the incident motivator is convergence latency.
**Recommendation: keep the no-boot-scan pin** (a boot walk probes every file —
walk.go:102-129) **and document the boot gap in the runbook §2 row; operators who want
faster convergence lower `MELLIFERA_WATCH_INTERVAL`.** Do not shorten the first tick in
v1 — that is a hidden boot scan by another name.

**Q5 — Both-sides join coverage tier.** The spec scenarios manual-joins-automatic /
automatic-joins-manual (and mid-run trailing scan) have no joint-level qa entry: the
flight is unit-tested with a synthetic fn under -race, the both-sides re-route is pinned
by a count-based grep (W2), and the joint legs cover the automatic-only and
manual-only paths, never a real join. A real-server join test needs a deterministically
slow scan, which the harness cannot produce without instrumentation.
**Recommendation: waive at unit tier** (pure unit + -race + structural pin + both paths
covered end-to-end separately is a defensible Tier 2 posture), **and record the waiver
at GATE 1** — or, if cheap, add a joint assertion that exactly one "scan" completes when
a manual POST lands mid-auto-run (via server log lines). Default recommendation: the waiver.

**Q6 — deleted-library-stops-autoscan has no named test.** The drop side of the watch-set
refresh is implemented (task 1.2: "drop deleted ones") and specified (spec scenario), but
no unit test name covers it (TestRunReconcileRefreshesLibrarySet is described only for the
add side) and no joint leg deletes a library.
**Recommendation: extend TestRunReconcileRefreshesLibrarySet (or add
TestRunReconcileDropsDeletedLibrary) in task 1.2's qa: list** — a one-line amendment to
the task text and qa entry; no design change.

**Q7 — NOTICE license string.** Task 1.2 says the NOTICE line goes "beside the Swagger UI
entry (Apache-2.0, the http-swagger precedent)" — the parenthetical describes the
neighboring entry, but an implementer can copy the license string. fsnotify's LICENSE is
BSD-3-Clause (verified: `$(go env GOMODCACHE)/github.com/fsnotify/fsnotify@v1.9.0/LICENSE`,
"Copyright (c) 2012-2019 fsnotify Authors", BSD redistribution terms).
**Recommendation: amend task 1.2 to name BSD-3-Clause explicitly for the fsnotify line.**

## 6. Resolutions (recorded at GATE 1 — human decides amend or waive)

| Q | Resolution (amend / waive + notes) |
|---|---|
| Q1 | **ANSWERED** — two-knob surface kept (disable = `MELLIFERA_WATCH_INTERVAL ≤ 0`, no `MELLIFERA_WATCH_ENABLED` boolean). No artifact edit needed; design D5 + Open Questions unchanged (design.md:149-156, 212-220). |
| Q2 | **ANSWERED (amended)** — dispatch law pinned: design D3 "Dispatch law (pinned)" paragraph (design.md:97-104), D4 cross-reference (design.md:123-126), task 1.2 Run-loop prose (tasks.md:8). |
| Q3 | **ANSWERED (amended)** — spec stop bound "within one reconcile interval": requirement (specs/watch-scan/spec.md:72-74), scenario THEN (spec.md:82); transient failed-trigger WARN note in task 3.1 runbook row (tasks.md:21). |
| Q4 | **ANSWERED (amended)** — no-boot-scan kept; first-scan-after-boot gap documented in task 3.1 §2 runbook row (tasks.md:21). |
| Q5 | **WAIVED** — both-sides join coverage at unit tier; human-approved at GATE 1. No artifact change (by design). wf-reviewer honors this waiver at GATE 2. |
| Q6 | **ANSWERED (amended)** — TestRunReconcileDropsDeletedLibrary + its qa entry added to task 1.2 (tasks.md:8-9). |
| Q7 | **ANSWERED (amended)** — task 1.2 NOTICE clause names BSD-3-Clause explicitly for the fsnotify line (tasks.md:8). |

Question frontier is **EMPTY**: zero open questions; exactly one recorded waiver
(Q5), human-approved at GATE 1, to be honored at GATE 2.

## 7. Amendment-round re-run (2026-11-11 — openspec-loop §Propose step 4)

Method: the four amended artifacts re-read in the worktree @ 689a323 (branch
`feature/watch-scan`; the change folder is untracked — artifacts not yet committed);
all §1 graph anchors re-grounded against live source and unchanged (run.go:75,
main.go:403-405, router.go:30, handlers.go:1188, store/libraries.go:349,
access/viewer.go:45, janitor.go:61-62 off-position precedent, runbook :94/:252 row
shapes, NOTICE:22-27 Swagger UI entry); planned-new nodes still absent from disk
(`internal/watch`, `cmd/mellifera/scanflight.go`, `cmd/mellifera/main_test.go`);
`go.mod` still fsnotify-free. proposal.md byte-untouched.

**Per-Q landing verification (all five amendment edits present, mechanically sound):**

- **Q2** — design.md:97-104 pins the law ("the `Run` select loop NEVER awaits
  `Deps.Scan` inline — every scan trigger dispatches its own goroutine") with the
  failure rationale (an in-loop await stalls event ingestion and would converge via
  post-completion event replay, not the specced dirty mechanism) and the bound
  (single-flight keeps concurrency at one scan per library). design.md:123-126
  cross-references it from D4 ("D3's dispatch law"), and tasks.md:8 operationalizes
  it in task 1.2's Run-loop prose. D3 pins, D4 references, the task enforces — no
  contradiction with D4's starter-ctx discipline. Edge impact: none — E1/E2 already
  assumed dispatched fires; the amendment converts assumption into pinned contract.
- **Q3** — spec.md:72-74 now bounds deletion ("SHALL stop triggering automatic scans
  within one reconcile interval"), scenario deleted-library-stops-autoscan's THEN
  carries the same bound (spec.md:82), and the task 3.1 runbook row documents the
  in-gap transient ("a deleted library's in-gap events at worst log a failed-trigger
  WARN … the root is dropped at the next tick", tasks.md:21). The requirement is now
  satisfiable by the D6 tick-diff implementation. Edge impact: none.
- **Q4** — tasks.md:21 §2 row documents the boot gap ("changes made while the server
  was down surface up to one MELLIFERA_WATCH_INTERVAL after boot; operators lower
  the interval for faster convergence"), consistent with D5's no-boot-run pin
  (design.md:163-164) and the spec lifecycle requirement (spec.md:86-87). Edge
  impact: none.
- **Q6** — tasks.md:8 names TestRunReconcileDropsDeletedLibrary ("stops receiving
  scans within one tick" — mirrors the amended spec bound) and tasks.md:9 carries
  its qa entry between RefreshesLibrarySet and TickTriggersScans. The named-test gap
  is closed; E9's caught-unwired column updated (6 → 7 adapter tests); the
  deleted-library-stops-autoscan coverage-map row moves gap → unit tier; §3 verdict
  refreshed to COVERED.
- **Q7** — tasks.md:8: "the fsnotify line names BSD-3-Clause explicitly (fsnotify's
  LICENSE is BSD-3-Clause, NOT Apache-2.0)" — the parenthetical correctly describes
  the NEIGHBORING Swagger UI entry (Apache-2.0) while pinning fsnotify's own license;
  the copy-the-wrong-string hazard is gone. Edge impact: none.

**Verdict deltas from the re-run:** wiring coverage unchanged (COVERED; W1/W3 duty
observations stand — task 1.2's verify still greps only go.mod, so the NOTICE line
and the new test remain prose-pinned rather than duty-asserted); qa seam coverage
COVERED (Q6 closed, Q5 waived per §6); complexity unchanged (CLEAN — the zero-touch
claim re-checked: `scan.Run` still has exactly one production caller, main.go:404;
`api.Deps.Scan` still has exactly one consumer, handlers.go:1194).

**Cosmetic observation (planner-flagged, no action):** proposal.md's Impact list
names only "§2 knob rows" for the runbook (proposal.md:69) — the §8 troubleshooting
row added by the amendments is not listed beside it. proposal.md shape is frozen at
GATE 1 approval and tasks.md:21 is the executable contract; recorded here so the
gate reader does not mistake it for drift.
