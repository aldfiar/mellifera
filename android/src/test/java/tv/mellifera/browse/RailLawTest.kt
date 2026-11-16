package tv.mellifera.browse

import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.yield
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
import tv.mellifera.browse.fixtures.librariesBody
import tv.mellifera.browse.fixtures.photoItemsBody
import tv.mellifera.browse.fixtures.photoLibrariesBody
import tv.mellifera.browse.fixtures.seriesBody
import tv.mellifera.browse.fixtures.tvItemsBody
import tv.mellifera.browse.fixtures.tvLibrariesBody
import tv.mellifera.net.Api
import tv.mellifera.takeRequestOrFail

/**
 * The collections rail law (5.15 — the SPA sidebar as remote-native
 * navigation, carried by BrowseState): opening lands the rail cursor on
 * the CURRENT collection's row and fires the counts once, closing (LEFT or
 * Back — one flow entry) keeps the grid's parked cursor, and selecting a
 * row (OK — the activation law, task 4.3) swaps the grid to a fresh
 * cursor-0 surface with the rail closed; a body that cannot open keeps the
 * rail open with its focus (the keep-focus law).
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

        // Make the CURRENT collection the second served row (an unknown
        // module — its body fires no fetch, D6), then open.
        flow.selectLibrary(2L)
        server.enqueue(json(summaryBody(libraryId = 1, items = 7)))
        server.enqueue(json(summaryBody(libraryId = 2, items = 42)))
        flow.openRail()

        val state = flow.state.value
        assertTrue(state.railOpen)
        // The initial-focus law carried into the rail: the cursor sits on
        // the CURRENT collection's row (library 2 = index 1), never row 0.
        assertEquals(1, state.railFocus)
        // The counts fired exactly once, in served order — and the unknown
        // module's switch added no request of its own.
        server.takeRequestOrFail("RailLawTest.rail_opens_at_current_collection") // /libraries
        server.takeRequestOrFail("RailLawTest.rail_opens_at_current_collection") // /series?library=1
        assertEquals("/api/v1/libraries/1/summary", server.takeRequestOrFail("RailLawTest.rail_opens_at_current_collection").path)
        assertEquals("/api/v1/libraries/2/summary", server.takeRequestOrFail("RailLawTest.rail_opens_at_current_collection").path)
        assertEquals(4, server.requestCount)
        assertEquals(42L, state.summaries[2L]?.items)

        // Idempotent: re-opening an open rail neither moves the cursor nor
        // re-fires a single summary request.
        flow.openRail()
        assertTrue(flow.state.value.railOpen)
        assertEquals(1, flow.state.value.railFocus)
        assertEquals(4, server.requestCount)
    }

    @Test
    fun rail_left_or_back_closes_keeps_grid_focus() = runBlocking {
        enqueueEnter()
        flow.enter()
        server.takeRequestOrFail("RailLawTest.rail_left_or_back_closes_keeps_grid_focus")
        server.takeRequestOrFail("RailLawTest.rail_left_or_back_closes_keeps_grid_focus")

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
        server.assertDrained("RailLawTest.rail_left_or_back_closes_keeps_grid_focus", 4)
    }

    @Test
    fun rail_walk_lands_clamped_inside_the_served_rows() = runBlocking {
        enqueueEnter()
        flow.enter()
        server.takeRequestOrFail("RailLawTest.rail_walk_lands_clamped_inside_the_served_rows")
        server.takeRequestOrFail("RailLawTest.rail_walk_lands_clamped_inside_the_served_rows")

        server.enqueue(json(summaryBody(libraryId = 1, items = 7)))
        server.enqueue(json(summaryBody(libraryId = 2, items = 42)))
        flow.openRail()
        server.takeRequestOrFail("RailLawTest.rail_walk_lands_clamped_inside_the_served_rows")
        server.takeRequestOrFail("RailLawTest.rail_walk_lands_clamped_inside_the_served_rows")

        // The walk's landing serves the clamp law: the rail cursor can never
        // aim outside the SERVED rows — past the last row clamps to it,
        // before the first clamps to row 0 (the same live-rows clamp as the
        // grid cursor), so UP/DOWN walking the open rail is a pure
        // cursor-in-state movement over exactly the rendered rows.
        flow.onRailFocusMoved(99)
        assertEquals(1, flow.state.value.railFocus)
        flow.onRailFocusMoved(-3)
        assertEquals(0, flow.state.value.railFocus)
        server.assertDrained("RailLawTest.rail_walk_lands_clamped_inside_the_served_rows", 4)
    }

    @Test
    fun rail_select_swaps_grid_resets_cursor() = runBlocking {
        // The tv library walks the paged items stream (D6) — a real fetch
        // swap to prove the reset law against.
        server.enqueue(json(tvLibrariesBody()))
        server.enqueue(json(seriesBody()))
        flow.enter()
        server.takeRequestOrFail("RailLawTest.rail_select_swaps_grid_resets_cursor")
        server.takeRequestOrFail("RailLawTest.rail_select_swaps_grid_resets_cursor")

        // Park the cursor to prove the swap resets it: OK on the rail's
        // second row (the FOCUSED row — the activation reads the rail
        // cursor, task 4.3) selects library 2 — a new collection is a fresh
        // grid, and the rail closes into it.
        flow.onGridFocusMoved(1)
        server.enqueue(json(summaryBody(libraryId = 1, items = 7)))
        server.enqueue(json(summaryBody(libraryId = 2, items = 42)))
        flow.openRail()
        flow.onRailFocusMoved(1)
        server.enqueue(json(tvItemsBody()))
        assertTrue(flow.activateRailRow())

        val state = flow.state.value
        assertFalse(state.railOpen)
        assertEquals(2L, state.libraryId)
        assertEquals(listOf("f-1", "f-2"), state.items.map { it.id })
        assertEquals(0, state.gridFocus)
        assertNull(state.error)
        // drain openRail's two summary legs, then the activation's fetch
        server.takeRequestOrFail("RailLawTest.rail_select_swaps_grid_resets_cursor")
        server.takeRequestOrFail("RailLawTest.rail_select_swaps_grid_resets_cursor")
        assertEquals("/api/v1/items?library=2&limit=50&offset=0", server.takeRequestOrFail("RailLawTest.rail_select_swaps_grid_resets_cursor").path)

        // A FAILED OK — the body cannot open — keeps the rail OPEN with its
        // focus (the walk-found 4.3 keep-focus law: never a closed rail over
        // a focus-less surface). The prior body reverts under the scrim with
        // the honest error, and the nonce staged no re-land.
        server.enqueue(MockResponse().setResponseCode(500)) // lib 1 summary
        server.enqueue(MockResponse().setResponseCode(500)) // lib 2 summary
        flow.openRail()
        flow.onRailFocusMoved(0) // walk UP to the serial row
        server.enqueue(MockResponse().setResponseCode(500)) // the switch's /series fetch
        assertFalse(flow.activateRailRow())

        val failed = flow.state.value
        assertTrue(failed.railOpen)
        assertEquals(0, failed.railFocus)
        assertEquals("Не удалось открыть коллекцию", failed.error)
        assertEquals(2L, failed.libraryId)
        assertEquals(listOf("f-1", "f-2"), failed.items.map { it.id })
        assertEquals(0, failed.gridFocus)
        assertEquals(1, failed.gridFocusNonce)
        // The queue drained: enter's two + the first openRail's summaries +
        // the swap's fetch + the failed openRail's summaries + the failed
        // switch's fetch — all eight answered.
        server.assertDrained("RailLawTest.rail_select_swaps_grid_resets_cursor", 8)
    }

    @Test
    fun rail_ok_enters_the_focused_image_body_and_relands_focus() = runBlocking {
        // enter over serial + image fixtures: lib 1's series grid, lib 2 the
        // photo body the on-device walk (0.3.2) could not reach — OK there
        // closed the rail onto a focus-less surface.
        server.enqueue(json(photoLibrariesBody()))
        server.enqueue(json(seriesBody()))
        flow.enter()
        server.takeRequestOrFail("RailLawTest.rail_ok_enters_the_focused_image_body_and_relands_focus") // /libraries
        server.takeRequestOrFail("RailLawTest.rail_ok_enters_the_focused_image_body_and_relands_focus") // /series?library=1

        // Open the rail, walk DOWN to the Images row, OK it: the image body
        // fetches (the folder rows + the paged stream's first page) and the
        // rail closes into it — cursor 0, the fresh body's re-land staged.
        server.enqueue(json(summaryBody(libraryId = 1, items = 7)))
        server.enqueue(json(summaryBody(libraryId = 2, items = 42)))
        flow.openRail()
        server.takeRequestOrFail("RailLawTest.rail_ok_enters_the_focused_image_body_and_relands_focus") // summaries
        server.takeRequestOrFail("RailLawTest.rail_ok_enters_the_focused_image_body_and_relands_focus")
        flow.onRailFocusMoved(1)
        server.enqueue(json(foldersBody()))
        server.enqueue(json(photoItemsBody()))
        assertTrue(flow.activateRailRow())

        val state = flow.state.value
        assertFalse(state.railOpen)
        assertEquals(2L, state.libraryId)
        assertEquals(listOf("p-1", "p-2"), state.items.map { it.id })
        assertEquals(3, state.folders.size) // the chips row: [Все] + the served folders
        assertEquals(0, state.gridFocus)
        assertEquals(1, state.gridFocusNonce) // the fresh body's focus re-land
        assertNull(state.error)
        assertEquals("/api/v1/libraries/2/folders", server.takeRequestOrFail("RailLawTest.rail_ok_enters_the_focused_image_body_and_relands_focus").path)
        assertEquals("/api/v1/items?library=2&limit=50&offset=0", server.takeRequestOrFail("RailLawTest.rail_ok_enters_the_focused_image_body_and_relands_focus").path)

        // A closed rail's OK is a no-op — no request, no state change.
        assertFalse(flow.activateRailRow())
        // enter's two + the open rail's summaries + the activation's two.
        server.assertDrained("RailLawTest.rail_ok_enters_the_focused_image_body_and_relands_focus", 6)
    }

    @Test
    fun rail_restore_flag_survives_a_plain_close_and_dies_on_activation() = runBlocking {
        // The home-restore law (task 8.4): the flag survives a plain
        // LEFT/BACK close (closeRail — HomeRows re-lands the opener's
        // cursor), but a SUCCESSFUL activation clears it — the cursor moves
        // INTO the opened body (4.3), and the restored home card's
        // focus→scroll actuator must not drag the viewport back onto the
        // rows over the body-top swap (walk34's close race).
        server.enqueue(json(tvLibrariesBody()))
        server.enqueue(json(seriesBody()))
        flow.enter()
        server.takeRequestOrFail("RailLawTest.rail_restore_flag_survives_a_plain_close_and_dies_on_activation") // /libraries
        server.takeRequestOrFail("RailLawTest.rail_restore_flag_survives_a_plain_close_and_dies_on_activation") // /series?library=1

        // Open FROM the home rows: the opener is recorded.
        server.enqueue(json(summaryBody(libraryId = 1, items = 7)))
        server.enqueue(json(summaryBody(libraryId = 2, items = 42)))
        flow.openRail(fromHome = true)
        assertTrue(flow.state.value.railRestoreHome)

        // A plain close (LEFT/Back): the rail closes, the restore STANDS —
        // HomeRows will re-request the opener card's focus.
        flow.closeRail()
        assertFalse(flow.state.value.railOpen)
        assertTrue(flow.state.value.railRestoreHome)

        // Re-open from home, walk to the tv row, OK: the activation close
        // enters the body AND clears the restore — nothing comes back.
        server.enqueue(json(summaryBody(libraryId = 1, items = 7)))
        server.enqueue(json(summaryBody(libraryId = 2, items = 42)))
        flow.openRail(fromHome = true)
        assertTrue(flow.state.value.railRestoreHome)
        flow.onRailFocusMoved(1)
        server.enqueue(json(tvItemsBody()))
        assertTrue(flow.activateRailRow())

        val state = flow.state.value
        assertFalse(state.railOpen)
        assertFalse(state.railRestoreHome)
        assertEquals(2L, state.libraryId)
        assertEquals(1, state.gridFocusNonce) // the body re-land staged
        // enter's two + the two openRails' summaries (4) + the activation's
        // paged-items fetch.
        server.assertDrained("RailLawTest.rail_restore_flag_survives_a_plain_close_and_dies_on_activation", 7)
    }

    @Test
    fun rail_ok_emits_the_body_swap_only_on_a_successful_activation() = runBlocking {
        // The visible-swap law (task 8.3): a SUCCESSFUL rail-OK activation
        // emits ONE body-swap signal — the UI actuator brings the opened
        // body's top INTO VIEW (the SPA's page shape); a plain rail close
        // and a FAILED activation emit nothing.
        server.enqueue(json(tvLibrariesBody()))
        server.enqueue(json(seriesBody()))
        flow.enter()
        server.takeRequestOrFail("RailLawTest.rail_ok_emits_the_body_swap_only_on_a_successful_activation") // /libraries
        server.takeRequestOrFail("RailLawTest.rail_ok_emits_the_body_swap_only_on_a_successful_activation") // /series?library=1

        val swaps = mutableListOf<Unit>()
        val collector = launch { flow.bodySwaps.collect { swaps.add(Unit) } }

        // A plain rail close (LEFT/Back) emits NO swap: only the rail
        // closes, the content keeps its parked cursor (the restore law —
        // never a page jump).
        server.enqueue(json(summaryBody(libraryId = 1, items = 7)))
        server.enqueue(json(summaryBody(libraryId = 2, items = 42)))
        flow.openRail()
        flow.closeRail()
        yield()
        assertEquals(0, swaps.size)

        // A FAILED OK — the body cannot open — emits none either: the rail
        // stays open over the reverted body (the keep-focus law, task 4.3).
        server.enqueue(MockResponse().setResponseCode(500)) // lib 1 summary
        server.enqueue(MockResponse().setResponseCode(500)) // lib 2 summary
        flow.openRail()
        server.enqueue(MockResponse().setResponseCode(500)) // the switch's /series fetch
        assertFalse(flow.activateRailRow())
        yield()
        assertEquals(0, swaps.size)

        // A SUCCESSFUL activation IS the visible swap: exactly ONE emission
        // per activation.
        flow.onRailFocusMoved(0)
        server.enqueue(json(seriesBody()))
        assertTrue(flow.activateRailRow())
        yield()
        assertEquals(1, swaps.size)

        collector.cancel()
        // enter's two + the two openRails' summaries (4) + the failed and
        // successful switches' series fetches (2).
        server.assertDrained("RailLawTest.rail_ok_emits_the_body_swap_only_on_a_successful_activation", 8)
    }
}
