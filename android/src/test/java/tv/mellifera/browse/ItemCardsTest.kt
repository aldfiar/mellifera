package tv.mellifera.browse

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import tv.mellifera.net.ItemDto

/**
 * The tv/image bodies' card mapping laws (design D6, task 4.1 — the SPA's
 * MovieCard/PhotoTile idioms as JVM-pure mappings): every optional fact is a
 * nullable carrier and a null renders NO block — the field-driven law
 * (L1) pinned per field.
 */
class ItemCardsTest {
    private fun doc(json: String): JsonElement = Json.parseToJsonElement(json)

    private fun item(
        id: String = "i-1",
        displayName: String = "",
        relativePath: String = "Movie (2000).mkv",
        document: JsonElement = doc("{}"),
        watched: Boolean? = null,
    ): ItemDto = ItemDto(
        id = id,
        libraryId = 2,
        relativePath = relativePath,
        mediaType = "tv",
        document = document,
        displayName = displayName,
        watched = watched,
    )

    // ---- fileTitle: the MovieCard idiom's title floor ------------------------

    @Test
    fun file_title_serves_the_display_name_verbatim() {
        assertEquals("Матрица", fileTitle("Матрица", "Матрица (1999).mkv"))
    }

    @Test
    fun file_title_floors_blank_and_filename_names_to_the_stem() {
        // Blank display_name → the extension-less stem.
        assertEquals("Матрица (1999)", fileTitle("", "Матрица (1999).mkv"))
        // A display_name that IS the raw filename floors too (INV-no-filenames).
        assertEquals("Матрица (1999)", fileTitle("Матрица (1999).mkv", "Матрица (1999).mkv"))
        // The 2–4 anchor keeps non-extension suffixes alive (the SPA EXT_RE law).
        assertEquals("Часть 2", fileTitle("", "Часть 2"))
        // Nothing to floor to → NO title block, never a fabricated name.
        assertNull(fileTitle("", ""))
        assertNull(fileTitle("", "dir/.mkv"))
    }

    // ---- toFileCard: thumb + title + ONE parsed-facts meta line -------------

    @Test
    fun file_card_requests_a_thumb_only_when_the_fact_exists() {
        val withThumb = item(
            id = "f-1",
            document = doc(
                """{"sources":{"frame-grabber":{"thumbnail_path":"/thumbs/f-1.jpg"}}}""",
            ),
        ).toFileCard()
        assertEquals("/api/v1/items/f-1/media?variant=thumb", withThumb.artworkUrl)

        // An empty thumbnail_path fact is NOT a thumb (the 404 law).
        val emptyFact = item(
            document = doc("""{"sources":{"frame-grabber":{"thumbnail_path":""}}}"""),
        ).toFileCard()
        assertNull(emptyFact.artworkUrl)

        // No fact → no artwork block, never a guessed URL.
        assertNull(item().toFileCard().artworkUrl)
    }

    @Test
    fun file_card_carries_the_one_meta_line_and_the_watched_stamp() {
        val card = item(
            displayName = "Фильм",
            document = doc(
                """{"sources":{"parser":{"year":2019,"resolution":"1080p"}},
                    "ffprobe":{"format":{"duration":"5400.4"}}}""",
            ),
            watched = true,
        ).toFileCard()
        // ONE dot-separated fact line: parsed facts + the ffprobe duration
        // (documentMeta's shared law — the first namespace wins, never mixed).
        assertEquals("2019 · 1080p · 1:30:00", card.meta)
        // The served watched stamp rides through (the D2 ✓/dim law renders it).
        assertEquals(true, card.watched)
        assertEquals("Фильм", card.title)
    }

    @Test
    fun file_card_with_no_facts_carries_no_meta_block() {
        assertNull(item().toFileCard().meta)
    }

    // ---- toPhotoCard: media + footer + real ratio, all field-driven ---------

    @Test
    fun photo_tile_footer_is_the_served_date_taken_day_part() {
        val card = item(
            document = doc(
                """{"sources":{"image-enricher":{"date_taken":"2026-05-01T10:20:30Z"}}}""",
            ),
        ).toPhotoCard()
        assertEquals("2026-05-01", card.footer)
    }

    @Test
    fun photo_tile_verbatim_stamp_passes_through_and_absence_renders_no_footer() {
        // An unparseable EXIF stamp renders verbatim — never re-encoded.
        val verbatim = item(
            document = doc("""{"sources":{"ns":{"date_taken":"май 2026"}}}"""),
        ).toPhotoCard()
        assertEquals("май 2026", verbatim.footer)
        // No date_taken anywhere → NO footer (never a faked date).
        assertNull(item().toPhotoCard().footer)
    }

    @Test
    fun photo_tile_uses_the_real_ratio_only_when_both_facts_exist() {
        val ratio = item(
            document = doc("""{"sources":{"ns":{"width":4000,"height":3000}}}"""),
        ).toPhotoCard()
        assertEquals(4000f / 3000f, ratio.aspect!!, 0.0001f)
        // Half the pair → the default fixed-height block, never a guess.
        val half = item(
            document = doc("""{"sources":{"ns":{"width":4000}}}"""),
        ).toPhotoCard()
        assertNull(half.aspect)
    }

    @Test
    fun photo_tile_media_prefers_the_thumb_then_the_original_then_nothing() {
        val thumb = item(
            id = "p-1",
            document = doc(
                """{"sources":{"frame-grabber":{"thumbnail_path":"/t.jpg"}},
                    "parsed":{"absolute_path":"/mnt/orig.jpg"}}""",
            ),
        ).toPhotoCard()
        assertEquals("/api/v1/items/p-1/media?variant=thumb", thumb.artworkUrl)

        val original = item(
            id = "p-2",
            document = doc("""{"parsed":{"absolute_path":"/mnt/orig.jpg"}}"""),
        ).toPhotoCard()
        assertEquals("/api/v1/items/p-2/media", original.artworkUrl)

        // No resolvable media fact → the pure placeholder (no broken state).
        assertNull(item(id = "p-3").toPhotoCard().artworkUrl)
    }

    @Test
    fun photo_tile_carries_no_title_or_meta_row() {
        val card = item(
            displayName = "IMG_0001",
            relativePath = "2026/IMG_0001.jpg",
            document = doc("""{"sources":{"ns":{"year":2026}}}"""),
        ).toPhotoCard()
        // Photo identity is the thumbnail — no title, no meta, no watched
        // mark (the SPA PhotoTile law; INV-no-filenames).
        assertNull(card.title)
        assertNull(card.meta)
        assertNull(card.watched)
        assertNull(card.progress)
    }
}
