package tv.mellifera.playback

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import tv.mellifera.net.ElementMetadata
import tv.mellifera.net.ItemDto
import tv.mellifera.net.MetadataAbout
import tv.mellifera.net.MetadataCastEntry
import tv.mellifera.net.MetadataEpisode
import tv.mellifera.net.SeriesDto

/**
 * The Active overlay's info-block mapping (design D7, the SPA InfoColumn's
 * IA) pinned field-driven: every block is a nullable carrier over the SERVED
 * projection only — null renders NO block, nothing to say → no blocks at
 * all (L1; spec "Info blocks are field-driven").
 */
class PlayerInfoTest {

    /** An episode document: the parsed anchor + two source namespaces. */
    private val episodeDoc = Json.parseToJsonElement(
        """
        {
          "parsed": {"series_relative_path": "serials/firefly"},
          "sources": {
            "shikimori": {"season": 1, "episode": 2},
            "kinopoisk": {"season": 1, "episode": 2, "note": "x"}
          }
        }
        """.trimIndent(),
    )

    private fun episode(metadata: ElementMetadata? = null) = ItemDto(
        id = "itm_1_f2",
        libraryId = 1,
        relativePath = "serials/firefly/s01e02.mkv",
        mediaType = "tv",
        document = episodeDoc,
        displayName = "Свадьба светлячков · S01E02",
        metadata = metadata,
    )

    private val fullMetadata = ElementMetadata(
        episode = MetadataEpisode(title = "Название серии", description = "Описание серии"),
        cast = listOf(
            MetadataCastEntry(name = "Имя", role = "Роль"),
            MetadataCastEntry(name = "Имя2", role = null),
        ),
    )

    private val series = SeriesDto(
        id = "ser_1_x",
        libraryId = 1,
        relativePath = "serials/firefly",
        displayName = "Свадьба светлячков",
        metadata = ElementMetadata(
            about = MetadataAbout(
                source = "shikimori",
                description = "[b]О сериале[/b] и продолжение",
            ),
        ),
    )

    @Test
    fun episode_blocks_render_from_served_fields() {
        val info = playerInfo(episode(fullMetadata), series)
        assertEquals("S01E02", info?.eyebrow)
        assertEquals("Название серии", info?.heading)
        assertEquals("Описание серии", info?.episodeDescription)
        assertEquals(2, info?.cast?.size)
        // The About reads the MATCHED series row (path anchor), BBCode stripped.
        assertEquals("О сериале и продолжение", info?.about)
    }

    @Test
    fun absent_description_block_is_absent_others_render() {
        // The spec scenario: no description field — the block is absent, the
        // rest render from their fields.
        val info = playerInfo(
            episode(ElementMetadata(episode = MetadataEpisode(title = "Название серии"))),
            series,
        )
        assertNull(info?.episodeDescription)
        assertEquals("Название серии", info?.heading)
        assertEquals("О сериале и продолжение", info?.about)
    }

    @Test
    fun film_floors_to_served_display_name() {
        // No parseable facts, no episode block — the served display name
        // heads the column; no eyebrow, no fabricated heading.
        val film = ItemDto(
            id = "itm_1_f9",
            displayName = "Фильм",
            document = Json.parseToJsonElement("""{"parsed": {}}"""),
        )
        val info = playerInfo(film, series = null)
        assertNull(info?.eyebrow)
        assertEquals("Фильм", info?.heading)
        assertNull(info?.episodeDescription)
        assertEquals(0, info?.cast?.size)
        assertNull(info?.about)
    }

    @Test
    fun facts_without_title_render_eyebrow_only() {
        // SPA InfoColumn: parseable facts + no served title → NO heading
        // (never a file-derived one); the eyebrow alone renders.
        val info = playerInfo(
            episode(ElementMetadata(episode = MetadataEpisode(description = "Описание серии"))),
            series,
        )
        assertEquals("S01E02", info?.eyebrow)
        assertNull(info?.heading)
    }

    @Test
    fun about_source_law_anchor_matched_else_item_own() {
        // Anchor unmatched → the ITEM's own about block.
        val ownAbout = ElementMetadata(about = MetadataAbout(source = "s", description = "Своё"))
        val unmatched = playerInfo(episode(ownAbout), series = null)
        assertEquals("Своё", unmatched?.about)

        // Anchor matched, matched row carries no about → NO fallback to the
        // item's own block (the SPA expression's exact shape).
        val seriesBare = SeriesDto(id = "ser_1_x", libraryId = 1, relativePath = "serials/firefly")
        val matchedBare = playerInfo(
            episode(
                ElementMetadata(
                    episode = MetadataEpisode(title = "t"),
                    about = MetadataAbout(source = "s", description = "Своё"),
                ),
            ),
            seriesBare,
        )
        assertNull(matchedBare?.about)
    }

    @Test
    fun empty_about_description_is_no_block() {
        // panelOf's carrier law: the description is the carrier — an empty
        // (or whitespace/BBCode-only) description is no About block.
        val empty = SeriesDto(
            id = "ser_1_x",
            libraryId = 1,
            relativePath = "serials/firefly",
            metadata = ElementMetadata(about = MetadataAbout(source = "s", description = "[b][/b]")),
        )
        val info = playerInfo(episode(fullMetadata), empty)
        assertNull(info?.about)
        assertEquals("Название серии", info?.heading) // the rest still render
    }

    @Test
    fun nothing_to_say_is_no_blocks_at_all() {
        // A row with no metadata, no parseable facts, no display name — the
        // mapper answers null (the overlay renders no blocks).
        val bare = ItemDto(id = "itm_1_f0", document = Json.parseToJsonElement("{}"))
        assertNull(playerInfo(bare, series = null))
    }

    @Test
    fun cast_rows_map_field_driven_per_entry() {
        // 12.4 (the audit P3-2 per-entry law): one CastRow model per served
        // entry — the portrait tile only when the served photo_url resolves
        // (an absolute URL passes resolveArtworkUrl anonymously), an absent
        // photo or a relative path with no server base is a plain row (never
        // a fabricated tile, L1); the role renders only when the served
        // entry carries a non-empty one.
        val rows = listOf(
            MetadataCastEntry(name = "Имя", role = "Роль", photoUrl = "https://image.tmdb.org/t/p/original/face.jpg"),
            MetadataCastEntry(name = "Имя2", role = null),
            MetadataCastEntry(name = "Имя3", role = "", photoUrl = "relative/face.jpg"),
        ).map { it.toCastRow() }
        assertEquals("Имя", rows[0].name)
        assertEquals("Роль", rows[0].role)
        assertEquals("https://image.tmdb.org/t/p/original/face.jpg", rows[0].portrait?.url)
        assertEquals(false, rows[0].portrait?.isAuthorized)
        assertNull(rows[1].portrait)
        assertNull(rows[1].role)
        assertNull(rows[2].portrait)
        assertNull(rows[2].role)
    }

    @Test
    fun clock_formats_spa_law() {
        assertEquals("0:00", formatClock(0))
        assertEquals("42:10", formatClock(42 * 60_000L + 10_000L))
        assertEquals("1:00:00", formatClock(3_600_000L))
        assertEquals("1:24:00", formatClock((3600 + 24 * 60) * 1000L))
    }
}
