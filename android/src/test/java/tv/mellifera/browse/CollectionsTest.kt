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
        assertEquals("/api/v1/libraries", server.takeRequest().path)
        assertEquals("/api/v1/series?library=1", server.takeRequest().path)
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
        server.takeRequest()
        server.takeRequest()
        // The answered summary maps through verbatim (updated_at served but
        // not carried — the decoder's unknown-keys law absorbed it).
        assertEquals(42L, state.summaries[1L]?.items)
        assertEquals(1L, state.summaries[1L]?.libraryId)
        // The failed summary degrades to a count-less row — never an error,
        // never a fabricated count.
        assertFalse(state.summaries.containsKey(2L))
        assertNull(state.error)
        // The walked summary routes, one per served collection, in order.
        assertEquals("/api/v1/libraries/1/summary", server.takeRequest().path)
        assertEquals("/api/v1/libraries/2/summary", server.takeRequest().path)
    }

    @Test
    fun select_library_swaps_grid() = runBlocking {
        server.enqueue(json(librariesBody()))
        server.enqueue(json(seriesBody()))
        flow.enter()
        server.takeRequest()
        server.takeRequest()

        // The switch walks GET /series?library={id} fetch-on-navigate; a new
        // collection is a fresh grid — the cursor resets to 0.
        flow.onGridFocusMoved(1)
        server.enqueue(json(moviesBody()))
        flow.selectLibrary(2L)

        val state = flow.state.value
        assertEquals(2L, state.libraryId)
        assertEquals(listOf("m-1", "m-2"), state.series.map { it.id })
        assertEquals(0, state.gridFocus)
        assertNull(state.error)
        assertEquals("/api/v1/series?library=2", server.takeRequest().path)

        // A FAILED switch keeps the prior grid: rows stay, the cursor and
        // libraryId revert, the honest RU error surfaces.
        flow.onGridFocusMoved(1)
        server.enqueue(MockResponse().setResponseCode(500))
        flow.selectLibrary(1L)

        val failed = flow.state.value
        assertEquals("Не удалось открыть коллекцию", failed.error)
        assertEquals(2L, failed.libraryId)
        assertEquals(listOf("m-1", "m-2"), failed.series.map { it.id })
        assertEquals(1, failed.gridFocus)
        assertFalse(failed.loading)
        assertTrue(server.takeRequest().path!!.endsWith("library=1"))
    }
}
