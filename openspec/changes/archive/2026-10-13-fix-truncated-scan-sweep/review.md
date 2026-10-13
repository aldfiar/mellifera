# Gate record: fix-truncated-scan-sweep

## GATE 2 — 2026-10-13

**Reviewer verdict: PASS-with-FLAGs — Approved.** (@wf-reviewer, adversarial pass)

- Probes: 4/4 PASS on the reviewer's own uncached runs (c7583e056fbcda8b, f2ddf8f24c53232e, 10894af4d44c3a67, d9c1c7d081cf3601); carried floors re-run green; `go build ./...`, `go vet`, `gofmt`, `go test -race` clean.
- `wf change check fix-truncated-scan-sweep`: OK (rc 0) — 4/4 probes re-run, coverage requirements=2 probe_backed=2 gaps=0, fingerprints match.
- Spec axis: both deltas (scan-library drain classification, serial-library sweep/self-heal) satisfied — every SHALL has code + a pinning test; no behavior change without a delta beyond the three recorded coder deviations (all judged sound: walk.go terminal-state factoring, ScanStream-direct unconfirmed test, ctx.Err() preference in the Recv-error branch).
- Standards axis: no P0/P1/P2. Advisory flags:
  - F1 (P3): unreadable scan root still reads as a confirmed clean+empty pass (pre-existing semantics, deltas silent) — follow-up change candidate: a typo'd root must not sweep.
  - F2 (P3): TestTruncatedStreamWarnsIncomplete could also assert res.Persisted (covered at suite level by the repro's 3/3 guard).
  - F3 (P3, note): server-side bare close maps to clean wire EOF — deliberate binary-compat, unreachable from scannerGRPC by construction.
- UNPROBEABLE: zero, confirmed true (no token; all boxes probe-backed).
- Out of scope, untouched: per-library scan concurrency guard; SMB transport root-cause; pre-existing TestRunScan_Orchestration/persist_probed_and_unprobeable failure (schema_version=2-vs-1, fails at pristine HEAD — owner TBD, isolated from this diff).

## Human archive approval

Approved 2026-10-13 via the GATE 2 gate question (user selected "Approve archive (Recommended)") after the verdict, flags, and post-archive recovery path (one healthy rescan of library 2 restores the 19 wrongly-tombstoned series) were presented. Archive may proceed.
