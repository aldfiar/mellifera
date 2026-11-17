package tv.mellifera.home

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import tv.mellifera.net.ContinueCurrent
import tv.mellifera.net.ContinueNext
import tv.mellifera.net.ContinueRow

/**
 * The home cards' field-driven mapping (design D4, L1): the pure branch
 * over the wire's `current` — every optional block is a nullable carrier
 * and a null renders NO block; the bar exists only when duration_seconds
 * is served; the position line is the served composition.
 */
class HomeCardsTest {

    @Test
    fun resume_row_maps_with_bar_and_full_position_line() {
        val card = row(
            displayName = "Сага S01E01",
            position = 300,
            duration = 2400,
            libraryName = "Сериалы",
            artwork = "/artwork/posters/s-1.jpg",
        ).toResumeCard()!!

        assertEquals("e-1", card.itemId)
        // The served eyebrow + episode title (parity P3-3).
        assertEquals("Сага", card.seriesName)
        assertEquals("Сага S01E01", card.title)
        assertEquals("Начало", card.episodeTitle)
        assertEquals("/artwork/posters/s-1.jpg", card.artworkUrl)
        // watchedPercent's law: 300/2400 → 13% (12.5 rounds to 13), clamped.
        assertEquals(13, card.percent)
        assertEquals("13% · 05:00 · Сериалы", card.positionLine)
    }

    @Test
    fun resume_row_without_duration_renders_no_bar_and_no_percent_part() {
        // The honest absence: no duration_seconds → no bar, and the
        // position line starts at the position (never a guessed percent).
        val card = row(position = 600, duration = null).toResumeCard()!!
        assertNull(card.percent)
        assertEquals("10:00 · Сериалы", card.positionLine)
    }

    @Test
    fun film_resume_row_maps_without_series_identity() {
        // The film row: series fields honest "" — the card's title block is
        // the served current display name; the eyebrow and episode-title
        // blocks are absent (parity P3-3), no library part when absent.
        val card = row(
            seriesName = "",
            displayName = "Матрица",
            episodeTitle = "",
            position = 3661,
            duration = 7200,
            libraryName = "",
        ).toResumeCard()!!
        assertNull(card.seriesName)
        assertEquals("Матрица", card.title)
        assertNull(card.episodeTitle)
        assertNull(card.artworkUrl)
        assertEquals(51, card.percent)
        assertEquals("51% · 1:01:01", card.positionLine)
    }

    @Test
    fun percent_clamps_at_hundred() {
        val card = row(position = 2400, duration = 2000).toResumeCard()!!
        assertEquals(100, card.percent)
        assertEquals("100% · 40:00 · Сериалы", card.positionLine)
    }

    @Test
    fun anchor_row_maps_with_served_next_offer() {
        val card = ContinueRow(
            seriesId = "s-2",
            seriesDisplayName = "Хроники",
            libraryId = 1,
            libraryName = "Сериалы",
            artwork = "/artwork/posters/s-2.jpg",
            next = ContinueNext(itemId = "e-9", label = "S02E01"),
        ).toAnchorCard()!!

        assertEquals("e-9", card.nextItemId)
        assertEquals("S02E01", card.nextLabel)
        assertEquals("Хроники", card.title)
        // The served library meta line (parity P3-3).
        assertEquals("Сериалы", card.libraryName)
        assertEquals("/artwork/posters/s-2.jpg", card.artworkUrl)
    }

    @Test
    fun anchor_row_without_next_renders_bare() {
        // A row carrying neither `current` nor `next` maps to the bare
        // card: no OK affordance, never a fabricated link (D4).
        val card = ContinueRow(
            seriesId = "s-3",
            seriesDisplayName = "Осенний вальс",
            libraryId = 1,
            libraryName = "Сериалы",
        ).toAnchorCard()!!
        assertNull(card.nextItemId)
        assertNull(card.nextLabel)
        assertEquals("Осенний вальс", card.title)
        assertNull(card.artworkUrl)
    }

    @Test
    fun anchor_row_without_library_name_maps_null_library_block() {
        // The absent library_name serves "" → no library block (L1).
        val card = ContinueRow(
            seriesId = "s-4",
            seriesDisplayName = "Тихий берег",
            libraryId = 1,
            libraryName = "",
            next = ContinueNext(itemId = "e-12", label = "S01E02"),
        ).toAnchorCard()!!
        assertEquals("Тихий берег", card.title)
        assertNull(card.libraryName)
    }

    @Test
    fun branch_is_mutually_exclusive() {
        val resumeRow = row().toResumeCard()!!
        assertNull(row().toAnchorCard())
        assertEquals(13, resumeRow.percent)

        val anchorRow = ContinueRow(
            seriesId = "s-2",
            seriesDisplayName = "Хроники",
            libraryId = 1,
            libraryName = "Сериалы",
            next = ContinueNext(itemId = "e-9", label = "S02E01"),
        )
        assertNull(anchorRow.toResumeCard())
        assertEquals("e-9", anchorRow.toAnchorCard()!!.nextItemId)
    }

    /** A resume-shaped row over the test defaults; every optional field
     * overridable so each test pins exactly the absence it names. */
    private fun row(
        displayName: String = "Сага S01E01",
        seriesName: String = "Сага",
        episodeTitle: String = "Начало",
        position: Long = 300,
        duration: Long? = 2400,
        libraryName: String = "Сериалы",
        artwork: String? = null,
    ) = ContinueRow(
        seriesId = "s-1",
        seriesDisplayName = seriesName,
        libraryId = 1,
        libraryName = libraryName,
        artwork = artwork,
        current = ContinueCurrent(
            itemId = "e-1",
            displayName = displayName,
            episodeTitle = episodeTitle,
            positionSeconds = position,
            durationSeconds = duration,
        ),
    )
}
