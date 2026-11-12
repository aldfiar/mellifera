package tv.mellifera.playback

import android.view.Surface
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import tv.mellifera.net.DebugEventRequest
import tv.mellifera.net.PlaybackDescriptor
import tv.mellifera.net.PlayResponse
import tv.mellifera.net.ProgressDto
import tv.mellifera.net.ProgressRequest
import tv.mellifera.player.PlayerController
import tv.mellifera.player.PlayerEvent
import tv.mellifera.player.PlayerReadout
import tv.mellifera.state.PlaybackState

/** The player-side fake: records the seam calls the orchestration makes. */
private class FakeController : PlayerController {
    override val readout = kotlinx.coroutines.flow.MutableStateFlow(PlayerReadout())

    private var consumer: ((PlayerEvent) -> Unit)? = null
    override fun setEventConsumer(consumer: (PlayerEvent) -> Unit) {
        this.consumer = consumer
    }

    val launched = mutableListOf<Triple<String, String, String>>()
    val seeks = mutableListOf<Long>()
    var playPauseCalls = 0
    var endCalls = 0

    override fun launch(itemId: String, playUrl: String, mode: String) {
        launched += Triple(itemId, playUrl, mode)
    }

    override fun playPause() {
        playPauseCalls++
    }

    override fun seekBy(deltaMs: Long) {}

    override fun seekTo(positionMs: Long) {
        seeks += positionMs
    }

    override fun selectVoiceover(index: Int) {}

    override fun attachSurface(surface: Surface?) {}

    override fun end() {
        endCalls++
    }

    /** The controller reports a player-level event through the channel. */
    fun emit(event: PlayerEvent) {
        consumer?.invoke(event)
    }
}

/** The net-side fake: the descriptor/progress answers, the recorded PUTs. */
private class FakeTransport(
    private val descriptor: PlaybackDescriptor,
    private val queued: Boolean = false,
    private val progress: ProgressDto,
) : PlaybackTransport {
    val puts = mutableListOf<ProgressRequest>()

    override suspend fun playback(itemId: String) = descriptor
    override suspend fun play(itemId: String, retry: Boolean) = PlayResponse(queued)
    override suspend fun progress(itemId: String) = progress

    override suspend fun putProgress(itemId: String, request: ProgressRequest): ProgressDto {
        puts += request
        return progress
    }

    override fun resolvePlayUrl(playUrl: String) = "RESOLVED($playUrl)"
}

private class RecordingSender : BeaconSender {
    val sent = mutableListOf<DebugEventRequest>()
    override suspend fun send(event: DebugEventRequest) {
        sent += event
    }
}

/** The direct-degrade descriptor the machine launches immediately. */
private fun directDescriptor(item: String = "i1") = PlaybackDescriptor(
    mode = "direct",
    state = "complete",
    playUrl = "/media/$item/original.mkv?token=tok",
)

private fun unconfinedScope() = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)

/**
 * The effect ferry + ticker law (5.7) over the REAL reduce machine: the
 * fake controller/transport/sender stand in at the seams, the fake delayer
 * parks the ticker on a channel so the test drives the 10s cadence. Pure
 * JVM — the eager (Unconfined) scope makes the describe→play→launch
 * cascade deterministic inside one call.
 */
class PlayerOrchestrationTest {
    private val epoch = ProgressDto("i1", 0, "2026-11-12T00:00:00Z")

    @Test
    fun resume_seeks_stored() = runBlocking {
        val controller = FakeController()
        val transport = FakeTransport(
            descriptor = directDescriptor(),
            progress = ProgressDto("i1", 60, "2026-11-12T00:00:00Z"),
        )
        val orch = PlayerOrchestration(
            controller = controller,
            transport = { transport },
            scope = unconfinedScope(),
            delayer = { awaitCancellation() },
        )
        orch.play("i1")

        // The machine rules: direct/complete launches NOW.
        val active = orch.state.value as? PlaybackState.Active
        assertTrue(active != null)
        assertEquals("i1", active?.session?.item)

        // The launch leg: the RELATIVE play_url resolved through the
        // transport, the stored 60s progress seeding the resume seek.
        assertEquals(
            listOf(Triple("i1", "RESOLVED(/media/i1/original.mkv?token=tok)", "direct")),
            controller.launched,
        )
        assertEquals(listOf(60_000L), controller.seeks)
    }

    @Test
    fun ticker_flushes_on_pause_and_exit() = runBlocking {
        val controller = FakeController()
        controller.readout.value = PlayerReadout(positionMs = 45_000)
        val transport = FakeTransport(descriptor = directDescriptor(), progress = epoch)
        val delays = mutableListOf<Long>()
        val gate = Channel<Unit>(Channel.UNLIMITED)
        val exitRefreshes = mutableListOf<Unit>()
        val orch = PlayerOrchestration(
            controller = controller,
            transport = { transport },
            scope = unconfinedScope(),
            delayer = { ms ->
                delays += ms
                gate.receive()
            },
            onExitRefresh = { exitRefreshes += Unit },
        )
        orch.play("i1")

        // Active: the ticker armed at the 10s cadence, nothing flushed yet.
        assertTrue(orch.state.value is PlaybackState.Active)
        assertEquals(listOf(PlayerOrchestration.SAMPLE_PERIOD_MS), delays)
        assertEquals(0, transport.puts.size)

        // Tick 1: a readout.sample flush of the live position, cadence re-armed.
        gate.send(Unit)
        assertEquals(1, transport.puts.size)
        assertEquals(45L, transport.puts[0].positionSeconds)
        assertEquals(listOf(10_000L, 10_000L), delays)

        // Pause flush: the toggle goes through the controller, the stored
        // position flushes immediately.
        orch.playPause()
        assertEquals(1, controller.playPauseCalls)
        assertEquals(2, transport.puts.size)
        assertEquals(45L, transport.puts[1].positionSeconds)

        // Exit: the machine's own FlushProgress + EndPlayer effects — one
        // final flush, the player ended, the browse refresh hook fired.
        orch.exit()
        assertEquals(PlaybackState.Idle, orch.state.value)
        assertEquals(3, transport.puts.size)
        assertEquals(1, controller.endCalls)
        assertEquals(1, exitRefreshes.size)
    }

    @Test
    fun video_error_beacons_and_fails() = runBlocking {
        val controller = FakeController()
        val transport = FakeTransport(descriptor = directDescriptor(), progress = epoch)
        val sender = RecordingSender()
        val orch = PlayerOrchestration(
            controller = controller,
            transport = { transport },
            sender = sender,
            scope = unconfinedScope(),
            delayer = { awaitCancellation() },
        )
        orch.play("i1")
        assertTrue(orch.state.value is PlaybackState.Active)

        // Active + video-error: the controller's event channel → the
        // machine → Beacon surfaced at the sender seam + the Failed state.
        controller.emit(PlayerEvent.VideoError(code = "ERROR_CODE_DECODING_FAILED", detail = "hevc decode failed"))

        val failed = orch.state.value as? PlaybackState.Failed
        assertTrue(failed != null)
        assertEquals("i1", failed?.item)

        assertEquals(1, sender.sent.size)
        val beacon = sender.sent[0]
        assertEquals("video-error", beacon.kind)
        assertEquals("i1", beacon.itemId)
        assertEquals("direct", beacon.mode)
        assertEquals("video-error", beacon.phase)
        assertEquals("ERROR_CODE_DECODING_FAILED", beacon.code)
        assertEquals("hevc decode failed", beacon.detail)
    }
}
