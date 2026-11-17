package tv.mellifera.browse

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import tv.mellifera.browse.fixtures.facetsBody
import tv.mellifera.browse.fixtures.foldersBody
import tv.mellifera.browse.fixtures.photoItemsBody
import tv.mellifera.browse.fixtures.photoLibrariesBody
import tv.mellifera.browse.fixtures.seriesBody
import tv.mellifera.dpad.DpadKey
import tv.mellifera.net.Api
import tv.mellifera.takeRequestOrFail

/**
 * The photo viewer's flow laws (task 8.13 — the operator-reported gap: OK
 * on a photo tile opened nothing): the tile's OK opens the modal viewer on
 * that loaded row; LEFT/RIGHT walk the loaded rows with hard bounds (the
 * viewer is modal — nothing to cross to); BACK closes onto the grid with
 * the filter and cursor untouched and the nonce bump re-landing the parked
 * tile; any body-content swap closes the viewer — never a viewer pointing
 * into a replaced stream.
 */
class PhotoFlowTest {
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

    /** enter() on the photo fixture (libraries alone — 15.2's clean-entry
     * law), then the image body's two fetches at the explicit activation. */
    private fun enterImageBody() = runBlocking {
        server.enqueue(json(photoLibrariesBody()))
        flow.enter()
        server.takeRequestOrFail("PhotoFlowTest.enterImageBody") // /libraries — the entry's ONLY request
        server.enqueue(json(foldersBody()))
        server.enqueue(json(photoItemsBody()))
        flow.selectLibrary(2L)
    }

    @Test
    fun photo_viewer_laws_open_move_close() = runBlocking {
        enterImageBody()
        assertEquals(listOf("p-1", "p-2"), flow.state.value.items.map { it.id })

        // The tile's OK opens the viewer on THAT row.
        flow.openPhoto(1)
        assertEquals(1, flow.state.value.photoIndex)

        // LEFT/RIGHT walk the loaded rows; the bounds are hard — at either
        // end the picture stays (the viewer is modal, nothing to cross to).
        flow.movePhoto(-1)
        assertEquals(0, flow.state.value.photoIndex)
        flow.movePhoto(-1)
        assertEquals(0, flow.state.value.photoIndex)
        flow.movePhoto(1)
        assertEquals(1, flow.state.value.photoIndex)
        flow.movePhoto(1)
        assertEquals(1, flow.state.value.photoIndex)

        // BACK's close law: the viewer clears, the body's filter and cursor
        // stay untouched, and the grid's nonce bumps — the parked tile's
        // deterministic re-land (the grid stays composed under the modal
        // viewer, so the one-shot request targets an attached node). The
        // filter-survival leg needs an APPLIED filter: pick one first.
        server.enqueue(json(photoItemsBody()))
        flow.pickFolder("2026")
        assertEquals("2026", flow.state.value.folder)
        flow.openPhoto(0)
        assertEquals(0, flow.state.value.photoIndex)
        val nonceBefore = flow.state.value.gridFocusNonce
        val focusBefore = flow.state.value.gridFocus
        flow.closePhoto()
        val closed = flow.state.value
        assertNull(closed.photoIndex)
        assertEquals(nonceBefore + 1, closed.gridFocusNonce)
        assertEquals(focusBefore, closed.gridFocus)
        assertEquals("2026", closed.folder) // the filter survives untouched
    }

    @Test
    fun open_photo_ignores_out_of_bounds_indexes() = runBlocking {
        enterImageBody()
        flow.openPhoto(-1)
        assertNull(flow.state.value.photoIndex)
        flow.openPhoto(2)
        assertNull(flow.state.value.photoIndex)
        // A closed viewer's move is a no-op too.
        flow.movePhoto(1)
        assertNull(flow.state.value.photoIndex)
        // And a second close is a no-op (no nonce burn).
        val nonceBefore = flow.state.value.gridFocusNonce
        flow.closePhoto()
        assertEquals(nonceBefore, flow.state.value.gridFocusNonce)
    }

    @Test
    fun body_content_swaps_close_the_viewer() = runBlocking {
        enterImageBody()
        flow.openPhoto(0)
        assertEquals(0, flow.state.value.photoIndex)

        // A library switch replaces the stream — the viewer must not ride
        // into the new body (the serial body fetches no items at all; its
        // facets leg rides best-effort first, 10.1).
        server.enqueue(json(facetsBody()))
        server.enqueue(json(seriesBody()))
        flow.selectLibrary(1L)
        assertNull(flow.state.value.photoIndex)

        // Same law for the chip pick's stream restart.
        server.enqueue(json(foldersBody()))
        server.enqueue(json(photoItemsBody()))
        flow.selectLibrary(2L)
        flow.openPhoto(1)
        assertEquals(1, flow.state.value.photoIndex)
        server.enqueue(json(photoItemsBody()))
        flow.pickFolder("2026")
        assertNull(flow.state.value.photoIndex)
    }

    /** The 12.2 rulings, JVM-pinned on the lifted pure law. */
    @Test
    fun viewer_key_law_pins_the_three_rulings() {
        // OK closes the viewer — the one dead key became the affordance;
        // Back stays the second exit (the BackHandler, not this law).
        assertEquals(ViewerKeyAct.Close, viewerKeyLaw(DpadKey.Ok))
        // LEFT/RIGHT move within the loaded rows.
        assertEquals(ViewerKeyAct.Move(-1), viewerKeyLaw(DpadKey.Left))
        assertEquals(ViewerKeyAct.Move(1), viewerKeyLaw(DpadKey.Right))
        // UP/DOWN stay consumed with no act — the modal law: nothing to
        // cross to under a full-screen overlay.
        assertEquals(ViewerKeyAct.Swallow, viewerKeyLaw(DpadKey.Up))
        assertEquals(ViewerKeyAct.Swallow, viewerKeyLaw(DpadKey.Down))
        // Keys the viewer does not recognize stay UNCONSUMED — the system
        // keeps them (Back itself never reaches onKeyEvent on device).
        assertNull(viewerKeyLaw(DpadKey.Back))
        assertNull(viewerKeyLaw(DpadKey.PlayPause))
        assertNull(viewerKeyLaw(DpadKey.AudioTrack))
    }

    /** The status line's pure formatter: «i/n» + the carried facts only. */
    @Test
    fun photo_status_line_is_field_driven() {
        assertEquals("1/20", photoStatusLine(0, 20, null, null))
        assertEquals("3/20 · 2026-05-01", photoStatusLine(2, 20, "2026-05-01", null))
        assertEquals("1/20 · 2560×1533", photoStatusLine(0, 20, null, "2560×1533"))
        assertEquals(
            "1/20 · 2026-05-01 · 2560×1533",
            photoStatusLine(0, 20, "2026-05-01", "2560×1533"),
        )
    }

    /** The facts read from the SERVED document — absent → absent (L1). */
    @Test
    fun photo_facts_read_from_the_served_document() {
        val served = doc(
            """{"sources":{"image-enricher":
               {"date_taken":"2026-05-01T10:20:30Z","width":4000,"height":3000}}}""",
        )
        assertEquals("2026-05-01", captureDate(served)?.let(::formatDatePart))
        assertEquals("4000×3000", photoDimensions(served))
        // A verbatim machine stamp passes through; no dimensions → none.
        val bare = doc("""{"sources":{"image-enricher":{"date_taken":"май 2026"}}}""")
        assertEquals("май 2026", captureDate(bare)?.let(::formatDatePart))
        assertNull(photoDimensions(bare))
        // No document facts at all → nothing.
        assertNull(photoDimensions(doc("{}")))
    }

    private fun doc(json: String): JsonElement = Json.parseToJsonElement(json)
}
