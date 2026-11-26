# Design — tv-style-parity

## Context

Design input: the FINAL parity draft (2026-11-26, rulings D-1..D-6 closed) with
its evidence set (TV `adb screencap` PNGs, headless-Chromium web captures, DOM
measurements, true-pixel mocks) — the substance is transduced HERE and into the
spec delta; the `.tmp` draft itself is untracked scratch and is never the
durable source. The predecessor `2026-11-20-tv-style-parity` (S-1..S-8) already
landed the token surface, typography law (SPA px ÷ 2), chip idiom, geometry ÷2
constants, home chrome and the slate focus ring — this change amends that
surface, never re-does it.

Current state @ e420ebc: `ui/TypeScale.kt` authors 8 public `TYPE_*` sp
constants (= SPA desktop px ÷ 2 — the RC-1 desktop scale); `browse/LayoutParity.kt`
authors fixed column counts (3 across everywhere — the RC-2 no-height-budget
state) plus gutter/overscan/aspect constants; `ui/LayoutParity.kt` pins
`RAIL_PANEL_WIDTH = 96dp`. The box: 1920×1080 override, density 320 (2.0× →
1sp = 2px), 960×540dp, 3 m viewing. Constraints: JVM-only tests
(testDebugUnitTest, no instrumentation), ≤8 exported symbols per package,
doc.go-style KDoc law, pure core / thin shell, funlen 60/40.

## Goals / Non-Goals

**Goals:**

- The panel reads like the SPA's `html.tv` tier at 3 m: mode-aware type scale
  (default Обычный = ×1.5), height-aware grid density, per-screen anatomy
  parity — every acceptance number from the draft's tables and §3 Verify lines
  is pinned in a JVM test or the spec delta.
- The scale, poster columns and episode columns become persisted user settings
  applied live.
- All in-force behavior laws keep their scenarios green (field-driven
  rendering, served names, BackHandler chain, two-emit landing, body-epoch
  guard, rail restore, 401 wipe, watched dim 0.55, aspect ratios).

**Non-Goals:**

- No server, SPA, wire, or Gradle-dependency changes (Q1).
- No two-column series page (D-1 explicitly rejects it), no masonry photo grid
  (D-2 retires it), no Collections card row on Home (D-4), no count line on
  the collection header (D-3).
- No Android system-font-scale coupling — the in-app scale setting is
  preferred precisely because system scale grows sp without the dp geometry
  (captions would overflow).
- No on-device automation in duties: screencap walks are session-side
  post-green verification.

## Decisions

### D1 — Type scale: a ruled table, not a multiplier (F-1)

`typeSize(mode, token)` is TABLE-DRIVEN. The operator ruled the columns
individually and they deviate from pure multiplication (READOUT Обычный = 24,
not 30; DISPLAY Обычный = 32, not 30; SMALL Обычный = 20, not 21; READOUT
Крупный = 32, not 40) — the table is the acceptance floor, the derivation
(«×2 was too large 17 Nov, ×1 too small 25 Nov, the SPA html.tv ×1.25 tier is
the floor» = the two operator rulings + the web's own tv tier) is the KDoc.

Ruled panel-px table (sp = px ÷ 2) — TypeScaleTest pins every cell:

| Token | Today (px) | Компактный | Обычный (default) | Крупный |
|---|---|---|---|---|
| META | 12 | 15 (7.5sp) | **18 (9sp)** | 24 (12sp) |
| SMALL | 14 | 17.5 (8.75sp) | **20 (10sp)** | 28 (14sp) |
| BODY | 16 | 20 (10sp) | **24 (12sp)** | 32 (16sp) |
| HEADING | 18 | 22.5 (11.25sp) | **28 (14sp)** | 36 (18sp) |
| READOUT | 20 | 25 (12.5sp) | **24 (12sp)** | 32 (16sp) |
| DISPLAY | 20 | 25 (12.5sp) | **32 (16sp)** | 40 (20sp) |
| CODE | 36 | 36 | 36 | 36 (mode-independent) |
| FALLBACK_INITIAL | 36 | 45 (22.5sp) | **54 (27sp)** | 72 (36sp) |

Call sites keep reading ONE scale accessor: the `TYPE_*` constants retire into
private table bases and become composable getters (`typeSmall()` …) backed by
`LocalUiScale` — a mechanical token-for-getter swap, no per-site redesign.
Used-by law (unchanged mapping): META = facts/durations/counts/eyebrows/hints/
✓/status; SMALL = card titles/chip labels/synopsis; BODY = messages/empty and
error lines; HEADING = «Продолжить»/«Следующая серия»/info headings; READOUT =
player clock; DISPLAY = page/hero titles; CODE = pairing code.

Mode-derived geometry rides the same module (ruled anchors, derived tier):
`chipHeight(mode)` = 30/36/48dp (F-4's ruled chips lane heights);
`railRowHeight(mode)` = `chipHeight(mode) × 4/3` = 40/48/64dp (the §3.2 ruled
anchor is 48dp at Обычный; the ×4/3 tier is the derivation — the walk
confirms). Alternative considered and rejected: deriving both from a single
multiplier of today's constants — the ruled columns are not proportional, so a
multiplier law would fail the pinned table.

### D2 — Density contract: one pure planner, outputs pinned (F-2)

`browse/LayoutParity.kt` gains `gridPlan(...)` — pure, JVM-tested. The law:

```
trackFromHeight(rows) = ((H − chrome − rows × caption) / rows) × aspect
columnsAuto           = floor((W + gutter) / (trackFromHeight + gutter))
columns               = columnOverride ?? columnsAuto          (override clamps so the caption never clips)
track                 = min((W + gutter) / columns − gutter, trackFromHeight)
tier                  = 2 rows when track ≥ 110dp (poster width floor), else 1 row + peek
```

W = the content column width (883dp at 960dp screen), H = viewport height
(540dp), aspect = width/height (POSTER_ASPECT 2/3, STILL_ASPECT 16/9,
PHOTO_TILE_ASPECT 1). Reserve inputs: `chromeReserve(mode, surface)` /
`captionReserve(mode, surface)` — Обычный serial values are the draft's ruled
inputs (chrome 80dp = title 28 + chips 36 + 16; caption 58dp = 2-line title 28
+ Season chip 24 + 6); Компактный/Крупный calibrate to the pinned outputs.

**Precedence rule (the contract's load-bearing clause): the pinned OUTPUTS are
the acceptance floor; the reserve inputs serve them.** Draft-pinned outputs
(LayoutParityTest pins each mode × override at 960×540, 1280×720 and 1920×1080
dp):

| Mode | Poster grid («Авто») | Titles | «Постеров в ряду» = 4 / 5 / 6 |
|---|---|---|---|
| Компактный | 7 × 2 (peek = 0) | 14 | 4+peek / 5+peek / 6+peek (1-row tier, peek grows) |
| **Обычный** | **7 × 2** (≈230×345px posters) | **14** | 4+peek (432×648) / 5+peek (343×515) / 6+peek (284×426) |
| Крупный | 4 (one row @216dp, 432×648, peek = 0) | 4 | 4 only (overrides clamp to 4; 5+ truncates titles) |

Landed correction (17.1 green, browse/LayoutParityTest): AUTO peek = 0 in
every cell above — the floor-derived auto columns force widthFit(auto) ≥
heightFit, so the auto track always lands ON the height-fit, and the
exact-fill identity 2·(caption + heightFit/aspect) ≡ H − chrome leaves the
leftover 0 for ANY reserve values (no single rounding rule can produce both
REGULAR's floor-derived 7 columns and a peek); peek > 0 exists only at the
overrides (the one-row tier).

Also ruled: photo grid «Авто» = 4 (216dp squares, 2 full rows at 540dp/Обычный);
home rows 4 across (card ≈ 209dp, still 209×118dp, caption ≈ 68dp, row ≈ 216dp,
two rows ≈ 371dp of 540); episode grid «Эпизодов в ряду» Авто = 3 at Обычный
(the ~100dp hero chrome reserve), 2/3/4 override. Tv-module stills: the draft
offers two approximate cells (Q6) — the law decides, no special case. The
fixed constants `SERIES_GRID_COLUMNS` / `TV_FILE_GRID_COLUMNS` /
`PHOTO_GRID_COLUMNS` / `HOME_ROW_COLUMNS` retire with this decision. Alternative
rejected: porting the SPA's CSS `auto-fill` + vh-tier selectors literally —
Compose has no vw/vh, and the draft's formula IS the port with the panel's
ruled anchors.

Landing record (17.1, green — LayoutParityTest): AUTO = height-first (the auto
track IS the height-fit; exact fill, peek 0), override = width-first clamped
to columnsAuto (Крупный's overrides clamp to 4); tier compare FIT_EPSILON_DP
0.05. Calibrated reserves (chrome/caption dp): serial Компактный 76/54,
Обычный 80/58 (ruled), Крупный 146/70; PHOTO Обычный 108/0; HOME Обычный
169/68; EPISODE Обычный 100/70. Landed @960×540: REGULAR auto 7×2 @114.67dp,
overrides 4/5/6 one-row @216.3/171.84/142.2dp (peeks 77.55/144.24/188.7);
Крупный auto 4 @216dp one-row; photo REGULAR 4×2 @216dp; home 4 across
@208.89dp card; episode REGULAR 3 @266.67dp; tv REGULAR 2×2 @334.22dp.
Крупный REGAINS the two-row tier at taller viewports (7×2 @144.67dp at
1280×720, 6×2 @264.67dp at 1920×1080) — law outputs, not mode constants.
Flag: the 22.2 on-device walk measures at 540dp only — the taller-viewport
two-row legs are test-pinned, walk-unverified.

### D3 — Card anatomy rows (F-3; field-driven law untouched)

| Card | Web | TV target |
|---|---|---|
| Series card | poster 2:3 → title clamp-2 → `Season N` chip | poster 2:3 → title clamp-2 (SMALL) → ONE caption line: «Season N» chip (served `season`, absent → absent) + ★ score (META, served `score`, absent → absent) at the 7-column lane; the full facts line renders when the lane fits it (≤6 columns — the lane WIDTH decides, never a hardcoded count); watched ✓ stays the art corner. LANDED NOTE (17.2): the Go wire serves NO `season` on series rows (the SPA derives its chip client-side from the opaque series document, which the TV client never walks) — in force, the compact caption is the ★ score alone; the chip is a seeded follow-up (read-time `season` on seriesDTO + one-line passthrough), outside this change's zero-server-delta boundary |
| Home resume card | 16:9 still → bar → eyebrow → title ·SxxEyy → meta | 16:9 still → bar → eyebrow (META) → title (SMALL, 1 line) → position line (META); OK = play |
| Home anchor card | 16:9 still → title → `Next SxxEyy` + library | 16:9 still → title (SMALL, 1 line) → «Следующая: SxxEyy» + library (META) |
| Episode card (new) | 16:9 card → title clamp-2 → duration + ✓ | 16:9 still → title clamp-2 (SMALL; served document `title` when present, else the composed name — never re-derived) → duration (META); ✓ corner + in-progress bar on the still |
| Photo tile | masonry, natural ratio | uniform 1:1, image FITS whole over a blurred fill (D-2 = b); no grid caption |

### D4 — Chips lane (F-4)

ONE horizontally scrollable `LazyRow` per lane (facet chips serial, folder
chips image — today both wrap/clip), chips at `chipHeight(mode)`, label SMALL +
count META, selected = the chip-active background change (the S-4 pill idiom
law stands). UP/DOWN semantics unchanged (`chipsRowConsumesUp` untouched);
LEFT/RIGHT walks the lane and scrolls it (scroll-to-focused-item).

### D5 — Settings (F-5): UiPrefs carrier, overlay shell, rail entry

Persistence: `SessionStore` string keys `ui_scale` (`compact|regular|large`),
`grid_columns` (`auto|4|5|6|7`), `episode_columns` (`auto|2|3|4`) beside
`KEY_TOKEN`/`KEY_ADDRESS` — absence decodes to the defaults, so first run
needs no setup. State: NEW `ui/UiPrefs.kt` — three `StateFlow`s (uiScale =
REGULAR, gridColumns = null = Авто, episodeColumns = null = Авто) + setters
that persist-through and emit; `AppViewModel` constructs it over its store and
exposes it; `App.kt`'s root `CompositionLocalProvider` provides
`LocalUiScale` + `LocalGridPrefs` from the flows (collectAsState) so every
surface reads live values and the overlay's changes re-tile the screens while
it is open. The in-app setting is preferred over Android's system font scale
because the latter scales sp without the dp geometry.

Overlay: NEW `ui/SettingsOverlay.kt` — the standard focused dialog shell (BACK
closes; focus lives inside; `tvFocusStyle` rows): «Масштаб интерфейса»
(OK or LEFT/RIGHT cycles, applied LIVE), «Постеров в ряду» (Авто/4/5/6/7),
«Эпизодов в ряду» (Авто/2/3/4), «Поделиться диагностикой» (moved from the
retired corner affordance, still telemetry-gated), «Сервер» (read-only
configured address), «Отвязать устройство» (wipes the token → Pairing).
`ui/SettingsSection.kt` deletes with its call site. Rail entry: a fixed last
«Настройки» row below the libraries (divider above, always present); the rail
walker's count becomes `libraries.size + 1` (`moveInList` bounds ride;
`dpad/KeyRouting.kt` itself untouched); OK opens the overlay; BACK restores
the rail focus.

### D6 — Screen decisions (per ruling)

- **D-1 series page**: episode GRID under the hero (the two-column list is not
  built); the poster grid's `moveInGrid` walker; initial focus = first
  unwatched episode when served, else index 0; BACK = series grid (chain
  unchanged); bottom padding `PARITY_OVERSCAN_Y`. Hero: poster
  `width(72.dp).aspectRatio(POSTER_ASPECT)` (natural 2:3, uncropped — the
  48×72dp box retires), title DISPLAY clamp-2, facts META, synopsis SMALL
  clamp-3, genre chips META, breadcrumb «Ongoings › Title» META (the web's
  back link is BACK on TV).
- **D-2 photo tiles**: fit-over-blur as in D3's table; `Modifier.blur` is
  API 31+ (the box is Android 14); below 31 a solid dark fill — the branch is
  a one-line `if`, not a strategy split.
- **D-3 collection header**: ONE line — title DISPLAY + a small type badge
  chip (the module's pastel), no count/description line; the body-top 27px
  home sliver retires (pad the home column bottom or extend the
  `bringIntoView` target; the `SWAP_RETRY_FRAMES` law untouched).
- **D-4 home fill**: the rows block centers vertically when shorter than the
  viewport (`Arrangement.Center` inside `fillMaxHeight`); no Collections row
  on Home; row-end padding symmetric (right content padding = left margin).
- **Player**: title header reads the same served info blocks the info column
  reads (absent → no bar — field-driven); seek 6dp + 14dp knob; auto-hide and
  key routing untouched.
- **Rail**: Q2's pastel 2dp focused-ring exception; Q5's `railPanelWidth` =
  96/96/112dp; the rail-open content offset (first card left edge ≥ 192px).

### D7 — The layout probe

`scripts/tv_layout_probe.py` — the session-side PIL measurement the ruling
session used (band scans, glyph-height scans, column-segment counts), CLI with
`--expect-*` exits, `--selftest` running the pure scan laws on synthetic
arrays (no PIL), lazy PIL import with a clear message. A session tool: never a
duty dependency, never shipped to the device.

## Interfaces

Signatures only — bodies are the implementer's, contracts are pinned by the
named tests.

```kotlin
// ui/UiScale.kt (NEW, G16) — pure; TypeScaleTest pins every cell + both ladders
enum class UiScaleMode(val label: String) { COMPACT("Компактный"), REGULAR("Обычный"), LARGE("Крупный") }
enum class TypeToken { META, SMALL, BODY, HEADING, READOUT, DISPLAY, CODE, FALLBACK_INITIAL }
fun typeSize(mode: UiScaleMode, token: TypeToken): TextUnit      // ruled F-1 table, sp = px ÷ 2
fun chipHeight(mode: UiScaleMode): Dp                            // 30 / 36 / 48 dp (F-4 ruled)
fun railRowHeight(mode: UiScaleMode): Dp                         // chipHeight × 4/3 → 40 / 48 / 64 dp
val LocalUiScale: ProvidableCompositionLocal<UiScaleMode>        // default REGULAR
data class GridPrefs(val posterColumns: Int?, val episodeColumns: Int?)   // null = Авто (both)
val LocalGridPrefs: ProvidableCompositionLocal<GridPrefs>        // beside LocalUiScale; default GridPrefs(null, null) = Авто

// ui/TypeScale.kt (rewritten, G16) — the 8 public constants retire; call sites read these
@Composable fun typeMeta(): TextUnit            // + typeSmall / typeBody / typeHeading /
                                                //   typeReadout / typeDisplay / typeCode / typeFallbackInitial

// browse/LayoutParity.kt (G17) — pure planner; LayoutParityTest pins the output tables
data class GridPlan(val columns: Int, val track: Dp, val rows: Int, val peek: Boolean)
fun gridPlan(
    width: Dp, height: Dp,
    chrome: Dp, caption: Dp,
    aspect: Float,                               // width/height: POSTER_ASPECT, STILL_ASPECT, PHOTO_TILE_ASPECT
    gutter: Dp = PARITY_GUTTER,
    columnOverride: Int? = null,                 // «Постеров в ряду» / «Эпизодов в ряду»; null = Авто
): GridPlan                                      // tier: 2 rows iff track ≥ 110dp, else 1 row + peek
fun chromeReserve(mode: UiScaleMode, surface: GridSurface): Dp   // REGULAR serial = 80dp (ruled)
fun captionReserve(mode: UiScaleMode, surface: GridSurface): Dp  // REGULAR serial = 58dp (ruled)
enum class GridSurface { POSTERS, STILLS, PHOTOS, HOME, EPISODES }

// ui/LayoutParity.kt (G17/G22)
fun railPanelWidth(mode: UiScaleMode): Dp        // 96 / 96 / 112 dp (Q5 default; RAIL_PANEL_WIDTH retires)

// pairing/SessionStore.kt (G18) — typed accessors; the three new KEY_* consts stay PRIVATE
// in the companion beside KEY_TOKEN/KEY_ADDRESS ("ui_scale" = compact|regular|large,
// "grid_columns" = auto|4|5|6|7, "episode_columns" = auto|2|3|4) — no public raw-key surface
fun readUiScale(): UiScaleMode?                   // typed decode; null = key absent → caller default
fun writeUiScale(mode: UiScaleMode)
fun readGridColumns(): Int?                       // null = absent = Авто
fun writeGridColumns(columns: Int?)
fun readEpisodeColumns(): Int?                    // null = absent = Авто
fun writeEpisodeColumns(columns: Int?)

// ui/UiPrefs.kt (NEW, G18) — SessionStore keys → AppViewModel StateFlows → composition locals
class UiPrefs(store: SessionStore, scope: CoroutineScope) {
    val uiScale: StateFlow<UiScaleMode>          // REGULAR default; setter persists + emits
    val gridColumns: StateFlow<Int?>             // null = Авто; setter persists + emits
    val episodeColumns: StateFlow<Int?>          // null = Авто; setter persists + emits
}
// AppViewModel: val uiPrefs: UiPrefs — App.kt root provides LocalUiScale + LocalGridPrefs from it

// ui/SettingsOverlay.kt (NEW, G18) — dialog shell + pure row law (SettingsOverlayTest)
@Composable fun SettingsOverlay(prefs: UiPrefs, viewModel: AppViewModel, onDismiss: () -> Unit)
//   BACK closes; rows: Масштаб интерфейса (OK/LEFT/RIGHT cycle, LIVE), Постеров в ряду (Авто/4/5/6/7),
//   Эпизодов в ряду (Авто/2/3/4), Поделиться диагностикой (gated), Сервер (read-only), Отвязать устройство
fun <T> cycleOption(options: List<T>, current: T, forward: Boolean): T   // pure, wraps

// browse/EpisodeCard.kt (NEW, G19) — anatomy per D3; data law JVM-pinned in SeriesGrid/Episodes tests
@Composable fun EpisodeCard(card: DisplayCard, ...)   // 16:9 still → title clamp-2 → duration; ✓ + bar on the still
fun episodeTitle(document: JsonElement, displayName: String): String?
//   served document `title` when present else null → caller falls back to the composed name (never re-derived)

// scripts/tv_layout_probe.py (NEW, G16) — session-side only
// python3 -I scripts/tv_layout_probe.py <png> [--expect-cols N] [--expect-rows N] [--min-glyph PX]
//   exit 0 within expectations, 1 outside; --selftest runs the scan laws on synthetic arrays
```

## Risks / Trade-offs

- [Reserve inputs vs pinned outputs diverge at Компактный/Крупный] → the
  precedence rule (D2): outputs are the floor; the inputs calibrate; the test
  table fails loudly if either drifts.
- [`Modifier.blur` cost on a 4-wide grid of large bitmaps] → one Coil request
  per tile feeding two painters; the blur rides the background layer only; the
  post-green walk checks scroll jank on-device.
- [Live re-tile while the overlay is open recomposes whole grids] → the flows
  emit through composition locals; grids already recompute per layout pass;
  acceptable at 540dp scale.
- [Getter sweep touches ~68 call sites] → mechanical token-for-getter swap,
  two tasks bounded by file sets, each with a tree-wide negative grep; the
  TYPE_* constants go private so no bypass survives.
- [Крупный mode may still truncate rail names at 112dp] → Q5's default keeps
  the one-line clamp law honest; the walk measures and an amendment re-authors
  if needed.
- [The stale-error fix could mask a hard-failing server] → resumeRefetch keeps
  the error line while in flight and on failure; the line only clears when a
  successful answer replaces the state.

## Migration Plan

Group order is the DAG: 16 → 17 → 18 strictly first (the knob exists before
the screens re-tile, so every later group verifies in all three modes), then
19–22 in any order, 23 independent. Each group's duty runs its targeted JVM
tests; GATE 2 runs the full Android suite + Go suite (unchanged, expected
green — zero server delta). Rollback = revert the branch; no data migrations
(the three new SharedPreferences keys are additive; absence decodes to
defaults).

## Open Questions

None deferred by design — the six open items (Q1–Q6) live in proposal.md's
Numbered questions and resolve at GATE 1; Q2/Q4/Q5/Q6 each carry a recommended
default the artifacts are already written against, so an adopted default needs
no re-authoring, and a rejected one re-authors only the affected task/spec
sections.
