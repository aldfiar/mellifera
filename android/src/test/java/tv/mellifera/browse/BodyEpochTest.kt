package tv.mellifera.browse

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.Response
import tv.mellifera.net.DebugEventRequest
import tv.mellifera.net.FacetDto
import tv.mellifera.net.FacetValueDto
import tv.mellifera.net.FacetsResponse
import tv.mellifera.net.HomeResponse
import tv.mellifera.net.ItemDto
import tv.mellifera.net.ItemResponse
import tv.mellifera.net.ItemsResponse
import tv.mellifera.net.LibraryDto
import tv.mellifera.net.LibraryFoldersResponse
import tv.mellifera.net.LibrarySummaryResponse
import tv.mellifera.net.LibrariesResponse
import tv.mellifera.net.MelliferaApi
import tv.mellifera.net.PairCreateResponse
import tv.mellifera.net.PairWaitResponse
import tv.mellifera.net.PlayRequest
import tv.mellifera.net.PlayResponse
import tv.mellifera.net.PlaybackDescriptor
import tv.mellifera.net.ProfileResponse
import tv.mellifera.net.ProgressDto
import tv.mellifera.net.ProgressRequest
import tv.mellifera.net.SeriesDto
import tv.mellifera.net.SeriesListResponse
import tv.mellifera.net.WatchDefaultsDto

/**
 * The body-epoch race guard (audit S-3, task 15.4 — design §D): [BrowseFlow]
 * is ONE shared state written from uncoordinated launch scopes, so every
 * body-write site captures the epoch BEFORE its await and drops the write
 * when a commit superseded it. The three proven interleavings each pin the
 * new body ending with ONLY the new collection's data:
 *
 * - append bleed — extendItems' suspended page never appends under the
 *   switched body's header;
 * - series-page resurrection — openSeries' resolved fetch never opens the
 *   OLD collection's series page over the new body;
 * - stale lanes — a fast B→C double-switch lands C's lanes/rows only;
 * - the Q12 revert leg — a failing-site revert resolving after a superseding
 *   commit drops (libraryId and rows stay the new collection's).
 *
 * A same-epoch control pins the guard's underside: a write without an
 * intervening commit still lands (no over-guard).
 *
 * The fake is SUSPENDING with gated continuations — the interleavings are
 * ordered deterministically, which MockWebServer cannot do (it cannot order
 * two suspended calls).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class BodyEpochTest {

    /**
     * The suspending fake: rules keyed by an exact call tag, staged before
     * the act; a gated rule suspends its caller until the test releases the
     * gate. An unmatched call fails fast — no silent defaults.
     */
    private class GatedApi : MelliferaApi {
        private class Rule(val gate: CompletableDeferred<Unit>?, val respond: suspend () -> Any)

        private val rules = mutableMapOf<String, Rule>()

        /** Stages the next response for the call tagged [tag]; [gate]
         * suspends the caller until the test completes it. */
        fun rule(tag: String, gate: CompletableDeferred<Unit>? = null, respond: suspend () -> Any) {
            check(tag !in rules) { "double-staged rule: $tag" }
            rules[tag] = Rule(gate, respond)
        }

        private suspend fun <T> serve(tag: String): T {
            val r = rules.remove(tag)
                ?: throw IllegalStateException("unexpected api call: $tag")
            r.gate?.await()
            @Suppress("UNCHECKED_CAST")
            return r.respond() as T
        }

        override suspend fun pair(): PairCreateResponse = serve("pair")
        override suspend fun waitPairing(id: String): PairWaitResponse = serve("waitPairing")
        override suspend fun libraries(): LibrariesResponse = serve("libraries")
        override suspend fun librarySummary(libraryId: Long): LibrarySummaryResponse =
            serve("summary:$libraryId")

        override suspend fun facets(libraryId: Long): FacetsResponse = serve("facets:$libraryId")
        override suspend fun series(
            libraryId: Long,
            genre: String?,
            kind: String?,
            status: String?,
        ): SeriesListResponse = serve("series:$libraryId")

        override suspend fun items(
            libraryId: Long,
            pathPrefix: String?,
            topLevel: Boolean?,
            limit: Int?,
            offset: Int?,
        ): ItemsResponse = serve("items:$libraryId:$offset")

        override suspend fun libraryFolders(libraryId: Long): LibraryFoldersResponse =
            serve("folders:$libraryId")

        override suspend fun episodes(seriesId: String): ItemsResponse =
            serve("episodes:$seriesId")

        override suspend fun playback(itemId: String): PlaybackDescriptor =
            serve("playback:$itemId")

        override suspend fun item(itemId: String): ItemResponse = serve("item:$itemId")
        override suspend fun play(itemId: String, body: PlayRequest): PlayResponse =
            serve("play:$itemId")

        override suspend fun progress(itemId: String): ProgressDto =
            serve("progress:$itemId")

        override suspend fun putProgress(itemId: String, body: ProgressRequest): ProgressDto =
            serve("putProgress:$itemId")

        override suspend fun home(): HomeResponse = serve("home")
        override suspend fun watchDefaults(): WatchDefaultsDto = serve("watchDefaults")
        override suspend fun profile(): ProfileResponse = serve("profile")
        override suspend fun debugEvent(body: DebugEventRequest): Response<Unit> =
            serve("debugEvent")
    }

    private fun flow(api: GatedApi) = BrowseFlow(apiFor = { api })

    private fun lib(id: Long, module: String) = LibraryDto(id = id, moduleId = module)

    private fun seriesOf(id: String) = SeriesDto(id = id)

    private fun page(prefix: String, from: Int, count: Int) =
        ItemsResponse((from until from + count).map { ItemDto(id = "$prefix-$it") })

    /** S-3 leg 1 — the APPEND BLEED: A's extendItems suspends in its
     * /items fetch; a rail-OK commits B; A's page resolves afterwards and
     * MUST drop — the new body ends with only B's rows, never A's page
     * appended under B's header. */
    @Test
    fun append_bleed_stale_page_never_appends_under_the_new_body() = runTest {
        val api = GatedApi()
        val flow = flow(api)
        api.rule("libraries") { LibrariesResponse(listOf(lib(2, "tv"), lib(3, "tv"))) }
        flow.enter()

        api.rule("items:2:0") { page("a", 0, 50) }
        flow.selectLibrary(2)
        assertEquals(50, flow.state.value.items.size)

        val gate = CompletableDeferred<Unit>()
        api.rule("items:2:50", gate) { page("a", 50, 50) }
        val append = launch { flow.extendItems() }
        runCurrent() // A's append suspends inside its /items fetch

        // The rail-OK commits B while A's page is still in flight.
        api.rule("items:3:0") { page("b", 0, 3) }
        assertTrue(flow.selectLibrary(3))

        gate.complete(Unit) // A's page resolves now
        append.join()

        val s = flow.state.value
        assertEquals(3, s.items.size)
        assertTrue(s.items.all { it.id.startsWith("b-") })
        assertEquals(0, s.itemsOffset)
        assertTrue(s.isStreamExhausted)
    }

    /** S-3 leg 2 — the SERIES-PAGE RESURRECTION: openSeries suspends in its
     * episodes fetch; a switch commits (selectedSeries=null with the fresh
     * body); the fetch resolves afterwards and MUST drop — the OLD
     * collection's series page never opens over the new body. */
    @Test
    fun series_resurrection_old_series_page_never_opens_over_the_new_body() = runTest {
        val api = GatedApi()
        val flow = flow(api)
        api.rule("libraries") { LibrariesResponse(listOf(lib(2, "serial"), lib(3, "serial"))) }
        flow.enter()

        api.rule("facets:2") { FacetsResponse() }
        api.rule("series:2") { SeriesListResponse(listOf(seriesOf("sA"))) }
        flow.selectLibrary(2)

        val gate = CompletableDeferred<Unit>()
        api.rule("episodes:sA", gate) { ItemsResponse(listOf(ItemDto(id = "e1"))) }
        val open = launch { flow.openSeries(SeriesDto(id = "sA", libraryId = 2)) }
        runCurrent() // the series entry commit landed; the fetch suspends

        // The rail-OK commits B: selectedSeries clears with the fresh body.
        api.rule("facets:3") { FacetsResponse() }
        api.rule("series:3") { SeriesListResponse(listOf(seriesOf("sB"))) }
        assertTrue(flow.selectLibrary(3))
        assertNull(flow.state.value.selectedSeries)

        gate.complete(Unit) // the OLD series' episodes resolve now
        open.join()

        val s = flow.state.value
        assertNull(s.selectedSeries)
        assertEquals(emptyList<ItemDto>(), s.episodes)
        assertEquals(emptyMap<String, Long>(), s.positions)
        assertEquals(listOf("sB"), s.series.map { it.id })
        assertNull(s.error)
    }

    /** S-3 leg 3 — the STALE LANES: B's activation suspends in its facet
     * lane fetch; C lands over it (the fast B→C double-switch); B's lane,
     * grid rows and body commit MUST drop — C's data only. */
    @Test
    fun stale_lanes_fast_double_switch_lands_only_the_new_collection() = runTest {
        val api = GatedApi()
        val flow = flow(api)
        api.rule("libraries") { LibrariesResponse(listOf(lib(2, "serial"), lib(3, "serial"))) }
        flow.enter()

        val gate = CompletableDeferred<Unit>()
        api.rule("facets:2", gate) {
            FacetsResponse(listOf(FacetDto(key = "genre", values = listOf(FacetValueDto("stale", 1)))))
        }
        api.rule("series:2") { SeriesListResponse(listOf(seriesOf("sB1"), seriesOf("sB2"))) }
        val first = launch { flow.selectLibrary(2) }
        runCurrent() // B's activation committed; it suspends in the lane fetch

        // C commits while B's activation is still in flight.
        api.rule("facets:3") { FacetsResponse() }
        api.rule("series:3") { SeriesListResponse(listOf(seriesOf("sC"))) }
        assertTrue(flow.selectLibrary(3))

        gate.complete(Unit) // B's stale lane resolves now
        first.join()

        val s = flow.state.value
        assertEquals(3L, s.libraryId)
        assertEquals(emptyList<FacetDto>(), s.facets)
        assertEquals(listOf("sC"), s.series.map { it.id })
        assertFalse(s.isLoading)
        assertNull(s.error)
    }

    /** Surveyor Q12 — the REVERT class: B's activation fails AFTER C
     * committed; B's failure revert (libraryId + the prior rows) MUST drop —
     * the body stays C's, and the stale error surface drops with it. */
    @Test
    fun superseded_failure_revert_drops_body_stays_the_new_collection() = runTest {
        val api = GatedApi()
        val flow = flow(api)
        api.rule("libraries") {
            LibrariesResponse(listOf(lib(2, "tv"), lib(3, "tv"), lib(4, "tv")))
        }
        flow.enter()

        api.rule("items:2:0") { page("a", 0, 50) }
        flow.selectLibrary(2)

        val gate = CompletableDeferred<Unit>()
        api.rule("items:3:0", gate) { throw RuntimeException("stale fetch resolves late") }
        val failing = launch { flow.selectLibrary(3) }
        runCurrent() // B's activation committed; its fetch suspends

        // C commits while B is still in flight.
        api.rule("items:4:0") { page("c", 0, 5) }
        assertTrue(flow.selectLibrary(4))

        gate.complete(Unit) // B's fetch now FAILS, after the superseding commit
        failing.join()

        val s = flow.state.value
        assertEquals(4L, s.libraryId)
        assertEquals(5, s.items.size)
        assertTrue(s.items.all { it.id.startsWith("c-") })
        assertTrue(s.isBodyOpen)
        assertNull(s.error)
    }

    /** The same-epoch control — the guard's underside: a write that resolves
     * late but WITHOUT an intervening commit still lands (no over-guard);
     * likewise a gated activation's own landing. */
    @Test
    fun same_epoch_writes_without_an_intervening_commit_still_land() = runTest {
        val api = GatedApi()
        val flow = flow(api)
        api.rule("libraries") { LibrariesResponse(listOf(lib(2, "tv"), lib(3, "tv"))) }
        flow.enter()

        api.rule("items:2:0") { page("a", 0, 50) }
        flow.selectLibrary(2)

        val gate = CompletableDeferred<Unit>()
        api.rule("items:2:50", gate) { page("a", 50, 50) }
        val append = launch { flow.extendItems() }
        runCurrent()
        gate.complete(Unit)
        append.join()
        assertEquals(100, flow.state.value.items.size)
        assertEquals(50, flow.state.value.itemsOffset)
        assertFalse(flow.state.value.isStreamExhausted)

        val gate2 = CompletableDeferred<Unit>()
        api.rule("items:3:0", gate2) { page("b", 0, 2) }
        val activation = launch { flow.selectLibrary(3) }
        runCurrent()
        gate2.complete(Unit)
        activation.join()
        assertEquals(3L, flow.state.value.libraryId)
        assertEquals(2, flow.state.value.items.size)
        assertTrue(flow.state.value.isBodyOpen)
        assertNull(flow.state.value.error)
    }
}
