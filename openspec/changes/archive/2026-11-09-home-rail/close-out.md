# Close-out — home-rail (archived 2026-11-09)

The durable record of the run. Machine home `.tmp/home-rail/` is deleted at clean;
the living specs (home-continue, web-ui, recommendation-sorting) carry the merged
deltas; review.md is the GATE 2 record.

## Landing shape

- Branch `feature/home-rail` (base fa3c254), worktree-isolated, strict lane.
- Commit 3260ee2: the applied work + gate record — 26 files, +2857/−340
  (internal/api ×4, web ×3, regenerated openapi + embedded dist, the whole
  change folder).
- Server + SPA ship in ONE release (embedded dist regenerated in the same
  commit — old SPA derefs `row.current` at five points and would crash on
  anchor rows; no server-only rollout).

## Final receipt summary (receipts.jsonl, all green)

| task | duty | apply rc | gate re-run rc |
|---|---|---|---|
| 1.1 entity layer | `go test ./internal/api -run 'TestHomeRoute'` | 0 (1424ms, wf-coder) | 0 (3275ms, wf-reviewer, fresh) |
| 1.2 route rework | `go test ./internal/api -run 'TestHomeRoute\|TestBrowseScaleJoint'` | 0 (1747ms, wf-coder) | 0 (401ms, same-code-state cache) |
| 2.1 web rail (@qa) | `cd web && npx tsc --noEmit && npx vitest run src/pages/home/Home.test.tsx` | 0 (4702ms, wf-qa) | 0 (7211ms) |
| 3.1 artifact regen | `make web-build` (GOPATH/bin self-set) | 0 (12189ms, wf-coder) | 0 (12124ms — byte-idempotent, same dist hash) |
| git-check | tree committed, branch pushed | — | 0 (53ms, session, after the close commit + push) |

GATE anchor: `go test ./...` 25/25 packages ok (internal/itest fresh 326.6s) ·
web vitest 700/700 (52 files; baseline 699 + 1). GATE 2: APPROVE, no FAIL, no
FLAG of substance; human archive approval recorded in review.md.

## What shipped

- `GET /api/v1/home` at entity grain: one card per touched series; anchor
  cards (caught-up series) carry NO `current` key on the wire
  (`Current *continueCurrent json:"current,omitempty"` — the 98%-resume lie
  and the duplicate-Next-chip wall are impossible by construction); caught-up
  without next serves no row; resume rows byte-identical to the old shape
  when present (pin: resume_row_byte_parity).
- internal/api: homeEntities/scoreHomeEntities/orderHomeEntities (unexported,
  beside the existing scorers in recs_ordering.go); home() rewired; the old
  homeLoad/homeSeries per-item path deleted (zero stale callers, verified by
  the reviewer's tree-wide grep); /progress untouched.
- SPA: ContinueCard anchor branch (series name in the title slot, Next chip
  primary, no position/bar/Play-into-current), key law
  `series_id || current?.item_id`, `current?` optional in api.ts; pinned by
  `renders-anchor-card-current-absent`.
- Wire/type artifacts regenerated: internal/web/api/openapi.{json,yaml}
  (current → allOf + omitempty doc), internal/web/dist (index-Cznl0keC.js).

## Follow-up seeds (not this change's scope)

1. **internal/art detached-fetch/TempDir flake** (pre-existing, proven on the
   untouched tree): a detached background fetch races t.TempDir RemoveAll.
   Did not reproduce at the gate anchor; seed for a small dedicated fix.
2. **Reviewer observations (5, cosmetic)**: design.md §Interfaces sketched
   `a.scoreHomeEntities(ctx,…)` as a method — implemented as the purer
   package-level fn; QueryItemsBySeries pre-cut runs per *resolved* touched
   series (the only coherent reading — a floored entity has no series row);
   floored entities carry no artwork leg (honest direction; delta text
   silent on it); the web anchor branch defensively renders a bare series
   card for a never-served shape (serve law drops it server-side);
   proposal.md keeps the older entity-layer phrasing (O1 residual — the
   binding task line pins recs_ordering.go, code complies).
3. **Diagnosis secondary findings, still open** (from
   .tmp/recs-watched-rail-2026-11-08.md): tombstoned-series empty-name rail
   rows (compose identity through tombstones or stop listing deleted series
   rows); deploy.sh `.deploy-rev` stamp (the deployed SPA once matched no
   commit — THIS deploy regenerates dist from the merged tree, healing it;
   the stamp idea stays open).
4. **Pre-existing build noise, not acted on**: npm ci 20-vulnerability audit
   notice; vite >500 kB chunk-size warning; swag "TypeSpecDef is nil" noise
   for stdlib types.
