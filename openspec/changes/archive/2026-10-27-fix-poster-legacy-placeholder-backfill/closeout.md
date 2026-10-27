# Close-out — fix-poster-legacy-placeholder-backfill

Archived 2026-10-27. Base a467358 → HEAD at close: `docs(openspec)` 84356f6. Pipeline home receipts: 14 total (6 authored duties ×2 — original run + reviewer re-run — plus git-check ×2), final status **7/7 rc 0**.

## Final per-task receipt summary

| Task | Commit | Duty (final receipt) | Result |
|---|---|---|---|
| 1.1 settle repair leg | `c317e00` | go test ./internal/art -run TestSettleRepair | green 21:36:24Z (wf-qa orig; wf-reviewer re-run) — the /fix repro, red on base, green at close |
| 1.2 golden repair fixture | `83cda93` | go test ./internal/art -run TestPosterRepairGolden | green 21:36:31Z — 4 vectors, semantic equality |
| 2.1 posters `no_upstream_art` reason | `2037e0b` | go test TestPostersNoUpstreamArtReason && vitest PosterOverlay.test.tsx | green 21:36:41Z — 6-vector exactly-when table + served-copy UI test |
| 2.2 item→series fallback | `c2e839e` | go test ./internal/api -run TestItemArtworkSeriesFallback | green 21:36:51Z — 9 vectors through ONE GET /items (no N+1, priced) |
| 3.1 art-hook 401 mask removal | `41214ee` | vitest src/lib/queries.test.tsx | green 21:37:00Z — 22 tests, red-on-base verified |
| 3.2 embedded regen | `7d42d6b` | make web-build + clean-tree guard + go build | green 21:37:24Z — byte-reproducible rebuild (in-session completion after a toolless-runner HALT; verified legitimate at GATE 2) |
| git-check (built-in) | — | git check — tree committed, branch pushed | green 05:31:42Z 2026-10-27 (after push -u origin) |

## Gate record

GATE 2 verdict **PASS** (all six re-run independently by @wf-reviewer; receipts now the reviewer's own). Full-suite anchor at gate: go test ./... 22 pkgs ok; vitest 29 files / 386 tests. Human archive approval 2026-10-27 in review.md.

## Spec deltas merged

- `openspec/specs/artwork/spec.md` — 3 requirements MODIFIED (settle repair of legacy placeholder keys; posters reason served honesty; item→series artwork fallback).
- `openspec/specs/web-ui/spec.md` — 2 requirements MODIFIED (overlay no-upstream-art state; art-hook 401 posture).

## Carried seeds (non-blocking)

- **S-1 (P3, judgement call):** Settle's rows shape retains every walked document in memory for the boot pass — streaming walk is the fix token if library scale ever makes RSS matter.
- **2.2-era WARN-tail flake:** pre-existing acquisition-goroutine teardown timing, adjudicated not-a-race (count=5 + full -race green).
- Pre-existing, unrelated: 4 lint errors in `web/src/pages/admin/Sources.test.tsx`; docs debt (api-reference ~8 layers behind, ui-roadmap table + .project_context.json stale, api/doc.go INV2/INV5) — dedicated docs pass.
