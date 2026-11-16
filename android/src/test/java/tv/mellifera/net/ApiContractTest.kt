package tv.mellifera.net

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import tv.mellifera.assertDrained
import tv.mellifera.takeRequestOrFail

/**
 * The 5.3 wire-contract pins over a real MockWebServer round trip (pure
 * JVM): the pair request's shape, the wait statuses' parsing, the bearer
 * interceptor's attachment law, and the relative play_url resolution.
 */
class ApiContractTest {
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
    fun pair_request_shape() = runBlocking {
        server.enqueue(json("""{"pairing_id":"p-1","code":"4821"}"""))
        val answer = api.service.pair()
        val recorded = server.takeRequestOrFail("ApiContractTest.pair_request_shape")
        assertEquals("POST", recorded.method)
        assertEquals("/api/v1/pair", recorded.path)
        assertNull(recorded.getHeader("Authorization"))
        assertEquals("p-1", answer.pairingId)
        assertEquals("4821", answer.code)
        server.assertDrained("ApiContractTest.pair_request_shape", 1)
    }

    @Test
    fun wait_parses_statuses() = runBlocking {
        // The five wait statuses (service.go) + the tokenless approved leg —
        // the pickup poll consumed the request, the approved answer carries
        // no token (the re-pair path, 5.4).
        val cases = listOf(
            """{"status":"pending"}""" to ("pending" to null),
            """{"status":"denied"}""" to ("denied" to null),
            """{"status":"expired"}""" to ("expired" to null),
            """{"status":"consumed"}""" to ("consumed" to null),
            """{"status":"approved","device_token":"tok-1"}""" to ("approved" to "tok-1"),
            """{"status":"approved"}""" to ("approved" to null),
        )
        for ((body, _) in cases) {
            server.enqueue(json(body))
        }
        for ((_, expected) in cases) {
            val answer = api.service.waitPairing("p-1")
            assertEquals(expected.first, answer.status)
            assertEquals(expected.second, answer.deviceToken)
        }
        // Every wait hit the wait route.
        repeat(cases.size) {
            assertEquals("/api/v1/pair/p-1/wait", server.takeRequestOrFail("ApiContractTest.wait_parses_statuses").path)
        }
        server.assertDrained("ApiContractTest.wait_parses_statuses", cases.size)
    }

    @Test
    fun token_interceptor_attaches() = runBlocking {
        api.token = "dev-token"
        server.enqueue(json("""{"status":"pending"}"""))
        api.service.waitPairing("p-1")
        assertEquals("Bearer dev-token", server.takeRequestOrFail("ApiContractTest.token_interceptor_attaches").getHeader("Authorization"))

        // The interceptor reads the token per request — a rotated token is
        // attached without rebuilding the client.
        api.token = "rotated"
        server.enqueue(json("""{"status":"pending"}"""))
        api.service.waitPairing("p-1")
        assertEquals("Bearer rotated", server.takeRequestOrFail("ApiContractTest.token_interceptor_attaches").getHeader("Authorization"))

        // No token → bare request (the pairing posture).
        api.token = null
        server.enqueue(json("""{"status":"pending"}"""))
        api.service.waitPairing("p-1")
        assertNull(server.takeRequestOrFail("ApiContractTest.token_interceptor_attaches").getHeader("Authorization"))
        server.assertDrained("ApiContractTest.token_interceptor_attaches", 3)
    }

    @Test
    fun relative_url_resolution() {
        // The descriptor's play_url is path-only; resolved against the base.
        val api = Api("http://192.168.1.5:8080")
        assertEquals(
            "http://192.168.1.5:8080/media/x/file.mp4?token=abc",
            api.resolvePlayUrl("/media/x/file.mp4?token=abc"),
        )
        // A base handed with a trailing slash resolves identically.
        assertEquals(
            "http://192.168.1.5:8080/media/x/file.mp4",
            Api("http://192.168.1.5:8080/").resolvePlayUrl("/media/x/file.mp4"),
        )
        // An already-absolute play_url passes through untouched.
        assertEquals(
            "https://cdn.example.com/v.m3u8",
            api.resolvePlayUrl("https://cdn.example.com/v.m3u8"),
        )
    }

    @Test
    fun item_detail_decodes_metadata_projection() = runBlocking {
        // GET /items/{id} (handlers.go itemResponse — itemDTO as-is): the
        // convention projection decodes whole (about/cast/episode) — the
        // player info blocks' wire (android-tv-layout-parity D7).
        server.enqueue(
            json(
                """
                {"item":{"id":"itm_1_f2","module_id":"serial","library_id":1,"file_id":"f2",
                "relative_path":"serials/x/s01e02.mkv","media_type":"tv","document":{},
                "schema_version":1,"status":"ready","title_override":"",
                "display_name":"X · S01E02",
                "metadata":{"about":{"source":"tmdb","description":"Описание"},
                "cast":[{"name":"Имя","role":"Роль"},{"name":"Имя2"}],
                "episode":{"title":"Серия","description":"Описание"}}}}
                """.trimIndent(),
            ),
        )
        val answer = api.service.item("itm_1_f2")
        // ONE request, taken ONCE into a variable — the walk names itself
        // and the timed take fails fast instead of blocking a worker
        // forever (the 2026-11-16 wedge lived here).
        val req = server.takeRequestOrFail("ApiContractTest.item_detail_decodes_metadata_projection")
        assertEquals("GET", req.method)
        assertEquals("/api/v1/items/itm_1_f2", req.path)
        val metadata = answer.item.metadata
        assertEquals("tmdb", metadata?.about?.source)
        assertEquals("Описание", metadata?.about?.description)
        assertEquals("Имя", metadata?.cast?.first()?.name)
        assertEquals("Роль", metadata?.cast?.first()?.role)
        assertNull(metadata?.cast?.get(1)?.role)
        assertEquals("Серия", metadata?.episode?.title)
        assertEquals("Описание", metadata?.episode?.description)

        // Absence: no metadata key decodes null — never an empty block (L1).
        server.enqueue(
            json(
                """
                {"item":{"id":"itm_1_f3","module_id":"serial","library_id":1,"file_id":"f3",
                "relative_path":"p","media_type":"tv","document":{},
                "schema_version":1,"status":"ready","title_override":"","display_name":"Y"}}
                """.trimIndent(),
            ),
        )
        assertNull(api.service.item("itm_1_f3").item.metadata)

        // The absence leg's request is taken too — both walked requests
        // consumed, the queue drained.
        assertEquals(
            "/api/v1/items/itm_1_f3",
            server.takeRequestOrFail("ApiContractTest.item_detail_decodes_metadata_projection").path,
        )
        server.assertDrained("ApiContractTest.item_detail_decodes_metadata_projection", 2)
    }

    @Test
    fun watch_defaults_serves_countdown() = runBlocking {
        // GET /api/v1/watch-defaults (watch_defaults.go): the ONE configured
        // int, served verbatim — the countdown source of truth the AutoNext
        // card starts from (D7); the client bakes no fallback of its own.
        server.enqueue(json("""{"auto_next_countdown_seconds":10}"""))
        val answer = api.service.watchDefaults()
        val recorded = server.takeRequestOrFail("ApiContractTest.watch_defaults_serves_countdown")
        assertEquals("GET", recorded.method)
        assertEquals("/api/v1/watch-defaults", recorded.path)
        assertEquals(10L, answer.autoNextCountdownSeconds)
        server.assertDrained("ApiContractTest.watch_defaults_serves_countdown", 1)
    }
}
