package tv.mellifera.home

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import tv.mellifera.assertDrained
import tv.mellifera.net.Api
import tv.mellifera.takeRequestOrFail

/**
 * The home wire + flow (design D4) over a real MockWebServer round trip
 * (pure JVM): fixtures mirror the LIVE handler's shapes (internal/api/
 * home.go — series fields always served, artwork/current/next omitempty so
 * an anchor card's `current` is GONE from the wire, a film row serves the
 * series fields as ""). The flow keeps the rows verbatim in served order.
 */
class HomeFlowTest {
    private lateinit var server: MockWebServer
    private lateinit var flow: HomeFlow

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        flow = HomeFlow(
            apiFor = { Api(server.url("/").toString().trimEnd('/'), token = "tok-1").service },
        )
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private fun json(body: String): MockResponse =
        MockResponse().setBody(body).addHeader("Content-Type", "application/json")

    /**
     * The three served shapes (home.go homeLibRows), in a deliberately
     * un-lexical served order — the score-then-recency order is inherited
     * server-side and the client re-sorts nothing:
     * 1. a serial RESUME row — artwork, current (full identity + duration)
     *    and next all present;
     * 2. an ANCHOR row — no `current` key at all (the omitempty law), next
     *    over the spent position;
     * 3. a FILM resume row — series fields as "", current without
     *    season/episode/episode_title, never a next, artwork absent.
     */
    private fun homeBody(): String = """
        {"continue":[
          {"series_id":"s-2","series_display_name":"Хроники","library_id":1,
           "library_name":"Сериалы",
           "next":{"item_id":"e-9","label":"S02E01"}},
          {"series_id":"s-1","series_display_name":"Сага","library_id":1,
           "library_name":"Сериалы","artwork":"/artwork/posters/s-1.jpg",
           "current":{"item_id":"e-1","display_name":"Сага S01E01","season":1,
                      "episode":1,"episode_title":"Начало","position_seconds":300,
                      "duration_seconds":2400},
           "next":{"item_id":"e-2","label":"S01E02"}},
          {"series_id":"","series_display_name":"","library_id":2,
           "library_name":"Фильмы",
           "current":{"item_id":"m-1","display_name":"Матрица","position_seconds":600,
                      "duration_seconds":8100}}
        ]}
    """.trimIndent()

    @Test
    fun rows_land_verbatim_in_served_order() = runBlocking {
        server.enqueue(json(homeBody()))

        flow.load()

        val state = flow.state.value
        // Served order preserved — the anchor row keeps its served FIRST
        // slot although a client re-sort by any key would move it.
        assertEquals(listOf("s-2", "s-1", ""), state.rows.map { it.seriesId })
        assertEquals(listOf(1L, 1L, 2L), state.rows.map { it.libraryId })

        // The resume row: every served field decoded verbatim.
        val resume = state.rows[1]
        assertEquals("/artwork/posters/s-1.jpg", resume.artwork)
        val cur = resume.current!!
        assertEquals("e-1", cur.itemId)
        assertEquals("Сага S01E01", cur.displayName)
        assertEquals(1L, cur.season)
        assertEquals(1L, cur.episode)
        assertEquals("Начало", cur.episodeTitle)
        assertEquals(300L, cur.positionSeconds)
        assertEquals(2400L, cur.durationSeconds)
        assertEquals("e-2", resume.next!!.itemId)
        assertEquals("S01E02", resume.next!!.label)

        // The anchor row: `current` was ABSENT from the wire — honest null,
        // never a zero-value resume point.
        val anchor = state.rows[0]
        assertNull(anchor.current)
        assertEquals("Хроники", anchor.seriesDisplayName)
        assertEquals("S02E01", anchor.next!!.label)

        // The film row: series fields honest "", no episode identity on the
        // resume body, no next offer, artwork absent (omitempty).
        val film = state.rows[2]
        assertEquals("", film.seriesId)
        assertEquals("", film.seriesDisplayName)
        assertNull(film.artwork)
        assertNull(film.next)
        val filmCur = film.current!!
        assertEquals("m-1", filmCur.itemId)
        assertNull(filmCur.season)
        assertNull(filmCur.episode)
        assertEquals("", filmCur.episodeTitle)
        assertEquals(600L, filmCur.positionSeconds)
        assertEquals(8100L, filmCur.durationSeconds)
    }

    @Test
    fun route_is_get_home_with_bearer() = runBlocking {
        server.enqueue(json("""{"continue":[]}"""))

        flow.load()

        val recorded = server.takeRequestOrFail("HomeFlowTest.route_is_get_home_with_bearer")
        assertEquals("GET", recorded.method)
        assertEquals("/api/v1/home", recorded.path)
        assertEquals("Bearer tok-1", recorded.getHeader("Authorization"))
        server.assertDrained("HomeFlowTest.route_is_get_home_with_bearer", 1)
    }

    @Test
    fun empty_served_array_is_no_rows_no_error() = runBlocking {
        server.enqueue(json("""{"continue":[]}"""))

        flow.load()

        val state = flow.state.value
        assertTrue(state.rows.isEmpty())
        assertNull(state.error)
        assertTrue(!state.isLoading)
    }

    @Test
    fun failure_keeps_prior_rows_and_surfaces_error() = runBlocking {
        server.enqueue(json(homeBody()))
        flow.load()

        server.enqueue(MockResponse().setResponseCode(500))
        flow.load()

        val state = flow.state.value
        // The failure law: whatever was on screen stays; the honest RU
        // error surfaces beside it.
        assertEquals(3, state.rows.size)
        assertEquals("Не удалось загрузить продолжения — проверьте сервер", state.error)
        assertTrue(!state.isLoading)
    }

    @Test
    fun unauthorized_routes_through_the_app_shell() = runBlocking {
        var wiped = false
        val flow = HomeFlow(
            apiFor = { Api(server.url("/").toString().trimEnd('/')).service },
            onUnauthorized = { wiped = true },
        )

        server.enqueue(MockResponse().setResponseCode(401))
        flow.load()

        assertTrue(wiped)
        assertNull(flow.state.value.error)
        assertTrue(flow.state.value.rows.isEmpty())
    }

    @Test
    fun focus_cursors_move_within_the_live_branches() = runBlocking {
        server.enqueue(json(homeBody()))
        flow.load()

        // The served set: one anchor row, two resume rows — each branch's
        // cursor clamps to ITS OWN live size.
        flow.onContinueFocusMoved(1)
        flow.onNextUpFocusMoved(0)
        var state = flow.state.value
        assertEquals(1, state.continueFocus)
        assertEquals(0, state.nextUpFocus)

        // A clamp attempt (the walker's law keeps arrows inside the row,
        // but the flow still defends its invariant — the same posture as
        // BrowseFlow.onGridFocusMoved).
        flow.onContinueFocusMoved(9)
        flow.onNextUpFocusMoved(9)
        state = flow.state.value
        assertEquals(1, state.continueFocus)
        assertEquals(0, state.nextUpFocus)
    }

    @Test
    fun load_preserves_and_clamps_the_cursors() = runBlocking {
        server.enqueue(json(homeBody()))
        flow.load()
        flow.onContinueFocusMoved(1)
        flow.onNextUpFocusMoved(0)

        // A player-exit refresh lands a smaller served set: one resume row,
        // one anchor. The cursors ride through (Back restores the exact
        // position — L3), clamped so none aims past the end.
        server.enqueue(
            json(
                """{"continue":[
                  {"series_id":"s-1","series_display_name":"Сага","library_id":1,
                   "current":{"item_id":"e-1","display_name":"Сага S01E01",
                              "position_seconds":300,"duration_seconds":2400}}
                ]}""",
            ),
        )
        flow.load()

        val state = flow.state.value
        assertEquals(1, state.rows.size)
        assertEquals(0, state.continueFocus) // 1 clamped into one resume row
        assertEquals(0, state.nextUpFocus)
    }

    // ---- entryLandsOnHome: the entry-destination law (task 8.15, #18) ----

    @Test
    fun entry_is_held_while_the_first_fetch_is_unresolved() {
        // The born-loading state: between the flow's construction and the
        // first load's resolution the home claims the entry — the grid's
        // actuator stands down and never launches blind into the
        // below-fold tile (the #18 mechanism).
        assertEquals(true, entryLandsOnHome(flow.state.value))
    }

    @Test
    fun entry_lands_on_home_for_resume_and_anchor_rows() = runBlocking {
        server.enqueue(json(homeBody()))
        flow.load()
        // Resume rows present → the first resume card is the entry.
        assertEquals(true, entryLandsOnHome(flow.state.value))

        // Anchor-only: no `current`, but the served `next` offer makes the
        // anchor card focusable — the entry's fallback row.
        server.enqueue(
            json(
                """{"continue":[
                  {"series_id":"s-2","series_display_name":"Хроники","library_id":1,
                   "library_name":"Сериалы",
                   "next":{"item_id":"e-9","label":"S02E01"}}
                ]}""",
            ),
        )
        flow.load()
        assertEquals(true, entryLandsOnHome(flow.state.value))
    }

    @Test
    fun entry_falls_to_the_grid_when_home_resolves_to_nothing_focusable() = runBlocking {
        // The served-empty surface: no rows at all.
        server.enqueue(json("""{"continue":[]}"""))
        flow.load()
        assertEquals(false, entryLandsOnHome(flow.state.value))

        // BARE rows only: an anchor card with no `next` offer is NOT
        // focusable (no OK affordance) — landing the entry there would
        // strand the focus on a dead node, so the grid keeps the entry.
        server.enqueue(
            json(
                """{"continue":[
                  {"series_id":"s-9","series_display_name":"Пустая","library_id":1,
                   "library_name":"Сериалы"}
                ]}""",
            ),
        )
        flow.load()
        assertEquals(false, entryLandsOnHome(flow.state.value))
    }

    @Test
    fun entry_falls_to_the_grid_after_a_failed_fetch() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(500))
        flow.load()
        val state = flow.state.value
        assertEquals("Не удалось загрузить продолжения — проверьте сервер", state.error)
        assertEquals(false, entryLandsOnHome(state))
    }

    // ---- homeErrorLine: the home error line (parity 11.1, audit P2-1) ----

    @Test
    fun home_error_line_shows_on_a_failed_empty_fetch() = runBlocking {
        // The audit P2-1 surface: the first /home fetch failed, no rows on
        // screen — the line IS the served error message, the SPA's
        // ErrorState equivalent.
        server.enqueue(MockResponse().setResponseCode(500))
        flow.load()

        val state = flow.state.value
        assertTrue(state.rows.isEmpty())
        assertEquals("Не удалось загрузить продолжения — проверьте сервер", homeErrorLine(state))
    }

    @Test
    fun home_error_line_hides_while_rows_are_on_screen() = runBlocking {
        // The failure law's other half: rows stay on screen through a failed
        // refresh — the line never shows beside live rows.
        server.enqueue(json(homeBody()))
        flow.load()
        server.enqueue(MockResponse().setResponseCode(500))
        flow.load()

        val state = flow.state.value
        assertEquals(3, state.rows.size)
        assertEquals("Не удалось загрузить продолжения — проверьте сервер", state.error)
        assertNull(homeErrorLine(state))
    }

    @Test
    fun home_error_line_is_null_without_an_error() = runBlocking {
        // The served-empty surface (L1): no rows, but also no failure —
        // an honest no-row surface, never an error line.
        server.enqueue(json("""{"continue":[]}"""))
        flow.load()

        val state = flow.state.value
        assertTrue(state.rows.isEmpty())
        assertNull(state.error)
        assertNull(homeErrorLine(state))
    }
}
