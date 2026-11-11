package tv.mellifera.pairing

import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import tv.mellifera.net.Api

/**
 * The poll classification pins (5.4): 5xx and transport errors are
 * transient — the client keeps its own cadence all the way to the TTL edge —
 * and a 404 for an unknown pairing id is dead.
 */
class PollClassifierTest {
    private lateinit var server: MockWebServer
    private lateinit var store: SessionStore

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        store = SessionStore(InMemorySessionBacking())
        store.writeServerAddress(server.url("/").toString().trimEnd('/'))
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private fun json(body: String): MockResponse =
        MockResponse().setBody(body).addHeader("Content-Type", "application/json")

    @Test
    fun five_xx_polls_to_ttl_edge() {
        // Classification: every 5xx and every transport error is transient.
        assertEquals(PollVerdict.KeepPolling, PollClassifier.classify(PollSignal.HttpError(500)))
        assertEquals(PollVerdict.KeepPolling, PollClassifier.classify(PollSignal.HttpError(503)))
        assertEquals(PollVerdict.KeepPolling, PollClassifier.classify(PollSignal.NetworkError))
        // Flow law: repeated 5xx never end the session early — the loop runs
        // to the client's own 5-minute-TTL edge (shortened here through the
        // flow's clock seam) and only then surfaces the expiry.
        runBlocking {
            val clock = AtomicLong(0)
            val flow = PairingFlow(
                apiFor = { address -> Api(address).service },
                store = store,
                scope = CoroutineScope(Job()),
                pollIntervalMs = 2_000,
                pairingTtlMs = 10_000,
                delayFn = { clock.addAndGet(it) },
                nowMs = { clock.get() },
            )
            server.enqueue(json("""{"pairing_id":"p-1","code":"4821"}"""))
            repeat(8) { server.enqueue(MockResponse().setResponseCode(503)) }
            flow.runPairing()
            val state = flow.state.value
            assertTrue(state is PairingState.Rejected)
            assertEquals("Код истёк — запустите сопряжение заново", (state as PairingState.Rejected).message)
            // 1 POST /pair + several wait polls before the edge — never one.
            assertTrue(server.requestCount > 3)
        }
    }

    @Test
    fun not_found_dead() {
        // Classification: a 404 for an unknown pairing id is dead.
        assertEquals(PollVerdict.Dead, PollClassifier.classify(PollSignal.HttpError(404)))
        // Flow law: the dead verdict surfaces and ends the session — no
        // further polls, no token.
        runBlocking {
            val flow = PairingFlow(
                apiFor = { address -> Api(address).service },
                store = store,
                scope = CoroutineScope(Job()),
                pollIntervalMs = 2_000,
                pairingTtlMs = 5 * 60 * 1000,
                delayFn = { },
                nowMs = { 0L },
            )
            server.enqueue(json("""{"pairing_id":"p-gone","code":"4821"}"""))
            server.enqueue(MockResponse().setResponseCode(404))
            flow.runPairing()
            assertTrue(flow.state.value is PairingState.Rejected)
            assertEquals(2, server.requestCount)
        }
    }
}
