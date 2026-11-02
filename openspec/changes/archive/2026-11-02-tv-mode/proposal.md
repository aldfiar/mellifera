# Proposal

## Why

The same embedded SPA on an Android TV browser renders a desktop-tuned layout that fails at 10-foot distance: a TV reporting 960×540 CSS px (a 1080p panel at dpr 2) falls below the `lg` breakpoint into 3 wide columns and ONE poster row does not even fit the viewport (measured on the live SPA, 2026-10-24 — UI proposal §7.0); card titles are 12.5px, unreadable at 3 m; the photo preview clips below the fold; and the remote's D-pad and media keys do nothing. Android TV ships Chromium with MSE, so the fix is ZERO backend work: the SPA grows one display mode plus key handling, and the Go tree is untouched.

## What Changes

- **`.tv` display mode** — one CSS block applied when `<html>` carries the `tv` class: every size a vw/vh-derived clamp (never a fixed px — type ≈1.05vw clamped 16→30px — so a 4K panel at dpr 1 lands the same physical density as a 1080p panel at dpr 2), ~2.5% overscan-safe edge padding, rows fit 100vh (building on the shipped 7.1 density contract, never re-doing it), a lifted content cap, a thicker focus ring. Default desktop rendering unchanged.
- **D-pad focus grid-walker** — ONE small pure util (focus index ±1 / ±columns over row-major grids, edge-clamped, no library): ArrowUp/Down/Left/Right move focus through the page's links/buttons, Enter/OK activates natively. Focus = the locked accent idiom, always visible in tv mode.
- **Media keys onto the shared table** — `MediaPlayPause`, `MediaTrackNext`, `MediaPrevTrack`, `MediaFastForward`, `MediaRewind`, `MediaStop` normalize onto the SAME player actions as the shipped 3.4 keyboard via the ONE normalization table in `web/src/lib/playerShortcuts.ts` (`MediaStop` exits playback through a new `exitWatch` action). The 3.4 legend renders on TV as-is.
- **History-Back overlays** — every `DialogShell` overlay pushes a history entry on open; Android TV Back (a history-back, not a key event) pops and closes the overlay — never exits the SPA; at root, Back stays router-back. Esc, scrim click-away, and the focus trap are unchanged.
- **Persistent TV chrome** — the `⋯`/gear triggers stay visible in tv mode (TV Chrome reports `pointer: fine`, so the shipped `@media (pointer: coarse)` persistent reveal alone misses TV); the photo preview becomes an immersive stage: image always inside the viewport against one status line, metadata hidden, ←/→ = prev/next photo, OK = slideshow, Back = back to the grid.
- **Device autodetect + manual override** — a best-effort ladder (Chromium `userAgentData.getHighEntropyValues(["model"])` → `navigator.userAgent` regex → wide-short-viewport + no-touch corroboration, which is never sufficient alone) sets the FIRST-load default only; the manual «Режим ТВ: Авто / Вкл / Выкл» control persists in localStorage `mellifera.tv` (the `mellifera.theme` idiom) and ALWAYS wins, applied live. An unknown box falls to the desktop layout with the override still reachable.
- **Embedded dist rebuilt** (`make web-build`); **ZERO backend** — the Go source tree is untouched; a task touching a Go file is out of scope by definition.
- **Out of scope:** pairing/QR login (deferred — needs a backend slice); login stays the token form. Audio feedback on focus moves is ruled out (the accent focus idiom is the feedback).

## Capabilities

### New Capabilities

- `tv-mode`: the 10-foot display mode of the embedded SPA — viewport-derived scaling, D-pad focus walking, remote media keys, history-Back overlay closing, persistent chrome, the immersive photo stage, device autodetect, and the manual «Режим ТВ» override.

### Modified Capabilities

(none — the `web-ui` requirements keep their stated behavior: Esc, scrim click-away, the 3.4 desktop bindings and the legend, and every desktop layout rule are unchanged; the media keys and the overlay Back channel are additive behavior owned by the new `tv-mode` capability.)

## Impact

- `web/src/` only: `styles/index.css` (the `.tv` block), `lib/tvmode.ts` (NEW — ladder, override, boot class apply), `lib/focusWalker.ts` (NEW), `components/TvFocusRoot.tsx` (NEW), `components/TvModeToggle.tsx` (NEW), `components/DialogShell.tsx` (history-entry mechanics), `lib/playerShortcuts.ts` (media-key normalization rows), `pages/browse/ItemDetail.tsx` (stage yield marker + OK=slideshow), `main.tsx` (boot import), `components/Sidebar.tsx` (side-foot gains the toggle), `App.tsx` (TvFocusRoot mount).
- `internal/web/dist` regenerated through `make web-build` (swag annotation regen rides along; still zero Go source edits).
- No API, no schema, no Go behavior changes. The Vitest floor grows by ~5 new/extended test files; the Go suite is untouched by the change's duties (the GATE anchor's `go test ./...` still guards it).
