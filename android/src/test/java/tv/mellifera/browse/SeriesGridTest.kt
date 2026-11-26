package tv.mellifera.browse

import androidx.compose.ui.graphics.Color
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import tv.mellifera.net.ElementMetadata
import tv.mellifera.net.ItemDto
import tv.mellifera.net.MetadataAbout
import tv.mellifera.net.SeriesDto

/**
 * The FIELD-DRIVEN rendering law (5.6) + the card tri-state (design D2):
 * the DisplayCard derivation is where "absent field → absent block" is
 * decided — a null block renders nothing, never a placeholder, never a
 * fabricated value. The tri-state rides the carriers: watched → the ✓ glyph
 * + dimmed title and NO bar; in-progress → the bar only when a percent
 * exists (never a guessed one); new → clean.
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
        // Null carriers render NO block — no bar, no meta line (D2/L1 pin).
        assertNull(bareCard.progress)
        assertNull(bareCard.meta)

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

        // watched=false is a PRESENT field — honestly not watched: no glyph,
        // no dim, never a "not watched" word chip (the chips are retired).
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
    fun series_card_score_carrier_law() {
        // The compact caption's ★ fact rides the served about.score through
        // toCard VERBATIM — no formatting at the carrier (the caption
        // renders it through scoreText, ONE formatter).
        val served = SeriesDto(
            id = "s-5",
            displayName = "Клевер",
            metadata = ElementMetadata(
                about = MetadataAbout(description = "Описание", score = 8.1),
            ),
        ).toCard()
        assertEquals(8.1, served.score!!, 1e-9)

        // Absent metadata → no score fact (the field-driven law: absence
        // renders absent, never a placeholder).
        assertNull(SeriesDto(id = "s-9", displayName = "Сага").toCard().score)

        // An about block without a score → no score fact either.
        assertNull(
            SeriesDto(
                id = "s-10",
                displayName = "Без оценки",
                metadata = ElementMetadata(about = MetadataAbout(description = "Только описание")),
            ).toCard().score,
        )
    }

    @Test
    fun episode_rows_follow_the_same_law() {
        // Absent artwork/watched → null blocks; present → verbatim.
        val bare = ItemDto(id = "e-1", displayName = "Серия 1").toCard()
        assertNull(bare.artworkUrl)
        assertNull(bare.watched)
        assertEquals("Серия 1", bare.title)
        // A fact-less document carries NO bar (no position fed in) and NO
        // meta block — the D2 law: the bar only when duration exists, a
        // guessed percent would be a fabrication.
        assertNull(bare.progress)
        assertNull(bare.meta)

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

    /** The document shape the SPA's meta laws read (Collection.tsx). */
    private fun probedDoc(duration: String = "1430"): String = """
        {"sources":{"kinopoisk":{"year":2019,"resolution":"1080p"},
                    "shikimori":{"year":2005}},
         "ffprobe":{"format":{"duration":"$duration"}}}
    """.trimIndent()

    @Test
    fun episode_meta_line_is_field_driven() {
        // The SPA's metaLine law verbatim (Collection.tsx): the FIRST source
        // namespace's parsed facts (year · resolution) plus the ffprobe
        // duration, dot-separated. The second namespace is never mixed in.
        val card = ItemDto(
            id = "e-3",
            displayName = "S01E03 · Название",
            document = Json.parseToJsonElement(probedDoc()),
        ).toCard()
        assertEquals("2019 · 1080p · 23:50", card.meta)

        // The duration formats H:MM:SS once it crosses the hour.
        val long = ItemDto(
            id = "e-4",
            displayName = "S01E04",
            document = Json.parseToJsonElement(probedDoc(duration = "3661")),
        ).toCard()
        assertEquals("2019 · 1080p · 1:01:01", long.meta)

        // A fact-less document renders NO meta block — never a padded line.
        assertNull(ItemDto(id = "e-5", displayName = "S01E05").toCard().meta)
        assertNull(
            ItemDto(
                id = "e-6",
                displayName = "S01E06",
                document = Json.parseToJsonElement("""{"sources":{},"ffprobe":{"format":{}}}"""),
            ).toCard().meta,
        )
    }

    @Test
    fun episode_progress_bar_carrier_law() {
        val doc = Json.parseToJsonElement(probedDoc())
        // Position over the document's duration → the watchedPercent carrier.
        assertEquals(42, ItemDto(id = "e-7", displayName = "S01E07", document = doc).toCard(600).progress)
        // Watched → NO bar even with a stored position (the D2 tri-state).
        assertNull(
            ItemDto(id = "e-8", displayName = "S01E08", document = doc, watched = true)
                .toCard(600)
                .progress,
        )
        // No stored position → no bar.
        assertNull(ItemDto(id = "e-9", displayName = "S01E09", document = doc).toCard().progress)
        // A position but NO duration → NO bar, never a guessed percent.
        assertNull(
            ItemDto(
                id = "e-10",
                displayName = "S01E10",
                document = Json.parseToJsonElement("""{"sources":{"kinopoisk":{"year":2019}}}"""),
            ).toCard(420).progress,
        )
    }

    @Test
    fun document_duration_law() {
        // The SPA's durationSeconds law verbatim: ffprobe.format.duration is
        // a decimal-seconds STRING; a number is accepted too; rounding is
        // whole seconds; anything missing/unparseable/non-positive → null.
        assertEquals(1431L, documentDuration(Json.parseToJsonElement(probedDoc(duration = "1430.7"))))
        assertEquals(
            3661L,
            documentDuration(Json.parseToJsonElement("""{"ffprobe":{"format":{"duration":3661}}}""")),
        )
        assertNull(
            documentDuration(Json.parseToJsonElement("""{"ffprobe":{"format":{"duration":"abc"}}}""")),
        )
        assertNull(
            documentDuration(Json.parseToJsonElement("""{"ffprobe":{"format":{"duration":-5}}}""")),
        )
        assertNull(documentDuration(Json.parseToJsonElement("{}")))
        assertNull(documentDuration(JsonNull))
    }

    @Test
    fun episode_title_rides_the_served_precedence() {
        // The served-title precedence (design D3's episode row): the
        // document's _view.title.value wins when present — the read-time
        // accessor family documentDuration uses for ffprobe — and the
        // composed name is NEVER re-derived client-side.
        val doc = Json.parseToJsonElement(
            """{"_view":{"title":{"value":"Рикошет"}},"sources":{"serial-parser":{"season":1,"episode":2}}}""",
        )
        assertEquals("Рикошет", episodeTitle(doc, "Сага · S01E02"))
        // A number renders its literal bytes (the JS String(value) law,
        // INV-no-rounding)...
        assertEquals("12", episodeTitle(Json.parseToJsonElement("""{"_view":{"title":{"value":12}}}"""), "Сага · S01E02"))
        assertEquals("12.5", episodeTitle(Json.parseToJsonElement("""{"_view":{"title":{"value":12.5}}}"""), "Сага · S01E02"))
        // ...anything else — absent, null, mistyped — floors to the composed
        // name verbatim.
        assertEquals("Сага · S01E02", episodeTitle(Json.parseToJsonElement("""{"sources":{}}"""), "Сага · S01E02"))
        assertEquals("Сага · S01E02", episodeTitle(Json.parseToJsonElement("""{"_view":{"title":{"value":null}}}"""), "Сага · S01E02"))
        assertEquals("Сага · S01E02", episodeTitle(Json.parseToJsonElement("""{"_view":{"title":{"value":{"nested":true}}}}"""), "Сага · S01E02"))
        // A blank composed name carries no title block — nothing fabricated.
        assertNull(episodeTitle(JsonNull, ""))
        // The mapper wires the precedence: a document-titled row titles its
        // card with the served value.
        assertEquals("Рикошет", ItemDto(id = "e-11", displayName = "Сага · S01E02", document = doc).toCard().title)
    }

    @Test
    fun episode_card_carries_the_display_formatted_duration_line() {
        // The episode card's duration line: the document's ffprobe duration,
        // display-formatted (ONE formatter — formatPosition)...
        val card = ItemDto(id = "e-12", displayName = "S01E01", document = Json.parseToJsonElement(probedDoc())).toCard()
        assertEquals("23:50", card.duration)
        // ...absent → NO duration line (field-driven absence, L1).
        assertNull(ItemDto(id = "e-13", displayName = "S01E02").toCard().duration)
        // The duration is episode-scoped: the series card never carries one.
        assertNull(SeriesDto(id = "s-11", displayName = "Сага").toCard().duration)
    }

    @Test
    fun format_position_law() {
        // The SPA's formatPosition law verbatim (Home.tsx): MM:SS, then
        // H:MM:SS past the hour; negative input floors at zero.
        assertEquals("23:50", formatPosition(1430))
        assertEquals("00:59", formatPosition(59))
        assertEquals("1:01:01", formatPosition(3661))
        assertEquals("00:00", formatPosition(0))
        assertEquals("00:00", formatPosition(-3))
    }

    @Test
    fun watched_percent_bar_law() {
        // The SPA's watchedPercent law verbatim (WatchedStates.tsx):
        // position over duration, rounded, clamped to 100.
        assertEquals(42, watchedPercent(42, 100))
        assertEquals(50, watchedPercent(1, 2))
        // Round-half: 1/3 → 33.33 → 33; 2/3 → 66.67 → 67.
        assertEquals(33, watchedPercent(1, 3))
        assertEquals(67, watchedPercent(2, 3))
        // Past the end clamps to 100, never over.
        assertEquals(100, watchedPercent(150, 100))
        assertEquals(100, watchedPercent(100, 100))
        // Missing or non-positive duration → NO bar — never a guessed
        // percent (the null → no block law at the bar's own carrier).
        assertNull(watchedPercent(30, null))
        assertNull(watchedPercent(30, 0))
        assertNull(watchedPercent(30, -5))
    }

    @Test
    fun series_card_meta_is_the_facts_projection() {
        // 11.2 — the card's meta line is the hero's factsOf projection over
        // the served about block (ONE formatter, never a duplicate): the
        // fixed fact order verbatim, ★ score · kind · status · N эп · year.
        val served = SeriesDto(
            id = "s-6",
            displayName = "Черный клевер",
            metadata = ElementMetadata(
                about = MetadataAbout(
                    description = "Описание",
                    score = 8.1,
                    kind = "Аниме",
                    status = "Выходит",
                    episodes = 12,
                    airedOn = "1998-02-20",
                ),
            ),
        ).toCard()
        assertEquals("★ 8.1 · Аниме · Выходит · 12 эп · 1998", served.meta)

        // Absent metadata → no meta block (L1) — the wire's omitempty law:
        // absence means no block, never an empty one.
        assertNull(SeriesDto(id = "s-7", displayName = "Сага").toCard().meta)

        // A metadata block present but fact-less → factsOf's own null: no
        // padded line, never a fabricated fact.
        assertNull(
            SeriesDto(
                id = "s-8",
                displayName = "Без фактов",
                metadata = ElementMetadata(about = MetadataAbout(description = "Только описание")),
            ).toCard().meta,
        )
    }

    @Test
    fun type_accent_law_follows_the_spa_dot_map() {
        // D3 — the SPA's pastel dot map (styles/index.css .dot-*).
        assertEquals(Color(0xFFB7A6F4), typeAccent("serial"))
        assertEquals(Color(0xFFF6C3A4), typeAccent("tv"))
        assertEquals(Color(0xFFA4E3C3), typeAccent("image"))
        assertEquals(Color(0xFFA4C8F4), typeAccent("audio"))
        // An unknown module id falls to the SPA's default dot pastel (the
        // watched-mark color) — never a blank, never a guessed hue.
        assertEquals(DEFAULT_TYPE_ACCENT, typeAccent("audiobook"))
        assertEquals(DEFAULT_TYPE_ACCENT, typeAccent(""))
    }
}
