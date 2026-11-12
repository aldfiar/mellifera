package tv.mellifera.joint

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import tv.mellifera.browse.BrowseFlow
import tv.mellifera.net.Api

/**
 * The 5.16 collections wire joint (the 7.1 posture extended to the collections
 * surface): the app's REAL net+browse code — BrowseFlow over the real
 * Api/Retrofit/OkHttp stack — against MockWebServer fixtures that mirror the
 * LIVE handlers' FULL wire shapes. The browse/fixtures bodies carry only the
 * fields 5.6 consumes; these carry EVERYTHING the server actually sends,
 * including the fields the client does not even declare — libraryDTO's
 * naming_group_style/naming_element_name and the whole additive `module`
 * presentation block (identity_fields, parsers, item_name, title_sources,
 * language_preference, refresh_sources, source_chain), seriesDTO's
 * module_id/relative_path/document/schema_version/status/title_override/
 * metadata — so the decoder's unknown-keys-ignored law is proven live: a
 * strict decoder would throw on the first byte past `streams_enabled`.
 * Field order and the omitempty absences are transcribed from the Go structs
 * in internal/api/handlers.go (json tags are the law): libraryDTO :75,
 * ModulePresentation :97, librarySummaryResponse :154, seriesDTO :229.
 *
 * The collections cycle pinned here (5.14/5.15):
 * - GET /libraries answers TWO module kinds (serial + movie) and the flow
 *   keeps BOTH in served order — the retired serial+tv client filter's
 *   regression proof (LibraryFilter deleted in df178f1).
 * - The rail-open trigger (openRail, the 5.15 path — not loadSummaries
 *   directly) fetches both summaries; librarySummaryResponse's library_id
 *   echo keys the merge and the counts decode per library under the full
 *   shape (updated_at is served on every row and dropped by the client; the
 *   no-items row serves the "" stamp — a real handler shape, still absorbed).
 * - selectLibrary fetches GET /series?library={id} for the OTHER library and
 *   lands its grid (fetch-on-navigate, never a reuse of the first fetch).
 */
class CollectionsWireJointTest {
    private lateinit var server: MockWebServer
    private lateinit var flow: BrowseFlow

    /**
     * GET /libraries' full wire shape (librariesResponse → libraryDTO): two
     * module kinds in served order, every libraryDTO field present on both
     * rows, the module block resolved per row (listLibraries fills it for
     * EVERY library) — lib 2's block omits language_preference/
     * refresh_sources/source_chain (omitempty honest absence within the
     * block) and its naming options carry the module-default "" marker.
     */
    private val fullLibraries = """
        {"items":[
          {"id":1,"module_id":"serial","root_path":"/media/serial",
           "display_name":"Сериалы","description":"Сериалы с NAS","streams_enabled":true,
           "naming_group_style":"season-folder","naming_element_name":"{title} · S{season}E{episode}",
           "module":{
             "identity_fields":["title","year"],
             "parsers":[
               {"id":"episodes","capability":"episode","display_fields":["season","episode"]},
               {"id":"single","display_fields":["title"]}
             ],
             "item_name":"{season}x{episode} · {title}",
             "title_sources":[{"id":"filename","enabled":true},{"id":"tmdb","enabled":false}],
             "language_preference":["ru","en"],
             "refresh_sources":[{"id":"tmdb","enabled":true}],
             "source_chain":[{"id":"filename","enabled":true},{"id":"tmdb","enabled":true}]
           }},
          {"id":2,"module_id":"movie","root_path":"/media/movie",
           "display_name":"Фильмы","description":"","streams_enabled":false,
           "naming_group_style":"","naming_element_name":"",
           "module":{
             "identity_fields":["title","year"],
             "parsers":[
               {"id":"movies","display_fields":["title"]}
             ],
             "item_name":"{title}",
             "title_sources":[{"id":"filename","enabled":true}]
           }}
        ]}
    """.trimIndent()

    /** Library 1's grid: one fully stamped seriesDTO (watched omitted — the
     * not-yet-watched false is what omitempty drops). */
    private val serialGrid = """
        {"items":[
          {"id":"s-1","module_id":"serial","library_id":1,"relative_path":"Сага",
           "document":{"title":"Сага","year":2019,"seasons":2},
           "schema_version":4,"status":"active","title_override":"","display_name":"Сага",
           "artwork":"/artwork/posters/s-1.jpg",
           "metadata":{"about":"Космическая сага о трёх поколениях","cast":["Морено","Соня"]},
           "rec_score":7.5}
        ]}
    """.trimIndent()

    /** Library 2's grid — the OTHER collection selectLibrary must land:
     * m-1 carries every omitempty leg; m-2 is the bare row (artwork,
     * metadata, rec_score, watched all honestly absent). */
    private val movieGrid = """
        {"items":[
          {"id":"m-1","module_id":"movie","library_id":2,"relative_path":"Матрица (1999).mkv",
           "document":{"title":"The Matrix","year":1999},
           "schema_version":4,"status":"active","title_override":"","display_name":"Матрица",
           "artwork":"/artwork/posters/m-1.jpg",
           "metadata":{"about":"Реальность — это иллюзия","cast":["Киану Ривз"]},
           "rec_score":12.5,"watched":true},
          {"id":"m-2","module_id":"movie","library_id":2,"relative_path":"Бегущий по лезвию (1982).mkv",
           "document":{"title":"Blade Runner","year":1982},
           "schema_version":4,"status":"active","title_override":"","display_name":"Бегущий по лезвию"}
        ]}
    """.trimIndent()

    /** librarySummaryResponse verbatim: the echo + count + the RFC3339 stamp
     * the client drops. */
    private val serialSummary = """
        {"library_id":1,"items":37,"updated_at":"2026-11-10T18:04:11Z"}
    """.trimIndent()

    /** The no-items row: items 0 and the "" stamp the handler serves when a
     * library has no items (librarySummaryResponse's zero-state shape). */
    private val movieSummary = """
        {"library_id":2,"items":0,"updated_at":""}
    """.trimIndent()

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val api = Api(server.url("/").toString(), token = "qa-bearer")
        flow = BrowseFlow(apiFor = { api.service })
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun all_libraries_and_summaries_decode() = runBlocking {
        server.enqueue(json(fullLibraries))
        server.enqueue(json(serialGrid))
        server.enqueue(json(serialSummary))
        server.enqueue(json(movieSummary))

        flow.enter()

        // BOTH module kinds kept in served order — the retired serial+tv
        // filter's regression proof: a "movie" library is not the client's
        // business to drop. The consumed fields decode through the full
        // shape (every ignored key rode along on the same bytes).
        val state = flow.state.value
        assertEquals(listOf(1L, 2L), state.libraries.map { it.id })
        assertEquals(listOf("serial", "movie"), state.libraries.map { it.moduleId })
        assertEquals(listOf("Сериалы", "Фильмы"), state.libraries.map { it.displayName })
        assertEquals(listOf(true, false), state.libraries.map { it.streamsEnabled })
        // The first served collection is adopted and its grid landed.
        assertEquals(1L, state.libraryId)
        assertEquals(listOf("s-1"), state.series.map { it.id })
        assertFalse(state.loading)

        // The rail opens through the 5.15 trigger — openRail fires the
        // per-collection summaries ONCE, focus lands on the current row.
        flow.openRail()
        val railed = flow.state.value
        assertEquals(true, railed.railOpen)
        assertEquals(0, railed.railFocus)
        // The summaries decoded under the full shape, merged by the
        // library_id echo: lib 1's count + its echo; lib 2's zero-state row
        // ("" updated_at served, dropped) still merges as its own entry.
        assertEquals(2, railed.summaries.size)
        assertEquals(1L, railed.summaries[1L]?.libraryId)
        assertEquals(37L, railed.summaries[1L]?.items)
        assertEquals(2L, railed.summaries[2L]?.libraryId)
        assertEquals(0L, railed.summaries[2L]?.items)
        assertNull(railed.error)

        // The cycle's request sequence: libraries → the first collection's
        // series → one summary per served collection, in served order; the
        // bearer rides the browse routes. takeRequest() CONSUMES — the
        // bearer check inspects the last popped request, never pops a fifth.
        assertEquals("/api/v1/libraries", server.takeRequest().path)
        assertEquals("/api/v1/series?library=1", server.takeRequest().path)
        assertEquals("/api/v1/libraries/1/summary", server.takeRequest().path)
        val last = server.takeRequest()
        assertEquals("/api/v1/libraries/2/summary", last.path)
        assertEquals("Bearer qa-bearer", last.getHeader("Authorization"))
        assertEquals(4, server.requestCount)
    }

    @Test
    fun switch_fetches_per_library_series() = runBlocking {
        server.enqueue(json(fullLibraries))
        server.enqueue(json(serialGrid))
        server.enqueue(json(movieGrid))

        flow.enter()

        // The switch walks GET /series?library={id} for the OTHER library —
        // the OTHER library's id on the query line, fetch-on-navigate.
        flow.selectLibrary(2L)

        val state = flow.state.value
        // The OTHER library's grid landed — lib 1's rows are gone.
        assertEquals(2L, state.libraryId)
        assertEquals(listOf("m-1", "m-2"), state.series.map { it.id })
        // The full seriesDTO decode: the stamped row's display/artwork/
        // rec_score/watched verbatim; the bare row's omitempty legs decode
        // as honest absence (never a fabricated 0/false).
        val m1 = state.series[0]
        assertEquals("Матрица", m1.displayName)
        assertEquals("/artwork/posters/m-1.jpg", m1.artwork)
        assertEquals(12.5, m1.recScore!!, 0.0)
        assertEquals(true, m1.watched)
        val m2 = state.series[1]
        assertEquals("Бегущий по лезвию", m2.displayName)
        assertNull(m2.artwork)
        assertNull(m2.recScore)
        assertNull(m2.watched)
        // A new collection is a fresh grid: the cursor reset, no churn left.
        assertEquals(0, state.gridFocus)
        assertFalse(state.loading)
        assertNull(state.error)

        assertEquals("/api/v1/libraries", server.takeRequest().path)
        assertEquals("/api/v1/series?library=1", server.takeRequest().path)
        assertEquals("/api/v1/series?library=2", server.takeRequest().path)
        assertEquals(3, server.requestCount)
    }
}
