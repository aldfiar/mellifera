package tv.mellifera.browse

import androidx.compose.ui.unit.dp
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The TV tile-geometry laws: the column fraction, the gutter, the overscan
 * edges, the FIXED tile aspects and the column counts are constants pinned
 * here so a drift fails the build. The uniform-row law: tile GEOMETRY is
 * the GRID's law — every card in a grid renders the same fixed-aspect art
 * block (the per-card aspect carrier is retired; rows can never go ragged),
 * artwork Crop-fills. The size lever is the COUNT, not the column: the
 * poster/photo grids ride 3 ACROSS — each tile consumes a third of the
 * column.
 */
class LayoutParityTest {
    // ---- the centered content column ---------------------------------------

    @Test
    fun content_column_is_the_tv_shell_cap() {
        // The SPA tv shell: html.tv main { max-width: min(92vw, 1800px) } —
        // 92vw of a 1920px viewport (the desktop pages' max-w-6xl cap is
        // superseded there).
        assertEquals(0.92f, CONTENT_COLUMN_FRACTION, 1e-6f)
    }

    @Test
    fun column_counts_pin_the_tile_scale() {
        // The count law: every grid rides 3 across — each tile consumes
        // a third of the column.
        assertEquals(3, SERIES_GRID_COLUMNS) // series posters across
        assertEquals(3, TV_FILE_GRID_COLUMNS) // tv stills across
        assertEquals(3, HOME_ROW_COLUMNS) // home 16:9 cards across
        assertEquals(3, PHOTO_GRID_COLUMNS) // photo squares across
    }

    @Test
    fun gutter_is_the_spa_gap_halved() {
        // The SPA's gap-3: 12px ÷ 2 at the box's 2.0× density = 6dp.
        assertEquals(6f, PARITY_GUTTER.value, 1e-6f)
    }

    @Test
    fun overscan_edges_are_the_tv_shell_padding() {
        // html.tv .app-content { padding: 2.5vh 2.5vw }: 2.5vw ≈ 48px and
        // 2.5vh ≈ 27px at 1920×1080 — ÷ 2 → 24dp horizontal, 14dp vertical.
        assertEquals(24f, PARITY_OVERSCAN_X.value, 1e-6f)
        assertEquals(14f, PARITY_OVERSCAN_Y.value, 1e-6f)
    }

    @Test
    fun track_math_fits_the_cards_in_the_tv_shell_column() {
        // The tv shell column: 92vw of 1920px ÷ 2 = 883.2dp. The home rows'
        // fixed track: (883.2 − 2·6) / 3 = 290.4dp per 16:9 card. Every
        // 3-across grid shares the arithmetic (the series/photo grids live
        // inside the page's PARITY_OVERSCAN_X body padding: a real tile is
        // (883.2 − 2·24 − 2·6) / 3 ≈ 274.4dp).
        assertEquals(871.2f / 3f, rowCardTrack(883.2.dp, SERIES_GRID_COLUMNS).value, 0.01f)
        assertEquals(871.2f / 3f, rowCardTrack(883.2.dp, HOME_ROW_COLUMNS).value, 0.01f)
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
