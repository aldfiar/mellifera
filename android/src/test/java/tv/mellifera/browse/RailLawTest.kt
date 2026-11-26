package tv.mellifera.browse

import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
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
import tv.mellifera.browse.fixtures.facetsBody
import tv.mellifera.browse.fixtures.foldersBody
import tv.mellifera.browse.fixtures.librariesBody
import tv.mellifera.browse.fixtures.photoItemsBody
import tv.mellifera.browse.fixtures.photoLibrariesBody
import tv.mellifera.browse.fixtures.seriesBody
import tv.mellifera.browse.fixtures.tvItemsBody
import tv.mellifera.browse.fixtures.tvLibrariesBody
import tv.mellifera.dpad.DpadKey
import tv.mellifera.dpad.moveInList
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
        server.enqueue(json(facetsBody()))
        server.enqueue(json(seriesBody()))
    }

    @Test
    fun rail_opens_at_current_collection() = runBlocking {
        server.enqueue(json(librariesBody()))
        flow.enter()
        // A closed rail fired NO summary requests (the closed-panel D1 law),
        // and 15.2's clean entry loaded NO body: /libraries is the entry's
        // ONLY request.
        assertEquals(1, server.requestCount)

        // Make the CURRENT collection the second served row (an unknown
        // module — its body fires no fetch, D6), then open.
        flow.selectLibrary(2L)
        server.enqueue(json(summaryBody(libraryId = 1, items = 7)))
        server.enqueue(json(summaryBody(libraryId = 2, items = 42)))
        flow.openRail()

        val state = flow.state.value
        assertTrue(state.isRailOpen)
        // The initial-focus law carried into the rail: the cursor sits on
        // the CURRENT collection's row (library 2 = index 1), never row 0.
        assertEquals(1, state.railFocus)
        // The counts fired exactly once, in served order — and the unknown
        // module's switch added no request of its own.
        server.takeRequestOrFail("RailLawTest.rail_opens_at_current_collection") // /libraries
        assertEquals("/api/v1/libraries/1/summary", server.takeRequestOrFail("RailLawTest.rail_opens_at_current_collection").path)
        assertEquals("/api/v1/libraries/2/summary", server.takeRequestOrFail("RailLawTest.rail_opens_at_current_collection").path)
        assertEquals(3, server.requestCount)
        assertEquals(42L, state.summaries[2L]?.items)

        // Idempotent: re-opening an open rail neither moves the cursor nor
        // re-fires a single summary request.
        flow.openRail()
        assertTrue(flow.state.value.isRailOpen)
        assertEquals(1, flow.state.value.railFocus)
        assertEquals(3, server.requestCount)
    }

    @Test
    fun rail_left_or_back_closes_keeps_grid_focus() = runBlocking {
        enqueueEnter()
        flow.enter()
        // 15.2: the entry loads no body — the parked cursor parks on the
        // serial grid loaded by the first explicit activation.
        flow.selectLibrary(1L)
        repeat(3) { server.takeRequestOrFail("RailLawTest.rail_left_or_back_closes_keeps_grid_focus") }

        // Park the grid cursor mid-grid, open the rail, walk it down.
        flow.onGridFocusMoved(1)
        server.enqueue(json(summaryBody(libraryId = 1, items = 7)))
        server.enqueue(json(summaryBody(libraryId = 2, items = 42)))
        flow.openRail()
        flow.onRailFocusMoved(1)
        assertTrue(flow.state.value.isRailOpen)
        assertEquals(1, flow.state.value.railFocus)

        // LEFT or Back route to the SAME flow entry (closeRail): only the
        // rail closes — the grid's parked cursor, rows and collection are
        // exactly where they were (the no-restart law).
        flow.closeRail()

        val state = flow.state.value
        assertFalse(state.isRailOpen)
        assertEquals(1, state.gridFocus)
        assertEquals(1L, state.libraryId)
        assertEquals(listOf("s-1", "s-2"), state.series.map { it.id })
        assertNull(state.error)
        server.assertDrained("RailLawTest.rail_left_or_back_closes_keeps_grid_focus", 5)
    }

    @Test
    fun rail_walk_lands_clamped_inside_the_served_rows() = runBlocking {
        server.enqueue(json(librariesBody()))
        flow.enter()
        server.takeRequestOrFail("RailLawTest.rail_walk_lands_clamped_inside_the_served_rows") // /libraries (15.2: the entry's only request)

        server.enqueue(json(summaryBody(libraryId = 1, items = 7)))
        server.enqueue(json(summaryBody(libraryId = 2, items = 42)))
        flow.openRail()
        server.takeRequestOrFail("RailLawTest.rail_walk_lands_clamped_inside_the_served_rows")
        server.takeRequestOrFail("RailLawTest.rail_walk_lands_clamped_inside_the_served_rows")

        // The walk's landing serves the clamp law: the rail cursor can never
        // aim outside the SERVED rows — past the last row clamps to it,
        // before the first clamps to row 0 (the same live-rows clamp as the
        // grid cursor), so UP/DOWN walking the open rail is a pure
        // cursor-in-state movement over exactly the rendered rows. 18.3:
        // the rendered row space grew by the fixed settings row — the
        // walker's count is libraries.size + 1 and the clamp lands on the
        // settings index (libraries.size = 2), the walk's last row.
        flow.onRailFocusMoved(99)
        assertEquals(2, flow.state.value.railFocus)
        flow.onRailFocusMoved(-3)
        assertEquals(0, flow.state.value.railFocus)
        server.assertDrained("RailLawTest.rail_walk_lands_clamped_inside_the_served_rows", 3)
    }

    @Test
    fun rail_walks_into_the_settings_row_and_ok_there_is_a_no_op() = runBlocking {
        // The fixed settings row (18.3): the rail walk's +1 row. The walker
        // (the pure moveInList law, dpad/KeyRouting.kt) and the flow's
        // landing clamp ride the SAME count — libraries.size + 1 — so DOWN
        // from the last library lands the settings index and the walk
        // clamps INSIDE it. The row is NOT a library: OK there is a no-op —
        // no body fetch, no rail close, the focus kept (the flow's
        // getOrNull guard refuses the virtual index; the overlay opens at
        // the composition site instead).
        server.enqueue(json(librariesBody()))
        flow.enter()
        server.takeRequestOrFail("RailLawTest.rail_walks_into_the_settings_row_and_ok_there_is_a_no_op") // /libraries

        server.enqueue(json(summaryBody(libraryId = 1, items = 7)))
        server.enqueue(json(summaryBody(libraryId = 2, items = 42)))
        flow.openRail()
        server.takeRequestOrFail("RailLawTest.rail_walks_into_the_settings_row_and_ok_there_is_a_no_op")
        server.takeRequestOrFail("RailLawTest.rail_walks_into_the_settings_row_and_ok_there_is_a_no_op")

        // DOWN from the last library row lands the settings index; DOWN at
        // the settings row clamps inside it; UP walks back to the
        // libraries. The screen composes exactly these steps (the walker's
        // landing rides onRailFocusMoved), so the joint law is pinned over
        // the REAL moveInList + the REAL flow — no mocks between them; the
        // walker's count is the SERVED size + 1, read live off the flow.
        val walkerCount = flow.state.value.libraries.size + 1
        assertEquals(3, walkerCount)
        assertEquals(2, moveInList(1, walkerCount, DpadKey.Down))
        flow.onRailFocusMoved(moveInList(1, 3, DpadKey.Down))
        assertEquals(2, flow.state.value.railFocus)
        assertEquals(2, moveInList(2, 3, DpadKey.Down))
        assertEquals(1, moveInList(2, 3, DpadKey.Up))
        flow.onRailFocusMoved(2)
        assertEquals(2, flow.state.value.railFocus)

        // OK on the settings index: refused, silently — no request rides
        // the act, the rail stays open on the settings row, the served
        // state (libraryId, summaries) is exactly what the walk left.
        assertFalse(flow.activateRailRow())
        val state = flow.state.value
        assertTrue(state.isRailOpen)
        assertEquals(2, state.railFocus)
        // The served entry default (enter pins the first library) stands —
        // the settings OK swaps nothing.
        assertEquals(1L, state.libraryId)
        assertNull(state.error)
        assertEquals(42L, state.summaries[2L]?.items)
        server.assertDrained("RailLawTest.rail_walks_into_the_settings_row_and_ok_there_is_a_no_op", 3)

        // The settings focus survives a plain re-report: the composition's
        // restore law re-lands the row by railFocus — the state half is
        // that the index still holds after the walk-away-and-back.
        flow.onRailFocusMoved(0)
        flow.onRailFocusMoved(2)
        assertEquals(2, flow.state.value.railFocus)
        server.assertDrained("RailLawTest.rail_walks_into_the_settings_row_and_ok_there_is_a_no_op", 3)
    }

    @Test
    fun rail_select_swaps_grid_resets_cursor() = runBlocking {
        // The tv library walks the paged items stream (D6) — a real fetch
        // swap to prove the reset law against.
        server.enqueue(json(tvLibrariesBody()))
        server.enqueue(json(facetsBody()))
        server.enqueue(json(seriesBody()))
        flow.enter()
        // 15.2: the entry loads no body — the parked cursor parks on the
        // serial grid loaded by the first explicit activation.
        flow.selectLibrary(1L)
        repeat(3) { server.takeRequestOrFail("RailLawTest.rail_select_swaps_grid_resets_cursor") }

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
        assertFalse(state.isRailOpen)
        assertEquals(2L, state.libraryId)
        assertEquals(listOf("f-1", "f-2"), state.items.map { it.id })
        assertEquals(0, state.gridFocus)
        assertNull(state.error)
        // The state contract's body half (task 8.11): a SUCCESSFUL
        // activation RAISES isBodyOpen — the opened body owns the next
        // Back (8.7), the entry-default carve-out never did.
        assertTrue(state.isBodyOpen)
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
        server.enqueue(MockResponse().setResponseCode(500)) // the switch's facets leg (best-effort)
        server.enqueue(MockResponse().setResponseCode(500)) // the switch's /series fetch
        assertFalse(flow.activateRailRow())

        val failed = flow.state.value
        assertTrue(failed.isRailOpen)
        assertEquals(0, failed.railFocus)
        assertEquals("Не удалось открыть коллекцию", failed.error)
        assertEquals(2L, failed.libraryId)
        assertEquals(listOf("f-1", "f-2"), failed.items.map { it.id })
        assertEquals(0, failed.gridFocus)
        assertEquals(1, failed.gridFocusNonce)
        // A reverted switch raises nothing — the PRIOR body keeps its own
        // isBodyOpen (the 8.8 carve-out; here the prior body IS the open
        // lib-2 body from the first successful activation).
        assertTrue(failed.isBodyOpen)
        // The queue drained: enter's three + the first openRail's summaries +
        // the swap's fetch + the failed openRail's summaries + the failed
        // switch's facets + series fetches — all ten answered.
        server.assertDrained("RailLawTest.rail_select_swaps_grid_resets_cursor", 10)
    }

    @Test
    fun rail_ok_enters_the_focused_image_body_and_relands_focus() = runBlocking {
        // enter over serial + image fixtures: lib 1's series grid, lib 2 the
        // photo body the on-device walk (0.3.2) could not reach — OK there
        // closed the rail onto a focus-less surface.
        server.enqueue(json(photoLibrariesBody()))
        server.enqueue(json(facetsBody()))
        server.enqueue(json(seriesBody()))
        flow.enter()
        // 15.2: the entry loads no body — the serial body rides the first
        // explicit activation.
        flow.selectLibrary(1L)
        server.takeRequestOrFail("RailLawTest.rail_ok_enters_the_focused_image_body_and_relands_focus") // /libraries
        server.takeRequestOrFail("RailLawTest.rail_ok_enters_the_focused_image_body_and_relands_focus") // /libraries/1/facets (10.1)
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
        assertFalse(state.isRailOpen)
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
        // enter's three + the open rail's summaries + the activation's two.
        server.assertDrained("RailLawTest.rail_ok_enters_the_focused_image_body_and_relands_focus", 7)
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
        server.enqueue(json(facetsBody()))
        server.enqueue(json(seriesBody()))
        flow.enter()
        // 15.2: the entry loads no body — the serial body rides the first
        // explicit activation.
        flow.selectLibrary(1L)
        server.takeRequestOrFail("RailLawTest.rail_restore_flag_survives_a_plain_close_and_dies_on_activation") // /libraries
        server.takeRequestOrFail("RailLawTest.rail_restore_flag_survives_a_plain_close_and_dies_on_activation") // /libraries/1/facets (10.1)
        server.takeRequestOrFail("RailLawTest.rail_restore_flag_survives_a_plain_close_and_dies_on_activation") // /series?library=1

        // Open FROM the home rows: the opener is recorded.
        server.enqueue(json(summaryBody(libraryId = 1, items = 7)))
        server.enqueue(json(summaryBody(libraryId = 2, items = 42)))
        flow.openRail(fromHome = true)
        assertTrue(flow.state.value.shouldRestoreHome)

        // A plain close (LEFT/Back): the rail closes, the restore STANDS —
        // HomeRows will re-request the opener card's focus.
        flow.closeRail()
        assertFalse(flow.state.value.isRailOpen)
        assertTrue(flow.state.value.shouldRestoreHome)

        // Re-open from home, walk to the tv row, OK: the activation close
        // enters the body AND clears the restore — nothing comes back.
        server.enqueue(json(summaryBody(libraryId = 1, items = 7)))
        server.enqueue(json(summaryBody(libraryId = 2, items = 42)))
        flow.openRail(fromHome = true)
        assertTrue(flow.state.value.shouldRestoreHome)
        flow.onRailFocusMoved(1)
        server.enqueue(json(tvItemsBody()))
        assertTrue(flow.activateRailRow())

        val state = flow.state.value
        assertFalse(state.isRailOpen)
        assertFalse(state.shouldRestoreHome)
        assertEquals(2L, state.libraryId)
        assertEquals(1, state.gridFocusNonce) // the body re-land staged
        // enter's three + the two openRails' summaries (4) + the activation's
        // paged-items fetch.
        server.assertDrained("RailLawTest.rail_restore_flag_survives_a_plain_close_and_dies_on_activation", 8)
    }

    @Test
    fun rail_ok_swap_emits_at_the_commit_and_again_after_the_load() = runBlocking {
        // The visible-swap law (tasks 8.3 + 8.5): a SUCCESSFUL rail-OK
        // activation emits TWO body-swap signals in a pinned ORDER. The
        // COMMIT-TIME emit fires BEFORE the body fetch resolves — the swap
        // starts the moment the switch commits, so the no-focus entry home
        // (walkG-debug: H3==H0 byte-identical for 9-12s, 0/3 legs landing,
        // fetch latency ruled out) never shows. The POST-LOAD RE-emit lands
        // the body top once the rows are in. A plain rail close emits
        // nothing; a FAILED activation emits only the commit-time signal —
        // no re-emit rides a reverted switch.
        server.enqueue(json(tvLibrariesBody()))
        flow.enter()
        server.takeRequestOrFail("RailLawTest.rail_ok_swap_emits_at_the_commit_and_again_after_the_load") // /libraries (15.2: the entry's only request)

        val swaps = Channel<Unit>(Channel.UNLIMITED)
        val collector = launch { flow.bodySwaps.collect { swaps.send(Unit) } }

        // A plain rail close (LEFT/Back) emits NO swap: only the rail
        // closes, the content keeps its parked cursor (the restore law —
        // never a page jump).
        server.enqueue(json(summaryBody(libraryId = 1, items = 7)))
        server.enqueue(json(summaryBody(libraryId = 2, items = 42)))
        flow.openRail()
        flow.closeRail()
        yield()
        assertFalse(swaps.tryReceive().isSuccess)

        // OK the tv row WITHOUT enqueueing the body fetch's response: the
        // fetch is in flight and unresolved — yet the commit-time swap
        // signal has ALREADY fired (the ordering law's first half).
        server.enqueue(json(summaryBody(libraryId = 1, items = 7)))
        server.enqueue(json(summaryBody(libraryId = 2, items = 42)))
        flow.openRail()
        flow.onRailFocusMoved(1)
        val activation = launch { assertTrue(flow.activateRailRow()) }
        withTimeout(5_000) { swaps.receive() } // the commit-time emit
        assertFalse(activation.isCompleted) // the fetch is still in flight
        assertTrue(flow.state.value.isRailOpen) // the rail closes only after the load
        assertFalse(swaps.tryReceive().isSuccess) // exactly one emit so far

        // Resolve the fetch: the activation completes, the body rows land,
        // and the POST-LOAD RE-emit fires — the ordering law's second half.
        server.enqueue(json(tvItemsBody()))
        activation.join()
        withTimeout(5_000) { swaps.receive() }
        assertFalse(swaps.tryReceive().isSuccess) // exactly two for a success
        assertEquals(2L, flow.state.value.libraryId)
        assertFalse(flow.state.value.isRailOpen)

        // A FAILED OK — the body cannot open — emits ONLY the commit-time
        // signal: the fetch resolves 500, the switch reverts, the rail
        // stays open (the keep-focus law, task 4.3) and NO re-emit fires.
        flow.onRailFocusMoved(0)
        server.enqueue(MockResponse().setResponseCode(500)) // lib 1 summary
        server.enqueue(MockResponse().setResponseCode(500)) // lib 2 summary
        flow.openRail()
        server.enqueue(MockResponse().setResponseCode(500)) // the switch's /items fetch
        assertFalse(flow.activateRailRow())
        withTimeout(5_000) { swaps.receive() } // the commit-time emit
        yield()
        assertFalse(swaps.tryReceive().isSuccess) // NO re-emit for a failure
        val failed = flow.state.value
        assertTrue(failed.isRailOpen)
        assertEquals("Не удалось открыть коллекцию", failed.error)

        collector.cancel()
        // enter's one + the plain-close openRail's summaries (2) + the
        // successful activation's summaries + fetch (3) + the failed
        // openRail's summaries (2) + the failed switch's /items fetch — the
        // failed OK re-lands the CURRENT (tv) row, whose body walks no
        // facets leg.
        server.assertDrained("RailLawTest.rail_ok_swap_emits_at_the_commit_and_again_after_the_load", 9)
    }

    @Test
    fun body_swap_emits_survive_a_busy_collector() = runBlocking {
        // The buffered-delivery contract (task 8.11, ledger #13's state
        // half): the screen consumes bodySwaps through ONE serialized lane
        // (the collector launches its scroll actuator per signal), so a
        // slow consumer must never drop a signal — the commit→post-load
        // pair is buffered (extraBufferCapacity = 4) and delivered even
        // when the collector is still busy with the first. If the flow
        // dropped the post-load emit on a busy lane, the 8.5 body-top land
        // would silently depend on collector timing — exactly the
        // inert-actuator class the #13 race exposed.
        server.enqueue(json(tvLibrariesBody()))
        flow.enter()
        server.takeRequestOrFail("RailLawTest.body_swap_emits_survive_a_busy_collector") // /libraries (15.2: the entry's only request)

        val received = Channel<Unit>(Channel.UNLIMITED)
        val collector = launch {
            flow.bodySwaps.collect {
                received.send(Unit)
                delay(150) // the lane is busy long after each signal fires
            }
        }

        // The swap: both emits fire while the collector is asleep in its
        // delay — the commit-time at the switch, the post-load once the
        // rows land.
        server.enqueue(json(summaryBody(libraryId = 1, items = 7)))
        server.enqueue(json(summaryBody(libraryId = 2, items = 42)))
        flow.openRail()
        flow.onRailFocusMoved(1)
        server.enqueue(json(tvItemsBody()))
        assertTrue(flow.activateRailRow())

        // Both signals arrive — the second buffered behind the busy lane,
        // late but NEVER dropped.
        withTimeout(5_000) { received.receive() } // the commit-time emit
        withTimeout(5_000) { received.receive() } // the post-load emit
        assertEquals(2L, flow.state.value.libraryId)
        assertFalse(flow.state.value.isRailOpen)

        collector.cancel()
        // enter's one + the openRail's summaries (2) + the fetch.
        server.assertDrained("RailLawTest.body_swap_emits_survive_a_busy_collector", 4)
    }
}
