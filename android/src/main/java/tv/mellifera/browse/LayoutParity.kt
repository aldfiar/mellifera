package tv.mellifera.browse

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.math.max
import kotlin.math.min
import tv.mellifera.ui.UiScaleMode

/**
 * The visual parity scale: the constants the TV layout reads its FIXED
 * geometry from — read from the SPA sources, not invented. The field-driven
 * law stays untouched for FACTS (names, counts, meta lines, footers); these
 * constants govern only the tile geometry and the content column, the SPA's
 * own fixed tv-shell classes (`html.tv main { max-width: min(92vw, 1800px) }`,
 * `aspect-[2/3]`, `aspect-video`). All px values halve at the box's 2.0×
 * density (SPA px ÷ 2), the same law TypeScale follows.
 */

/** The centered content column's fraction of the screen width — the SPA tv
 * shell's `html.tv main { max-width: min(92vw, 1800px) }`
 * (web/src/styles/index.css), the 10-foot source: 0.92 of the viewport
 * (92vw ≈ 883dp of a 960dp-wide panel at 2.0× density). The predecessor 0.60
 * read the desktop pages' `max-w-6xl` proportion (1152/1920), which the tv
 * shell's cap supersedes. The column width is not the tile-size lever — the
 * density law ([gridPlan]) is. */
const val CONTENT_COLUMN_FRACTION = 0.92f

/** The serial/collection poster's FIXED aspect — the SPA's
 * `aspect-[2/3] w-full` artwork class (components/Artwork.tsx). */
const val POSTER_ASPECT = 2f / 3f

/** The tv-module file still's FIXED aspect — the SPA's `aspect-video`
 * (Collection.tsx). */
const val STILL_ASPECT = 16f / 9f

/** The photo tile's FIXED aspect — SQUARE (the operator's 2026-11-16
 * uniform-row ruling): the natural-ratio masonry rendered ragged rows whose
 * text baselines shifted between neighbors; on TV every photo tile is the
 * same square, Crop-filled. */
const val PHOTO_TILE_ASPECT = 1f

// The two-row fit check's float tolerance in dp — the height-fit identity
// makes two rows consume the budget exactly, so only noise crosses it.
private const val FIT_EPSILON_DP = 0.05f

/** The grid tier's poster-width floor (the density contract): a track under
 * 110dp would render posters too small to read at 3 m, so the two-row tier
 * only lives when its height-fit track meets this floor — below it the
 * planner drops to one row plus a peek. */
val POSTER_TRACK_FLOOR: Dp = 110.dp

/** The shared gutter between tiles — the SPA's `gap-3` (12px) halved at the
 * 2.0× density: 12px ÷ 2 = 6dp. The planner's width-fit math subtracts it
 * ([gridPlan], [rowCardTrack]). */
val PARITY_GUTTER: Dp = 6.dp

/** The page's horizontal overscan edge — the SPA tv shell's
 * `html.tv .app-content { padding: 2.5vh 2.5vw }` horizontal leg
 * (web/src/styles/index.css): 2.5vw ≈ 48px at a 1920px viewport ÷ 2 = 24dp.
 * Keeps every surface inside the panel's safe area. */
val PARITY_OVERSCAN_X: Dp = 24.dp

/** The page's vertical overscan edge — the same shell padding's vertical
 * leg: 2.5vh ≈ 27px at a 1080px viewport ÷ 2 ≈ 14dp. */
val PARITY_OVERSCAN_Y: Dp = 14.dp

/** The surfaces a grid plan serves; each carries its own chrome and caption
 * reserves ([chromeReserve]/[captionReserve]). SERIAL = the 2:3 poster
 * grids (collections, folders), TV = the 16:9 file-still grid (no special
 * case — the same law, Q6), PHOTO = the 1:1 square grid (no caption on the
 * grid), HOME = the home rows' 16:9 cards, EPISODE = the series page's
 * episode grid under its hero. */
enum class GridSurface { SERIAL, TV, PHOTO, HOME, EPISODE }

// The vertical chrome reserves in dp ([COMPACT, REGULAR, LARGE]) per
// surface: the fixed-height UI above/beside a grid's rows that the height
// budget subtracts. Обычный SERIAL is the ruled draft number (title 28 +
// chips 36 + gap 16 = 80); REGULAR EPISODE is the ruled ~100dp hero
// reserve; the rest calibrate to the pinned planner outputs (the REGULAR
// PHOTO 108 reproduces «Авто» = 4 with 216dp squares, the REGULAR HOME 169
// reproduces 4-across ≈209dp cards — LayoutParityTest pins each).
private val CHROME_RESERVE = mapOf(
    GridSurface.SERIAL to floatArrayOf(76f, 80f, 146f),
    GridSurface.TV to floatArrayOf(76f, 80f, 146f),
    GridSurface.PHOTO to floatArrayOf(100f, 108f, 128f),
    GridSurface.HOME to floatArrayOf(150f, 169f, 204f),
    GridSurface.EPISODE to floatArrayOf(88f, 100f, 124f),
)

// The per-row caption reserves in dp ([COMPACT, REGULAR, LARGE]) per
// surface: the text block under each tile (titles, chips, meta lines).
// PHOTO is 0 — the uniform-square grid carries no caption. Обычный SERIAL
// is the ruled draft number (2-line title 28 + Season chip 24 + gap 6 = 58).
private val CAPTION_RESERVE = mapOf(
    GridSurface.SERIAL to floatArrayOf(54f, 58f, 70f),
    GridSurface.TV to floatArrayOf(38f, 42f, 56f),
    GridSurface.PHOTO to floatArrayOf(0f, 0f, 0f),
    GridSurface.HOME to floatArrayOf(52f, 68f, 88f),
    GridSurface.EPISODE to floatArrayOf(60f, 70f, 88f),
)

/** The vertical chrome a [surface]'s grid loses to fixed UI at [mode] —
 * the height budget's fixed subtraction. */
fun chromeReserve(mode: UiScaleMode, surface: GridSurface): Dp =
    CHROME_RESERVE.getValue(surface)[mode.ordinal].dp

/** The per-row caption reserve of a [surface]'s grid at [mode] —
 * subtracted once per row tier before the track derives. */
fun captionReserve(mode: UiScaleMode, surface: GridSurface): Dp =
    CAPTION_RESERVE.getValue(surface)[mode.ordinal].dp

/** The widest lane whose serial cards still render the full facts line —
 * the ruled caption boundary: at a lane of this many columns or fewer the
 * caption line carries the facts (the ★ score among them); a DENSER lane
 * (the 7-column AUTO tier at Обычный) renders the compact caption instead.
 * The decision reads the lane WIDTH — the plan's column count — never a
 * per-card or per-surface count. */
const val FACTS_LINE_MAX_COLUMNS = 6

/** One grid plan: the column count, the tile track width, the full-row tier
 * and the leftover height that lets the next row peek. */
data class GridPlan(val columns: Int, val track: Dp, val rows: Int, val peek: Dp)

/**
 * gridPlan — the pure height-aware grid planner (the density contract).
 * The tile track derives from the viewport-HEIGHT budget, not a constant:
 *
 * ```
 * trackFromHeight(rows) = ((H − chrome − rows × caption) / rows) × aspect
 * columnsAuto           = floor((W + gutter) / (trackFromHeight + gutter))
 * columns               = columnOverride ?? columnsAuto
 * track                 = min(widthFit, trackFromHeight(rows))
 * tier                  = 2 rows when the track meets [POSTER_TRACK_FLOOR], else 1 row + peek
 * ```
 *
 * W = the content column width (`CONTENT_COLUMN_FRACTION × screen`),
 * aspect = width/height ([POSTER_ASPECT], [STILL_ASPECT],
 * [PHOTO_TILE_ASPECT]). Evaluated over rows in {2, 1}: the two-row tier is
 * viable when its height-fit track meets the 110dp poster width floor
 * (smaller posters cannot carry a caption at 3 m) and two rows fit the
 * height; below it the planner drops to one row plus a peek — [GridPlan.peek]
 * is the leftover height under the full rows, the sliver of the next row
 * the scroll viewport shows.
 *
 * AUTO vs OVERRIDE: without an override the grid plans HEIGHT-first — the
 * column count is the largest whose tracks fit the two-row height-fit
 * (the height-fit caps the track). A set override plans WIDTH-first — the
 * operator's count fixes the track at its width fit and the row tier
 * re-derives from the height (only the one-row height-fit caps it); the
 * override is clamped to [columnsAuto] so a caption never clips: fewer
 * columns grow the peek or the track shrinks, never the caption. The
 * override travels as `Int?` on [tv.mellifera.ui.GridPrefs] (null = «Авто»).
 *
 * Superseded prior law (the fixed-3 counts): SERIES_GRID_COLUMNS,
 * TV_FILE_GRID_COLUMNS, PHOTO_GRID_COLUMNS and HOME_ROW_COLUMNS pinned
 * every grid at 3 ACROSS (D13: 3 stills/cards across the same column; the
 * 2026-11-16 uniform-row ruling kept photo tiles square at 3 across; each
 * poster consumed a third of the ~883dp column ≈ 274dp — over 2× linear on
 * the retired 4-across 116dp). The fixed counts could not answer the
 * viewport: a 540dp-tall panel and a 1080dp one deserve different tiers.
 * They retired into this planner — the count is now the height budget's
 * output, pinned by LayoutParityTest per mode × override × viewport.
 */
fun gridPlan(
    width: Dp,
    height: Dp,
    chrome: Dp,
    caption: Dp,
    aspect: Float,
    gutter: Dp = PARITY_GUTTER,
    columnOverride: Int? = null,
): GridPlan {
    val w = width.value
    val g = gutter.value
    val h = height.value
    val track2 = trackFromHeight(h, chrome.value, caption.value, rows = 2, aspect)
    val track1 = trackFromHeight(h, chrome.value, caption.value, rows = 1, aspect)
    // AUTO derives from the viable tier's height-fit; a large height-fit
    // (short rows) yields more columns, a small one fewer.
    val columnsAuto = ((w + g) / ((if (track2 >= POSTER_TRACK_FLOOR.value) track2 else track1) + g))
        .toInt()
        .coerceAtLeast(1)
    val columns = (columnOverride?.coerceAtMost(columnsAuto) ?: columnsAuto).coerceAtLeast(1)
    val widthFit = (w + g) / columns - g
    // The two-row candidate track: height-first for AUTO (the two-row
    // height-fit caps the track), width-first for an override (the count is
    // the operator's; only the one-row height-fit caps it — clamping to the
    // two-row fit would render every override identical to AUTO).
    val tierTwoTrack = min(widthFit, if (columnOverride == null) track2 else track1)
    // The height-fit arithmetic reproduces H − chrome exactly (the two rows
    // consume the budget by construction), so the fit check carries a hair
    // of tolerance — float noise must not flip the tier.
    val rows = if (
        tierTwoTrack >= POSTER_TRACK_FLOOR.value &&
        2 * (caption.value + tierTwoTrack / aspect) <= h - chrome.value + FIT_EPSILON_DP
    ) {
        2
    } else {
        1
    }
    val track = min(widthFit, if (rows == 2) track2 else track1)
    val leftover = h - chrome.value - rows * (caption.value + track / aspect)
    return GridPlan(columns, track.dp, rows, max(0f, leftover).dp)
}

private fun trackFromHeight(height: Float, chrome: Float, caption: Float, rows: Int, aspect: Float): Float =
    ((height - chrome - rows * caption) / rows) * aspect

/**
 * rowCardTrack — the fixed-track math for a row that fits [columns] cards
 * across a [columnWidth]: subtract the (columns − 1) inner gutters, divide
 * evenly. The home rows (its last consumers) plan their card width through
 * [gridPlan] now; this helper survives only as a pinned arithmetic in
 * LayoutParityTest.
 */
internal fun rowCardTrack(columnWidth: Dp, columns: Int, gutter: Dp = PARITY_GUTTER): Dp =
    (columnWidth - gutter * (columns - 1)) / columns
