package tv.mellifera.net

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

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
        val recorded = server.takeRequest()
        assertEquals("POST", recorded.method)
        assertEquals("/api/v1/pair", recorded.path)
        assertNull(recorded.getHeader("Authorization"))
        assertEquals("p-1", answer.pairingId)
        assertEquals("4821", answer.code)
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
            assertEquals("/api/v1/pair/p-1/wait", server.takeRequest().path)
        }
    }

    @Test
    fun token_interceptor_attaches() = runBlocking {
        api.token = "dev-token"
        server.enqueue(json("""{"status":"pending"}"""))
        api.service.waitPairing("p-1")
        assertEquals("Bearer dev-token", server.takeRequest().getHeader("Authorization"))

        // The interceptor reads the token per request — a rotated token is
        // attached without rebuilding the client.
        api.token = "rotated"
        server.enqueue(json("""{"status":"pending"}"""))
        api.service.waitPairing("p-1")
        assertEquals("Bearer rotated", server.takeRequest().getHeader("Authorization"))

        // No token → bare request (the pairing posture).
        api.token = null
        server.enqueue(json("""{"status":"pending"}"""))
        api.service.waitPairing("p-1")
        assertNull(server.takeRequest().getHeader("Authorization"))
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
}
