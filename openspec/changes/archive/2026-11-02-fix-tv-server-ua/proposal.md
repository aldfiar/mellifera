# Proposal

## Why

The operator's Android 14 TV (YaBrowser TV lite WebView) presents JavaScript a faked, desktop-looking `navigator.userAgent` while sending the truthful "Smart TV Pro" UA in its HTTP headers — the autodetect ladder reads the JS UA only (tvmode.ts:130-137) and the async `userAgentData` rescue is structurally dead on the plain-HTTP LAN deployment (secure-context-gated, tvmode.ts:150-152) — so the device boots desktop with «Режим ТВ: Авто» even though the widened Smart-TV marker (fix-autodetect) matches its header UA, and the no-cache shell logs prove the fixed bundle ran on the device.

## What Changes

- **Serve-time injection** — `serveIndex` (internal/web/web.go:82-87) gains the request (`serveIndex(w, r, opts)`; both call sites — the `/` mount :65 and the SPA NotFound fallback :75 — already have `r` in scope) and injects, per request, `<meta name="mellifera-client-ua" content="…html-escaped User-Agent header…">` immediately after `<head>` via `strings.Replace(…, "<head>", "<head>"+meta, 1)`. The embedded `dist/index.html` stays byte-stable at rest — NO dist-regen-for-injection, NO marker token, NO build step; injection is skipped when the header is absent or empty. One new stdlib import (`html`) for attribute escaping; `strings` is already imported (:10).
- **Ladder extension** (web/src/lib/tvmode.ts) — `TvEnvironment` grows an optional `serverUserAgent?: string`; the strong-marker scan rules TV when EITHER the JS UA or the server-observed UA carries a strong marker. The server UA is a **decisive-only source**: strong markers match against it, but the weak `\bTV\b` token and geometry corroboration apply to the JS UA only — "corroboration never sufficient alone" holds untouched. The override law (`resolveTvMode` :98-106) is untouched; the async model probe inherits the field through its `readTvEnvironment` spread with the upgrade-only contract intact.
- **Tolerance** — `readTvEnvironment` (:130-137) reads the meta defensively: absent, empty, whitespace, or garbled content floors to "no server UA observed" and the ladder rules exactly as today from the JS UA. Required regardless of injection shape: in DevMode the Vite proxy serves the SPA and Go never sees the shell request (web.go:31-35).
- **Tests** — the debugger's 4 repro rows (already in web/src/lib/tvmode.test.ts, uncommitted — 2 red of 61 today, verified live) go green / stay green with expectations unchanged; new `web_test.go` rows pin UA→meta injection and the no-UA omission through the existing HTTP surface; jsdom rows pin the meta-reader tolerance through the exported `applyTvMode` boot chain (no new module exports).
- **Embedded dist regen** for the redeploy (`make web-build`, the fix-autodetect 1.2 shape) — the swag regen rides along into internal/web/api and must come out **zero-delta on api**: the injection touches no swag-annotated handler and adds no routes.
- **Boundary note** — this change DOES edit Go source (the serving handler). The zero-Go-edit rule was tv-mode's slice definition, not a law; the delta retires the slice-scoped clause from the living spec's "Desktop rendering stays unchanged" requirement while keeping every desktop-rendering guarantee verbatim (the injected meta is invisible metadata no desktop rule reads). NO new endpoints, NO swag annotation changes, NO auth surface changes — the meta echoes the caller's own header, leaking nothing.
- **REJECTED alternative** (debugger-ruled): a `GET /client/ua` JSON endpoint read by an upgrade-only async probe — boot flash, async ordering complexity, auth-scope questions (this device already 403s on `/series/{id}/posters`), for zero benefit over the synchronous meta.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `tv-mode`: ADDS four requirements — three under the living spec's autodetect section: "The server-observed user agent detects a TV decisively" (decisive-source semantics; never a corroboration input; override law and the probe's upgrade-only contract untouched), "The SPA shell carries the caller's user agent" (the per-request, HTML-escaped, no-cache meta contract on every shell load — root and client-route fallback alike — omitted when the header is absent; the embedded shell byte-stable at rest), and "The SPA tolerates a missing or garbled server user agent" (floors to today's JS-UA behavior; no crash, no boot block, no fetch — the DevMode safety); plus one replacement: "Desktop rendering is injection-inert". That fourth replaces the REMOVED "Desktop rendering stays unchanged": the slice-scoped "no Go source edits" clause is retired (a slice boundary, not a standing law; the serving-side injection is rendering-inert) and every desktop-rendering guarantee is carried verbatim — the removal-and-re-add is forced by strict validation, which refuses a MODIFIED block that drops the obsolete slice-boundary scenario by name. The existing "Autodetect sets the first-load default only" and "The manual «Режим ТВ» override always wins" requirements are NOT touched.

## Impact

- `internal/web/web.go`: the `serveIndex` signature change (both in-package call sites), the injection replace, one `html` import; `internal/web/web_test.go`: new rows. web_test.go asserts through the HTTP surface only (`wantInBody` style) — verified no direct `serveIndex`/`indexHTML` references, so the signature change ripples nowhere else.
- `web/src/lib/tvmode.ts` (optional field, decisive-only strong scan, defensive meta reader) and `web/src/lib/tvmode.test.ts` (the 4 repro rows resolved, env-builder cast dropped, jsdom tolerance rows).
- `internal/web/dist` embedded bundle and `internal/web/api` swag output regenerate via `make web-build` (GOPATH/bin on PATH for swag); expected ZERO delta on internal/web/api, enforced by the task duty.
- Runtime effect: devices whose WebView fakes a desktop JS UA but sends a truthful header UA (the YaBrowser TV lite family) autodetect TV on first load; every previously-detected device, every honest desktop, and the DevMode dev loop behave exactly as before.
