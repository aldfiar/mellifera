# Integration audit — tv-style-parity

Surveyor: wf-surveyor · Date: 2026-11-26 · Read-only audit (this file + the wf-reviewer handoff are the only writes).

**Grounding basis.** Worktree `/Users/aldfiar/projects/go/mellifera.worktrees/tv-style-parity`, branch `feature/tv-style-parity`, HEAD `01fe9a4` — the proposal's baseline `e420ebc` plus `01fe9a4` (fix(itest): devices registry row, touches only `internal/itest/qa_pairing_joint_test.go`; zero Kotlin delta), so all citations are live at HEAD. The wf source map covers ZERO Kotlin: `wf index query stats` = 595 files (go 462 / js 3 / py 2 / sh 2 / ts 36 / tsx 90 — no .kt), BACKENDS python-graph; the worktree map auto-built CURRENT @ `01fe9a4` during this audit. Per the audit contract, every node was therefore grounded by direct live-source reads (G2) with `file:line` evidence below — no prompt-memory facts.

**Artifacts audited:** `proposal.md` (6 planner questions Q1–Q6), `design.md` (D1–D7 + Interfaces), `tasks.md` (20 tasks, groups 16–23), `tasks/17.1.md`, `tasks/19.1.md` (six-slot contracts), `specs/android-tv-client/spec.md` (delta).

---

## 1. The planned graph

### 1.1 Nodes (planned-touched, all grounded live)

Existing-touched (17):

| Node | Grounding |
|---|---|
| `ui/TypeScale.kt` (rewrite; 8 TYPE_* consts public→private) | consts at :26-51 (`TYPE_DISPLAY` 10.sp … `TYPE_FALLBACK_INITIAL` 18.sp) |
| `ui/LayoutParity.kt` (RAIL_PANEL_WIDTH → railPanelWidth(mode)) | `val RAIL_PANEL_WIDTH = 96.dp` :28; KDoc records the 96dp ruling + "walk-amend-0.3.13 proved 112dp pixel-exact" |
| `ui/Focus.kt` (rail ring 1→2dp pastel, Q2) | `tvFocusStyle` :83, `RingSlate` #CBD5E1 :46, `tvFocusRingWidth` clamp law :56 — today's effective ring at the box (dpr 2.0, 1920px): max(floor(2/2), min(3.84, floor(5/2))) = 2 device px = 1dp ✓ |
| `ui/App.kt` (root provider gains LocalUiScale/LocalGridPrefs) | root `CompositionLocalProvider(LocalContentColor provides tvForeground)` :65 wraps `when(state.screen){Pairing,Browse}` + `PlayerOverlay` :66-71 |
| `ui/SettingsSection.kt` (DELETE, 18.2) | telemetry-gated share row :32-51; «Поделиться диагностикой» :39; consumers: BrowseScreen import :89, call :171 |
| `browse/BrowseScreen.kt` (all 8 groups touch it) | 1400+ lines; every cited def verified — see §2.1 |
| `browse/HomeRows.kt` | `HomeRows` :110, density law `rowCardTrack(maxWidth, HOME_ROW_COLUMNS)` :138, row label TYPE_HEADING :211, LazyRow + `spacedBy(16.dp)` :212/:214, `ResumeCard` :328, unclamped resume title :380, `AnchorCard` :407 |
| `browse/LayoutParity.kt` (gridPlan + retirements) | CONTENT_COLUMN_FRACTION 0.92f :23, POSTER_ASPECT :27, STILL_ASPECT :31, PHOTO_TILE_ASPECT :37, SERIES_GRID_COLUMNS :43, TV_FILE_GRID_COLUMNS :47, HOME_ROW_COLUMNS :50, PHOTO_GRID_COLUMNS :55, PARITY_GUTTER 6dp :60, OVERSCAN_X 24dp :66, OVERSCAN_Y 14dp :70, `rowCardTrack` :78 |
| `browse/PhotoViewer.kt` | `photoStatusLine(index,count,capture,dimensions)` :180 — ALREADY dot-joins capture before dimensions |
| `browse/ItemCards.kt` | `captureDate` :98; `toFileCard` :122, `toPhotoCard` :138 (photo footer = captureDate :151) |
| `browse/SeriesGrid.kt` | `DisplayCard` :21 (id/title/artworkUrl/watched/progress/meta/footer — NO season/score), `watchedPercent` :62, `SeriesDto.toCard` :69, `ItemDto.toCard` :91, `documentDuration` :119, `documentMeta` :135 |
| `browse/FallbackArtwork.kt` (1 sweep site) | import TYPE_FALLBACK_INITIAL :13 |
| `playback/PlayerScreen.kt` | `ControlsBar` :304-362; seek `.height(2.dp)` :323/:331; clock TYPE_READOUT :347; hints TYPE_SMALL :349; `InfoBlocks(it)` :351 (consumes `playback.info`); voiceover TYPE_META :352-360; `PlayerOverlay` :76 |
| `pairing/SessionStore.kt` | `KEY_TOKEN="device_token"` / `KEY_ADDRESS="server_address"` in a PRIVATE companion :25-28; `clearToken` :19; `SharedPreferencesSessionBacking` :54 |
| `pairing/PairingScreen.kt` (11 sweep sites) | no unpair affordance today (strings :67-84 only) |
| `home/HomeFlow.kt` | `load()` :86; `error = null` clear-at-start :87; replace-state-whole law :93-99 |
| `AppViewModel.kt` | `onForegroundResume()` :233 (telemetry + `refreshProfile()`), `refreshProfile()` :240; unpair mechanism `screen = Screen.Pairing, token = null` :209 |

NEW (5 + two unpinned composition locals):

| Node | Grounding |
|---|---|
| `ui/UiScale.kt` (UiScaleMode, TypeToken, typeSize, chipHeight, railRowHeight, LocalUiScale) | absent today ✓ (grep: no LocalUiScale/LocalGridPrefs/chipHeight/railRowHeight anywhere) |
| `ui/UiPrefs.kt` (3 StateFlows + persist-through setters) | absent today ✓ |
| `ui/SettingsOverlay.kt` (dialog + cycleOption pure law) | absent today ✓ |
| `browse/EpisodeCard.kt` (EpisodeCard + episodeTitle helper) | absent today ✓; helper lands beside `documentDuration` per 19.1 contract |
| `scripts/tv_layout_probe.py` (session-side probe) | absent today ✓; `scripts/` holds dev.sh only |
| `LocalGridPrefs` (composition local) | read by 17.1 contract + 17.2/17.4/19.1 prose but NOT declared in design §Interfaces (→ Q15) |

Deliberately untouched (verified present so the "untouched" claims are implementable): `dpad/KeyRouting.kt` — `moveInGrid` :84, `moveInRow` :106, `chipsRowConsumesUp(key, aboveFocusable) = key == Up && !aboveFocusable` :126, `moveInList` :133; `nav/InitialFocus.kt` — `FocusTarget.EpisodeRow` :26, `browseFocusTarget` :51-58 (series open → `EpisodeRow(state.episodeFocus)`), pinned by `FocusLawTest::every_screen_resolves_initial_focus`; `net/Dtos.kt` — `score: Double?` :115, `season: Long?` :313 (the served fields 17.2 needs EXIST — no wire change); `SWAP_RETRY_FRAMES` BrowseScreen :1013.

### 1.2 Edges (planned relations; grounding = the task that implements them)

1. **getter→local**: typeMeta()/…/typeFallbackInitial() read `typeSize(LocalUiScale.current, token)` — 16.1.
2. **call-site sweep**: 68 `fontSize = TYPE_` sites → getters; file/file counts EXACT (see §2.2) — 16.2 (37), 16.3 (31) + privatization.
3. **provider**: App.kt root provider provides LocalUiScale + LocalGridPrefs from UiPrefs flows (collectAsState) — 18.1; scope verified: every named read surface sits inside App.kt :65's provider subtree (BrowseScreen ⊃ grids/chips/rail/HomeRows/PhotoViewer/SettingsOverlay; PairingScreen :67; PlayerOverlay :70).
4. **persist-through**: UiPrefs setters → SessionStore keys `ui_scale`/`grid_columns`/`episode_columns` (absence→defaults) — 18.1; SessionStore today exposes only typed accessors over a PRIVATE companion (→ note under Q15).
5. **construction**: AppViewModel constructs UiPrefs over its SessionStore, exposes it — 18.1 (pattern precedent: `viewModel.telemetry`).
6. **overlay↔prefs**: SettingsOverlay(prefs, viewModel, onDismiss) cycles scale/columns (cycleOption pure) applying LIVE; unpair row → clearToken → Screen.Pairing (mechanism exists, AppViewModel :209) — 18.2.
7. **rail entry**: CollectionsRail fixed last row «Настройки»; walker count = libraries.size + 1 riding moveInList bounds; OK opens overlay, BACK restores rail focus — 18.3.
8. **gridPlan consumers** (all five named): serial CardGrid :426 (17.2), tv CardGrid :449 (17.4), photo CardGrid :487 (17.4), home rows :138 (17.5), episode grid (19.1); each reads LocalGridPrefs/LocalUiScale and passes override — 17.1 lands the pure function, consumers per task.
9. **lane geometry**: chipHeight(mode) → FolderChipsRow :705 / FacetChipsRow :787; railRowHeight(mode) → RailRow :1028 (fixed 38dp retires) — 16.4.
10. **rail width**: railPanelWidth(mode) → CollectionsRail `.width(RAIL_PANEL_WIDTH)` :903 [**Q8 — orphaned in 17.1 as written**] and → ContentColumn/rail-open offset — 17.1 (def) / 22.2 (offset).
11. **caption**: CardView caption (:1302-1331 title/meta/footer) → ONE lane-width-dependent caption line (Season chip + ★ score at dense lanes; facts line ≤6 columns); `WatchedCornerMark` :1289 stays — 17.2; DisplayCard/toCard must gain season/score [**Q11**].
12. **episode grid**: SeriesPage :1093 swaps LazyColumn (:1115, EpisodeRow :1128) for LazyVerticalGrid of EpisodeCard; EpisodeRow :1368-1434 retires from the page (sole caller :1128 — clean); grid rides moveInGrid-family (KeyRouting untouched); first-unwatched initial focus [**Q10**] — 19.1.
13. **photo tiles**: CardView image branch :1273-1293 → uniform 1:1 + FIT over blur (API 31+ branch; solid dark below); one Coil request (Coil 2.7.0, build.gradle.kts :125) → two painters; grid caption retires (footer: toPhotoCard :151) — 20.1.
14. **viewer status**: photoStatusLine :180 → typeSmall(); capture date already wired (PhotoViewer :94-97 calls captureDate → formatDatePart) [**Q12**] — 20.1.
15. **player chrome**: ControlsBar top title bar reads `playback.info` (same PlayerInfoBlocks InfoBlocks :351 reads); seek 2→6dp + 14dp knob; token sizes — 21.1.
16. **home anatomy**: ResumeCard :328 (title clamp-1, :380 today unclamped), AnchorCard :407, symmetric row-end padding :212, Arrangement.Center vertical fill — 22.1.
17. **resume refetch**: HomeFlow.resumeRefetch() (load() untouched; :87's clear is why), three-path law; AppViewModel.onForegroundResume :233 launches beside refreshProfile() via appScope — 23.1.
18. **walker reuse (untouched source)**: KeyRouting laws serve chips/grid/rows/episode-grid; KeyRoutingTest pins — 16.4/18.3/19.1.
19. **probe**: tv_layout_probe.py — session-side only; seam = `--selftest` (pure scan laws, no PIL); never a duty dependency, never shipped — 16.5 (wiring-coverage exception by design: an app-orphan module that is a TOOL, with its own named seam).

Node/edge tally for the DONE line: **nodes=24** (17 existing-touched + 5 new + 2 unpinned locals), **edges=19** relation groups above (≈34 grounded pairwise links).

---

## 2. Check: wiring coverage

**Verdict: HOLDS with one blocking exception (Q8) and three hidden-scope relocations (Q9/Q10/Q11).**

### 2.1 Citation exactness — 26/26 EXACT

BrowseScreen: :89 (SettingsSection import), :171 (call), :196-212 (scroll/landing law + `bodyIntoView` :212), :260-275 (rail region), :330-341 (ContentColumn), :422-439 (serial CardGrid, `columns = SERIES_GRID_COLUMNS` :426), :449 (`TV_FILE_GRID_COLUMNS`), :487 (`PHOTO_GRID_COLUMNS`), :705 (FolderChipsRow), :787 (FacetChipsRow), :894 (CollectionsRail), :1028 (RailRow), :1093 (SeriesPage), :1111 + :1165 (SeriesHeroView call/def — the separate `browse/SeriesHero.kt` is the DATA mapping, no conflict), :1244-1333 (CardView), :1273-1293 (art box), :1289 (WatchedCornerMark), :1368 (EpisodeRow, `.height(36.dp)` :1381). HomeRows: :110/:138/:211/:212/:214/:328/:380/:407. AppViewModel :233/:240. HomeFlow :86/:87. ItemCards :98. PhotoViewer :180. PlayerScreen :304-362 (:323/:331 the 2dp seek). RAIL_PANEL_WIDTH :28. SessionStore :26-27. **No relocation (G2) required anywhere.**

### 2.2 The 16.1→16.3 privatization order — compiles at each step

Census (grep `fontSize = TYPE_`, live at HEAD): **68 total = the plan's claim exactly** — BrowseScreen 26, HomeRows 9, PhotoViewer 1, FallbackArtwork 1 (16.2's file list covers ALL 37), PlayerScreen 18, PairingScreen 11, SettingsSection 2 (16.3's covers ALL 31). No seventh file carries a site; **the 16.2/16.3 file lists fully cover the sweep**. Non-fontSize TYPE_ occurrences are: the definitions themselves, `import tv.mellifera.ui.TYPE_*` lines (rewritten by the same mechanical swap), KDoc mentions, and unrelated symbols (`DEFAULT_TYPE_ACCENT`, media3 `C.DATA_TYPE_*`/`TRACK_TYPE_*`). Test-side consumers: **TypeScaleTest only** (:17-31, :30-31 scale-law pins) — rewritten by 16.1 to table pins BEFORE 16.3 privatizes; a stale TYPE_ import anywhere would fail the gradle compile, so the order is compile-guarded, not trust-guarded. The 16.2/16.3 duties' grep + gradle chain parses correctly (`A && ! grep || exit 1`).

### 2.3 The blocking exception — Q8

`RAIL_PANEL_WIDTH`'s sole call site: BrowseScreen :903 `.width(RAIL_PANEL_WIDTH)` (import :82). 17.1 deletes the constant and lands `railPanelWidth(mode)` while its Call-site law says "NONE in this task — the call sites (serial/tv/photo grids, home rows) are tasks 17.2–17.5" — the rail panel is in NONE of those scopes; 22.2 names only the offset. As written, 17.1's verify (gradle compile of LayoutParityTest) is **guaranteed red** — the DAG's "each group verifies green" premise breaks at G17's first task. (The other four constant retirements ARE covered: SERIES→17.2, TV/PHOTO→17.4, HOME_ROW→17.5.)

### 2.4 Provider scope — sound

App.kt :65's existing root provider already wraps every screen + PlayerOverlay; 18.1's new locals land there, so every named read (grids, chips lanes, RailRow, HomeRows, PhotoViewer, PlayerScreen getters, PairingScreen getters, SettingsOverlay-inside-BrowseScreen) is inside scope. Composable getters reading `LocalUiScale.current` get the REGULAR default outside a provider — safe for pure JVM tests.

---

## 3. Check: QA seam coverage

**Verdict: HOLDS with two named gaps (Q13, Q14) needing explicit amend-or-waive.**

The five @qa joints against the three-tier strategy:

| Joint | Named tests | Tier verdict |
|---|---|---|
| 16.1 UiScale/TypeScale table | TypeScaleTest (rewrite: every (mode,token) cell + both ladders) | Tier-1 pure pins ✓ |
| 16.5 probe | `selftest` on synthetic arrays | Tier-1 for the script ✓ (app-side seam deliberately none — session tool) |
| 18.1 keys + flows | SessionStoreTest (round-trip encodings), AppSmokeTest (defaults + setter flips flow) | Store Tier-1 ✓; the persist-through LEG (setter → store write) not explicitly pinned → **Q14** |
| 18.2 overlay row law | SettingsOverlayTest (cycleOption pure: wraps, absence=Авто) | Tier-1 pure ✓; the live re-tile composition path is walk-tier by declared posture ✓ |
| 19.1 episode grid data law | EpisodesTest (title precedence, duration absence, Авто=3, overrides, first-unwatched helper, OK plays), SeriesGridTest (helpers), KeyRoutingTest (walker) | Tier-1 ✓ (real mappers over served fixtures; the joint/ wire-test family already exists for the wire tier) |

Existence check: every test class named in a verify duty exists today EXCEPT SettingsOverlayTest (created by 18.2 — the @qa convention). ui/FocusRingTest exists (:22.2's duty satisfiable). FocusLawTest :115-125 pins chipsRowConsumesUp both polarities as a pure function — those pins survive Q9's call-site fix.

**Q13 — the sweep's correctness control.** A wrong token→getter mapping at any of the 68 sites (e.g. `typeReadout` where `typeSmall` belongs) is invisible to every named test, both greps, and the compiler; getters are named after tokens so the risk is a mechanical slip, and 16.2/16.3 carry @audit (reviewer reads the six-slot prose at the gate) + the post-green walk measures real glyph heights. Control exists but is not a test — needs an explicit waive or a canary.

Composition-tier facts with no automated pin (declared posture, NOT gaps): "Live re-tile while open" (spec scenario), the rail-open offset (≥192px), BACK-restore of rail focus — all post-green walk items per the plan's own tier split (device walks are never duties).

---

## 4. Check: complexity / blast radius (@audit tasks 16.2, 16.3, 17.2, 20.1)

- **CardView caption (17.2)**: CardView has exactly ONE caller — CardGrid :657 — which serves serial/tv/photo alike. The caption rework therefore flows to ALL THREE grids unless branched per-surface; 17.4 explicitly keeps tv's "title + duration" and 20.1 retires the photo caption, so both later tasks re-touch the same caption block 17.2 rewrites — the @audit flags are correctly placed, and the dispatch order (17.2 → 17.4 → 20.1) serializes the shared block. WatchedCornerMark :1289 and the uniform-aspect art box are the in-force laws the rework must not disturb.
- **Constant privatization (16.3)**: zero bypass survives — census exact (§2.2), non-fontSize uses are imports/comments only, tests swept by 16.1's rewrite. Downstream consumers of the constants: none outside the getters after the sweep (the KDoc history moves into the table's derivation per design D1).
- **Photo-tile blur branch (20.1)**: the branch lives inside the SHARED art box (:1273-1293) — it must discriminate photo tiles from serial/tv tiles. Today DisplayCard carries no photo discriminator; toPhotoCard differs only by field values (footer= captureDate, blank meta family). 20.1 needs either a DisplayCard flag or a CardView parameter — an unnamed (compile-guarded) interface addition inside the named file. Below-API-31 the box is Android 14 (API 34) — the fallback branch is device-unreachable today, JVM-untestable, and lands as the spec's one-line `if`.
- **Viewer status line (20.1)**: formatter already production-wired (PhotoViewer :94-97); the net delta is the size token + possibly segment order (Q12).
- **Hidden scope found (relocations, not orphans)**: SeriesGrid.kt for 17.2 (Q11), nav/InitialFocus.kt + FocusLawTest for 19.1 (Q10), BrowseScreen's aboveFocusable feed for 18.2 (Q9) — each is a file the task's prose IMPLIES but never names; a contract-scoped runner HALTs on them.
- **Edges-per-file load**: BrowseScreen.kt absorbs 12 of the 20 tasks — expected for a screen-shell file; the only file whose deletion (SettingsSection) removes a symbol other code still semantically depends on is the Q9 case.
- **Complexity budget**: gridPlan/cycleOption/typeSize are pure table functions — inside the gocognit 15 bar trivially; the pinned-output tables are the tests. No planned cycle: ui→browse imports exist today (BrowseScreen imports ui.*) and the new nodes keep that direction (UiPrefs→SessionStore, SettingsOverlay→UiPrefs+AppViewModel, EpisodeCard→SeriesGrid) — no back edge (AppViewModel→browse already exists via state, unchanged).

---

## 5. Numbered questions (GATE 1 frontier)

**RECOMPUTED (amendment sweep, 2026-11-26): the frontier is EMPTY.** GATE 1
closed with every question answered by ADOPTION — all fifteen recommended
answers (Q13's canary option adopted as the seven per-token canaries). The
verdicts below stand as the closed evidence record; §6 carries the recorded
resolutions with their landing file:lines. The sweep re-verified each landing
at the unchanged HEAD `01fe9a4` and surfaced two NON-blocking residuals
(R1 doc-sync, R2 cosmetic — recorded in §6; the human decides amend-or-waive).

Planner Q1–Q6 — surveyor verdicts (evidence-verified this audit):

- **Q1 (surface empty) — CONFIRM the recommendation, CHALLENGE the evidence** → see Q7. The dependency claims verified live: Coil `io.coil-kt:coil-compose:2.7.0` (android/build.gradle.kts :125), SharedPreferences backing (SessionStore :54), `Modifier.blur` is androidx.compose.ui.draw (compose-ui already the app's foundation). Zero new Gradle deps + baseline-green build as guard: CORRECT.
- **Q2 (rail pastel ring exception) — CONFIRM.** The spec delta already carries the RAIL-ROW EXCEPTION clause + its scenario; the slate law text matches `tvFocusRingWidth` :56 verbatim; today's ring at the box = the formula's 2 device px = 1dp, so "1 → 2dp" is accurate.
- **Q3 (stale 1.1 scale law) — CONFIRM.** `grep graphicsLayer|scale(` under ui/ + browse/ = zero hits at HEAD; the clause retires as stale.
- **Q4 (resume-refetch posture) — CONFIRM.** `load()` clears error at start (:87) exactly as the proposal cites; the dedicated `resumeRefetch()` keeping rows+error while in flight is the sound landing; HomeFlowTest pins all three paths.
- **Q5 (railPanelWidth 96/96/112) — CONFIRM.** The ui/LayoutParity.kt KDoc itself records "walk-amend-0.3.13 proved 112dp pixel-exact" as history; the walk-then-amend plan stands.
- **Q6 (tv-module cell) — CONFIRM.** The tv branch is already a `CardGrid(STILL_ASPECT)` consumer (:449); no special case is needed and the law pins the outputs.

Surveyor questions (new, each with a recommended answer; the human decides amend or waive):

- **Q7 — the surface contradiction (LOW).** The planner's Q1 evidence ("`wf index surface` reports zero distributions for this repo (both trees, `files_parsed: 0`)") is contradicted by the live artifact: the parent tree's `.tmp/.dep_surface.json` (fingerprint CURRENT) lists ~230 distributions — all PYTHON packages of the elected interpreter environment (provenance `tools/wf/index.py`, interpreter `/Library/Frameworks/Python.framework/.../3.11`), and the worktree map indexes zero .kt files. **Recommended: correct Q1's evidence sentence to "the surface carries zero JVM/Android signal (its only distributions are the elected Python environment's); Kotlin is outside every indexed backend" — the recommendation (zero new deps, baseline-green gradle as guard) is unchanged and confirmed.**
- **Q8 — 17.1 orphaned the rail-width call site (HIGH — blocks).** RAIL_PANEL_WIDTH's sole call site BrowseScreen :903 (+ import :82) is outside 17.2–17.5; 17.1's call-site law says NONE; the constant's deletion makes 17.1's own duty guaranteed-red. **Recommended: fold the one-line rewire into 17.1 — CollectionsRail renders `.width(railPanelWidth(mode))` (the Q5 96dp value is unchanged at Компактный/Обычный, so behavior is identical at the current default), amend 17.1's Call-site law line accordingly; alternative: keep the constant alive (deprecated) until 22.2 swaps it, and delete there.**
- **Q9 — 18.2 dissolves the chips `aboveFocusable` premise (MEDIUM).** Today: `settingsFocusable` (BrowseScreen :127) = `telemetry.isOpen`; gate ON → SettingsSection renders above the body → `chipsRowConsumesUp` (:126, `Up && !aboveFocusable`) leaves UP unconsumed and it crosses natively to the settings row (the D12 law, KDoc KeyRouting :120-125). After 18.2 deletes SettingsSection, :127/:266 keep claiming a focusable that no longer exists — gate-on UP searches for a phantom. Behavior converges to a visual no-op, but a law and its call-site feed reference a dead target. **Recommended: 18.2 (already editing BrowseScreen :89/:171) also feeds `aboveFocusable = false` (or retires the :127/:266 chain), with a prose line noting the D12 crossing law retires with the row; chipsRowConsumesUp and FocusLawTest's pure pins stay untouched (16.4's freeze holds).**
- **Q10 — 19.1's initial-focus law home is unnamed (MEDIUM-HIGH).** The initial-focus law lives pinned in nav/InitialFocus.kt (`browseFocusTarget` → `FocusTarget.EpisodeRow(state.episodeFocus)` :53; its KDoc: "the law and the wiring cannot drift apart"), pinned by `FocusLawTest::every_screen_resolves_initial_focus`. 19.1 retires the episode LIST from the series page and rules "initial focus = first unwatched else index 0" but names only BrowseScreen.kt / EpisodeCard.kt / SeriesGrid.kt. **Recommended: 19.1's file scope explicitly adds nav/InitialFocus.kt (+ the FocusLawTest pin) — e.g., `browseFocusTarget` computes the first-unwatched index from the served watched stamps (pure, EpisodeRow target retained or renamed EpisodeGrid), or a named FocusTarget for the grid; without it the law home and the page drift, defeating the file's own invariant.**
- **Q11 — 17.2's mapping scope is hidden (MEDIUM).** DisplayCard (:21) carries no `season`/`score`; the ONE-caption-line law (Season chip + ★ score, "served season, absent → absent") requires extending DisplayCard + `SeriesDto.toCard` in SeriesGrid.kt. The served fields exist (Dtos.kt :115/:313 — no wire change), but SeriesGrid.kt is not in 17.2's named surface. **Recommended: 17.2's prose/file scope names SeriesGrid.kt (DisplayCard fields + toCard passthrough) at registration; SeriesGridTest gains the mapping pins.**
- **Q12 — 20.1's status-line order contradicts the live pins (LOW-MEDIUM).** 20.1's example «1/50 · 900×1413 · 3 апр. 2026» orders dimensions-then-date; the live formatter dot-joins index·capture·dimensions (photoStatusLine :180-185), PhotoViewer :94-97 already passes `captureDate(document)?.let(::formatDatePart)`, and PhotoFlowTest :166-170 pins capture-then-dims — so "gains the served capture date" is ALREADY the live behavior, and the example implies an unpinned segment SWAP. **Recommended: settle the order against the SPA source at apply time (this audit could not locate the SPA's photo status line component to rule); if SPA = dims-then-date, 20.1 re-orders the join and re-pins PhotoFlowTest (its duty already runs it); if SPA = date-then-dims, fix the example string. Either way the sentence "gains the capture date" should read "renders at typeSmall() (the capture date is already served there)".**
- **Q13 — the getter sweep has no automated correctness control (LOW).** 68 mechanical token→getter swaps; a wrong-getter slip passes all named tests + both greps. Control today: @audit review at 16.2/16.3 + the post-green glyph-height walk. **Recommended: waive explicitly (accept review+walk as the control — the getters are named after tokens and the swap is monotonic), or add one canary per token (7 assertions on a stub-provided LocalUiScale) to TypeScaleTest's rewrite in 16.1.**
- **Q14 — UiPrefs's persist-through leg is un-pinned (LOW).** 18.1 pins the store round-trip (SessionStoreTest) and the flow flip (AppSmokeTest), but no named test asserts setter → `SessionStore` write. **Recommended: 18.1's AppSmokeTest prose adds the second leg (after `uiPrefs.setGridColumns(5)`, the store round-trips `grid_columns=5`) — one assertion, no new test class.**
- **Q15 — `LocalGridPrefs` declaration home is unspecified (LOW).** design §Interfaces names only `LocalUiScale` (ui/UiScale.kt) while 17.1/17.2/17.4/19.1 read `LocalGridPrefs`, and SessionStore's new KEY_* consts sit in a private companion while the design declares them `const val` (public). **Recommended: declare `LocalGridPrefs` beside `LocalUiScale` (carrying the two `Int?` column prefs, default null = Авто) and give SessionStore typed accessors (readUiScale/writeUiScale …) or public keys + generic get/put — one line in the Interfaces block; compile-guarded either way, so this is a contract-completeness fix, not a defect.**

---

## 6. Resolutions

GATE 1 closed 2026-11-26 — the human APPROVED every recommended answer (Q13 as canary: the seven per-token assertions adopted). Recorded by the confirmation sweep (2026-11-26, HEAD `01fe9a4` unchanged — the amendment is doc-only); each landing verified in the amended artifacts:

- **Q1** → zero new Gradle dependencies (recommendation confirmed; evidence re-worded per Q7) → proposal.md :104-112.
- **Q2** → rail-scoped exception: rail rows render the 2dp type-pastel ring, every other surface keeps the slate outline → tasks.md :72 (22.2).
- **Q3** → the stale 1.1-scale clause retires; the focused rail name stays at its token size → tasks.md :72 ("no scale anywhere per Q3").
- **Q4** → dedicated `resumeRefetch()` keeps prior rows AND the error line while in flight; success replaces whole; `load()` untouched → tasks.md :77 (23.1); proposal.md :55-57.
- **Q5** → `railPanelWidth(mode)` = 96/96/112dp now (the ruled 96dp stands at Компактный/Обычный); the G22 walk measures Крупный and a follow-up re-authors if the 8-char floor fails → design.md :242; tasks.md :26 (17.1); tasks/17.1.md :75-77.
- **Q6** → no tv special case — the same `gridPlan` law decides; the test pins the exact outputs, the post-green walk confirms legibility → tasks.md :33 (17.4); tasks/17.1.md :44-45, :65-66.
- **Q7** → Q1's evidence re-worded: "the surface carries zero JVM/Android signal (its only distributions are the elected Python environment's); Kotlin is outside every indexed backend" → proposal.md :104-107.
- **Q8** → the ONE rail call site rewires inside 17.1 (`.width(RAIL_PANEL_WIDTH)` :903, import :82 → `.width(railPanelWidth(mode))`; grid call sites stay NONE, tasks 17.2–17.5); RailLawTest rides the duty as the rail-site guard → tasks.md :26 + :28; tasks/17.1.md :79-87, :97-98, :100-105.
- **Q9** → 18.2 retires the phantom feed: `settingsFocusable`/`aboveFocusable` feeds `false` or the chain retires outright; `chipsRowConsumesUp` itself and FocusLawTest's pure pins stay untouched (the 16.4 freeze holds) → tasks.md :43.
- **Q10** → the initial-focus law home is named: nav/InitialFocus.kt `browseFocusTarget` (`FocusTarget.EpisodeRow` :53) computes/keeps the first-unwatched focus (target retained or renamed EpisodeGrid; the FocusLawTest::every_screen_resolves_initial_focus pin updates with it); the duty gains FocusLawTest → tasks.md :51 + :54; tasks/19.1.md :49-53, :67-69, :79-81.
- **Q11** → SeriesGrid.kt joins 17.2's scope: DisplayCard gains the served `season` + `score` passthrough (SeriesDto.toCard; Dtos.kt :115/:313 — no wire change) and SeriesGridTest gains the mapping pins → tasks.md :29 + :30.
- **Q12** → the dims/date segment order settles against the SPA source at apply time; "the capture date is already served there" phrasing adopted → proposal.md :43-46; tasks.md :60.
- **Q13** → SEVEN per-token canary assertions in the TypeScaleTest rewrite (same class, stub-provided LocalUiScale at a non-default mode; CODE is mode-independent, no canary; the `qa:` line is unchanged) → tasks.md :11-12.
- **Q14** → the persist-through leg is pinned: after `uiPrefs.setGridColumns(5)` the store round-trips `grid_columns=5` (one assertion leg in AppSmokeTest, no new test class) → tasks.md :40.
- **Q15** → `GridPrefs(posterColumns, episodeColumns)` with `Int?` null = Авто and `LocalGridPrefs` declared beside LocalUiScale; typed SessionStore accessors readUiScale/writeUiScale + read/writeGridColumns + read/writeEpisodeColumns; the three new KEY_* consts stay PRIVATE → design.md :221-222, :244-252.

Sweep residuals (NEW findings, non-blocking; recommended — the human decides amend or waive):

- **R1 (LOW, doc-sync)** — tasks/19.1.md's Verify (:85-88) omits `--tests "tv.mellifera.browse.SeriesGridTest"`, which both the tasks.md duty (:54) and the contract's own Tests section (:78) carry. The register floor is complete — the duty derives from tasks.md, not the contract prose — so there is no grammar/drift/cmd-match exposure; the mismatch is contract-prose sync only. **Recommended: add the SeriesGridTest entry to 19.1.md's Verify line; acceptable to waive (the duty governs).**
- **R2 (COSMETIC)** — BrowseScreen.kt :889's KDoc still cites `[RAIL_PANEL_WIDTH]` ("the SPA `.side`'s 224px ÷ 2"); after 17.1 deletes the constant the link dangles — not a compile error. Verified non-blocking: the constant's only OTHER references are the ui/LayoutParityTest :16/:22 pins, and that test file is inside 17.1's rewrite scope (tasks.md :26 "ui/LayoutParityTest pins railPanelWidth per mode"), so deletion compiles. **Recommended: refresh the :889 KDoc sentence in the 17.1 rewire.**

Sweep verification basis (all live at HEAD `01fe9a4`): the amended text's citations re-verified EXACT — RAIL_PANEL_WIDTH def ui/LayoutParity.kt :28, import BrowseScreen :82, call :903 (sole main-source call site; the two test-side pins ui/LayoutParityTest :16/:22 sit in 17.1's own rewrite scope, R2's KDoc :889 is cosmetic); nav/InitialFocus.kt `browseFocusTarget` def :51 with the `FocusTarget.EpisodeRow` branch at :53 and the `every_screen_resolves_initial_focus` pin at FocusLawTest.kt :29; Dtos.kt `score` :115 / `season` :313; the Q9 feed lines BrowseScreen :126-127 (`settingsFocusable = telemetry.isOpen`) and :266 (`aboveFocusable = settingsFocusable`); the Q12 chain PhotoViewer :94-97 (captureDate already wired) → photoStatusLine :180-185 (dot-joins index·capture·dimensions) and ItemCards.kt `captureDate` :98. Cross-checks: the 17.1/18.3/22.2 duties each run RailLawTest with DISTINCT test lists — no duplicate-duty text, and the register grammar carries no cross-task duplicate-duty refusal; the 19.1 duty names every test the task edits (FocusLawTest, SeriesGridTest); the Q13 canaries are test-source getter assertions and cannot trip the 16.2/16.3 main-source `fontSize = TYPE_` sweep greps, nor disturb the 16.1 public → 16.3 private order; Q15's design block is consistent with 18.1's prose (typed accessors decode absence-to-default; 18.1 claims no public raw-key surface). Sweep note on the map: the worktree map (rebuilt, CURRENT @ `01fe9a4`) now lists 102 `.kt` file entries at the symbol-less floor — BACKENDS still python-graph only, `symbols=0`, and `wf index query def browseFocusTarget` → not in map — so Q7's re-worded sentence holds as written.

Landing amendment 2026-11-26 (post-apply, prose-only): 17.1 implementation ruling adopted (peek identity) → design D2 + spec delta + 17.5 prose corrected.

Landing amendment 2026-11-26 (post-apply, session ruling on 17.2's spec-mismatch report): the draft's «Season N» chip premise was false — Dtos.kt :313 is ContinueCurrent.season (the HOME DTO), SeriesDto carries no season, and the Go wire serves none (the SPA derives its chip client-side from the opaque series document the TV client never walks). Q11's "fields exist" verification propagated the wrong citation (surveyor + planner). Ruled: option (a) — the landed score-only compact caption IS the law-conformant reading (served-conditional → absent); NO server-side season in this change (zero-server-delta boundary). The chip is seeded as a follow-up: read-time `season` on seriesDTO mirroring the SPA derivation + one-line DisplayCard passthrough (the caption already slots it as a sibling). Spec :275 scenario + design D3 row record the in-force truth.

Gate-closure ruling 2026-11-26 (GATE 2, reviewer FLAG on 21.1 — ADOPTED): the player title bar renders the TWO-LEG identity line («SxxEyy · episode title»; a film floors to the served display name). The spec delta's "series · SxxEyy · episode title" over-described: PlayerInfoBlocks carries no series-name leg, and the SPA parity source itself (web/src/components/watch/InfoColumn.tsx + test) renders exactly the two-leg line — the landing is parity-true, the spec text was amended to the two-leg law (requirement + scenario). A three-leg code fix would diverge from the parity constitution.

Gate-closure ruling 2026-11-26 (GATE 2, reviewer FLAG on 18.2/geometry law — ADOPTED): the settings overlay is a CENTERED MODAL — its internal dialog padding (24/16dp literals) is not a page-edge inset, so the overscan scenario's enumeration drops it; the scenario now carries the exclusion clause. The dialog keeps its own padding law; the four page-edge surfaces read the 24/14dp constants.
