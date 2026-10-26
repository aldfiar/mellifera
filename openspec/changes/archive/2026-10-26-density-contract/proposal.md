# Proposal

## Why

The Layer 7.0 measured pain (2026-10-24, live dev SPA): poster rows are height-blind — a short CSS viewport (TV panels at dpr 2 report ~960x540; laptops at 125-150% zoom) overflows with ONE poster row plus the header; the item-detail photo preview clips on plain DESKTOP (image bottom y=642 in a 633px viewport); card titles render at 12.5px and photo tile footers at 11px — unreadable at TV distance; and two unstated content caps (Home 6xl, collection 5xl) waste half a 1920px panel. The density contract lands FIRST and standalone (roadmap Layer 7.1): desktop benefits now, and the later TV mode (7.2-7.4 — a separate future change, out of scope here) builds on it.

## What Changes

- Height-aware poster rows: the serial collection poster grid clamps card width from the viewport HEIGHT (CSS calc over 100vh, not width breakpoints), so at least 2 rows + header fit 100vh; the 2:3 poster ratio is preserved (width narrows, artwork never distorts).
- One content-cap decision (design.md D2): Home and the collection page unify on the 6xl browse cap; ItemDetail keeps its 5xl reading cap — the reason is now stated, ending the unstated two-cap split.
- Type floor: card titles (`.scard-title`, 12.5px today) and photo tile footers (`.ptile footer`, 11px today) render at 14px or larger everywhere; all other micro-copy keeps its current scale.
- Photo preview cap: the ItemDetail HeroImage drops the fixed 80vh cap for `calc(100vh - real chrome above)`, so image + identity never clip (a live desktop bug fix, not TV-only).
- Pure SPA slice: new `web/src/lib/density.ts` (pure helpers + measured chrome constants, table-driven tested), CSS edits in `web/src/styles/index.css`, two component wirings. ZERO backend — the Go tree is untouched.
- Baseline (base 7fb8fde = origin/main): `go test ./...` rc 0; vitest 28 files / 363 tests green. Default desktop rendering must not regress beyond the four scoped fixes; the photo masonry needs NO work (roadmap "Answered" note — `columns: 4 210px` already fits at short viewports).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `web-ui`: four new density requirements — height-aware poster rows, single browse content cap, card type floor, photo preview viewport cap.

## Impact

- `web/src/lib/density.ts` (new — 4 exported symbols, under the per-package bar), `web/src/lib/density.test.ts` (new, table-driven).
- `web/src/styles/index.css` (`.scard` clamp consumer; `.scard-title` + `.ptile footer` type floors).
- `web/src/pages/collections/Collection.tsx` (grid wiring + cap class), `web/src/pages/browse/ItemDetail.tsx` (HeroImage optional style prop + stage cap).
- `internal/web/dist` regenerated and committed via `make web-build` (closure task); `internal/web/api` must come out byte-identical (no route changes).
- No API, no data, no dependency changes; vitest covers the new pure symbols; the Go gate stays node-free.
