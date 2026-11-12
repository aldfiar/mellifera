package tv.mellifera.joint

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.yield
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import tv.mellifera.net.Api
import tv.mellifera.net.ProgressRequest
import tv.mellifera.playback.PlayerOrchestration
import tv.mellifera.player.PlayerReadout
import tv.mellifera.state.PlaybackState

/**
 * The 7.1 progress PUT wire joint (contract (c)): the app's REAL flush path
 * (PlayerOrchestration → the production transport adapter → the real
 * Api/Retrofit/OkHttp stack) byte-matches the handler's accepted shape —
 * handlers.go progressRequest {position_seconds int64, completed bool} —
 * and the round trip decodes the handler's progressDTO answer (integer
 * seconds, raw RFC3339 stamp, the omitempty read-time stamps). Distinct
 * from PlayerOrchestrationTest's ticker_flushes pin: there the transport
 * fake records Kotlin objects — the WIRE bytes (field names, the seconds
 * TYPE: an integer, never a fractional double) are unpinned.
 */
class ProgressWireJointTest {
    private lateinit var server: MockWebServer
    private lateinit var scope: CoroutineScope
    private lateinit var api: Api

    private val item = "degr-item"

    /** playbackResponse bytes — the direct degrade (gets the session Active). */
    private val descriptor = """
        {"mode":"direct","state":"complete","play_url":"/media/$item/original?token=qa-media-token","sections":[],"voiceovers":[]}
    """.trimIndent()

    private val playAck = """{"queued":false}"""

    /** progressDTO bytes for the launch leg's resume seed (stamps absent). */
    private val storedProgress = """
        {"item_id":"$item","position_seconds":47,"updated_at":"2026-11-12T10:00:00Z"}
    """.trimIndent()

    /** progressDTO bytes WITH the omitempty read-time stamps present — the
     * handler's full answer shape (Go struct order: item_id,
     * position_seconds, updated_at, rec_score, watched). */
    private val putAnswer = """
        {"item_id":"$item","position_seconds":83,"updated_at":"2026-11-12T10:00:01Z","rec_score":12.5,"watched":true}
    """.trimIndent()

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        api = Api(server.url("/").toString(), token = "qa-bearer")
    }

    @After
    fun tearDown() {
        scope.cancel()
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
     * recording is the deterministic end-of-cascade signal (the launch
     * leg's progress GET has landed once it is set).
     */
    private suspend fun awaitLaunched(controller: RecordingController) {
        while (controller.launched.isEmpty()) yield()
    }

    @Test
    fun put_shape_round_trip() = runBlocking {
        server.enqueue(json(descriptor))
        server.enqueue(json(playAck))
        server.enqueue(json(storedProgress))
        server.enqueue(json(putAnswer)) // PUT #1 — the orchestration's flush
        server.enqueue(json(putAnswer)) // PUT #2 — the explicit-completed watch

        val controller = RecordingController()
        val orch = PlayerOrchestration(
            controller = controller,
            transport = { productionTransport(api) },
            scope = scope,
            delayer = { awaitCancellation() }, // the ticker parks — only the pause flush PUTs
        )

        orch.play(item)
        awaitActive(orch)
        awaitLaunched(controller)

        // The pause flush: the readout's 83_456 ms crosses the wire as the
        // INTEGER 83 seconds (the ms→s truncation; a Double DTO would emit
        // 83.456 or 83.0) with completed:false encoded (encodeDefaults).
        controller.readout.value = PlayerReadout(positionMs = 83_456)
        orch.playPause()
        while (server.requestCount < 4) yield()

        // Drain the launch cascade in its pinned order before the PUT.
        assertEquals("/api/v1/items/$item/playback", server.takeRequest().path)
        assertEquals("/api/v1/items/$item/play", server.takeRequest().path)
        assertEquals("/api/v1/progress/$item", server.takeRequest().path)

        val put1 = server.takeRequest()
        assertEquals("PUT", put1.method)
        assertEquals("/api/v1/progress/$item", put1.path)
        assertEquals("Bearer qa-bearer", put1.getHeader("Authorization"))
        assertEquals("""{"position_seconds":83,"completed":false}""", put1.body.readUtf8())

        // The explicit completed watch (watched-states): the same shape with
        // completed:true — the client's other PUT leg the handler accepts.
        val dto = api.service.putProgress(item, ProgressRequest(positionSeconds = 83, completed = true))
        while (server.requestCount < 5) yield()

        // The round trip's decode half: progressDTO verbatim — integer
        // seconds, the raw RFC3339 stamp, the read-time stamps decoded.
        assertEquals(item, dto.itemId)
        assertEquals(83L, dto.positionSeconds)
        assertEquals("2026-11-12T10:00:01Z", dto.updatedAt)
        assertEquals(12.5, dto.recScore!!, 0.0)
        assertEquals(true, dto.watched)

        val put2 = server.takeRequest()
        assertEquals("PUT", put2.method)
        assertEquals("/api/v1/progress/$item", put2.path)
        assertEquals("""{"position_seconds":83,"completed":true}""", put2.body.readUtf8())

        assertEquals(5, server.requestCount)
    }
}
