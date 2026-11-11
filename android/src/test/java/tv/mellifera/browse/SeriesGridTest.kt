package tv.mellifera.browse

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import tv.mellifera.net.ItemDto
import tv.mellifera.net.SeriesDto

/**
 * The FIELD-DRIVEN rendering law (5.6): the DisplayCard derivation is where
 * "absent field → absent block" is decided — a null block renders nothing,
 * never a placeholder, never a fabricated value.
 */
class SeriesGridTest {
    @Test
    fun field_driven_rendering() {
        // Absent artwork (omitempty, decoded null) → no artwork block.
        val bare = SeriesDto(id = "s-1", displayName = "Сага")
        val bareCard = bare.toCard()
        assertNull(bareCard.artworkUrl)
        assertEquals("Сага", bareCard.title)
        assertNull(bareCard.watched)

        // Present fields render VERBATIM — no rewriting, no placeholder.
        val full = SeriesDto(
            id = "s-2",
            displayName = "Хроники",
            artwork = "/artwork/posters/s-2.jpg",
            watched = true,
        )
        val fullCard = full.toCard()
        assertEquals("/artwork/posters/s-2.jpg", fullCard.artworkUrl)
        assertEquals("Хроники", fullCard.title)
        assertEquals(true, fullCard.watched)

        // watched=false is a PRESENT field — its chip exists, honestly false.
        val unwatched = SeriesDto(id = "s-3", displayName = "Сериал", watched = false).toCard()
        assertEquals(false, unwatched.watched)
    }

    @Test
    fun blank_display_name_carries_no_title_block() {
        // The server's "" placeholder (the SPA em-dash case) fabricates no
        // title block on TV.
        assertNull(SeriesDto(id = "s-4", displayName = "").toCard().title)
    }

    @Test
    fun episode_rows_follow_the_same_law() {
        // Absent artwork/watched → null blocks; present → verbatim.
        val bare = ItemDto(id = "e-1", displayName = "Серия 1").toCard()
        assertNull(bare.artworkUrl)
        assertNull(bare.watched)
        assertEquals("Серия 1", bare.title)

        val full = ItemDto(
            id = "e-2",
            displayName = "Серия 2",
            artwork = "/artwork/thumbs/e-2.jpg",
            watched = false,
        ).toCard()
        assertEquals("/artwork/thumbs/e-2.jpg", full.artworkUrl)
        assertEquals(false, full.watched)
        assertEquals("e-2", full.id)
    }
}
