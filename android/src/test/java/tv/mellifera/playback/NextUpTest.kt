package tv.mellifera.playback

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import tv.mellifera.net.ItemDto
import tv.mellifera.net.WatchDefaultsDto

/**
 * The ended-edge pick's pins (D7, 5.2 — lib/nextup.ts's laws): facts come
 * from the served document's parsed anchor + sources namespaces (structural
 * only — no media-type literals, so a FILM with no parseable facts never
 * advances); the pick is the LOWEST (season, episode) strictly after the
 * played item's; the countdown is the SERVED shape only — unusable means no
 * countdown and NEVER autoplay, no baked fallback. Pure JVM.
 */
class NextUpTest {

    /** An episode-shaped item: [anchor] + the parsed numbers in the first
     * sources namespace; nulls drop the parts (the honest-absence fixtures). */
    private fun item(
        id: String,
        anchor: String?,
        season: Long?,
        episode: Long?,
        libraryId: Long = 7,
        title: String? = null,
    ): ItemDto {
        val parsed: JsonElement = if (anchor == null) {
            buildJsonObject { }
        } else {
            buildJsonObject { put("series_relative_path", anchor) }
        }
        val namespace = buildJsonObject {
            if (season != null) put("season", season)
            if (episode != null) put("episode", episode)
        }
        val document = buildJsonObject {
            put("parsed", parsed)
            put("sources", JsonObject(mapOf("shiritori" to namespace)))
        }
        return ItemDto(
            id = id,
            libraryId = libraryId,
            relativePath = "/lib/$id.mkv",
            mediaType = "tv",
            document = document,
            displayName = id,
            metadata = title?.let {
                // The next episode's served convention title (MetadataEpisode).
                tv.mellifera.net.ElementMetadata(episode = tv.mellifera.net.MetadataEpisode(title = it))
            },
        )
    }

    @Test
    fun facts_from_served_document() {
        val facts = episodeFactsOf(item("i1", "/anime/jojo", 2, 5))
        assertEquals(EpisodeFacts(7, "/anime/jojo", 2, 5), facts)
    }

    @Test
    fun film_without_anchor_is_no_facts() {
        // No parsed anchor — a film never advances (the structural law: the
        // media-type literal is never consulted).
        assertNull(episodeFactsOf(item("i1", null, 1, 1)))
        // An anchor without both numbers is equally no facts.
        assertNull(episodeFactsOf(item("i1", "/anime/jojo", 1, null)))
        assertNull(episodeFactsOf(item("i1", "/anime/jojo", null, 3)))
    }

    @Test
    fun string_numbers_are_not_facts() {
        val document = Json.parseToJsonElement(
            """{"parsed":{"series_relative_path":"/anime/jojo"},"sources":{"a":{"season":"2","episode":5}}}""",
        )
        val dto = ItemDto(
            id = "i1", libraryId = 7, relativePath = "/x", mediaType = "tv",
            document = document, displayName = "x",
        )
        assertNull(episodeFactsOf(dto))
    }

    @Test
    fun pick_is_lowest_strictly_after() {
        val current = item("i1", "/anime/jojo", 2, 5)
        val candidates = listOf(
            item("i3", "/anime/jojo", 3, 1),
            item("i2", "/anime/jojo", 2, 6),
            item("i0", "/anime/jojo", 2, 5), // not strictly after
            item("i4", "/anime/other", 9, 9), // another series' facts still order by tuple
        )
        val pick = nextEpisodeAfter(current, candidates)
        assertEquals("i2", pick?.item?.id)
        assertEquals("S02E06", pick?.label)
    }

    @Test
    fun season_beats_episode_in_the_ordering() {
        val current = item("i1", "/anime/jojo", 1, 9)
        val pick = nextEpisodeAfter(current, listOf(item("i2", "/anime/jojo", 2, 1), item("i3", "/anime/jojo", 1, 10)))
        assertEquals("i3", pick?.item?.id)
        assertEquals("S01E10", pick?.label)
    }

    @Test
    fun film_never_advances_and_empty_list_never_picks() {
        assertNull(nextEpisodeAfter(item("i1", null, 1, 1), listOf(item("i2", "/a", 1, 2))))
        assertNull(nextEpisodeAfter(item("i1", "/anime/jojo", 2, 5), emptyList()))
        // Candidates without parseable facts carry no pick.
        assertNull(nextEpisodeAfter(item("i1", "/anime/jojo", 2, 5), listOf(item("i2", "/anime/jojo", null, 6))))
    }

    @Test
    fun pick_carries_the_served_episode_title() {
        val pick = nextEpisodeAfter(
            item("i1", "/anime/jojo", 2, 5),
            listOf(item("i2", "/anime/jojo", 2, 6, title = "Дальше")),
        )
        assertEquals("Дальше", pick?.item?.metadata?.episode?.title)
    }

    @Test
    fun countdown_is_the_served_positive_integer_only() {
        assertEquals(10L, servedCountdown(WatchDefaultsDto(autoNextCountdownSeconds = 10)))
        // 0 / negative / null field / absent shape — all unusable: no
        // countdown, never autoplay (the refusal to guess).
        assertNull(servedCountdown(WatchDefaultsDto(autoNextCountdownSeconds = 0)))
        assertNull(servedCountdown(WatchDefaultsDto(autoNextCountdownSeconds = -5)))
        assertNull(servedCountdown(WatchDefaultsDto(autoNextCountdownSeconds = null)))
        assertNull(servedCountdown(null))
    }
}
