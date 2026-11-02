# Handoff — wf-debugger — fix-autodetect

## Root cause (code-certain, test-proven)
`web/src/lib/tvmode.ts` detection ladder misses the operator's real TV UA — spaced "Smart TV" family, Android 14 WebView, YaBrowser TV lite:
`Mozilla/5.0 (Linux; Android 14; Smart TV Pro Build/UTT2.250416.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/156.0.8078.47 YaBrowser/26.8.1.703 (lite) TV Safari/537.36`

1. STRONG_MARKERS (tvmode.ts:44-51) = [/SmartTV/, /BRAVIA/, /AFT\d/, /KFT/, /Silk/, /Leanback/] — "Smart TV Pro" (SPACE) matches none.
2. Weak \bTV\b token (tvmode.ts:57) matches → falls to corroboration.
3. Corroboration (tvmode.ts:63-69) needs ALL: ≥16:9 AND innerHeight ≤ 600 AND maxTouchPoints === 0 — dpr-1 full-HD (1080px) fails the height leg → desktop boot. Device's real viewport unmeasured; touch leg (WebViews often report 5) possibly failing too — fix must be geometry-independent.
4. Async model-hint probe (tvmode.ts:144-161) re-enters the SAME detectTvEnvironment → same table → same miss.

Not a regression: ladder authored whole on this branch (7d7e144/9da3a0d); the vocabulary omitted the RU-region Android-WebView family. Test file's own comment (tvmode.test.ts:29-32) shows the gap was known at authoring time.

## Repro (IN THE WORKING TREE, uncommitted, web/src/lib/tvmode.test.ts)
REAL_TV_UA constant + 3 rows: 1080p/zero-touch → RED (the bug) · 960×540/zero-touch → GREEN · model-hint "Smart TV Pro" on 1080p → RED. `cd web && npx vitest run src/lib/tvmode.test.ts` = 2 failed | 50 passed. These rows are the fix's first verify anchor — all three must go green, no existing row may flip.

## Ruled fix direction
**THE fix:** `/SmartTV/` → `/smart[\s_-]*tv/i` in STRONG_MARKERS — shared by UA scan AND model probe (`matchesStrongMarker`), needs no corroboration (laptop-lookalike scenario safe: no laptop UA says "Smart TV"), geometry/touch legs untouched (spec :112-131 "corroboration SHALL NEVER be sufficient alone" preserved). Do NOT reshape corroboration. YaBrowser family marker: optional belt-and-suspenders only.

## Secondary verdict
Override chain NOT broken: .menu-fab unconditionally visible (index.css:71-96, only hider is body.side-open), real <button> (Sidebar.tsx:142-151), panel content mounts when open, SideFoot TvModeToggle reachable by the walker once tv is on. Caveat: pre-fix the walker is inert on the device (armed only under html.tv) — TV browser's native focus must reach the FAB; no code defect.

## First fix step
Widen STRONG_MARKERS with the spaced variant (or fold into the existing /SmartTV/ row); the repro rows go green; add family rows (spaced variants, model-hint spaced, lookalike-desktop negative rows — "SmartTVX desktop app" style false-positive guards if authored).
