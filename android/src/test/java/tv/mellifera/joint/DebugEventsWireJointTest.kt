package tv.mellifera.joint

import kotlin.coroutines.ContinuationInterceptor
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.yield
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import tv.mellifera.diag.DeviceFacts
import tv.mellifera.diag.TraceFacts
import tv.mellifera.diag.snapshotEvent
import tv.mellifera.diag.traceEvent
import tv.mellifera.net.Api
import tv.mellifera.net.DebugEventRequest
import tv.mellifera.playback.BeaconWorker
import tv.mellifera.playback.PlayerOrchestration
import tv.mellifera.player.PlayerEvent
import tv.mellifera.state.PlaybackState

/**
 * The 7.1 debug-events wire joint (contract (d)): the REAL machine→beacon
 * chain (PlayerOrchestration's Beacon effect → BeaconWorker → the real
 * Api/Retrofit/OkHttp stack, the production poster posture) against
 * fixtures mirroring debug_events.go — the CLOSED kind set with per-kind
 * required fields, the 429 rate_limited envelope driving the worker's
 * cooldown/drop-oldest branch across the wire, and INV4 strip-before-send
 * proven on the RECORDED bytes (the media token a detail carries never
 * leaves the app).
 *
 * `crash` is RESERVED server-side (never an accepted value) and never a
 * fixture value here. The Go-side shape authority: debug_events_test.go's
 * wellFormedTrace / capability_snapshot fixtures and playback_events.go's
 * beaconRequest five-field law.
 */
class DebugEventsWireJointTest {
    private lateinit var server: MockWebServer
    private lateinit var orchScope: CoroutineScope
    private lateinit var api: Api

    private val item = "degr-item"

    private val descriptor = """
        {"mode":"direct","state":"complete","play_url":"/media/$item/original?token=qa-media-token","sections":[],"voiceovers":[]}
    """.trimIndent()

    private val playAck = """{"queued":false}"""

    private val storedProgress = """
        {"item_id":"$item","position_seconds":47,"updated_at":"2026-11-12T10:00:00Z"}
    """.trimIndent()

    /** The handler's 429: the canonical error envelope, no log-worthy body. */
    private fun rateLimited(): MockResponse =
        MockResponse()
            .setResponseCode(429)
            .setBody(errorJson("rate_limited", "too many debug events; slow down"))
            .addHeader("Content-Type", "application/json")

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        orchScope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        api = Api(server.url("/").toString(), token = "qa-bearer")
    }

    @After
    fun tearDown() {
        orchScope.cancel()
        server.shutdown()
    }

    private suspend fun awaitActive(orch: PlayerOrchestration): PlaybackState.Active {
        while (true) {
            (orch.state.value as? PlaybackState.Active)?.let { return it }
            val s = orch.state.value
            check(s !is PlaybackState.Failed && s !is PlaybackState.Dead) {
                "flow left the play path: $s"
            }
            yield()
        }
    }

    /**
     * Active is entered BEFORE the launch leg resolves — the launched
     * recording is the deterministic end-of-cascade signal, pinning the
     * playback→play→progress request order before the beacon fires.
     */
    private suspend fun awaitLaunched(controller: RecordingController) {
        while (controller.launched.isEmpty()) yield()
    }

    @Test
    fun beacon_shape_and_inv4() = runBlocking {
        // Responses: descriptor, degrade play, resume seed, then the
        // debug-events ingest — 429 first (the cooldown branch), then four
        // 200s (the handler answers 200 with NO body).
        server.enqueue(json(descriptor))
        server.enqueue(json(playAck))
        server.enqueue(json(storedProgress))
        server.enqueue(rateLimited())
        repeat(4) { server.enqueue(MockResponse().setResponseCode(200)) }

        val controller = RecordingController()
        val cooldowns = mutableListOf<Long>()
        val gate = CompletableDeferred<Unit>()
        // The worker owns its own root scope on this runBlocking's event
        // loop (the interceptor only) — cancelled at the end (the
        // BeaconWorkerTest idiom).
        val workerScope = CoroutineScope(
            SupervisorJob() + coroutineContext[ContinuationInterceptor]!!,
        )
        val worker = BeaconWorker(
            post = debugPoster(api),
            scope = workerScope,
            delayer = { ms ->
                cooldowns += ms
                gate.await()
            },
        )
        worker.start()

        val orch = PlayerOrchestration(
            controller = controller,
            transport = { productionTransport(api) },
            sender = worker, // the production wiring: the machine's beacon rides the worker
            scope = orchScope,
            delayer = { awaitCancellation() },
        )
        orch.play(item)
        awaitActive(orch)
        awaitLaunched(controller)

        // Active → video-error: the machine's Beacon effect ferries the
        // event (kind, item, mode, phase=the kind, code, detail) into the
        // worker; the worker strips the query and posts — the fixture
        // answers 429 and the loop parks in the cooldown.
        controller.emit(
            PlayerEvent.VideoError(
                code = "ERROR_CODE_DECODING_FAILED",
                detail = "decode failed on /media/$item/original?token=qa-media-token",
            ),
        )
        while (cooldowns.isEmpty()) yield()
        assertEquals(listOf(BeaconWorker.DEFAULT_COOLDOWN_MS), cooldowns)
        assertTrue(orch.state.value is PlaybackState.Failed)

        // The parked window keeps enqueuing (bounded queue absorbs) — the
        // remaining kinds of the closed set, each built by the app's REAL
        // producers: the machine-shaped beacon legs, the trace composer,
        // the snapshot composer.
        worker.send(
            DebugEventRequest(
                kind = "fatal",
                itemId = item,
                mode = "hls",
                phase = "fatal",
                code = "PLAYER_CODEC_FAILED",
                detail = "playback died at 12s",
            ),
        )
        worker.send(
            DebugEventRequest(
                kind = "stalled",
                itemId = item,
                mode = "hls",
                phase = "stalled",
                code = "STALL_3S",
                detail = "buffering on /media/$item/master.m3u8?token=qa-media-token",
            ),
        )
        worker.send(
            traceEvent(
                itemId = item,
                mode = "hls",
                facts = TraceFacts(
                    code = "first-frame",
                    httpStatus = 200,
                    url = "/media/$item/master.m3u8?token=qa-media-token",
                    firstFrameMs = 180,
                ),
            ),
        )
        worker.send(
            snapshotEvent(
                DeviceFacts(
                    model = "qa-tv-box",
                    androidVersion = "11",
                    apiLevel = 30,
                    appVersion = "0.1.0-dev",
                    media3Version = "1.4.1",
                    display = "1920x1080@60",
                    audioPaths = "hdmi",
                    decoders = emptyList(),
                ),
            ),
        )
        gate.complete(Unit)
        while (server.requestCount < 8) yield()

        // The wire, in order: descriptor → play → progress → the five
        // debug-events POSTs. Field order on every body is the DTO
        // declaration order; the shapes are the handler's accepted bytes.
        server.takeRequest() // GET playback
        server.takeRequest() // POST play
        server.takeRequest() // GET progress

        val e1 = server.takeRequest() // video-error — the machine chain, 429'd
        assertEquals("/api/v1/debug-events", e1.path)
        assertEquals("Bearer qa-bearer", e1.getHeader("Authorization"))
        val b1 = e1.body.readUtf8()
        assertEquals(
            """{"kind":"video-error","item_id":"$item","mode":"direct","phase":"video-error",""" +
                """"code":"ERROR_CODE_DECODING_FAILED","detail":"decode failed on /media/$item/original"}""",
            b1,
        )

        val e2 = server.takeRequest() // fatal — five-field beacon shape
        val b2 = e2.body.readUtf8()
        assertEquals(
            """{"kind":"fatal","item_id":"$item","mode":"hls","phase":"fatal",""" +
                """"code":"PLAYER_CODEC_FAILED","detail":"playback died at 12s"}""",
            b2,
        )

        val e3 = server.takeRequest() // stalled — detail stripped at send
        val b3 = e3.body.readUtf8()
        assertEquals(
            """{"kind":"stalled","item_id":"$item","mode":"hls","phase":"stalled",""" +
                """"code":"STALL_3S","detail":"buffering on /media/$item/master.m3u8"}""",
            b3,
        )

        val e4 = server.takeRequest() // playback-trace — phase="trace", code required
        val b4 = e4.body.readUtf8()
        assertEquals(
            """{"kind":"playback-trace","item_id":"$item","mode":"hls","phase":"trace",""" +
                """"code":"first-frame","detail":"code=first-frame status=200 url=/media/$item/master.m3u8 first_frame_ms=180"}""",
            b4,
        )

        val e5 = server.takeRequest() // capability-snapshot — not item-scoped
        // The non-carried legs ride as "" — which the handler's zero-value
        // decode reads as ABSENT (Go: `"item_id":""` and a missing key both
        // decode to ItemID == "", so the != "" law accepts; the Go-side
        // fixture truly omits the keys — same server verdict).
        val b5 = e5.body.readUtf8()
        assertEquals(
            """{"kind":"capability-snapshot","item_id":"","mode":"","phase":"","code":"",""" +
                """"detail":"model=qa-tv-box android=11 api=30 app=0.1.0-dev media3=1.4.1 display=1920x1080@60 audio=hdmi"}""",
            b5,
        )

        // INV4 across the joint: the media token that rode the play_url
        // query never reaches a wire body; the strip left the PATHS intact.
        for (body in listOf(b1, b2, b3, b4, b5)) {
            assertFalse(body.contains("qa-media-token"))
            assertFalse(body.contains("?token="))
            assertFalse("crash is reserved server-side — never emitted", body.contains(""""kind":"crash""""))
        }

        // The parked window drained in enqueue order — the cooldown never
        // dropped queued events and never retried the 429'd one.
        assertEquals(8, server.requestCount)
        workerScope.cancel()
    }
}
