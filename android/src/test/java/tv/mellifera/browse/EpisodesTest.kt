package tv.mellifera.browse

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import tv.mellifera.browse.fixtures.episodesBody
import tv.mellifera.browse.fixtures.librariesBody
import tv.mellifera.browse.fixtures.seriesBody
import tv.mellifera.net.Api
import tv.mellifera.net.SeriesDto

/**
 * The series page route pin (5.6): navigating into a series fetches
 * GET /series/{id}/episodes with the EXACT id, and the served episode rows
 * map verbatim into the state (the field-driven law downstream).
 */
class EpisodesTest {
    private lateinit var server: MockWebServer
    private lateinit var flow: BrowseFlow

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        flow = BrowseFlow(apiFor = { Api(server.url("/").toString().trimEnd('/')).service })
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private fun json(body: String): MockResponse =
        MockResponse().setBody(body).addHeader("Content-Type", "application/json")

    @Test
    fun series_episodes_route() = runBlocking {
        server.enqueue(json(librariesBody()))
        server.enqueue(json(seriesBody()))
        server.enqueue(json(episodesBody()))
        flow.enter()
        assertEquals(listOf("serial"), flow.state.value.libraries.map { it.moduleId })
        assertEquals(listOf("s-1", "s-2"), flow.state.value.series.map { it.id })

        flow.openSeries(SeriesDto(id = "s-1", displayName = "Сага"))

        // The walked requests: libraries → series?library=1 → the open
        // series' exact episodes route, over GET.
        assertEquals("/api/v1/libraries", server.takeRequest().path)
        assertEquals("/api/v1/series?library=1", server.takeRequest().path)
        val episodesRequest = server.takeRequest()
        assertEquals("GET", episodesRequest.method)
        assertEquals("/api/v1/series/s-1/episodes", episodesRequest.path)

        // The payload maps verbatim into the state's episode rows.
        val state = flow.state.value
        assertEquals("s-1", state.selectedSeries?.id)
        assertEquals(2, state.episodes.size)
        val first = state.episodes[0]
        assertEquals("e-1", first.id)
        assertEquals("Серия 1", first.displayName)
        assertNull(first.artwork)
        assertNull(first.watched)
        val second = state.episodes[1]
        assertEquals("Серия 2", second.displayName)
        assertEquals("/artwork/thumbs/e-2.jpg", second.artwork)
        assertEquals(true, second.watched)
    }
}
