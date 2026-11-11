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
import tv.mellifera.browse.fixtures.episodesBody
import tv.mellifera.browse.fixtures.librariesBody
import tv.mellifera.browse.fixtures.refreshedEpisodesBody
import tv.mellifera.browse.fixtures.seriesBody
import tv.mellifera.net.SeriesDto
import tv.mellifera.pairing.InMemorySessionBacking
import tv.mellifera.pairing.SessionStore

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
        server.enqueue(json(seriesBody()))
        server.enqueue(json(episodesBody()))
        viewModel.browse.enter()
        viewModel.browse.openSeries(SeriesDto(id = "s-1", displayName = "Сага"))
        // Pre-exit: e-1 carries no watched stamp; three requests have walked.
        assertTrue(
            viewModel.browse.state.value.episodes.first { it.id == "e-1" }.watched == null,
        )
        assertEquals(3, server.requestCount)

        // The player exits after e-1 finished — the hook alone triggers the
        // re-fetch; no manual reload, no re-navigation.
        server.enqueue(json(seriesBody()))
        server.enqueue(json(refreshedEpisodesBody()))
        viewModel.onPlayerExit()

        // Refresh re-walks the open surfaces: the series rows, then the
        // open series' episodes. (The first three requests were the
        // enter+open walk; the queue holds all five.)
        repeat(3) { server.takeRequest() }
        assertEquals("/api/v1/series?library=1", server.takeRequest().path)
        assertEquals("/api/v1/series/s-1/episodes", server.takeRequest().path)
        val episodes = viewModel.browse.state.value.episodes
        assertEquals(2, episodes.size)
        assertTrue(
            "e-1 must surface its post-watch watched stamp after the refresh",
            episodes.first { it.id == "e-1" }.watched == true,
        )
    }
}
