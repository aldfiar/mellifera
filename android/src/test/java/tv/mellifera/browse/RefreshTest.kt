package tv.mellifera.browse

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import tv.mellifera.AppViewModel
import tv.mellifera.Screen
import tv.mellifera.assertDrained
import tv.mellifera.browse.fixtures.episodesBody
import tv.mellifera.browse.fixtures.facetsBody
import tv.mellifera.browse.fixtures.librariesBody
import tv.mellifera.browse.fixtures.progressBody
import tv.mellifera.browse.fixtures.refreshedEpisodesBody
import tv.mellifera.browse.fixtures.seriesBody
import tv.mellifera.net.SeriesDto
import tv.mellifera.pairing.InMemorySessionBacking
import tv.mellifera.pairing.SessionStore
import tv.mellifera.takeRequestOrFail

/**
 * The player-exit refresh law (5.6), over the real net stack on a
 * MockWebServer: the hook fires → the progress/resume-visible surfaces
 * re-fetch WITHOUT a manual reload — the open series' episodes come back
 * with the post-watch watched stamp.
 */
class RefreshTest {
    private lateinit var server: MockWebServer
    private lateinit var store: SessionStore
    private lateinit var viewModel: AppViewModel

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        // Paired earlier: a stored address + token land straight on Browse.
        store = SessionStore(InMemorySessionBacking())
        store.writeServerAddress(server.url("/").toString().trimEnd('/'))
        store.writeToken("tok-1")
        viewModel = AppViewModel(store = store, appScope = CoroutineScope(Job()))
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private fun json(body: String): MockResponse =
        MockResponse().setBody(body).addHeader("Content-Type", "application/json")

    @Test
    fun player_exit_refreshes() = runBlocking {
        assertEquals(Screen.Browse, viewModel.state.value.screen)
        server.enqueue(json(librariesBody()))
        server.enqueue(json(facetsBody()))
        server.enqueue(json(seriesBody()))
        server.enqueue(json(episodesBody()))
        // The episode rows' progress walk (2.2): e-1 is in-progress, e-2 is
        // never started (the 404 IS the honest absence — no stored entry).
        server.enqueue(json(progressBody("e-1", 300)))
        server.enqueue(MockResponse().setResponseCode(404))
        viewModel.browse.enter()
        // The clean-entry law (15.2): enter serves /libraries alone — the
        // serial body rides the first explicit activation before the series
        // page opens over it.
        viewModel.browse.selectLibrary(1L)
        viewModel.browse.openSeries(SeriesDto(id = "s-1", displayName = "Сага"))
        // Pre-exit: e-1 carries no watched stamp but its stored position
        // landed; six requests have walked (libraries, then the
        // activation's facets + series, episodes, then one progress GET
        // per episode row).
        assertTrue(
            viewModel.browse.state.value.episodes.first { it.id == "e-1" }.watched == null,
        )
        assertEquals(mapOf("e-1" to 300L), viewModel.browse.state.value.positions)
        assertEquals(6, server.requestCount)

        // The player exits after e-1 finished — the hook alone triggers the
        // re-fetch; no manual reload, no re-navigation.
        server.enqueue(json(facetsBody()))
        server.enqueue(json(seriesBody()))
        server.enqueue(json(refreshedEpisodesBody()))
        // The refresh's own progress walk: e-1's position moved on, e-2
        // still never started.
        server.enqueue(json(progressBody("e-1", 660)))
        server.enqueue(MockResponse().setResponseCode(404))
        // The exit also refreshes the home rows under the same law (D4):
        // one more GET /home the walk must answer — an unanswered one rode
        // OkHttp's 10s read timeout as a swallowed best-effort failure
        // (the slow-green mechanism 7.1 kills).
        server.enqueue(json("""{"continue":[]}"""))
        viewModel.onPlayerExit()

        // Refresh re-walks the open surfaces: the serial body's facets, the
        // series rows, the open series' episodes, then the progress walk,
        // then the home refresh. (The first six requests were the
        // enter+open walk; the queue holds all twelve.)
        repeat(6) { server.takeRequestOrFail("RefreshTest.player_exit_refreshes") }
        assertEquals("/api/v1/libraries/1/facets", server.takeRequestOrFail("RefreshTest.player_exit_refreshes").path)
        assertEquals("/api/v1/series?library=1", server.takeRequestOrFail("RefreshTest.player_exit_refreshes").path)
        assertEquals("/api/v1/series/s-1/episodes", server.takeRequestOrFail("RefreshTest.player_exit_refreshes").path)
        assertEquals("/api/v1/progress/e-1", server.takeRequestOrFail("RefreshTest.player_exit_refreshes").path)
        assertEquals("/api/v1/progress/e-2", server.takeRequestOrFail("RefreshTest.player_exit_refreshes").path)
        assertEquals("/api/v1/home", server.takeRequestOrFail("RefreshTest.player_exit_refreshes").path)
        val episodes = viewModel.browse.state.value.episodes
        assertEquals(2, episodes.size)
        assertTrue(
            "e-1 must surface its post-watch watched stamp after the refresh",
            episodes.first { it.id == "e-1" }.watched == true,
        )
        // The positions re-walked too — the row's bar follows the NEW
        // stored position, and e-2 keeps its honest absence.
        assertEquals(mapOf("e-1" to 660L), viewModel.browse.state.value.positions)

        // The queue drained: the six enter/open requests + the six refresh
        // legs, each answered by an enqueued fixture.
        server.assertDrained("RefreshTest.player_exit_refreshes", 12)
    }
}
