package tv.mellifera.joint

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import tv.mellifera.net.Api
import tv.mellifera.pairing.InMemorySessionBacking
import tv.mellifera.pairing.PairingFlow
import tv.mellifera.pairing.PairingState
import tv.mellifera.pairing.PollClassifier
import tv.mellifera.pairing.PollSignal
import tv.mellifera.pairing.PollVerdict
import tv.mellifera.pairing.SessionBacking
import tv.mellifera.pairing.SessionStore

/**
 * The 7.1 pairing wire joint (contract (a)): the app's REAL pairing flow
 * (PairingFlow + PollClassifier + the real Api stack) against MockWebServer
 * fixtures mirroring the LIVE server lifecycle byte-for-byte —
 * internal/pairing/service.go Wait (single-use pickup, the consumed
 * successor poll, the restart's approved-no-token shape) as the shape
 * authority, transplanted from internal/itest/qa_pairing_joint_test.go
 * legs 1-4 to the JVM side.
 *
 * Distinct from PairingFlowTest's pins: here ONE pairing id walks the WHOLE
 * lifecycle — pickup, then the same id reads consumed-no-token — and every
 * fixture mirrors the handler's exact key set (the Go joint asserts exact
 * JSON key counts; these fixtures ARE those bytes).
 */
class PairingWireJointTest {
    private lateinit var server: MockWebServer

    /** pairing_id of cycle A — 32 lowercase hex, the mint shape qaPairingIDRe pins. */
    private val id1 = "a1b2c3d4e5f6a7b8a1b2c3d4e5f6a7b8"
    private val id2 = "fedcba9876543210fedcba9876543210"
    private val token1 = "qa-device-token-1"

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    /** Counts device-token writes — the stored-exactly-once law. */
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

    /**
     * The app's real pairing wiring (AppViewModel's posture): its own Api
     * instance per address, tokenless — the pair group is unauthenticated.
     * No-op delay and a fixed clock make the poll loop deterministic.
     */
    private fun flow(store: SessionStore): PairingFlow = PairingFlow(
        apiFor = { address -> Api(address).service },
        store = store,
        scope = CoroutineScope(Job()),
        delayFn = { },
        nowMs = { 0L },
    )

    private fun newStore(): Pair<SessionStore, CountingBacking> {
        val backing = CountingBacking(InMemorySessionBacking())
        val store = SessionStore(backing)
        // The address screen ran earlier (stored-address-skips-entry law) —
        // the running MockWebServer's address, as PairingFlowTest does.
        store.writeServerAddress(server.url("/").toString().trimEnd('/'))
        return store to backing
    }

    @Test
    fun full_cycle_with_single_use() = runBlocking {
        // The server lifecycle, fixture-exact per service.go Wait and the
        // Go joint's exact-key-set asserts:
        //  pair           → {pairing_id, code}                     (2 keys)
        //  wait (pending) → {status}                               (1 key)
        //  wait (pickup)  → {status: approved, device_token}       (2 keys — the ONE ride)
        //  wait (again)   → {status: consumed}                     (1 key — INV2)
        //  pair (restart) → {pairing_id, code}
        //  wait           → {status: approved}                     (1 key — raw gone, no token)
        server.enqueue(json("""{"pairing_id":"$id1","code":"AKQ2XMWZ"}"""))
        server.enqueue(json("""{"status":"pending"}"""))
        server.enqueue(json("""{"status":"approved","device_token":"$token1"}"""))
        server.enqueue(json("""{"status":"consumed"}"""))
        server.enqueue(json("""{"pairing_id":"$id2","code":"MWZ2QKA"}"""))
        server.enqueue(json("""{"status":"approved"}"""))

        // --- cycle A: pair → pending → pickup. The token rides ONCE. ---
        val (storeA, backingA) = newStore()
        val flowA = flow(storeA)
        flowA.runPairing()
        assertEquals(PairingState.Paired, flowA.state.value)
        assertEquals(token1, storeA.readToken())
        assertEquals(1, backingA.tokenWrites)

        // Wire facts of cycle A: POST /pair bare (no Authorization — the
        // unauthenticated pair posture), then the client-cadence GETs on the
        // wait route with NO query string (INV4: the client adds nothing).
        val pair1 = server.takeRequest()
        assertEquals("POST", pair1.method)
        assertEquals("/api/v1/pair", pair1.path)
        assertEquals("", pair1.body.readUtf8())
        assertNull(pair1.getHeader("Authorization"))
        repeat(2) {
            val poll = server.takeRequest()
            assertEquals("GET", poll.method)
            assertEquals("/api/v1/pair/$id1/wait", poll.path)
            assertNull(poll.getHeader("Authorization"))
        }

        // --- the pickup's successor poll on the SAME id: consumed, no
        // token — service.go's SetPairingStatus(consumed) consequence. The
        // real DTO parses the 1-key bytes; the real classifier rules the
        // app's terminal: the re-pair surface, never a retry. ---
        val api = Api(server.url("/").toString())
        val consumed = api.service.waitPairing(id1)
        assertEquals("consumed", consumed.status)
        assertNull("device_token must be absent after the single pickup (INV2)", consumed.deviceToken)
        assertEquals(PollVerdict.Consumed, PollClassifier.classify(PollSignal.Answer(consumed.status, consumed.deviceToken)))
        assertEquals("/api/v1/pair/$id1/wait", server.takeRequest().path)

        // --- cycle B: the server-restart shape (approved, raw gone,
        // service.go:180-185) drives the app's re-pair path: surfaced
        // honestly, NO credential fabricated, POST /pair not auto-fired. ---
        val (storeB, backingB) = newStore()
        val flowB = flow(storeB)
        flowB.runPairing()
        val rejected = flowB.state.value as? PairingState.Rejected
        assertTrue("expected Rejected but was ${flowB.state.value}", rejected != null)
        assertEquals("Сервер потерял токен подтверждения — запустите сопряжение заново", rejected?.message)
        assertNull(storeB.readToken())
        assertEquals(0, backingB.tokenWrites)
        val pair2 = server.takeRequest()
        assertEquals("/api/v1/pair", pair2.path)
        val wait4 = server.takeRequest()
        assertEquals("/api/v1/pair/$id2/wait", wait4.path)
        assertEquals(6, server.requestCount)
    }
}
