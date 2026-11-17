package tv.mellifera.browse

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import tv.mellifera.assertDrained
import tv.mellifera.browse.fixtures.episodesBody
import tv.mellifera.browse.fixtures.librariesBody
import tv.mellifera.browse.fixtures.progressBody
import tv.mellifera.browse.fixtures.seriesBody
import tv.mellifera.browse.fixtures.tvItemsBody
import tv.mellifera.browse.fixtures.tvLibrariesBody
import tv.mellifera.net.Api
import tv.mellifera.net.ItemDto
import tv.mellifera.net.SeriesDto
import tv.mellifera.takeRequestOrFail

/**
 * The collections law (5.14 — the SPA-parity state/flow, the browser app's
 * collections logic carried to the TV flow): ALL served collections are
 * kept in served order, the module-label law renders every module_id
 * readably, the rail's counts are best-effort and rail-open only, and a
 * collection switch swaps the grid fetch-on-navigate while a failed switch
 * keeps the prior grid.
 */
class CollectionsTest {
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

    private fun summaryBody(libraryId: Long, items: Long): String =
        """{"library_id":$libraryId,"items":$items,"updated_at":"2026-11-12T00:00:00Z"}"""

    @Test
    fun all_collections_kept_in_served_order() = runBlocking {
        server.enqueue(json(librariesBody()))
        server.enqueue(json(seriesBody()))

        flow.enter()

        val state = flow.state.value
        // ALL served collections are kept, in the served order — no module
        // filter stands between the server's list and the rail.
        assertEquals(listOf(1L, 2L), state.libraries.map { it.id })
        assertEquals(listOf("serial", "movie"), state.libraries.map { it.moduleId })
        // Default collection = the FIRST served.
        assertEquals(1L, state.libraryId)
        assertEquals(listOf("s-1", "s-2"), state.series.map { it.id })

        // enter()'s request sequence is unchanged: libraries → the first
        // collection's series. A closed rail fired no summary requests.
        assertEquals("/api/v1/libraries", server.takeRequestOrFail("CollectionsTest.all_collections_kept_in_served_order").path)
        assertEquals("/api/v1/series?library=1", server.takeRequestOrFail("CollectionsTest.all_collections_kept_in_served_order").path)
        assertEquals(2, server.requestCount)
    }

    @Test
    fun module_label_law() {
        // The known module ids carry their pure labels.
        assertEquals("Каталоги", moduleLabel("serial"))
        assertEquals("ТВ", moduleLabel("tv"))
        assertEquals("Фото", moduleLabel("image"))
        // An unknown module id renders its own id — a type the client has
        // never seen still yields a readable entry (the default-dot law).
        assertEquals("movie", moduleLabel("movie"))
        assertEquals("audiobook", moduleLabel("audiobook"))
    }

    @Test
    fun summaries_best_effort_countless_on_failure() = runBlocking {
        server.enqueue(json(librariesBody()))
        server.enqueue(json(seriesBody()))
        flow.enter()
        // The rail opens: every served collection fires its summary — the
        // first answers, the second fails hard (5xx).
        server.enqueue(json(summaryBody(libraryId = 1, items = 42)))
        server.enqueue(MockResponse().setResponseCode(500))

        flow.loadSummaries()

        val state = flow.state.value
        // drain enter()'s walked requests before asserting the summary legs
        server.takeRequestOrFail("CollectionsTest.summaries_best_effort_countless_on_failure")
        server.takeRequestOrFail("CollectionsTest.summaries_best_effort_countless_on_failure")
        // The answered summary maps through verbatim (updated_at served but
        // not carried — the decoder's unknown-keys law absorbed it).
        assertEquals(42L, state.summaries[1L]?.items)
        assertEquals(1L, state.summaries[1L]?.libraryId)
        // The failed summary degrades to a count-less row — never an error,
        // never a fabricated count.
        assertFalse(state.summaries.containsKey(2L))
        assertNull(state.error)
        // The walked summary routes, one per served collection, in order.
        assertEquals("/api/v1/libraries/1/summary", server.takeRequestOrFail("CollectionsTest.summaries_best_effort_countless_on_failure").path)
        assertEquals("/api/v1/libraries/2/summary", server.takeRequestOrFail("CollectionsTest.summaries_best_effort_countless_on_failure").path)
        server.assertDrained("CollectionsTest.summaries_best_effort_countless_on_failure", 4)
    }

    @Test
    fun unknown_module_select_is_honest_empty() = runBlocking {
        server.enqueue(json(librariesBody()))
        server.enqueue(json(seriesBody()))
        flow.enter()
        server.takeRequestOrFail("CollectionsTest.unknown_module_select_is_honest_empty")
        server.takeRequestOrFail("CollectionsTest.unknown_module_select_is_honest_empty")

        // The unknown module's honest path (D6's stated TV divergence): the
        // switch fires NO body fetch at all — the body renders the module's
        // own id as label over an empty state, never an error, never a
        // guessed grid.
        flow.selectLibrary(2L)

        val state = flow.state.value
        assertEquals(2L, state.libraryId)
        assertEquals("movie", state.libraries.first { it.id == 2L }.moduleId)
        assertEquals(emptyList<SeriesDto>(), state.series)
        assertEquals(emptyList<ItemDto>(), state.items)
        assertEquals(0, state.gridFocus)
        assertNull(state.error)
        assertFalse(state.isLoading)
        // enter()'s two requests were ALL the traffic: the unknown module
        // fetched nothing.
        assertEquals(2, server.requestCount)
    }

    @Test
    fun tv_module_select_walks_the_paged_items_stream() = runBlocking {
        server.enqueue(json(tvLibrariesBody()))
        server.enqueue(json(seriesBody()))
        flow.enter()
        server.takeRequestOrFail("CollectionsTest.tv_module_select_walks_the_paged_items_stream")
        server.takeRequestOrFail("CollectionsTest.tv_module_select_walks_the_paged_items_stream")

        // The tv body (D6): fetch-on-navigate over GET /items — the FIRST
        // page of the paged stream (limit 50 at offset 0); a new collection
        // is a fresh grid, the cursor resets to 0.
        flow.onGridFocusMoved(1)
        server.enqueue(json(tvItemsBody()))
        flow.selectLibrary(2L)

        val state = flow.state.value
        assertEquals(2L, state.libraryId)
        assertEquals(listOf("f-1", "f-2"), state.items.map { it.id })
        assertEquals(0, state.gridFocus)
        assertNull(state.error)
        assertEquals("/api/v1/items?library=2&limit=50&offset=0", server.takeRequestOrFail("CollectionsTest.tv_module_select_walks_the_paged_items_stream").path)

        // A FAILED switch keeps the prior body: rows stay, the cursor and
        // libraryId revert, the honest RU error surfaces.
        flow.onGridFocusMoved(1)
        server.enqueue(MockResponse().setResponseCode(500))
        flow.selectLibrary(1L)

        val failed = flow.state.value
        assertEquals("Не удалось открыть коллекцию", failed.error)
        assertEquals(2L, failed.libraryId)
        assertEquals(listOf("f-1", "f-2"), failed.items.map { it.id })
        assertEquals(1, failed.gridFocus)
        assertFalse(failed.isLoading)
        assertTrue(server.takeRequestOrFail("CollectionsTest.tv_module_select_walks_the_paged_items_stream").path!!.endsWith("library=1"))
        server.assertDrained("CollectionsTest.tv_module_select_walks_the_paged_items_stream", 4)
    }

    @Test
    fun select_library_closes_an_open_series_page() = runBlocking {
        server.enqueue(json(librariesBody()))
        server.enqueue(json(seriesBody()))
        flow.enter()
        server.takeRequestOrFail("CollectionsTest.select_library_closes_an_open_series_page")
        server.takeRequestOrFail("CollectionsTest.select_library_closes_an_open_series_page")

        // A series page is open: its episodes land, then the per-episode
        // progress walk (2.2 — one GET per served row).
        server.enqueue(json(episodesBody()))
        server.enqueue(json(progressBody("e-1", 60)))
        server.enqueue(json(progressBody("e-2", 120)))
        flow.openSeries(SeriesDto(id = "s-1", displayName = "Сага"))
        repeat(3) { server.takeRequestOrFail("CollectionsTest.select_library_closes_an_open_series_page") }
        assertEquals("s-1", flow.state.value.selectedSeries?.id)

        // The switch's fresh-body law (8.9 — the operator's live-box report:
        // the old collection's episode page must not ride over the new
        // body): the series page, its rows and its positions close WITH
        // the old collection. The movie module fetches no body at all.
        flow.selectLibrary(2L)

        val state = flow.state.value
        assertEquals(2L, state.libraryId)
        assertNull(state.selectedSeries)
        assertEquals(emptyList<ItemDto>(), state.episodes)
        assertEquals(emptyMap<String, Long>(), state.positions)
        assertTrue(state.isBodyOpen)
        assertEquals(5, server.requestCount)

        // A FAILED switch keeps the open series page (the failure law —
        // whatever was on screen is kept): the trio reverts with the body.
        server.enqueue(json(episodesBody()))
        server.enqueue(json(progressBody("e-1", 60)))
        server.enqueue(json(progressBody("e-2", 120)))
        flow.openSeries(SeriesDto(id = "s-1", displayName = "Сага"))
        repeat(3) { server.takeRequestOrFail("CollectionsTest.select_library_closes_an_open_series_page") }
        server.enqueue(MockResponse().setResponseCode(500))
        flow.selectLibrary(1L)

        val failed = flow.state.value
        assertEquals("Не удалось открыть коллекцию", failed.error)
        assertEquals(2L, failed.libraryId)
        assertEquals("s-1", failed.selectedSeries?.id)
        assertEquals(listOf("e-1", "e-2"), failed.episodes.map { it.id })
        server.assertDrained("CollectionsTest.select_library_closes_an_open_series_page", 9)
    }
}
