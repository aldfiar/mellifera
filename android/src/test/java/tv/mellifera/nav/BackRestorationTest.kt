package tv.mellifera.nav

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import tv.mellifera.AppViewModel
import tv.mellifera.Screen
import tv.mellifera.dpad.DpadKey
import tv.mellifera.dpad.moveInGrid
import tv.mellifera.pairing.InMemorySessionBacking
import tv.mellifera.pairing.SessionStore

/**
 * The back-restoration law (5.9), pinned over the REAL browse flow on a
 * MockWebServer: navigate the grid (focus moves through the pure dpad
 * law), open a series, press Back — the grid returns with its PRIOR FOCUS
 * POSITION, not a restart at card 0 (the classic TV failure mode).
 */
class BackRestorationTest {
    private lateinit var server: MockWebServer
    private lateinit var store: SessionStore
    private lateinit var viewModel: AppViewModel

    /** The series grid renders 4 cards per row (BrowseScreen's law input). */
    private val gridColumns = 4

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

    /** Two full rows of series — enough grid to move within a row. */
    private fun eightSeriesBody(): String = """
    {"items":[${
        (1..8).joinToString(",") { i ->
            """
      {"id":"s-$i","module_id":"serial","library_id":1,"relative_path":"S$i",
       "document":{},"schema_version":4,"status":"active","title_override":"",
       "display_name":"Сериал $i"}
"""
        }
    }]}
""".trimIndent()

    private fun episodesBody(seriesId: String): String = """
    {"items":[
      {"id":"$seriesId-e1","module_id":"serial","library_id":1,"file_id":"f-1",
       "relative_path":"s01e01.mkv","media_type":"serial",
       "document":{},"schema_version":1,"status":"active","title_override":"",
       "display_name":"Серия 1"}
    ]}
""".trimIndent()

    @Test
    fun grid_focus_restored_after_back() = runBlocking {
        assertEquals(Screen.Browse, viewModel.state.value.screen)
        server.enqueue(json(tv.mellifera.browse.fixtures.librariesBody()))
        server.enqueue(json(eightSeriesBody()))
        val browse = viewModel.browse
        browse.enter()
        val before = browse.state.value
        assertEquals(8, before.series.size)
        assertEquals(0, before.gridFocus)

        // Navigate: three Rights on the first row — through the pure law,
        // exactly as the composable wiring routes them.
        var cursor = before.gridFocus
        repeat(3) {
            cursor = moveInGrid(cursor, gridColumns, before.series.size, DpadKey.Right)
            browse.onGridFocusMoved(cursor)
        }
        assertEquals(3, browse.state.value.gridFocus)

        // Into the series page — the grid cursor PARKS, episodes load.
        server.enqueue(json(episodesBody("s-4")))
        browse.openSeries(before.series[3])
        assertEquals("s-4", browse.state.value.selectedSeries?.id)
        assertEquals(3, browse.state.value.gridFocus)
        assertEquals(0, browse.state.value.episodeFocus)

        // Back: the grid returns at the SAME position — not a restart.
        browse.closeSeries()
        val restored = browse.state.value
        assertNull(restored.selectedSeries)
        assertEquals(3, restored.gridFocus)
        assertEquals(8, restored.series.size)
        assertEquals("s-4", restored.series[3].id)
    }
}
