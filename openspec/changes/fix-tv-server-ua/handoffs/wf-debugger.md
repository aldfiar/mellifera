# Handoff — wf-debugger — fix-tv-server-ua

## Diagnosis (session, evidence-verified 2026-11-02)

**The detection ladder is blind to the header UA — and on this device class, only the header UA is truthful.**

Live evidence (server logs, alatoic, after the fix-autodetect redeploy @ 918a03f):

1. The TV (ip 192.168.0.215, UA `Mozilla/5.0 (Linux; Android 14; Smart TV Pro Build/UTT2.250416.001; wv) ... YaBrowser/26.8.1.703 (lite) TV Safari/537.36`) fetched the NEW fixed bundle at 12:56:02 — `GET /assets/index-B2SO7dwH.js` → 200, 1,086,849 bytes, plus 3 more reloads through 12:56:48. Cache ruled out; the fixed ladder RAN on the device.
2. The operator confirmed via the on-screen toggle: «Режим ТВ: Авто» — the override is clean (readTvOverride floors invalid to auto; had it been "off" the toggle would show Выкл).
3. Despite the widened decisive marker `/smart[\s_-]*tv/i` (tvmode.ts:47) and a header UA containing "Smart TV", the device still boots desktop → the UA the ladder saw did NOT contain the marker.
4. Source: `readTvEnvironment` (tvmode.ts:130-137) feeds `navigator.userAgent` ONLY — the JS-visible UA. Conclusion: this YaBrowser TV lite WebView presents JavaScript a different (faked/munged, likely desktop-looking) UA than it sends in HTTP headers.
5. The existing async rescue cannot fire on this deployment: `probeTvModel` (tvmode.ts:146-163) no-ops unless `navigator.userAgentData` exists (:150-152), and Chromium exposes userAgentData ONLY in secure contexts — the app is served over plain `http://192.168.0.7:29527`. Structurally dead on LAN HTTP.

## Ruled fix direction

**The server injects the caller's real User-Agent header into the served SPA shell; the ladder reads it as a second, trustworthy UA source.**

- The SPA handler serves `index.html` with `Cache-Control: no-cache` (verified via response headers) — an injected `<meta name="mellifera-client-ua" content="<header UA>">` is always fresh, per-request, and synchronous-readable by the SPA at boot: NO fetch, NO boot flash, NO auth question (it echoes the caller's own header, leaking nothing).
- Detection: `detectTvEnvironment` gains a second UA candidate — TV when EITHER the JS UA or the server-observed UA carries a strong marker (the widened row does the matching; weak-token/corroboration stays tied to the JS UA only — the server UA is a DECISIVE-source, never a corroboration input, preserving the "corroboration never sufficient alone" clause).
- Override law untouched (override still wins over everything).
- The Go serving handler edits + swag-adjacent regen are in scope for this change (the zero-Go-edit boundary was tv-mode's slice definition, not a global law — state it in the proposal).
- REJECTED alternative: a `GET /client/ua` JSON endpoint read by an upgrade-only async probe — boot flash, async ordering complexity, auth-scope questions (this device already 403s on `/series/{id}/posters`), for zero benefit over the meta injection.

## Debugger findings (2026-11-02, verified against the live tree)

### 1. Serving path — claim CONFIRMED, meta injection is feasible

- Handler: `serveIndex` — internal/web/web.go:82-87. Writes the embedded shell `indexHTML` (read once at init: web.go:26 + `mustReadIndex` :151-157, from `//go:embed all:dist` :20-21) with `Content-Type: text/html; charset=utf-8` (:83) and `Cache-Control: no-cache` (:84 → `cacheControl(false, opts)` :110-115 returns "no-cache" for the index unconditionally). Per-request, synchronous, no caching layer in front.
- Mounts: `r.Get("/", …)` (:65) AND the NotFound SPA fallback (:67-76 → `serveIndex` at :75). Deep-link client routes get the same shell — injection covers every shell load, not just `/`.
- THE GAP: `serveIndex(w, opts)` takes NO `*http.Request` — the User-Agent header is unreachable at the injection point today. The fix needs the mechanical signature change `serveIndex(w, r, opts)`; both call sites (:65, :75) already have `r` in scope.
- Single serving path: cmd/mellifera/main.go:602 composes the ONE top-level handler, `web.Handler(apiHandler, web.Options{DevMode: cfg.webDev, Media: mediaSvc})`. Nothing else serves the shell. DevMode caveat (web.go:31-35): in dev the Vite proxy serves the SPA and Go never sees shell requests → the frontend reader MUST tolerate a missing/placeholder meta; that requirement exists regardless of injection shape.
- Precedent: NO per-request substitution exists anywhere in the serving layer (repo-wide grep `strings.Replace|html/template|text/template` over non-test Go: only pkg/releasename string parsing; zero template execution in the repo). This change creates the pattern — there is nothing to copy.

Injection shape (recommendation: smallest change, embedded file byte-stable at rest, no build step):

- **Recommended — serve-time head-tag injection (Go-only):** inside `serveIndex`, `strings.Replace(string(indexHTML), "<head>", "<head>" + meta, 1)` where meta = `<meta name="mellifera-client-ua" content="` + `html.EscapeString(r.Header.Get("User-Agent"))` + `">`. Verified: the embedded internal/web/dist/index.html is 394 bytes with exactly ONE `<head>` (Vite preserves the input tag; web/index.html carries it). Zero frontend edits, zero dist regen, embedded bytes untouched at rest (the replace runs on a per-request copy; `indexHTML` is never mutated). `strings` is already imported (web.go:10); the stdlib `html` import is NEW but required — UA headers may contain `"`/`<` and must be attribute-escaped. Skip the injection when the header is empty (frontend floors to absent).
- **Alternative — marker token:** author `<meta name="mellifera-client-ua" content="__MELLIFERA_CLIENT_UA__">` into web/index.html and `strings.ReplaceAll(token, escaped-ua)` at serve. More discoverable, but costs a dist regen commit (the standard `make web-build`; precedent: fix-autodetect 1.2's embedded dist regen) and the frontend must ALSO treat the unreplaced literal token as absent. Pick this if the reviewer prefers explicitness over minimal diff — both are correct.
- Frontend reader duty (either shape): read the meta at boot in `readTvEnvironment` (tvmode.ts:130-137); absent or placeholder content floors to "no server UA observed" (DevMode + stale-dist safety).
- Test coupling: web_test.go never references `serveIndex`/`indexHTML` directly (grep clean) — it asserts body substrings through the `Handler(...)` HTTP surface (`wantInBody`), so the signature change ripples nowhere; the coder should add one web_test row pinning UA header → injected meta content, and one no-UA row.

### 2. Repro rows — written, RED where required

File: web/src/lib/tvmode.test.ts (UNCOMMITTED — the only file touched). Contract: proposed optional `serverUserAgent?: string` on `TvEnvironment`; rows pass it through the `env()` builder whose overrides type was widened by an intersection + one `as TvEnvironment` cast — once the interface grows the field, the intersection and the cast evaporate and no row reshapes. Type-clean: `npx tsc --noEmit` rc 0 (web build runs tsc, so this matters).

Run `cd web && npx vitest run src/lib/tvmode.test.ts` → **Tests 2 failed | 59 passed (61)**:

| Row | Expect | Now |
|---|---|---|
| `server_ua_decisive_over_faked_js_ua` — faked desktop JS UA (Chrome/156 Windows) + `serverUserAgent` = REAL device UA, hostile 1920×1080 zero touch | true | **RED** (got false) — the headline row |
| `server_ua_desktop_stays_desktop` — both sources plain desktop, hostile zero-touch shape | false | GREEN (guard row; must STAY false after the fix) |
| `server_ua_spaced_family_decisive` — faked JS UA + spaced "Smart TV" server UA, hostile geometry | true | **RED** (got false) — hostile geometry makes the DECISIVE path provable by construction (the weak path is geometry-dead at 1080p: 1080 > 600) |
| `server_ua_weak_token_never_corroborates` — faked JS UA + weak bare `\bTV\b` server UA (WEAK_TV_UA) at a CORROBORATING 960×540 zero touch | false | GREEN — **vacuous today** (the implementation ignores `serverUserAgent`); **LOAD-BEARING after the fix**: it is the clause guard that kills any ladder running the weak token over the server UA ("corroboration never sufficient alone" preserved) |

All 57 pre-existing rows stayed green — the `env()` helper change regressed nothing. RED rows fail with exactly `expected false to be true` at tvmode.test.ts:326 and :358.

### 3. Corrections / refinements to the ruled direction

- Handoff line cites re-verified against the live tree: `/smart[\s_-]*tv/i` at tvmode.ts:47 ✓; `readTvEnvironment` feeds navigator.userAgent only at :130-137 ✓; `probeTvModel` no-ops without userAgentData at :148-152 ✓ (plain-HTTP insecure context keeps it structurally dead) ✓.
- The meta injection is feasible exactly as ruled — `serveIndex` is per-request, no-cache, and the fallback path funnels through the same function. NO pivot to the JSON endpoint needed.
- One refinement to the ruled wording: "or the handler already templates something per-request" is FALSE — there is no per-request substitution precedent and no template execution anywhere; and the marker-token variant as imagined needs a dist regen. The head-tag replace avoids both costs. Recommendation above; the choice between the two shapes is the proposal's to make.
- Fix direction otherwise unchanged: DECISIVE-only server UA candidate (strong markers only, never a corroboration input); override law untouched.
