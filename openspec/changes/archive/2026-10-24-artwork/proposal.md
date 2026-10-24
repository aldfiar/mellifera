# Proposal

## Why

Every browse surface that should show poster art shows nothing or lies: the live instance's 25 series all carry `sources.shikimori.poster`, but 16 of them carry shikimori's identical missing-art asset (`…/assets/globals/missing_original.jpg`), and the SPA renders a blank `scard-poster` span with no art endpoint to fetch from. Layer 2 of the UI improvement roadmap puts real poster art on every library surface, served through the binary, with an honest missing-art treatment: chain-walk skips placeholders, a deterministic generated fallback covers absence, and the admin gains a poster override family symmetric to titles.

## What Changes

- NEW `internal/art` package: a content-addressed art store (`<data>/art/<sha256>/`) with fetch-once acquisition (singleflight per URL, ≤2 concurrent upstream, 15 s timeout, ≤8 MB cap, in-memory failure cooldown) and an upload ingest guard (magic-byte sniff JPG/PNG/WebP ≤ 8 MB, center crop-once 2:3, original + cropped stored, cropped served).
- Served `seriesDTO`/`itemDTO` gain an additive `artwork` field (resolved proxy URL, `omitempty`), composed at read time: override → first non-placeholder poster on the gate-resolved chain → absent. The SPA reads only this field.
- NEW wire surface: `GET/HEAD /api/v1/art/object/art_<sha256>` (browse group, admin+client) and the poster override family `GET/POST/DELETE /api/v1/series/{id}/posters|poster` mirrored on `/items/{id}` (admin group).
- The cmd-side janitor generalizes into a named multi-task registry (day-one tasks: `streams` folded in unchanged + `art` settle+GC); GC reclaims on reference loss, never time; an env knob disables the art task only.
- shikimori plugin drops `poster`/cast `photo_url` on write when the URL is a known missing-art asset — existing placeholder rows stay honest via the walk-side skip, pinned by a shared golden fixture consumed by both the plugin and api tests.
- SPA: `PosterFrame` component (real art through the authenticated channel, else a deterministic generated fallback card), a module-scope object-URL LRU, poster rendering on three surfaces (collection series cards, series-flow header, item detail), and the `PosterOverlay` management surface (candidates, select, upload, reset).
- GLOSSARY.md gains the amended **Artwork** wording (two legs server-side; thumbnail leg stays client-side).
- Dependencies: `golang.org/x/sync` promoted to a direct require (already in go.sum — no new download); `golang.org/x/image` added genuinely new (WebP decode-only).

## Capabilities

### New Capabilities

- `artwork`: poster artwork served through the binary — composition precedence and honest absence, placeholder skip, the override family, upload ingest, fetch-once acquisition, and GC on reference loss.

### Modified Capabilities

- `media-serving`: gains the art object endpoint — `GET/HEAD /api/v1/art/object/{oid}` in the browse role group with strong ETag, `Cache-Control: private, immutable`, and pure path resolution.
- `shikimori-enrichment`: the conversion write-side no longer records known missing-art placeholder URLs as `poster` (or cast `photo_url`).
- `web-ui`: poster art rendering through the binary (PosterFrame + generated fallback + object-URL LRU on the library surfaces) and the poster management overlay.

## Impact

- Code: `internal/store` (two additive value-agnostic tables + primitive-signature methods, zero new exports), `internal/art` (new), `internal/api` (composition stamping, five-ish new routes, `Deps.Art` field, zero new exports; api intra-core deps 3 → 4), `cmd/mellifera` (janitor registry), `plugins/shikimori` (write-side drop), `internal/itest` (joint test), `web/src` (client, LRU, component, surfaces, overlay).
- Budgets: `internal/art` ≤ 8 exported symbols (including exactly `ErrNotImage`, `ErrTooLarge`); store and api stay at 12/12; new Go files each under the 300-line warn; `handlers.go` untouched.
- Committed regen artifacts: `internal/web/api/openapi.{json,yaml}` (swag annotations on the new routes) and `internal/web/dist` (rebuilt SPA embed) — regenerated inside this change.
- Docs: `GLOSSARY.md` Artwork line.
- Wire: additive only — new routes and one `omitempty` response field; no existing behavior changes except the shikimori write-side drop (which strengthens the honest-absence convention).
