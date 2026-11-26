# Proposal — tv-style-parity

## Why

The TV app reads as a shrunken desktop page next to the SPA it mirrors: every
text renders the SPA's DESKTOP type scale (6–10sp = 12–20px on the panel —
«font on tv too small», operator 2026-11-26), the grids are fixed 3-across
constants with no viewport-height budget (one poster row fills 76% of the
height and the next lands as a 23px sliver — «posters and elements should
better fit to ratio»), and the screens carry anatomy gaps the web does not
have: the series page is ~60% empty under a 36dp single-column episode list,
the player has no title header and a 2dp seek bar, photo tiles force a 1:1
center-crop that loses heads/feet, and the open rail overlays the first home
card. The ruled parity draft (2026-11-26, rulings D-1..D-6 CLOSED) turns the
deployed SPA into per-screen steps with measured acceptance numbers. The
context ruling: «web ui look more convenient» — the SPA is the reference.

## What Changes

- **G16 — scale mode + type function**: `typeSize(mode, token)` over the ruled
  F-1 table (Компактный ×1.25 / **Обычный ×1.5, default** / Крупный ×2 of the
  SPA desktop px), `LocalUiScale` + composable getters so call sites keep
  reading one scale accessor; app-wide getter sweep; facet/folder chips lanes
  become ONE scrollable row per lane (F-4) at mode-derived heights; the
  session-side `scripts/tv_layout_probe.py` measurement tool.
- **G17 — density contract**: the height-aware `gridPlan` pure function
  (width-fit vs height-fit, two-row tier at the 110dp poster floor, one row +
  peek below; «Постеров в ряду» override 4..7 clamped by the caption law)
  replaces the fixed-3 ruling; serial/tv/photo grids re-tiled; home rows go
  4-across; collection header becomes ONE line (D-3) and the body-top 27px
  sliver retires.
- **G18 — settings overlay + rail entry**: `ui_scale` / `grid_columns` /
  `episode_columns` persisted beside the server address, exposed as StateFlows
  and read through composition locals; a focused settings overlay (live
  re-tile while open) replaces the gated corner `SettingsSection`; a fixed
  «Настройки» last rail row opens it; «Отвязать устройство» moves in.
- **G19 — series page episode grid (D-1)**: the 36dp list becomes a card grid
  (16:9 episode cards: still → title clamp-2 → duration, ✓ corner + progress
  bar on the still; «Эпизодов в ряду» Авто=3 / 2 / 3 / 4); hero poster goes
  natural 2:3 at 72dp width, synopsis 3 lines, breadcrumb line; initial focus
  = first unwatched.
- **G20 — photo tiles fit-over-blur (D-2)**: uniform 1:1 box, photo FITS whole
  over a blurred fill of itself (solid dark below API 31), no grid caption;
  viewer status line renders at typeSmall() — the capture date is already
  served there; the dims/date segment order settles against the SPA source at
  apply time.
- **G21 — player controls**: title header (series · SxxEyy · episode) over a
  top gradient, 6dp seek bar with a 14dp knob, token sizes (clock READOUT,
  hints SMALL); auto-hide and key routing untouched.
- **G22 — home anatomy + rail polish**: resume/anchor captions per the web's
  hierarchy (titles clamp to one line), rows block centers vertically (D-4),
  row-end padding symmetric, content column offsets by the rail width when the
  rail is open (first card never under the rail); rail focus ring 2dp in the
  module type-pastel (Q2), panel width per mode (Q5).
- **G23 — home resume refetch**: a foreground-resume /home refetch heals the
  stale «Не удалось загрузить продолжения» line; rows and the error line stay
  visible while it runs (Q4).
- **Scope boundary — geometry + scale only.** The in-force laws are NOT
  touched: field-driven rendering, served names only, no filesystem paths on
  user screens, the BackHandler chain, two-emit landing, the body-epoch guard,
  rail open/close restore, the 401 wipe, watched dim 0.55, per-surface aspect
  ratios (2:3 poster / 16:9 still / 1:1 photo — never «unified»). Zero server
  delta, zero SPA delta, zero wire changes.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `android-tv-client`: the typography law becomes mode-aware (three presets,
  ruled per-token table, default Обычный); the geometry law retires the
  fixed-3 column ruling for the height-aware density contract and the
  override settings; the home, series-detail, collection-body, rail-geometry
  and focus-ring requirements gain the per-screen parity scenarios; NEW
  requirements for the density contract, the UI scale settings surface, the
  player controls chrome, the photo fit-over-blur tile, and the chips lane.

## Impact

- Android Kotlin only (`android/src/main/java/tv/mellifera/`): `ui/`
  (TypeScale rewrite, NEW UiScale, NEW UiPrefs, NEW SettingsOverlay,
  SettingsSection deleted, Focus, LayoutParity), `browse/` (BrowseScreen,
  HomeRows, LayoutParity, SeriesGrid, PhotoViewer, ItemCards, NEW
  EpisodeCard), `playback/` (PlayerScreen), `pairing/` (SessionStore,
  PairingScreen), `home/` (HomeFlow), `AppViewModel.kt`, `ui/App.kt` — plus
  `scripts/tv_layout_probe.py` (NEW, session-side tool, never on a duty path).
- Tests: TypeScaleTest rewrite (per-mode table pins), browse + ui
  LayoutParityTest rewrite (density output tables), RailLawTest (+1 row),
  FocusLawTest, KeyRoutingTest, HomeFlowTest (resume pin), HomeCardsTest,
  EpisodesTest, SeriesHeroTest, SeriesGridTest, PhotoFlowTest, ItemCardsTest,
  SessionStoreTest, AppSmokeTest, ControlsHideTest, PlayerInfoTest; NEW
  SettingsOverlayTest.
- Zero new Gradle dependencies — see Q1 (the `Modifier.blur` idiom is
  androidx.compose.ui.draw, Coil and SharedPreferences are already declared).
- Baseline green @ e420ebc (gradle JVM + `go test ./...`). Duties run targeted
  JVM tests only; GATE 2 runs the full suites. On-device screencap walks are
  post-green, session-side over the tv-debug relays — never duties.

## Numbered questions (GATE 1)

1. **Dependency surface is empty.** The surface carries zero JVM/Android
   signal (its only distributions are the elected Python environment's);
   Kotlin is outside every indexed backend, so the surface cannot confirm or
   deny any API. The tasks lean only on already-declared
   artifacts: `Modifier.blur` (androidx.compose.ui.draw; API 31+, solid-fill
   fallback below), Coil (one request → two painters — already in use),
   SharedPreferences (SessionStore's backing). **Recommended: proceed with
   zero new Gradle dependencies; the baseline-green gradle build is the
   guard.**
2. **Rail focus ring vs the slate law.** The draft (§3.2 step 4) wants the
   focused rail row's ring at 2dp with the row's MODULE TYPE-PASTEL border;
   the living spec's Focus ring law pins the slate #CBD5E1 outline for every
   focusable (the blue accent was retired as a selection wash — the pastels
   are a different family, dotSerial etc.). **Recommended: adopt as a
   rail-scoped exception — rail rows render the 2dp type-pastel border, every
   other surface keeps the slate outline; the spec delta is written that
   way.**
3. **«Focused name keeps the 1.1 scale law» is stale.** The draft's §3.2 step
   1 clause references a law S-7 retired: zero `graphicsLayer`/scale remains
   under `ui/` + `browse/` (grep-verified @ e420ebc) and the spec says NO
   scale transform. **Recommended: the focused rail name stays at its token
   size; the clause retires as stale draft text.**
4. **Resume-refetch error posture.** The draft pins «the error line stays
   while it runs», but `HomeFlow.load()` clears `error` at start
   (HomeFlow.kt:87). **Recommended: a dedicated `resumeRefetch()` that keeps
   prior rows AND the error line visible while in flight; success replaces
   the state whole (load's law), failure keeps the prior posture; `load()`
   itself untouched.**
5. **Rail panel width at Крупный.** The draft says widen to 112dp only if a
   name ellipsizes below 8 chars at Крупный — at SMALL=28sp(56px) an 8-char
   name ≈ 269px vs ≈180px of text box at 112dp, so the condition fires but
   112dp may still truncate. **Recommended: `railPanelWidth(mode)` =
   96/96/112dp now (the ruled 96dp stands at Компактный/Обычный); the G22
   on-device walk measures Крупный and a follow-up amendment re-authors the
   width if the 8-char floor still fails.**
6. **Tv-module grid cell is under-pinned.** The draft offers «≈ 5 cols × 3
   rows of 169×95dp» OR «4 × 2 of 216×122dp» for the tv stills at
   540dp/Обычный without ruling between them. **Recommended: no tv special
   case — the same `gridPlan` law decides (at Обычный/Авто it yields the
   two-row tier with its own track); the test pins the law's exact outputs at
   the three viewport shapes, and the post-green walk confirms legibility.**
