# Close-out — tv-debug-overlay (dispatch lane, closed 2026-11-02)

## Deliverable
`?tvdebug=1` on-screen device diagnostic, SPA-only, zero backend: query-param gated overlay (absent param → never mounts) showing live navigator.userAgent, the server-injected `mellifera-client-ua` meta (defensive floor to "(absent)"), viewport + dpr + screen, maxTouchPoints, userAgentData availability, the `html.tv` class state via MutationObserver, the raw «Режим ТВ» localStorage value, and rolling logs of the last 10 keydowns (key/code/keyCode) + last 5 pointer events (type/x/y). Built to settle, ON THE DEVICE: whether tv mode engaged, what CSS viewport the box reports, and what the pointer-emulated D-pad actually sends.

## Receipt summary (3/3 green incl. git-check)
| Task | Commit | Tests | Note |
|---|---|---|---|
| 1.1 overlay | 53c0a74 | TvDebugOverlay.test.tsx 5/5 | inline styles (no CSS-contract surface), tvmode.ts untouched (7 exports), jsdom pointermove via plain Event (jsdom 25 has no PointerEvent ctor) |
| 1.2 dist regen | 1ef3834 | duty chain green | index-BvNIFsq3.js → index-CT8e18ra.js (`tvdebug` in bundle), api delta ZERO, first-run red journaled, re-run byte-identical |
| git-check | 101522a (push) | — | change folder committed + pushed |

## Field context
Follow-up to fix-tv-server-ua's field truth: the operator's YaBrowser TV lite pointer-emulates the D-pad (no arrow KeyboardEvents; no browser-side toggle exists), and the box's CSS viewport is suspected small (~960×540 dpr-2), flooring out the .tv scaling. This overlay turns those suspicions into measurements: the operator opens the app with `?tvdebug=1`, presses D-pad keys, and the screen reports what arrives. Dispatch lane per loop rules (independent one-shot, no spec delta, no archive ceremony).
