package tv.mellifera.browse

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * The visual parity scale (design D13, task 8.2): the constants the TV layout
 * reads its FIXED geometry from — read from the SPA sources, not invented.
 * The field-driven law (L1/L6) stays untouched for FACTS (names, counts,
 * meta lines, footers); these constants govern only the tile geometry and
 * the content column, the SPA's own fixed classes (`aspect-[2/3]`,
 * `aspect-video`, `mx-auto max-w-6xl`).
 */

/** The centered content column's fraction of the screen width — the SPA's
 * `mx-auto max-w-6xl` proportion (1152px on a 1920 viewport = 60%; 576dp at
 * the box's 2.0× density). The 2026-11-16 density amendment briefly moved
 * this to 0.80 and was CORRECTED by the operator mid-review: «the problem is
 * not the column size, but how many posters consume the column» — the column
 * STAYS at the SPA proportion; the tile-count law (SERIES/PHOTO grids at 3
 * across) is the size lever. */
const val CONTENT_COLUMN_FRACTION = 0.60f

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

/** The series poster grid's column count — 3 ACROSS (the operator's
 * 2026-11-16 count ruling: each poster consumes a THIRD of the column, not
 * a quarter). At the 576dp column minus its 32dp body padding and gutters
 * that is a 160dp poster — ~38% linear over the retired 4-across 116dp. */
const val SERIES_GRID_COLUMNS = 3

/** The tv file-still grid's column count (D13: 3 stills across the same
 * column). */
const val TV_FILE_GRID_COLUMNS = 3

/** The home rows' 16:9 cards across the same column (D13: 3 across). */
const val HOME_ROW_COLUMNS = 3

/** The photo grid's column count — 3 ACROSS under the same count ruling:
 * uniform 160dp squares (PHOTO_TILE_ASPECT), each preview consuming a third
 * of the column. The natural photo ASPECTS are what retired. */
const val PHOTO_GRID_COLUMNS = 3

/** The shared gutter between tiles — the grid rows', the rows' and the home
 * rows' track math all subtract this. */
val PARITY_GUTTER: Dp = 16.dp

/**
 * rowCardTrack — the fixed-track math for a row that fits [columns] cards
 * across a [columnWidth]: subtract the (columns − 1) inner gutters, divide
 * evenly. The home rows' LazyRow has no width-driven tracks (a horizontal
 * walker), so its cards take this fixed width.
 */
internal fun rowCardTrack(columnWidth: Dp, columns: Int, gutter: Dp = PARITY_GUTTER): Dp =
    (columnWidth - gutter * (columns - 1)) / columns
