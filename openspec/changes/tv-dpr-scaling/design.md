# Design

## Context

Field facts (the operator box, measured live): Android-14 4K TV, YaBrowser TV lite WebView, CSS viewport 960×511 (browser chrome ~29 CSS px), dpr ≈ 2–4 reported through the `?tvdebug=1` overlay — `TvDebugOverlay.tsx:182` prints `window.devicePixelRatio`, so the measurement instrument already ships. The `.tv` shell block (web/src/styles/index.css:664-773) implements the tv-mode design D3 law — every size a vw/vh clamp, never bare px — pinned by `tvCssContract.test.ts` (the fs-contract idiom: exact text pins + the no-bare-px sweep over `SIZE_PROPS ∪ --`-custom props between the block markers). At 960 CSS px the clamp fractions compute sub-floor values and every px floor catches: root type 10.08→16px, triggers 24→40px, poster clamp legs →120px. The single class-writer `applyTvMode` (web/src/lib/tvmode.ts:203-213) has exactly two call sites — the boot side effect (:219) and the live «Режим ТВ» toggle (`TvModeToggle.tsx:59`); the async model probe upgrades the class directly at :189. Tests stub globals with the file's `Object.defineProperty` + `Reflect.deleteProperty` idiom (tvmode.test.ts:389-408); jsdom 25 provides `window.devicePixelRatio` (= 1). Baseline: tvmode suite and the SPA suite green; this session's `wf index` rebuilt fresh but maps no TS callers — every citation below is a direct live-file read.

## Goals / Non-Goals

**Goals:**

- Tv sizes derive from the physical viewport (CSS × dpr) through ONE mechanism: a `--tv-dpr` var written by the single class-writer, consumed by `calc(... * var(--tv-dpr, 1))` wraps.
- Zero regression everywhere else: dpr-1 renders byte-identical to shipped; desktop never sees the var; density.ts untouched; ladder, override law and all 66 existing tvmode rows intact — new tests only ADD.
- The two-rows-fit-100vh and overscan fraction laws survive UNCHANGED on every dpr.

**Non-Goals:**

- No density.ts rework, no new CSS mechanism (no `@media (resolution)`, no zoom), no tvmode export growth, no Go source edits, no detection changes.

## Decisions

**D1 — The var rides the single class-writer via a private `writeTvMode(on)`.** tvmode.ts grows a MODULE-PRIVATE helper — `function writeTvMode(on: boolean): void` — doing `classList.toggle("tv", on)` as today plus: when on, `documentElement.style.setProperty("--tv-dpr", String(dpr))` with `dpr = typeof window.devicePixelRatio === "number" && Number.isFinite(...) && > 0 ? window.devicePixelRatio : 1` (the module's guarded-reader posture; a jsdom-undefined value floors to 1); when off, `removeProperty("--tv-dpr")`. `applyTvMode` (:206) and `probeTvModel` (:189) both call it — the probe's upgrade path MUST carry the var or an upgraded dpr-2 box renders the class at the ×1 fallback. Exports stay at 7. Alternative rejected: setting the var only inside `applyTvMode` — the probe path would silently skip it; a separate exported setter — export growth for one internal invariant.

**D2 — The scale set is four rules (survey-verified).** (1) root type :684 → `font-size: calc(clamp(16px, 1.05vw, 30px) * var(--tv-dpr, 1))`; (2) main max-width :700 → `max-width: calc(min(92vw, 1800px) * var(--tv-dpr, 1))` — provably behavior-inert everywhere (the wrapped cap 3600 CSS px binds only above a ~3913 CSS px viewport at dpr 2; below that the container wins exactly as today), kept under the uniform "px-bearing size declarations scale" law; (3) focus outline :732 → `outline: calc(clamp(2px, 0.2vw, 5px) * var(--tv-dpr, 1)) solid hsl(var(--ring))` (floors at ≤1000 CSS px viewports — the operator's box included); (4) cardact-trigger :742-743 → both width and height wrapped (the ⋯ hit target is the law's poster child; scenario-pinned). The outline-offset (:733) stays RAW per the ruling — the offset is ring chrome aesthetics, not a 10-foot density value.

**D3' — The unscale set is everything else, INCLUDING the poster-grid rule wholesale (the survey's deviation from the requested list).** Scaling the poster clamp leg (:724, the 120px floor) breaks the height law: the rule's governing leg is the pure fraction `calc((100vh - var(--tv-poster-chrome)) / 3)` — 100vh always spans the full physical screen on any dpr, so the fraction is physically dpr-invariant and already lands correct (at 960×511/dpr 2 it budgets 149.9 CSS px ≈ 300 physical, matching the dpr-1 1080p fraction). Wrapping the floor leg to 240 CSS px INVERTS the max() precedence (240 > 149.9), the track budget leaves the height law, and the second row clips below the fold — breaking the carried "Short viewport keeps two rows on screen" scenario on exactly the target boxes. Ruling: the poster rule (:720-726) stays byte-identical. For the same class of reasons `--tv-status-chrome` (:763) stays raw — its consumer (:767) subtracts it from 100vh, and scaling the reserve without the viewport term corrupts the stage arithmetic. Padding (:693), `--tv-poster-chrome` (:721), img cap (:767): pure fractions, unscaled.

**D4 — Density resolution: ZERO density.ts changes.** The constants feed desktop-only consumption paths that the `.tv` block replaces wholesale at tv shapes (verified): Collection.tsx:1499-1507 emits `--poster-track-w-1/2` inline via `posterCardMaxWidth({chromeH: SERIES_GRID_CHROME_PX=182, ...})` — consumed ONLY by the desktop tier rules (index.css:428-434, specificity (0,1,0)), which the tv rule's `--poster-track-max` pick ((0,2,1), :720-726) beats at tv shapes, so the 182px chrome and the 120px floor never surface there; ItemDetail.tsx:582 rides `photoStageMaxH(PHOTO_STAGE_CHROME_PX=136)` inline on the img — beaten by the tv stage rule's `!important` (:767). "On top of, never replacing" preserved: density keeps computing for desktop; tv overrides the consumed var; no dpr-awareness ever enters the pure contract. `density.test.ts` (exact-string pins) stays green untouched.

**D5 — Test posture: ADD rows, reuse the idioms.** tvmode.test.ts gains ONE describe block exercising the exported `applyTvMode` boot chain (the fix-tv-server-ua idiom): dpr stubbed via `Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: N })`, afterEach `Reflect.deleteProperty` + inline-style var cleanup + class cleanup (the :403-408 pattern); the var asserts through `documentElement.style.getPropertyValue("--tv-dpr")`. Rows: tv ruling at dpr 2 → class + var "2"; no stub → var "1"; dpr 0 → var "1" (the floor); desktop ruling → no class AND no var; stored Вкл→Выкл with `applyTvMode()` between → var set then REMOVED (the TvModeToggle.tsx:59 live path); auto-desktop + `userAgentData` probe resolving a TV model at dpr 2 (the :528 stub idiom) → class AND var "2". tvCssContract.test.ts: 3 pinned strings move to the wrapped forms (:96, :105, :128); NEW pins carry both halves of the law — the wrapped outline string, and the UNSCALED set raw (`padding: 2.5vh 2.5vw`, `--tv-poster-chrome: 12vh`, `--tv-status-chrome: clamp(48px, 7vh, 110px)`, `outline-offset: clamp(2px, 0.2vw, 4px)`, poster `clamp(120px, 4vw, 240px)` raw) — so a later edit cannot drift a wrap into a fraction rule or vice versa; the no-bare-px sweep stays green (every wrapped form keeps its vw/vh term; the sized-declaration guard count still ≥ 8). Risk note: jsdom custom-property reads via setProperty/getPropertyValue are supported by jsdom 25's cssstyle, and this suite has no prior custom-prop assertion — if the harness dropped them the row fails LOUDLY at apply, never silently green.

**D6 — The icon swap is a two-token edit.** Sidebar.tsx:6 `Settings2` → `Settings` in the import; :222 the JSX tag. lucide-react exports both (verified in the installed d.ts); no test references the icon name (grep: zero hits in Sidebar.test.tsx); tsc at the regen task type-gates the rename.

## Interfaces (cross-group)

- **I1 — `--tv-dpr` (the physical-density contract, group 1 ↔ the `.tv` block).** Written ONLY by `writeTvMode`: set to `String(devicePixelRatio)` (floored to 1 when absent/non-finite/≤0) on the root's inline style exactly when the `tv` class lands; REMOVED whenever the class leaves (boot desktop ruling, live toggle-off). The CSS consumes it exclusively through `var(--tv-dpr, 1)` inside `calc(...)` wraps in the `.tv` block — the `, 1` default makes dpr-1 AND var-absence both byte-identical to shipped. No other stylesheet rule or TS code reads or writes it.
- **I2 — The density interplay resolution (group 1 ↔ density.ts).** D4 stated as the standing law: at tv shapes the density-emitted desktop vars are dead (replaced wholesale or `!important`-beaten); density.ts stays dpr-blind. Any future tv-shape change that wants a density constant at tv must re-derive it as a vh fraction, never scale a px constant.
- **I3 — Group 2 consumes group 1 wholesale.** The regen task embeds whatever group 1 produced; no interface beyond the build itself (no API surface changes — internal/web/api must regen zero-delta).

## Risks / Trade-offs

- [The poster-grid deviation contradicts the requested scale list] → documented with the overflow proof (D3'); the carried two-rows scenario is the acceptance bar; flagged for GATE 1 as the change's one judgment call.
- [A fractional dpr (1.25, 1.5) lands a non-integer var] → `String(dpr)` is exact; calc handles fractions natively; no rounding law claimed.
- [The main max-width wrap is provably inert today] → kept under the uniform law with the bound stated (D2); a viewport past ~3913 CSS px at dpr 2 would need cap review anyway.
- [jsdom cannot evaluate calc math or media queries] → unchanged posture: the block is text-pinned (fs-contract) and visually accepted (the MANUAL TEST NOTE precedent); the var plumbing itself is fully jsdom-tested through applyTvMode.
- [First regen verify runs red on uncommitted dist] → the journaled pattern: commit the regen, re-run verify, assets then byte-identical (hashed) and green (stated in the task text).
- [Icon rename breaks an unseen consumer] → grep shows Settings2 exists only at Sidebar.tsx:6/:222; tsc at the regen type-gate catches any missed reference.

## Migration Plan

None — additive SPA behavior through the normal embedded-dist rebuild; rollback is redeploying the previous binary. No stored state: the var is ephemeral inline style, never persisted.

## Open Questions

None — the two judgment calls (the density ruling D4, the poster-grid deviation D3') are resolved here and flagged for GATE 1.

## Diagram Decision

exclude — single-writer mechanism with one var and one consuming block; the I1 contract statement reconstructs every relationship in one pass (software-design §Diagram: include only what prose cannot show).
