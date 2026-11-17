package tv.mellifera.browse

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import tv.mellifera.assertDrained
import tv.mellifera.browse.fixtures.episodesBody
import tv.mellifera.browse.fixtures.facetsBody
import tv.mellifera.browse.fixtures.librariesBody
import tv.mellifera.browse.fixtures.seriesBody
import tv.mellifera.net.Api
import tv.mellifera.net.SeriesDto
import tv.mellifera.takeRequestOrFail

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
        server.enqueue(json(facetsBody()))
        server.enqueue(json(seriesBody()))
        server.enqueue(json(episodesBody()))
        // The rows' progress walk (2.2): both rows never started — the 404
        // IS the honest absence. Every walked request needs its answer; an
        // unanswered one rode OkHttp's 10s read timeout as a swallowed
        // best-effort failure (the slow-green mechanism 7.1 kills).
        server.enqueue(MockResponse().setResponseCode(404))
        server.enqueue(MockResponse().setResponseCode(404))
        flow.enter()
        // The all-collections law (5.14): BOTH served collections are kept,
        // in the served order — the serial+tv client filter is retired.
        assertEquals(listOf("serial", "movie"), flow.state.value.libraries.map { it.moduleId })
        // The clean-entry law (15.2): enter serves /libraries alone — the
        // serial body loads at the first explicit activation.
        flow.selectLibrary(1L)
        assertEquals(listOf("s-1", "s-2"), flow.state.value.series.map { it.id })

        flow.openSeries(SeriesDto(id = "s-1", displayName = "Сага"))

        // The walked requests: libraries → the activation's facets (10.1,
        // best-effort) → series?library=1 → the open series' exact episodes
        // route, over GET.
        assertEquals("/api/v1/libraries", server.takeRequestOrFail("EpisodesTest.series_episodes_route").path)
        assertEquals("/api/v1/libraries/1/facets", server.takeRequestOrFail("EpisodesTest.series_episodes_route").path)
        assertEquals("/api/v1/series?library=1", server.takeRequestOrFail("EpisodesTest.series_episodes_route").path)
        val episodesRequest = server.takeRequestOrFail("EpisodesTest.series_episodes_route")
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

        // The queue drained: the walk's six requests (libraries → facets →
        // series → episodes → one progress GET per row) each got their
        // answer.
        server.assertDrained("EpisodesTest.series_episodes_route", 6)
    }
}
