# GATE 2 review — watch-scan

Reviewer: wf-reviewer · Date: 2026-11-11 · Base: 689a323 · Worktree: `mellifera.worktrees/watch-scan` (branch `feature/watch-scan`, tree deliberately uncommitted at gate time)

## Verdict

**PASS — GATE 2 reviewer verdict recorded; human archive approval may proceed.**

- Spec axis: **PASS** — every spec-delta requirement implemented, every scenario covered per the GATE-1-approved coverage posture; no code outside the spec's scope.
- Standards axis: **PASS** — zero hard violations; four judgement-call observations recorded below, none gate-blocking.
- git-check: **RED BY DESIGN at gate time** (pending close-order push) — the EXPECTED state recorded by the fix-trash-rerename close-out; not a gate failure. Pipeline `status` rc 1 is due to git-check alone (6/7 green).

## 1. Per-duty re-runs (`wf pipeline verify watch-scan <id> --by wf-reviewer`)

All six green tasks re-run in the reviewer's own shell; every rc 0; every receipt's `cmd` equals the row's current `duty.verify` (cmd-match green rule holds — receipts.jsonl cross-checked line by line against tasks.md).

| Task | Duty (abbrev.) | Re-run | Result |
|---|---|---|---|
| 1.1 | `go test ./internal/watch -run 'TestEngine' -count=1` | 1153 ms | ok, rc 0 |
| 1.2 | `go test ./internal/watch -count=1 && grep -q fsnotify go.mod` | 3582 ms | ok, rc 0 |
| 2.1 | `go test -race ./cmd/mellifera -run 'TestScanFlight' -count=1` | 4050 ms | ok, rc 0 |
| 2.2 | `go test ./cmd/mellifera -run 'TestWatchKnobs' -count=1 && test flight.run count ≥ 2` | 2076 ms | ok, rc 0 |
| 3.1 | grep both `MELLIFERA_WATCH_*` knobs in the runbook | 8 ms | ok, rc 0 |
| 3.2 | ffmpeg guard + `go test ./internal/itest -run 'TestQAWatchScan' -count=1` | 39439 ms | ok, rc 0 |

Task 1.2 carries two prior receipts (a re-run, both green) — normal re-verification, both cmd-matched.

## 2. GATE full-suite anchor

- `go test ./...` — **exit 0, every package ok, zero FAIL** (internal/itest 459 s incl. the new joint; internal/watch 4.2 s; cmd/mellifera 1.9 s; the no-test-file packages are pre-existing: pack, refusal, relay, sourcestate, proto/*).
- `gofmt -l` — changed surfaces (`internal/watch`, `cmd/mellifera`, `internal/itest`) **clean**. Two repo files flagged (`.claude/skills/mellifera-build/module-template/doc.go`, `plugins/shikimori/convert_test.go`) are byte-identical to base 689a323 — pre-existing, outside this diff.
- `go vet ./...` — clean.
- `npx --yes -p @fission-ai/openspec@1.14.0 openspec validate watch-scan --strict` — **rc 0** ("Change 'watch-scan' is valid"); pin 1.14.0 honored per `openspec/config.yaml`.

## 3. Diff vs spec deltas

Reviewed `git status --porcelain` + full reads of every changed/new file against `specs/watch-scan/spec.md`:

- **Automatic scan on filesystem change** — engine quiet window extends on each event (`internal/watch/engine.go:50-59`, `TestEngineEventExtendsDeadline`), fire at expiry (`engine.go:65-74`), mid-run changes mark dirty → exactly one trailing scan (`engine.go:117-128`, `TestEngineCompletedRefiresOnDirty`). Joint legs (a)/(b) green (created-file trigger; rename → tombstone + replacement, no manual request).
- **Single-flight per library** — `cmd/mellifera/scanflight.go:61-89`: join-or-start keyed per library; starter's ctx governs the run, waiter's ctx governs only the wait; recorded outcome published via `close(done)` before map removal (no second fn execution in the completion window). Both trigger closures route through ONE instance (`main.go:405,417,709`).
- **Periodic reconciliation walk** — `internal/watch/watch.go:168-175` (refresh + per-library backstop); running library folds to dirty (`engine.go:80-91`). `TestRunReconcileTickTriggersScans` proves recurrence.
- **Watch set follows library CRUD** — `watch.go:180-200` diff install/drop at each tick; `TestRunReconcileRefreshesLibrarySet` + `TestRunReconcileDropsDeletedLibrary` (the Q6 amendment) green.
- **Watcher lifecycle and operator knobs** — enabled by default, launched beside the janitor, Run errors WARN (`main.go:683-721`); ≤ 0 disables alone (no construction, `main.go:692`); malformed → default + warning naming the knob (`envDuration`, `main.go:890-894`); debounce floored at 1 s (`main.go:899-901`); no boot scan (Run installs watches only; the ticker fires first one interval in). Joint leg (c) proves the off position end-to-end.
- **No scope creep**: `internal/scan`, `internal/api`, `internal/store`, proto tree untouched (git status confirms — zero modified files under them), `scan_jobs` stays reserved, no new REST surface. Leg (b)'s `?status=deleted` audit-window assertion strengthens the spec's own tombstone law — verified, not added behavior. The `wake` channel is the dispatch law's re-arm mechanism (D3 scope).

## 4. Integration re-ground

Map rebuilt + `CURRENCY: CURRENT` @ 689a323 (Go backend is file-level — per the surveyor's method note, def/caller grounding fell back to live-source grep with citations):

- `scan.Run` production callers: **exactly one** — `cmd/mellifera/main.go:407` (the shared `scanFn` closure). Proposal blast-radius claim holds.
- `api.Deps.Scan` consumer: **exactly one** — `internal/api/handlers.go:1194`; internal/api untouched; field signature preserved (`internal/api/router.go:30`).
- **E2+E3 wired**: `flight.run` at `main.go:417` (api closure re-route) and `main.go:709` (watch.Deps.Scan), same `flight` + same `scanFn` — one seam, both directions join (duty grep counted code sites, not comments; verified by read).
- `internal/watch` fan-in: **1** (main.go only; the sole other reference is a comment in the itest). No orphan: every new symbol has a live caller (engine.observe/dueFires/backstop/completed/nextDeadline/trig; watchSet.addRoot/removeRoot/installTree/dropUnder/owner/libraryIDs; scanFlight.run/newScanFlight; watchInterval/watchDebounce all consumed in main.go or in-package).
- **Waiver honored** — Q5 (both-sides join coverage at unit tier, human-approved at GATE 1, integration.md §6): honored. Join semantics proven at unit tier under `-race` with goroutine-dump parking proof (`TestScanFlightJoinsInFlightRun`), both real trigger paths route through the one flight (verified at 417/709), and each path is covered end-to-end separately (legs a/b automatic, leg c manual). No unwaived unimplemented edge found.
- **Surveyor's resolutions table matches reality**: Q1 two-knob surface (no `MELLIFERA_WATCH_ENABLED` anywhere in code); Q2 dispatch law pinned in design.md:97-104 and implemented (every trigger dispatches its own goroutine, `watch.go:229-241`; the loop never awaits inline); Q3 spec bound "within one reconcile interval" (spec.md:72-74, 82) + runbook in-gap WARN note; Q4 boot-gap documented in the runbook §2 row; Q6 `TestRunReconcileDropsDeletedLibrary` exists (`watch_test.go:214`) + qa entry; Q7 NOTICE names BSD 3-Clause explicitly. All five §1 node anchors re-verified in live source (run.go:75, router.go:30, handlers.go:1188/1194, store/libraries.go:349, access/viewer.go:45).

## 5. Standards axis

- internal/watch: **5 top-level exported symbols** (Library, Deps, Config, Service, NewService — ≤ 8 budget); `doc.go` present; **pure leaf** — imports stdlib + fsnotify only (no mellifera imports); pure engine / thin adapter split holds; dependency direction DOWN (cmd → watch wiring only).
- Complexity budget: every named file under the fail line — watch.go 275, engine.go 128, fsnotify.go 122, doc.go 26, scanflight.go 89, main.go delta +75 lines (1574 → 1649). New non-test functions all ≤ 30 lines, nesting ≤ 2. The itest joint (439 lines) sits within the house norm (existing qa joints run 724–1414 lines).
- No hardcoded secrets; no unused imports (vet clean); errors logged with context, never swallowed (watch errors WARN + reconcile backstop continues — the spec's graceful-degradation law).

**Judgement-call observations (P3, none gate-blocking):**

1. **Failed-scan retry cadence** — `completed(ok=false)` re-arms every debounce (`engine.go:122-123`): a deleted library's in-gap triggers retry ~each debounce (default 30 s → up to ~120 fast-failing attempts + WARN lines per library per 1 h interval until the tick drops the root). This is the design-pinned failure re-arm law (D4 context discipline), bounded by the tick, and the runbook §8 row documents the in-gap WARNs. Acceptable; a future refinement could cap in-gap retries.
2. **`engine.backstop` is a fourth engine operation** beyond design D3's named trio (observe/dueFires/completed) — the tick's arm-or-dirty entry. Implementation refinement serving D2/D6, comment-documented (`engine.go:76-91`); consistent with the design's intent.
3. **`dropUnder` iterates the whole dirs map per Remove/Rename event** (O(dirs) per file event, `fsnotify.go:83-92`) — negligible at media-library scale; the reconcile walk covers any drift.
4. **Test functions run 30–34 lines** in watch_test.go/scanflight_test.go — the house test convention's arrange-act-assert shape; baseline judgement call, consistent with neighboring suites.

## Gate record

Six duties re-run green with cmd-match · full suite exit 0 · gofmt/vet/validate clean · waiver Q5 honored · resolutions table verified · git-check red by design (pending close-order push — the fix-trash-rerename close-out's EXPECTED state). Reviewer verdict: **PASS**. Human archive approval is the remaining gate input.

## Human archive approval

APPROVED by the operator (GATE 2 PASS presented; all four P3 observations accepted as recorded judgement calls, none blocking) — 2026-11-11. Close order authorized: commit + push, git-check green, archive, docs, close-out, clean, merge-back.
