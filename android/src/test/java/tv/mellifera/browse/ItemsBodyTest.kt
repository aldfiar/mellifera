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
import tv.mellifera.browse.fixtures.facetsBody
import tv.mellifera.browse.fixtures.foldersBody
import tv.mellifera.browse.fixtures.librariesBody
import tv.mellifera.browse.fixtures.photoItemsBody
import tv.mellifera.browse.fixtures.photoLibrariesBody
import tv.mellifera.browse.fixtures.tvLibrariesBody
import tv.mellifera.net.Api
import tv.mellifera.takeRequestOrFail

/**
 * The tv/image bodies' flow laws (design D6, task 4.1): the paged stream
 * appends page by page as the cursor reaches the loaded end and stands down
 * at a short page; a chip pick server-filters the SAME stream (path_prefix /
 * top_level=true) and restarts it at offset 0; the folder rows are
 * best-effort; a failed pick keeps the prior stream.
 */
class ItemsBodyTest {
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

    /** A FULL page (50 rows — PAGE_SIZE) starting at [from]: the page the
     * append trigger keeps walking through. */
    private fun fullPage(prefix: String, from: Int): String {
        val rows = (from until from + 50).joinToString(",") { i ->
            """{"id":"$prefix-$i","module_id":"tv","library_id":2,
                "relative_path":"X$i (2000).mkv","media_type":"tv","document":{},
                "schema_version":1,"status":"active","title_override":"",
                "display_name":"X$i"}""".replace("\n", "").replace(Regex("\\s+"), " ").trim()
        }
        return """{"items":[$rows]}"""
    }

    /** The EMPTY page — the honest end-of-stream marker. */
    private val emptyPage = """{"items":[]}"""

    @Test
    fun extend_appends_pages_until_the_stream_ends() = runBlocking {
        server.enqueue(json(tvLibrariesBody()))
        server.enqueue(json(facetsBody()))
        server.enqueue(json(EMPTY_SERIES))
        flow.enter()
        server.enqueue(json(fullPage("f", 0)))
        flow.selectLibrary(2L)
        server.takeRequestOrFail("ItemsBodyTest.extend_appends_pages_until_the_stream_ends") // /libraries
        server.takeRequestOrFail("ItemsBodyTest.extend_appends_pages_until_the_stream_ends") // /libraries/1/facets (10.1)
        server.takeRequestOrFail("ItemsBodyTest.extend_appends_pages_until_the_stream_ends") // /series?library=1
        server.takeRequestOrFail("ItemsBodyTest.extend_appends_pages_until_the_stream_ends") // /items page 0
        assertEquals(50, flow.state.value.items.size)
        assertFalse(flow.state.value.isStreamExhausted)

        // The cursor landed on the LAST loaded card: the next page fetches
        // and APPENDS — the walk continues into the new rows, offset 50.
        server.enqueue(json(fullPage("f", 50)))
        flow.extendItems()
        assertEquals(100, flow.state.value.items.size)
        assertEquals("f-50", flow.state.value.items[50].id)
        assertEquals(50, flow.state.value.itemsOffset)
        assertEquals("/api/v1/items?library=2&limit=50&offset=50", server.takeRequestOrFail("ItemsBodyTest.extend_appends_pages_until_the_stream_ends").path)

        // The stream ends: the empty page appends nothing and marks the
        // stream exhausted — the trigger stands down and fires NOTHING
        // further.
        server.enqueue(json(emptyPage))
        flow.extendItems()
        assertEquals(100, flow.state.value.items.size)
        assertTrue(flow.state.value.isStreamExhausted)
        flow.extendItems()
        assertEquals(6, server.requestCount)
    }

    @Test
    fun extend_is_idempotent_outside_the_paged_bodies() = runBlocking {
        server.enqueue(json(librariesBody()))
        server.enqueue(json(facetsBody()))
        server.enqueue(json(EMPTY_SERIES))
        flow.enter()
        repeat(3) { server.takeRequestOrFail("ItemsBodyTest.extend_is_idempotent_outside_the_paged_bodies") }

        // The serial body pages nothing (5.14's whole-grid law): the append
        // trigger fires NO request there.
        flow.extendItems()
        assertEquals(3, server.requestCount)

        // The unknown module's honest empty: extend fires nothing either.
        flow.selectLibrary(2L)
        flow.extendItems()
        assertEquals(3, server.requestCount)
        assertTrue(flow.state.value.items.isEmpty())
    }

    @Test
    fun image_body_loads_folders_and_top_level_chip_uses_top_level_param() = runBlocking {
        server.enqueue(json(photoLibrariesBody()))
        server.enqueue(json(facetsBody()))
        server.enqueue(json(EMPTY_SERIES))
        flow.enter()
        server.enqueue(json(foldersBody()))
        server.enqueue(json(photoItemsBody()))
        flow.selectLibrary(2L)
        server.takeRequestOrFail("ItemsBodyTest.image_body_loads_folders_and_top_level_chip_uses_top_level_param") // /libraries
        server.takeRequestOrFail("ItemsBodyTest.image_body_loads_folders_and_top_level_chip_uses_top_level_param") // /libraries/1/facets (10.1)
        server.takeRequestOrFail("ItemsBodyTest.image_body_loads_folders_and_top_level_chip_uses_top_level_param") // /series?library=1
        server.takeRequestOrFail("ItemsBodyTest.image_body_loads_folders_and_top_level_chip_uses_top_level_param") // /libraries/2/folders
        server.takeRequestOrFail("ItemsBodyTest.image_body_loads_folders_and_top_level_chip_uses_top_level_param") // /items page 0

        // The served folder rows landed verbatim (top-level files report
        // path ""); the grid walks the unfiltered stream first.
        assertEquals(listOf("", "2026", "nature"), flow.state.value.folders.map { it.path })
        assertEquals(listOf(12L, 9L, 30L), flow.state.value.folders.map { it.items })
        assertNull(flow.state.value.folder)

        // The top-level chip's pick (path "") rides top_level=true and
        // RESTARTS at offset 0 — the same stream the counts count.
        server.enqueue(json(photoItemsBody()))
        flow.pickFolder("")
        assertEquals("", flow.state.value.folder)
        assertEquals(0, flow.state.value.itemsOffset)
        assertEquals(0, flow.state.value.gridFocus)
        assertEquals(
            "/api/v1/items?library=2&top_level=true&limit=50&offset=0",
            server.takeRequestOrFail("ItemsBodyTest.image_body_loads_folders_and_top_level_chip_uses_top_level_param").path,
        )

        // A named folder's pick rides path_prefix on the same law.
        server.enqueue(json(photoItemsBody()))
        flow.pickFolder("nature")
        assertEquals("nature", flow.state.value.folder)
        assertEquals(
            "/api/v1/items?library=2&path_prefix=nature&limit=50&offset=0",
            server.takeRequestOrFail("ItemsBodyTest.image_body_loads_folders_and_top_level_chip_uses_top_level_param").path,
        )
        // The queue drained: enter's three + folders + the items page + the
        // two picks' refetches — all seven answered.
        server.assertDrained("ItemsBodyTest.image_body_loads_folders_and_top_level_chip_uses_top_level_param", 7)
    }

    @Test
    fun folders_failure_degrades_to_the_bare_all_chip() = runBlocking {
        server.enqueue(json(photoLibrariesBody()))
        server.enqueue(json(facetsBody()))
        server.enqueue(json(EMPTY_SERIES))
        flow.enter()
        server.enqueue(MockResponse().setResponseCode(500))
        server.enqueue(json(photoItemsBody()))
        flow.selectLibrary(2L)
        repeat(3) { server.takeRequestOrFail("ItemsBodyTest.folders_failure_degrades_to_the_bare_all_chip") }

        // The failed folders read degrades to the bare [Все] chip — never
        // an error, never a placeholder row; the items stream still landed.
        assertTrue(flow.state.value.folders.isEmpty())
        assertNull(flow.state.value.error)
        assertEquals(listOf("p-1", "p-2"), flow.state.value.items.map { it.id })
        server.assertDrained("ItemsBodyTest.folders_failure_degrades_to_the_bare_all_chip", 5)
    }

    @Test
    fun failed_pick_keeps_the_prior_stream() = runBlocking {
        server.enqueue(json(photoLibrariesBody()))
        server.enqueue(json(facetsBody()))
        server.enqueue(json(EMPTY_SERIES))
        flow.enter()
        server.enqueue(json(foldersBody()))
        server.enqueue(json(photoItemsBody()))
        flow.selectLibrary(2L)
        repeat(3) { server.takeRequestOrFail("ItemsBodyTest.failed_pick_keeps_the_prior_stream") }
        repeat(2) { server.takeRequestOrFail("ItemsBodyTest.failed_pick_keeps_the_prior_stream") }
        val priorItems = flow.state.value.items

        // The filtered refetch fails: the PRIOR stream stays on screen, the
        // folder reverts, the honest RU error surfaces (the flow's failure
        // law — never a wiped body).
        server.enqueue(MockResponse().setResponseCode(500))
        flow.pickFolder("nature")

        val failed = flow.state.value
        assertEquals("Не удалось загрузить элементы", failed.error)
        assertNull(failed.folder)
        assertEquals(priorItems.map { it.id }, failed.items.map { it.id })
        assertFalse(failed.isLoading)
        server.assertDrained("ItemsBodyTest.failed_pick_keeps_the_prior_stream", 6)
    }

    private companion object {
        /** The serial body's empty grid (only the module-keyed legs matter here). */
        const val EMPTY_SERIES = """{"items":[]}"""
    }
}
