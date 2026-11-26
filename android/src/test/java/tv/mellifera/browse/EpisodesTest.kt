package tv.mellifera.browse

import androidx.compose.ui.unit.dp
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
import tv.mellifera.browse.fixtures.episodesWatchedPrefixBody
import tv.mellifera.browse.fixtures.facetsBody
import tv.mellifera.browse.fixtures.librariesBody
import tv.mellifera.browse.fixtures.seriesBody
import tv.mellifera.net.Api
import tv.mellifera.net.SeriesDto
import tv.mellifera.takeRequestOrFail
import tv.mellifera.ui.UiScaleMode

/**
 * The series page route pin (5.6): navigating into a series fetches
 * GET /series/{id}/episodes with the EXACT id, and the served episode rows
 * map verbatim into the state (the field-driven law downstream). The
 * page's data laws hold here: the first-unwatched entry seed, the
 * served-title precedence and the duration line over the SERVED rows, and
 * the episode column law at the series page's own grid inputs.
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

    @Test
    fun series_page_seeds_first_unwatched_and_maps_the_card_law() = runBlocking {
        server.enqueue(json(librariesBody()))
        server.enqueue(json(facetsBody()))
        server.enqueue(json(seriesBody()))
        server.enqueue(json(episodesWatchedPrefixBody()))
        // The progress walk's answers: both rows never started — the 404 is
        // the honest absence (the 2.2 law, same walk as the route pin).
        server.enqueue(MockResponse().setResponseCode(404))
        server.enqueue(MockResponse().setResponseCode(404))
        flow.enter()
        flow.selectLibrary(1L)
        flow.openSeries(SeriesDto(id = "s-1", displayName = "Сага"))

        val state = flow.state.value
        // The entry seed (nav/InitialFocus.kt's law): e-1 is served
        // watched — the first-unwatched episode takes the initial focus.
        // FocusLawTest pins the pure law; this pin ties it to the wire —
        // the flow seeds it from the SERVED watched states.
        assertEquals(1, state.episodeFocus)

        // The served-title precedence (design D3), mapped over the SERVED
        // rows by the real mapper: e-1's document title «Пилот» wins over
        // the composed name — never re-derived client-side...
        val watched = state.episodes[0].toCard(state.positions["e-1"])
        assertEquals("Пилот", watched.title)
        // ...a row whose document carries no title floors to the composed
        // name verbatim.
        val bare = state.episodes[1].toCard(state.positions["e-2"])
        assertEquals("Сага · S01E02", bare.title)
        // Duration: the ffprobe read renders display-formatted; a document
        // without it renders NO duration line (field-driven absence).
        assertEquals("45:00", watched.duration)
        assertNull(bare.duration)
        // The tri-state holds on the served carriers: watched → NO bar...
        assertNull(watched.progress)
        // ...an unstarted bare row → no bar (the position walk 404'd).
        assertNull(bare.progress)
        // OK plays the FOCUSED episode: the card's id IS the served episode
        // id — the click's payload never lands on a fabricated index (the
        // 2026-11-12 dead-OK defect stays fixed).
        assertEquals("e-1", watched.id)
        assertEquals("e-2", bare.id)

        // The walk drained: libraries → facets → series → episodes → one
        // progress GET per row.
        server.assertDrained("EpisodesTest.series_page_seeds_first_unwatched_and_maps_the_card_law", 6)
    }

    @Test
    fun episode_grid_columns_ride_the_pref_over_the_plan() {
        // The ruled cell at the series page's own inputs: «Авто» = 3 at
        // Обычный @960×540 under the ~100dp hero chrome reserve
        // (LayoutParityTest pins the planner's full table; this pin ties
        // the SERIES-PAGE surface inputs and the pref override together).
        val width = (960f * CONTENT_COLUMN_FRACTION).dp
        fun plan(override: Int?) = gridPlan(
            width = width,
            height = 540.dp,
            chrome = chromeReserve(UiScaleMode.REGULAR, GridSurface.EPISODE),
            caption = captionReserve(UiScaleMode.REGULAR, GridSurface.EPISODE),
            aspect = STILL_ASPECT,
            columnOverride = override,
        )
        assertEquals(3, plan(null).columns)
        // The «Эпизодов в ряду» pref rides the planner's override law: 2
        // renders 2 — a SPARSER lane keeps the operator's count...
        assertEquals(2, plan(2).columns)
        // ...4 clamps to the auto count — a caption never clips (the same
        // clamp LayoutParityTest pins at the auto cell).
        assertEquals(3, plan(4).columns)
    }
}
