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
import tv.mellifera.browse.fixtures.librariesBody
import tv.mellifera.browse.fixtures.moviesBody
import tv.mellifera.browse.fixtures.seriesBody
import tv.mellifera.net.Api

/**
 * The collections rail law (5.15 — the SPA sidebar as remote-native
 * navigation, carried by BrowseState): opening lands the rail cursor on
 * the CURRENT collection's row and fires the counts once, closing (LEFT or
 * Back — one flow entry) keeps the grid's parked cursor, and selecting a
 * row swaps the grid to a fresh cursor-0 surface with the rail closed.
 */
class RailLawTest {
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
        """{"library_id":$libraryId,"items":$items}"""

    private fun enqueueEnter() {
        server.enqueue(json(librariesBody()))
        server.enqueue(json(seriesBody()))
    }

    @Test
    fun rail_opens_at_current_collection() = runBlocking {
        enqueueEnter()
        flow.enter()
        // A closed rail fired NO summary requests (the closed-panel D1 law):
        // enter()'s sequence is libraries → the first collection's series.
        assertEquals(2, server.requestCount)

        // Make the CURRENT collection the second served row, then open.
        server.enqueue(json(moviesBody()))
        flow.selectLibrary(2L)
        server.enqueue(json(summaryBody(libraryId = 1, items = 7)))
        server.enqueue(json(summaryBody(libraryId = 2, items = 42)))
        flow.openRail()

        val state = flow.state.value
        assertTrue(state.railOpen)
        // The initial-focus law carried into the rail: the cursor sits on
        // the CURRENT collection's row (library 2 = index 1), never row 0.
        assertEquals(1, state.railFocus)
        // The counts fired exactly once, in served order.
        server.takeRequest() // /libraries
        server.takeRequest() // /series?library=1
        server.takeRequest() // /series?library=2
        assertEquals("/api/v1/libraries/1/summary", server.takeRequest().path)
        assertEquals("/api/v1/libraries/2/summary", server.takeRequest().path)
        assertEquals(5, server.requestCount)
        assertEquals(42L, state.summaries[2L]?.items)

        // Idempotent: re-opening an open rail neither moves the cursor nor
        // re-fires a single summary request.
        flow.openRail()
        assertTrue(flow.state.value.railOpen)
        assertEquals(1, flow.state.value.railFocus)
        assertEquals(5, server.requestCount)
    }

    @Test
    fun rail_left_or_back_closes_keeps_grid_focus() = runBlocking {
        enqueueEnter()
        flow.enter()
        server.takeRequest()
        server.takeRequest()

        // Park the grid cursor mid-grid, open the rail, walk it down.
        flow.onGridFocusMoved(1)
        server.enqueue(json(summaryBody(libraryId = 1, items = 7)))
        server.enqueue(json(summaryBody(libraryId = 2, items = 42)))
        flow.openRail()
        flow.onRailFocusMoved(1)
        assertTrue(flow.state.value.railOpen)
        assertEquals(1, flow.state.value.railFocus)

        // LEFT or Back route to the SAME flow entry (closeRail): only the
        // rail closes — the grid's parked cursor, rows and collection are
        // exactly where they were (the no-restart law).
        flow.closeRail()

        val state = flow.state.value
        assertFalse(state.railOpen)
        assertEquals(1, state.gridFocus)
        assertEquals(1L, state.libraryId)
        assertEquals(listOf("s-1", "s-2"), state.series.map { it.id })
        assertNull(state.error)
    }

    @Test
    fun rail_select_swaps_grid_resets_cursor() = runBlocking {
        enqueueEnter()
        flow.enter()
        server.takeRequest()
        server.takeRequest()

        // Park the cursor to prove the swap resets it: OK on the rail's
        // second row selects library 2 — a new collection is a fresh grid.
        flow.onGridFocusMoved(1)
        server.enqueue(json(summaryBody(libraryId = 1, items = 7)))
        server.enqueue(json(summaryBody(libraryId = 2, items = 42)))
        flow.openRail()
        flow.onRailFocusMoved(1)
        server.enqueue(json(moviesBody()))
        flow.selectLibrary(2L)
        flow.closeRail()

        val state = flow.state.value
        assertFalse(state.railOpen)
        assertEquals(2L, state.libraryId)
        assertEquals(listOf("m-1", "m-2"), state.series.map { it.id })
        assertEquals(0, state.gridFocus)
        assertNull(state.error)
        // drain openRail's two summary legs, then the switch's fetch
        server.takeRequest()
        server.takeRequest()
        assertEquals("/api/v1/series?library=2", server.takeRequest().path)

        // A FAILED select from the rail keeps the prior grid (the flow's
        // failure law) and the rail still closes.
        flow.onGridFocusMoved(1)
        server.enqueue(MockResponse().setResponseCode(500)) // lib 1 summary
        server.enqueue(MockResponse().setResponseCode(500)) // lib 2 summary
        flow.openRail()
        server.enqueue(MockResponse().setResponseCode(500))
        flow.selectLibrary(1L)
        flow.closeRail()

        val failed = flow.state.value
        assertFalse(failed.railOpen)
        assertEquals("Не удалось открыть коллекцию", failed.error)
        assertEquals(2L, failed.libraryId)
        assertEquals(listOf("m-1", "m-2"), failed.series.map { it.id })
        assertEquals(1, failed.gridFocus)
    }
}
