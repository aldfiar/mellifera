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
import tv.mellifera.browse.fixtures.seriesBody
import tv.mellifera.net.Api
import tv.mellifera.takeRequestOrFail

/**
 * The collection body's Back law (task 8.7 — the back-stack hole the
 * on-device walk found: with the series/rail/chips handlers all disabled,
 * ONE Back on the opened body fell through to the Activity default and
 * EXITED to the launcher). The SPA route parity: the web Collection is a
 * route, back returns home — an EXPLICITLY opened body (a successful
 * rail-row OK) closes onto the home rows under the no-restart law, the
 * home restore stages through the SAME flag the rail close rides
 * (shouldRestoreHome), and a body never opened stages no restore (D12's
 * grid Back law — exit — stands for the entry body). The chips-focused
 * Back keeps ITS law: unfocus to the grid inside the body — the filter
 * stays, never a wipe, never an exit.
 *
 * Task 8.8 widens the raise: isBodyOpen is set at the SHARED
 * explicit-activation commit (selectLibrary's success) — every path that
 * renders the body as the active surface raises it there, the walk36
 * leg-D anchor path included, and the entry default body stays unopened
 * (D12's exit law) with closeBody's clear as the only false transition.
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
     * Enter over serial + image and reach the OPENED image body through the
     * rail: the walk-found path (rail OK → folders + first items page).
     * Returns with the body open, cursor 0, the chips row served.
     */
    private fun openImageBodyThroughTheRail() = runBlocking {
        server.enqueue(json(photoLibrariesBody()))
        server.enqueue(json(seriesBody()))
        flow.enter()
        server.takeRequestOrFail("BodyBackTest") // /libraries
        server.takeRequestOrFail("BodyBackTest") // /series?library=1
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
    fun body_back_closes_the_body_and_stages_the_home_restore() = runBlocking {
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
        // the body CLOSES onto the home rows and the restore stages.
        flow.closeBody()

        val state = flow.state.value
        assertFalse(state.isBodyOpen)
        // The restore rides the SAME flag the rail close rides: HomeRows'
        // actuator re-lands the parked home cursor and its focus→scroll
        // carries the viewport back to the rows.
        assertTrue(state.shouldRestoreHome)
        // The no-restart law (L3): the loaded body, its filter, cursors and
        // the rail's state are ALL untouched — DOWN re-enters the same
        // filtered body; reopening the rail lands on the current collection.
        assertEquals(2L, state.libraryId)
        assertEquals("nature", state.folder)
        assertEquals(listOf("p-1", "p-2"), state.items.map { it.id })
        assertEquals(3, state.folders.size)
        assertEquals(1, state.gridFocus)
        assertEquals(1, state.railFocus)
        assertEquals(-1, state.chipFocus)
        assertNull(state.error)
        assertFalse(state.isLoading)
        // The close is a state flip, never a fetch — the walked seven
        // requests (enter × 2, summaries × 2, folders + the two items
        // pages) were ALL the traffic.
        server.assertDrained("BodyBackTest.body_back_closes_the_body_and_stages_the_home_restore", 7)
    }

    @Test
    fun body_back_never_stages_a_restore_for_an_unopened_body() = runBlocking {
        openImageBodyThroughTheRail()
        flow.closeBody()
        assertTrue(flow.state.value.shouldRestoreHome)

        // Leave the home rows for the entry-grid posture: a rail open from
        // the GRID hands the restore back (fromHome=false), a plain close
        // keeps it standing down.
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
        assertEquals(2L, state.libraryId)
        assertEquals(listOf("p-1", "p-2"), state.items.map { it.id })
        server.assertDrained("BodyBackTest.body_back_never_stages_a_restore_for_an_unopened_body", 8)
    }

    @Test
    fun chips_back_unfocuses_to_the_grid_inside_the_body() = runBlocking {
        openImageBodyThroughTheRail()
        flow.onChipFocusMoved(1)
        assertEquals(1, flow.state.value.chipFocus)

        // The chips-focused BACK (D12's law, unchanged by 8.7): focus
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
        server.assertDrained("BodyBackTest.chips_back_unfocuses_to_the_grid_inside_the_body", 6)
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
        server.enqueue(json(seriesBody()))
        flow.enter()
        server.takeRequestOrFail("BodyBackTest.every_explicit_activation_raises_bodyOpen_the_anchor_path_included") // /libraries
        server.takeRequestOrFail("BodyBackTest.every_explicit_activation_raises_bodyOpen_the_anchor_path_included") // /series?library=1

        server.enqueue(json(foldersBody()))
        server.enqueue(json(photoItemsBody()))
        assertTrue(flow.selectLibrary(2L)) // the anchor path: no rail involved
        server.takeRequestOrFail("BodyBackTest.every_explicit_activation_raises_bodyOpen_the_anchor_path_included") // /libraries/2/folders
        server.takeRequestOrFail("BodyBackTest.every_explicit_activation_raises_bodyOpen_the_anchor_path_included") // /items?library=2&limit=50&offset=0

        val activated = flow.state.value
        assertTrue(activated.isBodyOpen) // the SHARED commit raised it (8.8)
        assertEquals(2L, activated.libraryId)

        // BACK consumed → home: closeBody clears and stages the restore.
        flow.closeBody()
        val closed = flow.state.value
        assertFalse(closed.isBodyOpen)
        assertTrue(closed.shouldRestoreHome)
        server.assertDrained(
            "BodyBackTest.every_explicit_activation_raises_bodyOpen_the_anchor_path_included", 4)
    }

    @Test
    fun entry_default_body_stays_unopened_back_exits_per_d12() = runBlocking {
        // The entry default body is NOT an opened one: no explicit
        // activation ran (enter loads it directly), so isBodyOpen stays
        // down and the grid keeps D12's Back law — exit, never a phantom
        // home restore.
        server.enqueue(json(photoLibrariesBody()))
        server.enqueue(json(seriesBody()))
        flow.enter()
        server.takeRequestOrFail("BodyBackTest.entry_default_body_stays_unopened_back_exits_per_d12") // /libraries
        server.takeRequestOrFail("BodyBackTest.entry_default_body_stays_unopened_back_exits_per_d12") // /series?library=1

        assertFalse(flow.state.value.isBodyOpen)

        // The guard: closeBody stages no restore for an unopened body —
        // the fourth BackHandler would not even be enabled.
        flow.closeBody()
        val state = flow.state.value
        assertFalse(state.isBodyOpen)
        assertFalse(state.shouldRestoreHome)
        server.assertDrained("BodyBackTest.entry_default_body_stays_unopened_back_exits_per_d12", 2)
    }
}
