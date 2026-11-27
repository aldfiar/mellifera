package tv.mellifera.browse

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import tv.mellifera.net.MetadataAbout
import tv.mellifera.net.SeriesDto

/**
 * The series hero's FIELD-DRIVEN mapping (design D5): the served
 * `metadata.about` block shapes the panel — an absent block or an empty
 * description renders NO panel (no synopsis, no facts line, no chips,
 * L1); a present one renders the SPA Synopsis idiom verbatim (Synopsis.tsx's
 * panelOf): BBCode-stripped description, genres as chips, the fixed fact
 * order (★ score · kind · status · N эп · year). The wire decode pin keeps
 * Dtos.kt mirroring api.ts ElementMetadata field-for-field (L6).
 */
class SeriesHeroTest {
    @Test
    fun absent_metadata_carries_no_about_panel() {
        // No metadata block on the served row (the unwired-chain case) →
        // no about panel: no synopsis, no facts, no chips. Title and poster
        // ride their own served fields, untouched.
        val hero = SeriesDto(
            id = "s-1",
            displayName = "Сага",
            artwork = "/artwork/posters/s-1.jpg",
        ).toHero()
        assertEquals("Сага", hero.title)
        assertEquals("/artwork/posters/s-1.jpg", hero.posterUrl)
        assertNull(hero.about)
    }

    @Test
    fun empty_or_markup_only_description_carries_no_panel() {
        // The description is the carrier the server resolved on: stripped
        // to nothing → no panel, no facts line either (D5/L1).
        for (description in listOf("", "   ", "[b][/b]", "[i]   [/i]")) {
            val hero = servedSeries(description = description).toHero()
            assertNull("description=$description must carry no panel", hero.about)
        }
    }

    @Test
    fun served_about_renders_the_synopsis_idiom() {
        val hero = servedSeries().toHero()
        val about = hero.about!!
        // BBCode wrappers stripped, inner text kept, trimmed.
        assertEquals("Аста и Йон и…" , about.description)
        // The fixed fact order verbatim: ★ score · kind · status · N эп · year.
        assertEquals("★ 8.1 · Аниме · Выходит · 12 эп · 1998", about.facts)
        // Blank genre names filter out; the rest ride verbatim as chips.
        assertEquals(listOf("Приключения", "Фэнтези"), about.genres)
    }

    @Test
    fun absent_facts_skip_their_slots() {
        // Only score + year are served → a two-word row; nothing fabricated
        // in the gaps.
        val hero = servedSeries(
            description = "Просто описание",
            factsJson = """"score":7,"aired_on":"2003-04-05"""",
        ).toHero()
        assertEquals("★ 7 · 2003", hero.about!!.facts)
        // No genres served → no chips, never a placeholder.
        assertEquals(emptyList<String>(), hero.about!!.genres)
    }

    @Test
    fun facts_of_is_the_one_formatter_output_unchanged() {
        // 11.2 — factsOf is promoted to internal so the series card's meta
        // line rides the SAME projection (no duplicate formatter); its
        // output is pinned unchanged: the fixed fact order verbatim
        // (★ score · kind · status · N эп · year), absent slots skipped,
        // a fact-less block → null.
        val facts = MetadataAbout(
            description = "Описание",
            score = 8.1,
            kind = "Аниме",
            status = "Выходит",
            episodes = 12,
            airedOn = "1998-02-20",
        )
        assertEquals("★ 8.1 · Аниме · Выходит · 12 эп · 1998", factsOf(facts))
        assertEquals("★ 7 · 1998", factsOf(facts.copy(score = 7.0, kind = null, status = null, episodes = null)))
        assertNull(factsOf(MetadataAbout(description = "Описание")))
    }

    @Test
    fun score_renders_like_the_spa_number() {
        // JS String(n): integral scores lose the fraction; decimals ride.
        assertEquals("8", scoreText(8.0))
        assertEquals("8.1", scoreText(8.1))
        assertEquals("7.35", scoreText(7.35))
    }

    @Test
    fun year_is_the_aired_on_prefix_never_a_guess() {
        // The "YYYY" prefix law: numeric, positive, at least four chars.
        assertEquals(1998, yearOf("1998-02-20"))
        assertEquals(1998, yearOf("1998")) // a bare year is exactly a prefix
        assertNull(yearOf(""))             // nothing to read
        assertNull(yearOf("abc"))          // non-numeric
        assertNull(yearOf("19x8-01-01"))   // non-numeric prefix
        assertNull(yearOf("0000-01-01"))   // non-positive year
    }

    @Test
    fun wire_decode_mirrors_api_ts_element_metadata() {
        // The served metadata block decodes through the SerialName law —
        // snake_case wire names, honest absence everywhere (the api.ts
        // ElementMetadata shape; unknown keys stay ignored by the decoder).
        val series = JSON.decodeFromString(
            SeriesDto.serializer(),
            """
            {"id":"s-9","module_id":"serial","library_id":1,
             "display_name":"Клинок",
             "metadata":{
               "about":{"source":"shiki","description":"Путь клинка.",
                        "genres":["Драма"],"score":8.62,"kind":"TV",
                        "status":"released","episodes":26,
                        "aired_on":"1993-04-06"},
               "cast":[{"name":"Имя","role":"Роль","photo_url":"/p.jpg"}],
               "episode":{"title":"Первый","description":"Начало"}},
             "unknown_served_key":{"ignored":true}}
            """.trimIndent(),
        )
        val about = series.metadata!!.about!!
        assertEquals("shiki", about.source)
        assertEquals("Путь клинка.", about.description)
        assertEquals(listOf("Драма"), about.genres)
        assertEquals(8.62, about.score!!, 1e-9)
        assertEquals("TV", about.kind)
        assertEquals("released", about.status)
        assertEquals(26L, about.episodes)
        assertEquals("1993-04-06", about.airedOn)
        assertEquals("Роль", series.metadata!!.cast!!.single().role)
        assertEquals("Первый", series.metadata!!.episode!!.title)
        // Absence: a bare series row decodes to a null block — never an
        // empty one.
        assertNull(JSON.decodeFromString(SeriesDto.serializer(), """{"id":"s-0"}""").metadata)
    }

    /** A served row whose about block carries every fact slot filled. */
    private fun servedSeries(
        description: String = "[character=124731]Аста[/character] и Йон и…",
        factsJson: String = """
            "genres":["Приключения","","Фэнтези"],"score":8.1,
            "kind":"Аниме","status":"Выходит","episodes":12,
            "aired_on":"1998-02-20"
        """.trimIndent(),
    ): SeriesDto = JSON.decodeFromString(
        SeriesDto.serializer(),
        """
        {"id":"s-5","module_id":"serial","library_id":1,
         "display_name":"Черный клевер",
         "artwork":"/artwork/posters/s-5.jpg",
         "metadata":{"about":{"source":"shiki",
                              "description":"$description",
                              $factsJson}}}
        """.trimIndent(),
    )

    /** The Api decoder's law (net/Api.kt): unknown keys ignored. */
    private val JSON: Json = Json { ignoreUnknownKeys = true }
}
