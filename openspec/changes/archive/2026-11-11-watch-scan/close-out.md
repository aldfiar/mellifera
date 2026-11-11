# watch-scan — close-out

Closed 2026-11-11. Branch `feature/watch-scan` (base 689a323), archived as
`openspec/changes/archive/2026-11-11-watch-scan/`; living spec
`openspec/specs/watch-scan/spec.md` (+5 requirements).

## What shipped

Auto-rescan of watched library folders on filesystem change — no manual REST
scan required. Motivating incident: byte-identical duplicate episode downloads
under renamed variants sat in the library until a manual `POST
/libraries/{id}/scan` tombstoned the old copies.

- `internal/watch` — new pure-leaf package: `engine.go` (unexported state
  machine over explicit `now`, re-arm on `!ok` OR dirty = one trailing scan),
  `watch.go` + `fsnotify.go` (recursive watch-set install, longest-prefix
  event→library mapping, dir Create/Remove maintain the set, reconcile tick
  refreshes the library set on CRUD, dispatch law: every scan trigger runs in
  its own goroutine — the loop never awaits a scan inline), mutex + backstop +
  nextDeadline.
- `cmd/mellifera/scanflight.go` — unexported single-flight per library:
  join-or-start, the starter's ctx runs the scan, a waiter's ctx governs only
  the wait; entries are deleted after completion so window-triggers join the
  recorded outcome.
- `cmd/mellifera/main.go` — ONE scanFlight shared by the manual scan endpoint
  (`api.Deps.Scan`) and the watcher (`watch.Deps.Scan`); `go watchSvc.Run(ctx)`
  beside the janitor; knobs `MELLIFERA_WATCH_INTERVAL` (default 1h; ≤0
  disables the watcher alone, UNFLOORED, janitor off-position law) and
  `MELLIFERA_WATCH_DEBOUNCE` (default 30s, floor 1s). No boot scan — the
  first-scan-after-boot gap is documented in the runbook.
- `docs/operator-runbook.md` — §2 knob rows + §8 troubleshooting row.
- `internal/itest/qa_watch_scan_joint_test.go` — 3 joint legs: file-create
  triggers with NO scan POST; rename-variant tombstones (the incident);
  INTERVAL=0 disabled → manual-only.
- `go.mod` — `github.com/fsnotify/fsnotify v1.10.1`; `NOTICE` names its
  BSD-3-Clause explicitly.

## Final per-task receipts (durable record)

14 receipts in the machine home, ZERO red anywhere. First green + reviewer
re-run per task:

| Task | First green | Re-run at gate |
|---|---|---|
| 1.1 watch engine | wf-coder 333ms | wf-reviewer 1153ms |
| 1.2 fsnotify watcher | wf-coder 3767ms (re-verified after size-limit refactor) | wf-reviewer 3582ms |
| 2.1 scanFlight | wf-coder 2640ms (-race) | wf-reviewer 4050ms |
| 2.2 main wiring + knobs | wf-coder 1218ms | wf-reviewer 2076ms |
| 3.1 runbook | wf-coder 10ms | wf-reviewer 8ms |
| 3.2 joint itest (@qa) | wf-qa 40877ms | wf-reviewer 39439ms |
| git-check | — (built-in) | wf-reviewer green at close, post-commit+push |

## Gate record

GATE 1: APPROVED with all 7 surveyor recommendations (integration.md Q1–Q7
resolved; §6 of this archive). GATE 2: PASS both axes, zero FAIL/FLAG; 4 P3
non-blocking observations recorded in review.md (failed-scan retry cadence
~30s until the tick drops it; `engine.backstop` as a 4th engine op;
`dropUnder` O(dirs); 30–34-line tests). Full suite `go test ./...` exit 0
(459s incl. itest), gofmt/vet clean, `openspec validate watch-scan --strict`
rc 0. Human archive approval recorded in `review.md`.

## Residuals

- Failed-scan retry cadence (P3): a scan that errors re-fires every debounce
  until the reconcile tick drops the trigger — acceptable; seeded in review.md.
- Deploy: operator deploys to alatoic via the standard rsync → docker build
  recipe; watcher defaults (1h reconcile / 30s debounce) are live-safe for the
  current single-host, RO-container-mount topology.
