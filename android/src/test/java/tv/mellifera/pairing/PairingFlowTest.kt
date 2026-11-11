package tv.mellifera.pairing

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import tv.mellifera.net.Api

/**
 * The 5.4 pairing-flow pins over a real MockWebServer round trip (pure
 * JVM): the single token pickup, the honest terminal surfaces, the
 * re-pair paths, and the 401-anywhere wipe. The poll delay is a no-op and
 * the flow is driven directly, so every test is deterministic.
 */
class PairingFlowTest {
    private lateinit var server: MockWebServer
    private lateinit var backing: CountingBacking
    private lateinit var store: SessionStore

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        backing = CountingBacking(InMemorySessionBacking())
        store = SessionStore(backing)
        // The address screen ran earlier: pairing happens against a stored
        // address (the stored-address-skips-entry law) — here the running
        // MockWebServer's.
        store.writeServerAddress(server.url("/").toString().trimEnd('/'))
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private fun json(body: String): MockResponse =
        MockResponse().setBody(body).addHeader("Content-Type", "application/json")

    private fun flow(): PairingFlow = PairingFlow(
        apiFor = { address -> Api(address).service },
        store = store,
        scope = CoroutineScope(Job()),
        pollIntervalMs = 2_000,
        pairingTtlMs = 5 * 60 * 1000,
        delayFn = { },
        nowMs = { 0L },
    )

    @Test
    fun happy_path_stores_once() = runBlocking {
        server.enqueue(json("""{"pairing_id":"p-1","code":"4821"}"""))
        server.enqueue(json("""{"status":"pending"}"""))
        server.enqueue(json("""{"status":"pending"}"""))
        server.enqueue(json("""{"status":"approved","device_token":"tok-7"}"""))
        val flow = flow()
        flow.runPairing()
        assertEquals(PairingState.Paired, flow.state.value)
        assertEquals("tok-7", store.readToken())
        assertEquals(1, backing.tokenWrites)
        // One POST /pair, then the client-cadence polls over the wait route.
        val first = server.takeRequest()
        assertEquals("POST", first.method)
        assertEquals("/api/v1/pair", first.path)
        repeat(3) {
            val poll = server.takeRequest()
            assertEquals("GET", poll.method)
            assertEquals("/api/v1/pair/p-1/wait", poll.path)
        }
    }

    @Test
    fun approved_no_token_repairs() = runBlocking {
        server.enqueue(json("""{"pairing_id":"p-1","code":"4821"}"""))
        server.enqueue(json("""{"status":"approved"}"""))
        val flow = flow()
        flow.runPairing()
        // The tokenless approved leg is surfaced honestly — no token written,
        // and NO automatic POST /pair (user-triggered only).
        assertTrue(flow.state.value is PairingState.Rejected)
        assertNull(store.readToken())
        assertEquals(2, server.requestCount)
        // The user re-triggers: a fresh POST /pair picks the token up.
        server.enqueue(json("""{"pairing_id":"p-2","code":"9930"}"""))
        server.enqueue(json("""{"status":"approved","device_token":"tok-8"}"""))
        flow.runPairing()
        assertEquals(PairingState.Paired, flow.state.value)
        assertEquals("tok-8", store.readToken())
        assertEquals(1, backing.tokenWrites)
        assertEquals(4, server.requestCount)
    }

    @Test
    fun denied_expired_conflict_surfaced() = runBlocking {
        // denied, expired, and the double-approve 409 each surface as a
        // Rejected terminal — never retried into oblivion, never a token.
        val flow = flow()
        server.enqueue(json("""{"pairing_id":"p-1","code":"4821"}"""))
        server.enqueue(json("""{"status":"denied"}"""))
        flow.runPairing()
        assertEquals("Оператор отклонил сопряжение — запустите заново", rejectedMessage(flow))

        server.enqueue(json("""{"pairing_id":"p-2","code":"9930"}"""))
        server.enqueue(json("""{"status":"expired"}"""))
        flow.runPairing()
        assertEquals("Код истёк — запустите сопряжение заново", rejectedMessage(flow))

        server.enqueue(json("""{"pairing_id":"p-3","code":"1111"}"""))
        server.enqueue(MockResponse().setResponseCode(409))
        flow.runPairing()
        assertEquals("Код больше нельзя подтвердить — запустите сопряжение заново", rejectedMessage(flow))
        assertNull(store.readToken())
        assertEquals(0, backing.tokenWrites)
    }

    @Test
    fun second_poll_consumed() = runBlocking {
        // Another pickup consumed the approval before this device's second
        // poll: the consumed answer carries no token, and the flow must not
        // fabricate one nor auto-fire a fresh POST /pair.
        server.enqueue(json("""{"pairing_id":"p-1","code":"4821"}"""))
        server.enqueue(json("""{"status":"pending"}"""))
        server.enqueue(json("""{"status":"consumed"}"""))
        val flow = flow()
        flow.runPairing()
        assertTrue(flow.state.value is PairingState.Rejected)
        assertNull(store.readToken())
        assertEquals(0, backing.tokenWrites)
        assertEquals(3, server.requestCount)
    }

    @Test
    fun unauthorized_wipes_token_user_repairs() = runBlocking {
        store.writeToken("stale-token")
        val flow = flow()
        assertEquals(PairingState.Ready, flow.state.value)
        // A 401 anywhere wipes the token and lands on the pairing screen —
        // without firing a single request.
        flow.onUnauthorized()
        assertNull(store.readToken())
        assertEquals(PairingState.Ready, flow.state.value)
        assertEquals(0, server.requestCount)
        // The user re-pairs from the wiped state.
        server.enqueue(json("""{"pairing_id":"p-1","code":"4821"}"""))
        server.enqueue(json("""{"status":"approved","device_token":"tok-9"}"""))
        flow.runPairing()
        assertEquals(PairingState.Paired, flow.state.value)
        assertEquals("tok-9", store.readToken())
    }
}

/** The honest terminal surface as a message. */
private fun rejectedMessage(flow: PairingFlow): String {
    val state = flow.state.value
    assertTrue("expected Rejected but was $state", state is PairingState.Rejected)
    return (state as PairingState.Rejected).message
}

/** Counts device-token writes so the "stored exactly once" law is assertable. */
private class CountingBacking(private val inner: SessionBacking) : SessionBacking {
    var tokenWrites = 0
    override fun get(key: String): String? = inner.get(key)
    override fun put(key: String, value: String) {
        if (key == "device_token") tokenWrites++
        inner.put(key, value)
    }
    override fun remove(key: String) {
        inner.remove(key)
    }
}
