package tv.mellifera.playback

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The skip-chip classifier's pins (D7, 5.2 — lib/skipSections.ts's laws over
 * the SAME served descriptor sections): chapter kind + both bounds + the
 * exact intro/credits lexicon classify; everything else is honest absence —
 * the client never fabricates a skip range. Pure JVM.
 */
class SkipSectionsTest {

    private fun section(json: String): JsonElement = Json.parseToJsonElement(json)

    @Test
    fun chapter_with_intro_title_classifies() {
        val skip = skipSectionOf(
            section("""{"kind":"chapter","start":10.0,"end":90.5,"title":"  INTRO "}"""),
        )
        assertEquals(SkipSection(SkipKind.Intro, 10.0, 90.5), skip)
    }

    @Test
    fun cyrillic_lexicon_classifies() {
        assertEquals(
            SkipKind.Intro,
            skipSectionOf(section("""{"kind":"chapter","start":0.0,"end":5.0,"title":"Опенинг"}"""))?.kind,
        )
        assertEquals(
            SkipKind.Credits,
            skipSectionOf(section("""{"kind":"chapter","start":0.0,"end":5.0,"title":"титры"}"""))?.kind,
        )
        assertEquals(
            SkipKind.Credits,
            skipSectionOf(section("""{"kind":"chapter","start":0.0,"end":5.0,"title":"ED"}"""))?.kind,
        )
    }

    @Test
    fun marker_kind_classifies_to_nothing() {
        assertNull(
            skipSectionOf(section("""{"kind":"marker","start":0.0,"end":5.0,"title":"intro"}""")),
        )
    }

    @Test
    fun end_less_or_degenerate_range_classifies_to_nothing() {
        assertNull(skipSectionOf(section("""{"kind":"chapter","start":10.0,"title":"intro"}""")))
        assertNull(skipSectionOf(section("""{"kind":"chapter","start":10.0,"end":10.0,"title":"intro"}""")))
        assertNull(skipSectionOf(section("""{"kind":"chapter","start":10.0,"end":5.0,"title":"intro"}""")))
    }

    @Test
    fun unknown_or_absent_title_classifies_to_nothing() {
        assertNull(skipSectionOf(section("""{"kind":"chapter","start":0.0,"end":5.0,"title":"Комментарии"}""")))
        assertNull(skipSectionOf(section("""{"kind":"chapter","start":0.0,"end":5.0}""")))
    }

    @Test
    fun substring_titles_never_classify() {
        // "ed" inside "Wedding" would fabricate a credits chip — exact match only.
        assertNull(skipSectionOf(section("""{"kind":"chapter","start":0.0,"end":5.0,"title":"Wedding"}""")))
    }

    @Test
    fun string_bounds_are_not_numbers() {
        assertNull(
            skipSectionOf(section("""{"kind":"chapter","start":"10.0","end":5.0,"title":"intro"}""")),
        )
    }

    @Test
    fun projection_preserves_served_order_and_drops_unclassified() {
        val ranges = skipSectionsOf(
            listOf(
                section("""{"kind":"chapter","start":10.0,"end":90.0,"title":"intro"}"""),
                section("""{"kind":"marker","start":100.0,"end":110.0,"title":"intro"}"""),
                section("""{"kind":"chapter","start":800.0,"end":840.0,"title":"credits"}"""),
            ),
        )
        assertEquals(
            listOf(
                SkipSection(SkipKind.Intro, 10.0, 90.0),
                SkipSection(SkipKind.Credits, 800.0, 840.0),
            ),
            ranges,
        )
    }

    @Test
    fun containment_is_start_inclusive_end_exclusive() {
        val ranges = listOf(SkipSection(SkipKind.Credits, 800.0, 840.0))
        assertEquals(ranges[0], skipSectionAt(ranges, 800.0))
        assertEquals(ranges[0], skipSectionAt(ranges, 839.999))
        // The end boundary itself is OUTSIDE — the OK activation seeks to
        // end + beat, which must leave the range closed.
        assertNull(skipSectionAt(ranges, 840.0))
        assertNull(skipSectionAt(ranges, 799.999))
        // The skip target (end + SKIP_SEEK_PAST_SECONDS) never lands back in.
        assertNull(skipSectionAt(ranges, 840.0 + SKIP_SEEK_PAST_SECONDS))
    }
}
