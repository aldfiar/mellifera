package tv.mellifera.browse

import androidx.compose.ui.unit.dp
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import tv.mellifera.net.ItemDto
import tv.mellifera.net.SeriesDto

/**
 * The visual parity scale laws (design D13, task 8.2): the column fraction,
 * the FIXED tile aspects and the column counts are constants — pinned here
 * against the SPA's own classes (`mx-auto max-w-6xl`, `aspect-[2/3]`,
 * `aspect-video`) so a drift away from the SPA's scale fails the build. The
 * field-driven tile aspect is retired from the serial/tv bodies; the photo
 * masonry keeps the served ratio.
 */
class LayoutParityTest {
    // ---- the centered content column ---------------------------------------

    @Test
    fun content_column_is_the_spa_s_max_w_6xl_proportion() {
        // 1152px of 1920 = 60% (576dp at density 320).
        assertEquals(0.60f, CONTENT_COLUMN_FRACTION, 1e-6f)
    }

    @Test
    fun column_counts_pin_the_parity_scale() {
        assertEquals(4, SERIES_GRID_COLUMNS) // series posters across
        assertEquals(3, TV_FILE_GRID_COLUMNS) // tv stills across
        assertEquals(3, HOME_ROW_COLUMNS) // home 16:9 cards across
        assertEquals(4, PHOTO_GRID_COLUMNS) // the masonry's unchanged tracks
    }

    @Test
    fun track_math_fits_the_cards_in_the_576dp_column() {
        // Home rows: (576 − 2·16) / 3 ≈ 181dp per 16:9 card.
        assertEquals(544f / 3f, rowCardTrack(576.dp, HOME_ROW_COLUMNS).value, 0.01f)
        // The series grid track: (576 − 3·16) / 4 = 132dp — the ≈135dp poster.
        assertEquals(132f, rowCardTrack(576.dp, SERIES_GRID_COLUMNS).value, 0.01f)
    }

    // ---- the fixed tile aspects ---------------------------------------------

    @Test
    fun fixed_aspects_match_the_spa_s_own_classes() {
        assertEquals(2f / 3f, POSTER_ASPECT, 1e-6f) // Artwork.tsx aspect-[2/3]
        assertEquals(16f / 9f, STILL_ASPECT, 1e-6f) // Collection.tsx aspect-video
    }

    @Test
    fun series_cards_carry_the_fixed_poster_aspect() {
        // The served width/height facts no longer size serial tiles — the
        // field-driven TILE aspect is retired (the facts law stands for meta).
        val card = SeriesDto(id = "s-1", displayName = "Сага").toCard()
        assertEquals(POSTER_ASPECT, card.aspect!!, 1e-6f)
    }

    @Test
    fun file_cards_carry_the_fixed_still_aspect() {
        val card = ItemDto(id = "f-1", mediaType = "tv").toFileCard()
        assertEquals(STILL_ASPECT, card.aspect!!, 1e-6f)
    }

    @Test
    fun photo_tiles_keep_the_natural_served_ratio() {
        val natural = ItemDto(
            id = "p-1",
            document = Json.parseToJsonElement("""{"sources":{"ns":{"width":4000,"height":3000}}}"""),
        ).toPhotoCard()
        assertEquals(4000f / 3000f, natural.aspect!!, 1e-6f)
        // No width/height facts → null (the fixed-height placeholder block).
        assertNull(ItemDto(id = "p-2").toPhotoCard().aspect)
    }

    @Test
    fun episode_rows_stay_unaspected() {
        // Episode rows size their 72dp-row art themselves — no aspect carrier.
        assertNull(ItemDto(id = "e-1", displayName = "S01E01").toCard().aspect)
    }
}
