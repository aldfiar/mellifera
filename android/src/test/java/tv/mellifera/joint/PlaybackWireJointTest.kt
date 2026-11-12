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
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import tv.mellifera.net.Api
import tv.mellifera.playback.PlayerOrchestration
import tv.mellifera.state.PlaybackState
import tv.mellifera.state.PlaySession
import tv.mellifera.state.RenditionPlan

/**
 * The 7.1 descriptor+play degrade wire joint (contract (b)): the REAL flow
 * machine + REAL orchestration + REAL Api/Retrofit/OkHttp stack (the
 * production transport adapter posture) against fixtures mirroring the LIVE
 * handlers' bytes — playback.go's playbackResponse (direct degrade, relative
 * play_url carrying the media token on its query), playResponse
 * {queued:false}, and progressDTO (the resume seed). Distinct from
 * PlayerOrchestrationTest: there the transport is a fake, so the wire BYTES
 * (the explicit retry:false degrade law, the descriptor field set) and the
 * absolute-URL resolution across a real HTTP base are unpinned.
 */
class PlaybackWireJointTest {
    private lateinit var server: MockWebServer
    private lateinit var scope: CoroutineScope
    private lateinit var base: String

    private val item = "degr-item"

    /** playbackResponse bytes: direct degrade — omitempty legs absent, the
     * always-present arrays [] (wireArray), the RELATIVE play_url with the
     * media token on its query (describe.go:117's direct floor). */
    private val descriptor = """
        {"mode":"direct","state":"complete","play_url":"/media/$item/original?token=qa-media-token","sections":[],"voiceovers":[]}
    """.trimIndent()

    /** playResponse: the degrade ack — no re-enqueue happened. */
    private val playAck = """{"queued":false}"""

    /** progressDTO bytes (rec_score/watched omitempty absent): the resume seed. */
    private val storedProgress = """
        {"item_id":"$item","position_seconds":47,"updated_at":"2026-11-12T10:00:00Z"}
    """.trimIndent()

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        base = server.url("/").toString().trimEnd('/')
        scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
    }

    @After
    fun tearDown() {
        scope.cancel()
        server.shutdown()
    }

    /** Drives the cascade to Active, failing fast on a wrong terminal. */
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
     * Active is entered BEFORE the launch leg resolves (the machine rules
     * on the play answer; the progress GET + controller.launch follow) —
     * the launched recording is the deterministic end-of-cascade signal,
     * and it pins the request order on the server.
     */
    private suspend fun awaitLaunched(controller: RecordingController) {
        while (controller.launched.isEmpty()) yield()
    }

    @Test
    fun descriptor_play_degrade_relative_url() = runBlocking {
        server.enqueue(json(descriptor))
        server.enqueue(json(playAck))
        server.enqueue(json(storedProgress))

        val api = Api(server.url("/").toString(), token = "qa-bearer")
        val controller = RecordingController()
        val orch = PlayerOrchestration(
            controller = controller,
            transport = { productionTransport(api) },
            scope = scope,
            delayer = { awaitCancellation() }, // the ticker parks — no stray PUTs
        )

        orch.play(item)
        val active = awaitActive(orch)
        awaitLaunched(controller)

        // The session carries the play_url VERBATIM — relative; resolution
        // is transport law, never the machine's.
        assertEquals(
            PlaySession(item, "/media/$item/original?token=qa-media-token", "direct", RenditionPlan.NoPicker),
            active.session,
        )

        // The launch: the RELATIVE url resolved against the configured base,
        // the token riding the query into the player; the stored 47s seeds
        // the resume seek.
        assertEquals(
            listOf(Triple(item, "$base/media/$item/original?token=qa-media-token", "direct")),
            controller.launched,
        )
        assertEquals(listOf(47_000L), controller.seeks)
        assertTrue(orch.state.value is PlaybackState.Active)

        // The wire: descriptor → degrade play → progress, in order, all
        // behind the paired bearer credential.
        val playbackReq = server.takeRequest()
        assertEquals("GET", playbackReq.method)
        assertEquals("/api/v1/items/$item/playback", playbackReq.path)
        assertEquals("Bearer qa-bearer", playbackReq.getHeader("Authorization"))

        // The degrade law's body: the ONE optimistic play, retry EXPLICIT
        // false (encodeDefaults), from_seconds absent — exactly 13 bytes of
        // JSON. INV4: no token, no query anywhere in the mutation.
        val playReq = server.takeRequest()
        val playBody = playReq.body.readUtf8()
        assertEquals("POST", playReq.method)
        assertEquals("/api/v1/items/$item/play", playReq.path)
        assertEquals("""{"retry":false}""", playBody)
        assertFalse(playBody.contains("token"))

        val progressReq = server.takeRequest()
        assertEquals("GET", progressReq.method)
        assertEquals("/api/v1/progress/$item", progressReq.path)
        assertFalse(progressReq.path!!.contains("token"))

        // The degrade cycle is ONCE: exactly three requests — no second
        // play, no enqueue-wait on a queued:false direct answer.
        assertEquals(3, server.requestCount)
    }
}
