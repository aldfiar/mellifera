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
import tv.mellifera.net.ItemDto
import tv.mellifera.net.SeriesDto
import tv.mellifera.takeRequestOrFail

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
 * ModulePresentation :99, librarySummaryResponse :154, seriesDTO :220.
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
 * - selectLibrary to the unknown module is the HONEST EMPTY path (design D6's
 *   stated TV divergence): no body fetch fires at all; the tv/image bodies'
 *   paged-stream wire lives in tv_and_image_bodies_walk_the_paged_stream.
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
     * not-yet-watched false is what omitempty drops). The metadata block is
     * the typed convention projection (internal/naming/metadata.go): the
     * about OBJECT (source + description, the first-wins carrier) and cast
     * entries as {name,...} objects — the api.ts ElementMetadata shape the
     * client now decodes (2.1). */
    private val serialGrid = """
        {"items":[
          {"id":"s-1","module_id":"serial","library_id":1,"relative_path":"Сага",
           "document":{"title":"Сага","year":2019,"seasons":2},
           "schema_version":4,"status":"active","title_override":"","display_name":"Сага",
           "artwork":"/artwork/posters/s-1.jpg",
           "metadata":{"about":{"source":"filename",
                                "description":"Космическая сага о трёх поколениях"},
                       "cast":[{"name":"Морено"},{"name":"Соня","role":"мать"}]},
           "rec_score":7.5}
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

    /** facetsResponse verbatim (facets.go — layout-parity 10.1): counted
     * values verbatim, the closure's serving order untouched. */
    private val facetsFull = """
        {"facets":[
          {"key":"genre","values":[{"value":"Комедия","count":12},{"value":"Драма","count":7}]},
          {"key":"status","values":[{"value":"ongoing","count":3}]}
        ]}
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
        server.enqueue(json(facetsFull))
        server.enqueue(json(serialGrid))
        server.enqueue(json(serialSummary))
        server.enqueue(json(movieSummary))

        flow.enter()

        // BOTH module kinds kept in served order — the retired serial+tv
        // filter's regression proof: a "movie" library is not the client's
        // business to drop. The consumed fields decode through the full
        // shape (every ignored key rode along on the same bytes). The
        // clean-entry law (15.2): enter serves /libraries alone — the first
        // collection's grid rides the first explicit activation.
        flow.selectLibrary(1L)
        val state = flow.state.value
        assertEquals(listOf(1L, 2L), state.libraries.map { it.id })
        assertEquals(listOf("serial", "movie"), state.libraries.map { it.moduleId })
        assertEquals(listOf("Сериалы", "Фильмы"), state.libraries.map { it.displayName })
        assertEquals(listOf(true, false), state.libraries.map { it.streamsEnabled })
        // The first served collection is adopted and its grid landed.
        assertEquals(1L, state.libraryId)
        assertEquals(listOf("s-1"), state.series.map { it.id })
        // The typed metadata block rides the grid row (2.1): the about
        // object and the cast entries decode through the api.ts
        // ElementMetadata shape (source ignored-by-name is proven by the
        // decode landing at all — unknown keys stay absorbed).
        val s1 = state.series[0]
        assertEquals("Космическая сага о трёх поколениях", s1.metadata?.about?.description)
        assertEquals("filename", s1.metadata?.about?.source)
        assertEquals("мать", s1.metadata?.cast?.lastOrNull()?.role)
        assertFalse(state.isLoading)

        // The rail opens through the 5.15 trigger — openRail fires the
        // per-collection summaries ONCE, focus lands on the current row.
        flow.openRail()
        val railed = flow.state.value
        assertEquals(true, railed.isRailOpen)
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

        // The cycle's request sequence: libraries (the entry's ONLY
        // request) → the activation's facets → the collection's series →
        // one summary per served collection, in served order; the bearer
        // rides the browse routes. takeRequest() CONSUMES — the bearer
        // check inspects the last popped request, never pops a sixth.
        assertEquals("/api/v1/libraries", server.takeRequestOrFail("CollectionsWireJointTest.all_libraries_and_summaries_decode").path)
        assertEquals("/api/v1/libraries/1/facets", server.takeRequestOrFail("CollectionsWireJointTest.all_libraries_and_summaries_decode").path)
        assertEquals("/api/v1/series?library=1", server.takeRequestOrFail("CollectionsWireJointTest.all_libraries_and_summaries_decode").path)
        assertEquals("/api/v1/libraries/1/summary", server.takeRequestOrFail("CollectionsWireJointTest.all_libraries_and_summaries_decode").path)
        val last = server.takeRequestOrFail("CollectionsWireJointTest.all_libraries_and_summaries_decode")
        assertEquals("/api/v1/libraries/2/summary", last.path)
        assertEquals("Bearer qa-bearer", last.getHeader("Authorization"))
        assertEquals(5, server.requestCount)
    }

    @Test
    fun switch_to_unknown_module_is_honest_empty() = runBlocking {
        server.enqueue(json(fullLibraries))

        flow.enter()

        // The unknown module's honest path (design D6's stated TV
        // divergence): the switch fires NO body fetch — the body renders the
        // module's own id as label over an empty state, never an error,
        // never a guessed grid.
        flow.selectLibrary(2L)

        val state = flow.state.value
        assertEquals(2L, state.libraryId)
        assertEquals("movie", state.libraries.last().moduleId)
        assertEquals(emptyList<SeriesDto>(), state.series)
        assertEquals(emptyList<ItemDto>(), state.items)
        assertEquals(0, state.gridFocus)
        assertFalse(state.isLoading)
        assertNull(state.error)

        // enter()'s single request was ALL the traffic.
        assertEquals("/api/v1/libraries", server.takeRequestOrFail("CollectionsWireJointTest.switch_to_unknown_module_is_honest_empty").path)
        assertEquals(1, server.requestCount)
    }

    /**
     * GET /items' FULL wire shape (itemsResponse → itemDTO) — every field
     * the handler serves, transcribed from internal/api/handlers.go :306
     * (json tags are the law): the stamped row carries every omitempty leg
     * (artwork/extra_parsers/metadata/rec_score/watched), the bare row
     * honestly omits them. The document's sources namespaces carry the
     * parsed facts the MovieCard idiom reads (year/resolution), the ffprobe
     * duration blob and the frame-grabber thumb fact.
     */
    private val tvItemsFull = """
        {"items":[
          {"id":"f-1","module_id":"tv","library_id":2,"file_id":"ff-1",
           "relative_path":"Movie.2019.1080p.mkv","media_type":"tv",
           "document":{"sources":{"parser":{"year":2019,"resolution":"1080p"}},
                       "ffprobe":{"format":{"duration":"5400.5"}},
                       "frame-grabber":{"thumbnail_path":"/thumbs/f-1.jpg"}},
           "schema_version":1,"status":"active","title_override":"",
           "display_name":"Матрица","artwork":"/artwork/posters/f-1.jpg",
           "extra_parsers":["tmdb"],
           "metadata":{"about":{"source":"filename","description":"Пустыня реальности"}},
           "rec_score":12.5,"watched":true},
          {"id":"f-2","module_id":"tv","library_id":2,"file_id":"ff-2",
           "relative_path":"Бегущий (1982).mkv","media_type":"tv",
           "document":{},"schema_version":1,"status":"active",
           "title_override":"","display_name":"Бегущий"}
        ]}
    """.trimIndent()

    /** libraryFoldersResponse verbatim: top-level files report path "". */
    private val foldersFull = """
        {"folders":[{"path":"","items":12},{"path":"2026","items":9},{"path":"nature","items":30}]}
    """.trimIndent()

    /** The image library's items page: one RFC3339 capture date, one
     * verbatim machine stamp (unparseable EXIF passes through untouched). */
    private val photoItemsFull = """
        {"items":[
          {"id":"p-1","module_id":"image","library_id":3,"file_id":"pf-1",
           "relative_path":"2026/IMG_0001.jpg","media_type":"image",
           "document":{"sources":{"image-enricher":{"date_taken":"2026-05-01T10:20:30Z",
                                                     "width":4000,"height":3000}}},
           "schema_version":1,"status":"active","title_override":"",
           "display_name":"IMG_0001","watched":false},
          {"id":"p-2","module_id":"image","library_id":3,"file_id":"pf-2",
           "relative_path":"2026/IMG_0002.jpg","media_type":"image",
           "document":{"sources":{"image-enricher":{"date_taken":"май 2026"}}},
           "schema_version":1,"status":"active","title_override":"",
           "display_name":"IMG_0002"}
        ]}
    """.trimIndent()

    /**
     * GET /libraries' full wire shape with THREE module kinds in served
     * order — serial (1), tv (2), image (3) — the D6 bodies' walk targets.
     */
    private val fullLibrariesTvImage = """
        {"items":[
          {"id":1,"module_id":"serial","root_path":"/media/serial",
           "display_name":"Сериалы","description":"","streams_enabled":true},
          {"id":2,"module_id":"tv","root_path":"/media/tv",
           "display_name":"ТВ","description":"","streams_enabled":false},
          {"id":3,"module_id":"image","root_path":"/media/photos",
           "display_name":"Фото","description":"","streams_enabled":false}
        ]}
    """.trimIndent()

    @Test
    fun tv_and_image_bodies_walk_the_paged_stream() = runBlocking {
        server.enqueue(json(fullLibrariesTvImage))
        server.enqueue(json(tvItemsFull))
        server.enqueue(json(tvItemsFull))
        server.enqueue(json(foldersFull))
        server.enqueue(json(photoItemsFull))
        server.enqueue(json(photoItemsFull))

        flow.enter()

        // The tv body (D6): the FIRST page of the paged stream over
        // GET /items — the full itemDTO decode: relative_path and the
        // document's source namespaces land verbatim; the bare row's
        // omitempty legs decode as honest absence.
        flow.selectLibrary(2L)
        val tv = flow.state.value
        assertEquals(2L, tv.libraryId)
        assertEquals(listOf("f-1", "f-2"), tv.items.map { it.id })
        assertEquals("Movie.2019.1080p.mkv", tv.items.first().relativePath)
        assertEquals("Бегущий", tv.items.last().displayName)
        assertNull(tv.items.last().artwork)
        assertNull(tv.items.last().watched)

        // A folder chip's pick server-filters the SAME stream (path_prefix
        // on the query line) and restarts at offset 0 — never a client-side
        // post-filter.
        flow.pickFolder("2026")
        assertEquals(listOf("f-1", "f-2"), flow.state.value.items.map { it.id })
        assertEquals("2026", flow.state.value.folder)
        assertEquals(0, flow.state.value.itemsOffset)

        // The image body (D6): the served folder rows beside the same
        // stream — folders walk their own route, the items stream its own.
        flow.selectLibrary(3L)
        assertEquals(3L, flow.state.value.libraryId)
        assertEquals(listOf("", "2026", "nature"), flow.state.value.folders.map { it.path })
        assertEquals(listOf(12L, 9L, 30L), flow.state.value.folders.map { it.items })
        assertEquals(listOf("p-1", "p-2"), flow.state.value.items.map { it.id })

        // The top-level chip (path "") rides top_level=true — the SAME
        // wire param law the SPA's usePagedItems rides.
        flow.pickFolder("")
        assertEquals("", flow.state.value.folder)
        assertEquals(listOf("p-1", "p-2"), flow.state.value.items.map { it.id })

        // The cycle's request line: every leg's query carries the params
        // the body walks, in the seam's declaration order — the entry's
        // libraries alone (15.2), then the explicit activations' fetches.
        assertEquals("/api/v1/libraries", server.takeRequestOrFail("CollectionsWireJointTest.tv_and_image_bodies_walk_the_paged_stream").path)
        assertEquals("/api/v1/items?library=2&limit=50&offset=0", server.takeRequestOrFail("CollectionsWireJointTest.tv_and_image_bodies_walk_the_paged_stream").path)
        assertEquals(
            "/api/v1/items?library=2&path_prefix=2026&limit=50&offset=0",
            server.takeRequestOrFail("CollectionsWireJointTest.tv_and_image_bodies_walk_the_paged_stream").path,
        )
        assertEquals("/api/v1/libraries/3/folders", server.takeRequestOrFail("CollectionsWireJointTest.tv_and_image_bodies_walk_the_paged_stream").path)
        assertEquals("/api/v1/items?library=3&limit=50&offset=0", server.takeRequestOrFail("CollectionsWireJointTest.tv_and_image_bodies_walk_the_paged_stream").path)
        assertEquals(
            "/api/v1/items?library=3&top_level=true&limit=50&offset=0",
            server.takeRequestOrFail("CollectionsWireJointTest.tv_and_image_bodies_walk_the_paged_stream").path,
        )
        assertEquals(6, server.requestCount)
    }
}
