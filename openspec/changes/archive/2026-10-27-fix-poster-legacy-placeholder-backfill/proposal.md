# Proposal

## Why

Series documents enriched before the write-side missing-art drop (4eb1067, 2026-10-24) still store `sources.shikimori.poster = …/assets/globals/missing_original.jpg` (17/88 series). Three consistent placeholder filters floor these to "no artwork" at compose, so cards render the generated fallback on every refresh — while identify/preview and the poster overlay show the raw URL (the admin exception), making posters appear to "collect then fade". Nothing was deleted; the stored state is a lie the read side papers over. Secondary defects in the same seam: the overlay answers a bare `{"current":"","candidates":[]}` for placeholder-only series (indistinguishable from "the plugin never ran"), item surfaces never inherit the series poster, and the art-blob channel masks a 401 as the fallback gradient (during a token rotation everything looks "cleaned").

## What Changes

- Settle repair leg (1.1): the settle pass strips `sources.<ns>.poster` keys carrying the missing-art prefix from live stored docs — the write-side rule applied to old state, scoped to EXACT path-prefix matches; a real URL is never touched. This is the /fix repro: its verify duty is a test that FAILS on base a467358.
- Golden repair fixture (1.2): legacy-placeholder-doc → repaired-roundtrip vectors pinned as a committed golden, per the `internal/api/testdata/golden/` idiom.
- Overlay "no upstream art" state (2.1): `GET /api/v1/series/{id}/posters` (and the items twin) serves an explicit `reason` field (`no_upstream_art`) when every stored namespace poster key is a placeholder; the web PosterOverlay renders it («У источника нет постера») — field-driven, never source literals. api/ stays pure delegation.
- Series poster fallback in item compose (2.2): item surfaces inherit the owning series' chain poster when the item resolves none (read-time compose in internal/api, unchanged wire shape).
- Art-blob 401 routing (3.1): `useArtworkObjectUrl` stops absorbing the rotated session's 401 as the generated fallback — the app's single `handle401` rotation owns the surface.

The three placeholder-filter copies (convert.go:191, settle.go:37-43, art.go:66-75) stay put — the ≤8-exports cap (api is at the 12 hard-fail boundary) wins over consolidation; the golden fixture keeps them pinned.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `artwork`: the missing-art requirement gains the settle repair leg (stored-state repair, prefix-exact, real URLs untouched); composition precedence gains the item→series fallback leg; the poster override family's GET envelope gains the served `no_upstream_art` reason.
- `web-ui`: the poster overlay's empty state becomes field-driven on the served reason; the poster art channel's 401 routes through the app's 401 rotation instead of masking as the fallback.

## Impact

- `internal/art/settle.go` (repair leg + write-back via `store.PutSeries`/`store.PutItem` — internal/art has no doc-write today, so the repair test is red on base), new `internal/art/settle_test.go`, new `internal/art/testdata/golden/poster_repair.json`.
- `internal/api/art.go` (posters reason on the unexported envelope; compose fallback in `artworkFor`/`itemDTOs` — zero new exported symbols; internal/api already sits AT the 12 hard-fail boundary), `internal/api/art_test.go`, `internal/api/handlers.go` (compose only).
- `web/src/lib/queries.ts` (401 routing), `web/src/lib/api.ts` (DTO field), `web/src/components/manage/PosterOverlay.tsx` (reason state); their tests.
- Regenerated embedded artifacts via `make web-build` (swag OpenAPI picks up the response field; dist rebuild).

### Baseline

Base a467358 is GREEN: `go test ./...` rc 0 (22 pkgs), `npx vitest run` 29 files / 383 tests. The full suite re-runs only at the worktree bootstrap and the GATE.

### Repro (why task 1.1's duty is red on base)

`Settle` (internal/art/settle.go:60-81) only SKIPS placeholder URLs (`missingArtURL` guard at settle.go:69-71) and walks rows read-only (`walkPosterURLs`, settle.go:84; the package's only store writes are `DeleteArtFetch` rows — grep-verified: no `PutItem`/`PutSeries` call exists in internal/art). A stored doc carrying a legacy placeholder poster key therefore survives every settle pass unchanged, so a settle-level test feeding such a doc and asserting the strip CANNOT pass on a467358. The duty also guards on the test file's existence so it fails (not vacuously passes) before the fix lands.
