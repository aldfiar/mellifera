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
import tv.mellifera.browse.fixtures.foldersBody
import tv.mellifera.browse.fixtures.photoItemsBody
import tv.mellifera.browse.fixtures.photoLibrariesBody
import tv.mellifera.net.Api
import tv.mellifera.takeRequestOrFail

/**
 * The collection body's Back law (task 8.7 — the back-stack hole the
 * on-device walk found: with the series/rail/chips handlers all disabled,
 * ONE Back on the opened body fell through to the Activity default and
 * EXITED to the launcher). The SPA route parity: the web Collection is a
 * route, back returns home — an EXPLICITLY opened body (a successful
 * rail-row OK) closes onto the home rows and the home restore stages
 * through the SAME flag the rail close rides (shouldRestoreHome). The
 * chips-focused Back keeps ITS law: unfocus to the grid inside the body —
 * the filter stays, never a wipe, never an exit.
 *
 * Task 15.2's clean law (the operator directive «each collection enter
 * should clean previous collection data»): the close is CLOSE + CLEAR —
 * the TWELVE body fields reset to fresh-body defaults while libraryId,
 * summaries and railFocus are kept, the entry serves /libraries alone (no
 * default body), and isBodyOpen=true ⇒ an explicit activation (the 8.8
 * raise made structural).
 */
class BodyBackTest {
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

    /**
     * Reach the OPENED image body through the rail: enter (libraries
     * alone — 15.2's clean-entry law), the rail with its summaries, then
     * the row OK (folders + first items page). Returns with the body
     * open, cursor 0, the chips row served.
     */
    private fun openImageBodyThroughTheRail() = runBlocking {
        server.enqueue(json(photoLibrariesBody()))
        flow.enter()
        server.takeRequestOrFail("BodyBackTest") // /libraries — the entry's ONLY request (15.2)
        server.enqueue(json(summaryBody(libraryId = 1, items = 7)))
        server.enqueue(json(summaryBody(libraryId = 2, items = 42)))
        flow.openRail()
        server.takeRequestOrFail("BodyBackTest") // summaries × 2
        server.takeRequestOrFail("BodyBackTest")
        flow.onRailFocusMoved(1)
        server.enqueue(json(foldersBody()))
        server.enqueue(json(photoItemsBody()))
        assertTrue(flow.activateRailRow())
        server.takeRequestOrFail("BodyBackTest") // /libraries/2/folders
        server.takeRequestOrFail("BodyBackTest") // /items?library=2&limit=50&offset=0

        val opened = flow.state.value
        assertTrue(opened.isBodyOpen) // the activation OPENS the body (8.7)
        assertEquals(2L, opened.libraryId)
        assertEquals(3, opened.folders.size)
        assertFalse(opened.isRailOpen)
        assertEquals(-1, opened.chipFocus)
    }

    @Test
    fun body_back_closes_and_clears_staging_the_home_restore() = runBlocking {
        openImageBodyThroughTheRail()

        // Park the grid cursor mid-body and pick a folder — the exact
        // walk-found posture the exit hole was found in (the pick's grid
        // re-land pulled focus off the chips row, whose focus-loss clears
        // the chips cursor — clearChipFocus, the UI's onFocusChanged act).
        flow.onGridFocusMoved(1)
        flow.onChipFocusMoved(2)
        server.enqueue(json(photoItemsBody()))
        flow.pickFolder("nature")
        flow.clearChipFocus()
        assertEquals("nature", flow.state.value.folder)
        flow.onGridFocusMoved(1) // the cursor parks mid-body again

        // The body-open BACK: consumed by the fourth handler's flow entry —
        // the body CLOSES + CLEARS onto the home rows (15.2), the restore
        // stages.
        flow.closeBody()

        val state = flow.state.value
        assertFalse(state.isBodyOpen)
        // The restore rides the SAME flag the rail close rides: HomeRows'
        // actuator re-lands the parked home cursor and its focus→scroll
        // carries the viewport back to the rows.
        assertTrue(state.shouldRestoreHome)
        // The KEPT trio (15.2): the rail's selected marker, its counts and
        // its cursor survive the close.
        assertEquals(2L, state.libraryId)
        assertEquals(1, state.railFocus)
        assertEquals(42L, state.summaries[2L]?.items)
        // The TWELVE cleared — the minimal state law (audit §B): a closed
        // body leaves nothing behind, the next activation is a fresh body.
        assertEquals(emptyList<Any>(), state.series)
        assertEquals(emptyList<Any>(), state.items)
        assertEquals(emptyList<Any>(), state.folders)
        assertEquals(emptyList<Any>(), state.facets)
        assertEquals(emptyMap<String, String>(), state.facetSelection)
        assertNull(state.folder) // the picked «nature» filter is gone
        assertEquals(0, state.itemsOffset)
        assertFalse(state.isStreamExhausted)
        assertEquals(-1, state.chipFocus)
        assertNull(state.photoIndex)
        assertEquals(0, state.gridFocus)
        assertEquals(emptyMap<String, Long>(), state.positions)
        assertNull(state.error)
        assertFalse(state.isLoading)
        // The close is a state flip, never a fetch — the walked six
        // requests (enter, summaries × 2, folders + the two items pages)
        // were ALL the traffic.
        server.assertDrained("BodyBackTest.body_back_closes_and_clears_staging_the_home_restore", 6)
    }

    @Test
    fun body_back_never_stages_a_restore_for_an_unopened_body() = runBlocking {
        openImageBodyThroughTheRail()
        flow.closeBody()
        assertTrue(flow.state.value.shouldRestoreHome)

        // Leave the home rows for the rail posture: a rail open from the
        // GRID hands the restore back (fromHome=false), a plain close keeps
        // it standing down.
        server.enqueue(json(summaryBody(libraryId = 1, items = 7)))
        server.enqueue(json(summaryBody(libraryId = 2, items = 42)))
        flow.openRail()
        flow.closeRail()
        assertFalse(flow.state.value.shouldRestoreHome)

        // The GUARD: a body that was never opened stages no restore — Back
        // there is the app's own exit (D12's grid law), never a phantom
        // home grab.
        flow.closeBody()

        val state = flow.state.value
        assertFalse(state.isBodyOpen)
        assertFalse(state.shouldRestoreHome)
        assertEquals(2L, state.libraryId) // the close law's kept marker
        assertEquals(emptyList<Any>(), state.items) // cleared by the first close
        server.assertDrained("BodyBackTest.body_back_never_stages_a_restore_for_an_unopened_body", 7)
    }

    @Test
    fun chips_back_unfocuses_to_the_grid_inside_the_body() = runBlocking {
        openImageBodyThroughTheRail()
        flow.onChipFocusMoved(1)
        assertEquals(1, flow.state.value.chipFocus)

        // The chips-focused BACK (D12's law, unchanged by 8.7/15.2): focus
        // returns to the parked grid cursor — the nonce bump is the
        // re-land — and the body STAYS OPEN. Never a state wipe, never an
        // exit: the filter and the served stream keep riding.
        flow.refocusGridFromChips()

        val state = flow.state.value
        assertEquals(-1, state.chipFocus)
        // The activation's re-land staged nonce 1; the chips Back bumps it
        // to 2 — the grid cursor's re-request.
        assertEquals(2, state.gridFocusNonce)
        assertTrue(state.isBodyOpen) // chips Back lands INSIDE the body
        assertFalse(state.shouldRestoreHome) // no home restore staged
        assertNull(state.folder) // the [Все] filter, untouched
        assertEquals(listOf("p-1", "p-2"), state.items.map { it.id })
        assertEquals(3, state.folders.size)
        server.assertDrained("BodyBackTest.chips_back_unfocuses_to_the_grid_inside_the_body", 5)
    }

    @Test
    fun every_explicit_activation_raises_bodyOpen_the_anchor_path_included() = runBlocking {
        // The 8.8 walk36 leg-D trap: the rail-row OK was isBodyOpen's ONLY
        // raiser, so an activation that rode the fetch-bearing
        // selectLibrary path WITHOUT the rail (the anchor-card OK on the
        // restored home) left the body the active surface with the
        // BackHandler chain fully disabled — ONE BACK exited to the
        // launcher. The raise now lives at the SHARED activation commit:
        // the same selectLibrary call with NO rail open must hold the
        // opened body's Back law.
        server.enqueue(json(photoLibrariesBody()))
        flow.enter()
        server.takeRequestOrFail("BodyBackTest.every_explicit_activation_raises_bodyOpen_the_anchor_path_included") // /libraries

        server.enqueue(json(foldersBody()))
        server.enqueue(json(photoItemsBody()))
        assertTrue(flow.selectLibrary(2L)) // the anchor path: no rail involved
        server.takeRequestOrFail("BodyBackTest.every_explicit_activation_raises_bodyOpen_the_anchor_path_included") // /libraries/2/folders
        server.takeRequestOrFail("BodyBackTest.every_explicit_activation_raises_bodyOpen_the_anchor_path_included") // /items?library=2&limit=50&offset=0

        val activated = flow.state.value
        assertTrue(activated.isBodyOpen) // the SHARED commit raised it (8.8)
        assertEquals(2L, activated.libraryId)

        // BACK consumed → home: closeBody closes + clears and stages the
        // restore.
        flow.closeBody()
        val closed = flow.state.value
        assertFalse(closed.isBodyOpen)
        assertTrue(closed.shouldRestoreHome)
        server.assertDrained(
            "BodyBackTest.every_explicit_activation_raises_bodyOpen_the_anchor_path_included", 3)
    }

    @Test
    fun entry_serves_libraries_alone_the_first_body_fetches_at_activation() = runBlocking {
        // The clean-entry law (15.2): enter() serves /libraries ALONE — no
        // default body loads; the first served collection is adopted as
        // libraryId (the rail's selected marker and refresh()'s target)
        // while the body fields stay at their fresh defaults.
        server.enqueue(json(photoLibrariesBody()))
        flow.enter()
        server.takeRequestOrFail("BodyBackTest.entry_serves_libraries_alone_the_first_body_fetches_at_activation") // /libraries

        val entered = flow.state.value
        assertFalse(entered.isBodyOpen)
        assertEquals(1L, entered.libraryId)
        assertEquals(emptyList<Any>(), entered.series)
        assertEquals(emptyList<Any>(), entered.items)
        assertFalse(entered.isLoading)

        // The guard: closeBody stages no restore for an unopened body —
        // the fourth BackHandler would not even be enabled.
        flow.closeBody()
        assertFalse(flow.state.value.isBodyOpen)
        assertFalse(flow.state.value.shouldRestoreHome)

        // The FIRST body fetches at the first explicit activation.
        server.enqueue(json(foldersBody()))
        server.enqueue(json(photoItemsBody()))
        assertTrue(flow.selectLibrary(2L))
        val activated = flow.state.value
        assertTrue(activated.isBodyOpen)
        assertEquals(listOf("p-1", "p-2"), activated.items.map { it.id })
        server.assertDrained(
            "BodyBackTest.entry_serves_libraries_alone_the_first_body_fetches_at_activation", 3)
    }

    @Test
    fun refresh_after_close_refetches_the_kept_libraryId_into_the_unmounted_body() = runBlocking {
        // The 15.2 pin: refresh() stays ungated — after a close it
        // refetches the KEPT libraryId into the UNMOUNTED state, invisible
        // and harmless (pinned, not changed).
        openImageBodyThroughTheRail()
        flow.closeBody()
        assertTrue(flow.state.value.shouldRestoreHome)

        // The player-exit refresh rides the kept libraryId (2, image): the
        // unfiltered first page refetches at offset 0 (the close cleared
        // the folder filter).
        server.enqueue(json(photoItemsBody()))
        flow.refresh()
        assertEquals(
            "/api/v1/items?library=2&limit=50&offset=0",
            server.takeRequestOrFail("BodyBackTest.refresh_after_close_refetches_the_kept_libraryId_into_the_unmounted_body").path,
        )

        val state = flow.state.value
        // Harmless: the body STAYS unmounted — the refetched rows land into
        // state no surface renders.
        assertFalse(state.isBodyOpen)
        assertTrue(state.shouldRestoreHome)
        assertEquals(2L, state.libraryId)
        assertEquals(listOf("p-1", "p-2"), state.items.map { it.id })
        assertNull(state.error)
        server.assertDrained(
            "BodyBackTest.refresh_after_close_refetches_the_kept_libraryId_into_the_unmounted_body", 6)
    }
}
