# Close-out — fix-trash-rerename

Closed 2026-11-10 · GATE 1 approved round 1 ("approve") · GATE 2 APPROVED round 1 (review.md gate record; FLAG-1 deferred) · human archive approval "approve, deploy on alatoic" same day · archived as `2026-11-10-fix-trash-rerename` (spec deltas merged: packaged-playback ~2 — Remux-only pack lane + Budget-capped artifacts carry the stranded-trash delete-on-sight law).

## What shipped

The stranded-trash guard in `evictDir` (cmd/mellifera/playback.go:676): a path already ending in `.trash` is deleted directly — best-effort, failed removal Warn+false mirroring today's removal-failure shape, success Info+true — instead of being renamed to a second `.trash` suffix. The rename-aside branch below the guard stays byte-identical (unsuffixed eviction still protects a client mid-fetch); no sweep/loop signature changes; all three call sites (demotion ~509, budget ~594, retention ~661) heal through the one guard. Root cause eliminated: the sweep could no longer grow a stranded dir's suffix per pass (the prod mechanism — 39 suffixes on `44b3d67ef54a2033` over ~38 boots, ENAMETOOLONG WARN every boot, bytes never reclaimed); a failed reclaim now retries the SAME name, and any removable stranded dir (any suffix depth) is reclaimed on sight.

## Final receipt summary (the durable record once the machine home is gone)

- **Plan**: 1 group, 1 authored task + built-in git-check. Final state 2/2 green, `wf pipeline status` rc 0.
- **Receipt ledger**: 3 events, zero reds beyond the EXPECTED-pending git-check at gate time:
  - 1.1 (wf-coder) — green FIRST run, 3746 ms. Duty: `go test ./cmd/mellifera -run 'TestSweepRetentionTrashDeleteOnSight|TestSweepRetention|TestSweepBudget' || exit 1`. The repro test had been authored RED by the diagnose pre-step (dead1.trash grew dead1.trash.trash at pass 1 — the growth mechanism reproduced exactly) and flipped green against the fix.
  - 1.1 (wf-reviewer) — gate re-run rc 0, cmd-match holds; anti-cache `-count=1 -v`: repro 2/2, retention 7/7, budget 4/4.
  - git-check (wf-reviewer) — RED at gate (EXPECTED pending push per close order) → green at close (bb283a7 push).
- **GATE 2 full-suite anchor**: `go test ./...` every package ok (internal/itest 408 s); gofmt/vet clean; `openspec validate --strict` rc 0. First spotless gate in this install: zero reds besides the by-design pending git-check, no fix rounds.

## Loop lessons

1. **handoff-put before pipeline-init blocks init**: the diagnose pre-step's `wf handoff put` created `.tmp/<feature>/` before `wf pipeline init`, whose exists-refusal then fired. Resolution: re-put after the change folder existed (the sanctioned election home — `changes/<feature>/handoffs/`), remove the bare pre-init dir, init, register. The /fix sequencing (seed before scaffold) hits this every time until the verb adopts a bare dir.
2. **Diagnose-pre-step-authored repro tests make first-run-green gates cheap** — the acceptance floor pre-exists the apply task, so the coder's red-to-green is provable in one receipt. This is the pattern that produced the spotless ledger.

## Follow-up seeds (carried to docs/backlog.md by the docs sweep)

P3 fixture-hoisting pass in cmd/mellifera/retention_test.go (GATE 2 FLAG-1): trashSeed/trashBuild/trashBackdate near-copy TestSweepRetention's closures — extract shared package-level fixtures. Nothing else staled: project_structure cmd/mellifera clause updated with the guard; orchestrator budget rows accurate as-is (policy package untouched); api surface unchanged.

## Deployment

DEPLOYED to alatoic from this branch (human-authorized with the archive approval; PR merge pending). Post-fix, the next sweep pass reclaims the stranded prod directory (`data/streams/itm_4_35e5baf7a6a1cdc4/44b3d67ef54a2033.trash×39`) the moment its transient removal blocker lifts; if the blocker persists, the name stays steady at 39 with a per-boot WARN instead of growing. The per-boot ENAMETOOLONG WARN disappears either way.
