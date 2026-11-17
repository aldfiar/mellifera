package tv.mellifera.net

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
import tv.mellifera.takeRequestOrFail

/**
 * The facet wire's contract pins (layout-parity task 10.1, over a real
 * MockWebServer round trip — pure JVM): the /libraries/{id}/facets
 * response shape parse (the L6 mirror of internal/api/facets.go), the
 * /series facet-param passthrough (params on the wire ONLY when non-null),
 * and the unknown value's honest empty list.
 */
class FacetsTest {
    private lateinit var server: MockWebServer
    private lateinit var api: Api

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = Api(server.url("/").toString())
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private fun json(body: String): MockResponse =
        MockResponse().setBody(body).addHeader("Content-Type", "application/json")

    @Test
    fun facets_response_shape_parses() = runBlocking {
        // facetsResponse (facets.go): counted values verbatim — never
        // transliterated — the closure's serving order (count desc, value
        // asc) served untouched.
        server.enqueue(
            json(
                """
                {"facets":[
                  {"key":"genre","values":[{"value":"Комедия","count":12},{"value":"Драма","count":7}]},
                  {"key":"status","values":[{"value":"ongoing","count":3}]}
                ]}
                """.trimIndent(),
            ),
        )
        val answer = api.service.facets(1)
        val recorded = server.takeRequestOrFail("FacetsTest.facets_response_shape_parses")
        assertEquals("GET", recorded.method)
        assertEquals("/api/v1/libraries/1/facets", recorded.path)
        assertEquals(listOf("genre", "status"), answer.facets.map { it.key })
        assertEquals("Комедия", answer.facets[0].values[0].value)
        assertEquals(12, answer.facets[0].values[0].count)
        assertEquals("Драма", answer.facets[0].values[1].value)
        assertEquals(7, answer.facets[0].values[1].count)
        assertEquals("ongoing", answer.facets[1].values.single().value)
        assertEquals(3, answer.facets[1].values.single().count)

        // The empty aggregate: facets is ALWAYS non-nil — {"facets":[]}
        // decodes an empty list, never null (facets.go's nil law).
        server.enqueue(json("""{"facets":[]}"""))
        assertTrue(api.service.facets(2).facets.isEmpty())
        assertEquals(
            "/api/v1/libraries/2/facets",
            server.takeRequestOrFail("FacetsTest.facets_response_shape_parses").path,
        )
        server.assertDrained("FacetsTest.facets_response_shape_parses", 2)
    }

    @Test
    fun series_params_ride_only_when_set() = runBlocking {
        // The facet conjuncts ride /series' query — ONE value per param, AND
        // across params; a null param stays OFF the wire (never an empty
        // filter leg).
        server.enqueue(json("""{"items":[]}"""))
        api.service.series(1, genre = "Комедия", kind = null, status = "ongoing")
        val filtered = server.takeRequestOrFail("FacetsTest.series_params_ride_only_when_set")
        assertEquals("/api/v1/series", filtered.requestUrl!!.encodedPath)
        assertEquals("1", filtered.requestUrl!!.queryParameter("library"))
        assertEquals("Комедия", filtered.requestUrl!!.queryParameter("genre"))
        assertNull(filtered.requestUrl!!.queryParameter("kind"))
        assertEquals("ongoing", filtered.requestUrl!!.queryParameter("status"))

        // The no-facets default: the bare scored listing — library alone.
        server.enqueue(json("""{"items":[]}"""))
        api.service.series(1)
        assertEquals(
            "/api/v1/series?library=1",
            server.takeRequestOrFail("FacetsTest.series_params_ride_only_when_set").path,
        )
        server.assertDrained("FacetsTest.series_params_ride_only_when_set", 2)
    }

    @Test
    fun unknown_value_gets_the_honest_empty_list() = runBlocking {
        // No client-side validation: an unknown facet value rides the query
        // verbatim and the server's empty listing IS the answer (handlers.go
        // listSeries over the facet id-set).
        server.enqueue(json("""{"items":[]}"""))
        val answer = api.service.series(1, genre = "никогда-не-существовал")
        val recorded = server.takeRequestOrFail("FacetsTest.unknown_value_gets_the_honest_empty_list")
        assertEquals("никогда-не-существовал", recorded.requestUrl!!.queryParameter("genre"))
        assertTrue(answer.items.isEmpty())
        server.assertDrained("FacetsTest.unknown_value_gets_the_honest_empty_list", 1)
    }
}
