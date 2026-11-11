# Handoff — session (watch-scan)

GATE 1 APPROVED (with all 7 surveyor recommendations; amendment round landed + surveyor re-run verified, frontier empty — resolutions in integration.md §6, sole waiver Q5 join-coverage-at-unit-tier).

Registered: 7 tasks (1.1, 1.2, 2.1, 2.2, 3.1, 3.2 + built-in git-check), 0 receipts. Worktree attached in header.

Next: apply task **1.1** (internal/watch pure engine), then 1.2 (adapter, needs 1.1), 2.1 (scanflight, independent of G1), 2.2 (main wiring, needs 2.1), 3.1 (runbook), 3.2 (joint, needs all). Dispatch order = group order; 1.2 ∥ 2.1 safe (disjoint packages).

Baseline: full `go test ./...` green at 689a323 (worktree bootstrap). Machine home: `.tmp/watch-scan/` in the worktree.
