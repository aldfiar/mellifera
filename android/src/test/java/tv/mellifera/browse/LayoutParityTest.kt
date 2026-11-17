package tv.mellifera.browse

import androidx.compose.ui.unit.dp
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The TV tile-geometry laws (design D13, task 8.2, AMENDED by the operator's
 * 2026-11-16 rulings — task 8.10): the column fraction, the FIXED tile
 * aspects and the column counts are constants pinned here so a drift fails
 * the build. The uniform-row law: tile GEOMETRY is the GRID's law — every
 * card in a grid renders the same fixed-aspect art block (the per-card
 * aspect carrier is retired; rows can never go ragged), artwork Crop-fills.
 * The size lever is the COUNT, not the column (the operator's corrected
 * ruling: «the problem is not the column size, but how many posters consume
 * the column») — the column stays at the SPA's 60%, and the poster/photo
 * grids went 3 ACROSS: each tile consumes a third of the column (a 160dp
 * poster at the padded 512dp inner width vs the retired 4-across 116dp).
 */
class LayoutParityTest {
    // ---- the centered content column ---------------------------------------

    @Test
    fun content_column_stays_the_spa_proportion() {
        // The SPA's max-w-6xl: 1152px of 1920 = 60% (576dp at density 320).
        // The brief 0.80 amendment was corrected — the count is the lever.
        assertEquals(0.60f, CONTENT_COLUMN_FRACTION, 1e-6f)
    }

    @Test
    fun column_counts_pin_the_tile_scale() {
        // The count ruling: every grid rides 3 across — each tile consumes
        // a third of the column.
        assertEquals(3, SERIES_GRID_COLUMNS) // series posters across
        assertEquals(3, TV_FILE_GRID_COLUMNS) // tv stills across
        assertEquals(3, HOME_ROW_COLUMNS) // home 16:9 cards across
        assertEquals(3, PHOTO_GRID_COLUMNS) // photo squares across
    }

    @Test
    fun track_math_fits_the_cards_in_the_576dp_column() {
        // The home rows' fixed track: (576 − 2·16) / 3 ≈ 181dp per 16:9 card.
        // Every 3-across grid shares the arithmetic (the series/photo grids
        // live inside the body's 32dp padding: a real tile is
        // (576 − 64 − 2·16) / 3 = 160dp, measured on-device).
        assertEquals(544f / 3f, rowCardTrack(576.dp, SERIES_GRID_COLUMNS).value, 0.01f)
        assertEquals(544f / 3f, rowCardTrack(576.dp, HOME_ROW_COLUMNS).value, 0.01f)
    }

    // ---- the fixed tile aspects ---------------------------------------------

    @Test
    fun tile_aspects_are_the_grid_s_fixed_laws() {
        assertEquals(2f / 3f, POSTER_ASPECT, 1e-6f) // Artwork.tsx aspect-[2/3]
        assertEquals(16f / 9f, STILL_ASPECT, 1e-6f) // Collection.tsx aspect-video
        // The retired masonry's replacement: every photo tile is the same
        // square (Crop fills it either orientation) — uniform rows.
        assertEquals(1f, PHOTO_TILE_ASPECT, 1e-6f)
    }
}
