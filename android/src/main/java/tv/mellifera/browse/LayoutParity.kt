package tv.mellifera.browse

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

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
 * shell's cap supersedes. Column width is not the tile-size lever — the
 * column-count law (SERIES/PHOTO grids at 3 across) is. */
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

/** The series poster grid's column count — 3 ACROSS: each poster consumes a
 * THIRD of the column, not a quarter. At the ~883dp column minus its
 * overscan body padding and gutters that is a ~274dp poster — over 2× linear
 * on the retired 4-across 116dp. */
const val SERIES_GRID_COLUMNS = 3

/** The tv file-still grid's column count (D13: 3 stills across the same
 * column). */
const val TV_FILE_GRID_COLUMNS = 3

/** The home rows' 16:9 cards across the same column (D13: 3 across). */
const val HOME_ROW_COLUMNS = 3

/** The photo grid's column count — 3 ACROSS under the same count law:
 * uniform squares (PHOTO_TILE_ASPECT), each preview consuming a third of the
 * column. The natural photo ASPECTS are what retired. */
const val PHOTO_GRID_COLUMNS = 3

/** The shared gutter between tiles — the SPA's `gap-3` (12px) halved at the
 * 2.0× density: 12px ÷ 2 = 6dp. The grid rows', the rows' and the home rows'
 * track math all subtract this ([rowCardTrack] consumers flow with it). */
val PARITY_GUTTER: Dp = 6.dp

/** The page's horizontal overscan edge — the SPA tv shell's
 * `html.tv .app-content { padding: 2.5vh 2.5vw }` horizontal leg
 * (web/src/styles/index.css): 2.5vw ≈ 48px at a 1920px viewport ÷ 2 = 24dp.
 * Keeps every surface inside the panel's safe area. */
val PARITY_OVERSCAN_X: Dp = 24.dp

/** The page's vertical overscan edge — the same shell padding's vertical
 * leg: 2.5vh ≈ 27px at a 1080px viewport ÷ 2 ≈ 14dp. */
val PARITY_OVERSCAN_Y: Dp = 14.dp

/**
 * rowCardTrack — the fixed-track math for a row that fits [columns] cards
 * across a [columnWidth]: subtract the (columns − 1) inner gutters, divide
 * evenly. The home rows' LazyRow has no width-driven tracks (a horizontal
 * walker), so its cards take this fixed width.
 */
internal fun rowCardTrack(columnWidth: Dp, columns: Int, gutter: Dp = PARITY_GUTTER): Dp =
    (columnWidth - gutter * (columns - 1)) / columns
