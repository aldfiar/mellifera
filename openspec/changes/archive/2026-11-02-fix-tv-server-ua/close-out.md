# Close-out — fix-tv-server-ua (archived 2026-11-02)

## Deliverable
The detection ladder reads the TRUTHFUL header UA on devices whose WebView fakes a JS-visible one. Two halves: the Go shell handler `serveIndex` stamps every SPA shell response (root + NotFound fallback) with `<meta name="mellifera-client-ua" content="…html-escaped User-Agent…">` (per-request, no-cache, embedded index.html byte-stable at rest, omitted on empty header); the SPA ladder runs the strong-marker scan over the server-observed UA as a DECISIVE-only source — it can rule TV on, never feeds the weak token or corroboration ("corroboration never sufficient alone" preserved). Override law + upgrade-only probe untouched. First tv-mode change to touch Go source (the serving handler); swag delta zero (no routes added).

Root cause record: the operator's Android-14 TV (YaBrowser TV lite) sends the truthful "Smart TV Pro" UA in HTTP headers while `navigator.userAgent` shows a faked desktop-looking string; `fix-autodetect`'s widened marker was correct but blind to the header. Live evidence: TV fetched the fixed bundle (server logs, 12:56) yet stayed desktop with «Режим ТВ: Авто»; the async userAgentData probe is secure-context-gated and structurally dead on the plain-HTTP LAN. Full diagnosis in handoffs/wf-debugger.md (kept in the archive).

## Final receipt summary (all green; ledger 4 tasks / receipts incl. reviewer re-runs)
| Task | Commit | Tests | Note |
|---|---|---|---|
| 1.1 SPA ladder | 209cb6b | tvmode.test.ts 66/66 | 4 repro rows green expectations-unchanged (2 were red), +5 jsdom tolerance rows through applyTvMode, env-builder cast dropped |
| 1.2 Go injection | 6f61490 | go test ./internal/web | serveIndex(w, r, opts), escaped meta after first <head>, 3 httptest rows (escaped specials / no-UA omission / deep-link) |
| 1.3 dist regen | 3d0ed10 | duty chain green | index-B2SO7dwH.js → index-BvNIFsq3.js (meta reader in bundle), api delta EXACTLY ZERO; first verify red journaled, re-run byte-identical |
| git-check | 3302f58 (push) | — | change folder committed + pushed before archive (deploy-first ordering, operator-directed) |

## Gate record
review.md: all five axes PASS, zero FLAGs (re-verify, full-suite anchors go test rc 0 / vitest 41 files 595 tests / tsc rc 0, diff-vs-delta incl. embedded-shell-at-rest-meta-free check, standards, strict validate rc 0). Delta shape: REMOVED "Desktop rendering stays unchanged" (slice-scoped no-Go-edits clause retired) + ADDED 4 requirements incl. "Desktop rendering is injection-inert" — forced by strict validation refusing a MODIFIED block that drops a scenario. Archive approval: operator, 2026-11-02.

## Deploy + live verification (operator-directed deploy-before-archive)
Deployed @ 3302f58 to alatoic; all four injection probes hold on the served shell (verbatim meta echo for the TV's exact UA on / and deep links; escaped entities for attribute specials; omitted on empty UA). Old bundle absent. Health 200, zero error lines, 7/7 plugins. One transient docker vite-transpile NUL-byte failure on first attempt — diagnosed single-run bit flip (cached inputs identical, clean retry); watch item: alatoic RAM/disk if it recurs.

## Field-truth follow-ups (the fix works; the DEVICE has more story)
- The TV's YaBrowser lite D-pad is pointer-emulated — arrows move a virtual cursor, NO arrow KeyboardEvents reach any page; the focus walker can never engage in that browser (no browser-side toggle exists per the operator). The deployed fixes DO engage in key-capable TV browsers (TVBro / Firefox for Android TV class) with zero further work.
- "Same page" look suspected: the box likely reports a small CSS viewport (~960×540 dpr-2) where the .tv vw/vh clamps floor out — suspected, unmeasured. Follow-up change: ?tvdebug=1 on-screen diagnostic (viewport, tv-class state, key events) — operator-approved next step; then possibly small-viewport .tv floors.
- TV gets 403s on /api/v1/series/{id}/posters (431 in one window; art objects 200) — device-token scope question, its own future change.

## Docs actualized
Living spec Purpose amended in-place at archive: "zero backend work" retired — the slice is SPA-first with exactly one serving-layer assist (the client-UA meta), matching the shipped reality.
