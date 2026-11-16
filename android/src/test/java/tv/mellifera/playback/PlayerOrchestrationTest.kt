package tv.mellifera.playback

import android.view.Surface
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
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
private fun directDescriptor(
    item: String = "i1",
    sections: List<kotlinx.serialization.json.JsonElement> = emptyList(),
) = PlaybackDescriptor(
    mode = "direct",
    state = "complete",
    playUrl = "/media/$item/original.mkv?token=tok",
    sections = sections,
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

    // ---- the info leg (D7) ----

    /** A served info projection the fake loader answers. */
    private val infoFixture = PlayerInfoBlocks(
        eyebrow = "S01E02",
        heading = "Название серии",
        episodeDescription = "Описание серии",
        cast = emptyList(),
        about = null,
    )

    @Test
    fun info_loads_on_active_and_leaves_with_the_session() = runBlocking {
        val controller = FakeController()
        val transport = FakeTransport(descriptor = directDescriptor(), progress = epoch)
        val loaded = mutableListOf<String>()
        val orch = PlayerOrchestration(
            controller = controller,
            transport = { transport },
            infoLoader = {
                InfoLoader { item ->
                    loaded += item
                    infoFixture
                }
            },
            scope = unconfinedScope(),
            delayer = { awaitCancellation() },
        )
        orch.play("i1")

        // Active: the Launch ferry also ran the info leg — once, for the
        // session's item, and the blocks ride the info flow (never AppState).
        assertTrue(orch.state.value is PlaybackState.Active)
        assertEquals(listOf("i1"), loaded)
        assertEquals(infoFixture, orch.info.value)

        // Exit: the blocks leave with the session.
        orch.exit()
        assertEquals(PlaybackState.Idle, orch.state.value)
        assertNull(orch.info.value)
    }

    @Test
    fun info_failure_leaves_blocks_absent_and_playback_intact() = runBlocking {
        val controller = FakeController()
        val transport = FakeTransport(descriptor = directDescriptor(), progress = epoch)
        val orch = PlayerOrchestration(
            controller = controller,
            transport = { transport },
            infoLoader = { InfoLoader { throw java.io.IOException("no net") } },
            scope = unconfinedScope(),
            delayer = { awaitCancellation() },
        )
        orch.play("i1")

        // Best-effort: the failed load surfaces nowhere — still Active, no
        // blocks (honest absence), playback untouched.
        assertTrue(orch.state.value is PlaybackState.Active)
        assertNull(orch.info.value)
    }

    @Test
    fun info_arriving_after_the_session_died_is_dropped() = runBlocking {
        var orchRef: PlayerOrchestration? = null
        val controller = FakeController()
        val transport = FakeTransport(descriptor = directDescriptor(), progress = epoch)
        val orch = PlayerOrchestration(
            controller = controller,
            transport = { transport },
            infoLoader = {
                InfoLoader {
                    // The session exits mid-load; the resolve lands after.
                    orchRef!!.exit()
                    throw java.io.IOException("aborted")
                }
            },
            scope = unconfinedScope(),
            delayer = { awaitCancellation() },
        )
        orchRef = orch
        orch.play("i1")

        // The stale resolve is DROPPED — no blocks over a dead session.
        assertEquals(PlaybackState.Idle, orch.state.value)
        assertNull(orch.info.value)
    }

    // ---- the ended edge + skip ranges (D7, 5.2) ----

    /** A descriptor carrying one classified intro range and one dropped
     * marker section — the served sections the classifier consumes. */
    private val sectionsFixture = listOf(
        kotlinx.serialization.json.Json.parseToJsonElement(
            """{"kind":"chapter","start":10.0,"end":90.0,"title":"intro"}""",
        ),
        kotlinx.serialization.json.Json.parseToJsonElement(
            """{"kind":"marker","start":100.0,"end":110.0,"title":"intro"}""",
        ),
    )

    /** The next-up offer fixture: a resolvable pick, countdown UNUSABLE —
     * the malformed-shape posture (no countdown, never autoplay). */
    private fun noCountdownOffer() = NextUpOffer(
        itemId = "i2",
        nameLine = "Сериал · S01E02",
        episodeTitle = "Дальше",
        countdownSeconds = null,
    )

    @Test
    fun skip_ranges_ride_the_descriptor_and_leave_with_the_session() = runBlocking {
        val controller = FakeController()
        val transport = FakeTransport(
            descriptor = directDescriptor(sections = sectionsFixture),
            progress = epoch,
        )
        val orch = PlayerOrchestration(
            controller = controller,
            transport = { transport },
            scope = unconfinedScope(),
            delayer = { awaitCancellation() },
        )
        orch.play("i1")

        // Classified at the describe seam: only the chapter classified —
        // the marker is honest absence.
        assertEquals(
            listOf(SkipSection(SkipKind.Intro, 10.0, 90.0)),
            orch.skipRanges.value,
        )

        // Exit: the ranges leave with the session (readout law).
        orch.exit()
        assertEquals(PlaybackState.Idle, orch.state.value)
        assertEquals(emptyList<SkipSection>(), orch.skipRanges.value)
    }

    @Test
    fun ended_edge_loads_offer_and_never_enters_the_machine() = runBlocking {
        val controller = FakeController()
        val transport = FakeTransport(descriptor = directDescriptor(), progress = epoch)
        val loaded = mutableListOf<String>()
        val orch = PlayerOrchestration(
            controller = controller,
            transport = { transport },
            nextUpLoader = {
                NextUpLoader { item ->
                    loaded += item
                    noCountdownOffer()
                }
            },
            scope = unconfinedScope(),
            delayer = { awaitCancellation() },
        )
        orch.play("i1")
        assertTrue(orch.state.value is PlaybackState.Active)

        // The ended edge: the card's offer loads, but the machine is NEVER
        // told — an ended media is not a flow failure, the state stays
        // Active (manual Back still exits).
        controller.emit(PlayerEvent.Ended)
        assertEquals(listOf("i1"), loaded)
        assertEquals(noCountdownOffer(), orch.nextUp.value)
        assertTrue(orch.state.value is PlaybackState.Active)
        // The unusable countdown shape: NO countdown and NEVER autoplay —
        // no baked fallback.
        assertNull(orch.countdown.value)
    }

    @Test
    fun loader_failure_answers_no_card_and_playback_intact() = runBlocking {
        val controller = FakeController()
        val transport = FakeTransport(descriptor = directDescriptor(), progress = epoch)
        val orch = PlayerOrchestration(
            controller = controller,
            transport = { transport },
            nextUpLoader = { NextUpLoader { throw java.io.IOException("no net") } },
            scope = unconfinedScope(),
            delayer = { awaitCancellation() },
        )
        orch.play("i1")
        controller.emit(PlayerEvent.Ended)

        assertTrue(orch.state.value is PlaybackState.Active)
        assertNull(orch.nextUp.value)
    }

    @Test
    fun countdown_ticks_off_the_injected_delay_and_fires_the_next_play() = runBlocking {
        val controller = FakeController()
        val transport = FakeTransport(descriptor = directDescriptor(), progress = epoch)
        // Two gates so the ticker (10s cadence) and the countdown (1s ticks)
        // never steal each other's sends — the ms names the gate.
        val tickerGate = Channel<Unit>(Channel.UNLIMITED)
        val countdownGate = Channel<Unit>(Channel.UNLIMITED)
        val orch = PlayerOrchestration(
            controller = controller,
            transport = { transport },
            nextUpLoader = {
                NextUpLoader { NextUpOffer("i2", "Сериал · S01E02", "Дальше", countdownSeconds = 2) }
            },
            scope = unconfinedScope(),
            delayer = { ms ->
                if (ms == PlayerOrchestration.COUNTDOWN_TICK_MS) countdownGate.receive() else tickerGate.receive()
            },
        )
        orch.play("i1")
        controller.emit(PlayerEvent.Ended)

        // The snapshot at the edge's open: 2s armed, nothing fired.
        assertEquals(2L, orch.countdown.value)
        assertTrue(orch.state.value is PlaybackState.Active)

        // Tick 1 → 1s left. Tick 2 → zero fires the «Смотреть» path: exit
        // the spent session, play the next episode.
        countdownGate.send(Unit)
        assertEquals(1L, orch.countdown.value)
        countdownGate.send(Unit)
        val next = orch.state.value as? PlaybackState.Active
        assertTrue(next != null)
        assertEquals("i2", next?.session?.item)
        // The edge closed with the departure: no lingering card/countdown.
        assertNull(orch.nextUp.value)
        assertNull(orch.countdown.value)
    }

    @Test
    fun seek_closes_the_edge_and_never_lets_the_countdown_land() = runBlocking {
        val controller = FakeController()
        val transport = FakeTransport(descriptor = directDescriptor(), progress = epoch)
        val countdownGate = Channel<Unit>(Channel.UNLIMITED)
        val orch = PlayerOrchestration(
            controller = controller,
            transport = { transport },
            nextUpLoader = {
                NextUpLoader { NextUpOffer("i2", "Сериал · S01E02", "Дальше", countdownSeconds = 5) }
            },
            scope = unconfinedScope(),
            delayer = { ms ->
                if (ms == PlayerOrchestration.COUNTDOWN_TICK_MS) countdownGate.receive() else awaitCancellation()
            },
        )
        orch.play("i1")
        controller.emit(PlayerEvent.Ended)
        assertEquals(5L, orch.countdown.value)

        // A seek is live playback again — the edge closes with its offer
        // and its countdown (cancellation never lets a countdown land).
        orch.seekTo(1_000L)
        assertNull(orch.nextUp.value)
        assertNull(orch.countdown.value)

        // Drive the gate freely: the cancelled countdown fires nothing.
        countdownGate.send(Unit)
        countdownGate.send(Unit)
        val active = orch.state.value as? PlaybackState.Active
        assertEquals("i1", active?.session?.item)
    }

    @Test
    fun cancel_suppresses_the_card_for_the_session() = runBlocking {
        val controller = FakeController()
        val transport = FakeTransport(descriptor = directDescriptor(), progress = epoch)
        var loads = 0
        val orch = PlayerOrchestration(
            controller = controller,
            transport = { transport },
            nextUpLoader = {
                NextUpLoader {
                    loads += 1
                    noCountdownOffer()
                }
            },
            scope = unconfinedScope(),
            delayer = { awaitCancellation() },
        )
        orch.play("i1")
        controller.emit(PlayerEvent.Ended)
        assertEquals(noCountdownOffer(), orch.nextUp.value)

        // «Отмена»: the card drops and every LATER ended edge in this app
        // session renders nothing — the loader is never even consulted.
        orch.cancelNextUp()
        assertNull(orch.nextUp.value)
        controller.emit(PlayerEvent.Ended)
        assertEquals(1, loads)
        assertNull(orch.nextUp.value)
        assertTrue(orch.state.value is PlaybackState.Active)
    }

    @Test
    fun replay_closes_the_edge_before_the_late_offer_lands() = runBlocking {
        var orchRef: PlayerOrchestration? = null
        val controller = FakeController()
        val transport = FakeTransport(descriptor = directDescriptor(), progress = epoch)
        val orch = PlayerOrchestration(
            controller = controller,
            transport = { transport },
            nextUpLoader = {
                NextUpLoader {
                    // The replay happens mid-load; the resolve lands after.
                    orchRef!!.playPause()
                    noCountdownOffer()
                }
            },
            scope = unconfinedScope(),
            delayer = { awaitCancellation() },
        )
        orchRef = orch
        orch.play("i1")
        controller.emit(PlayerEvent.Ended)

        // The replay closed the edge; the stale offer is DROPPED — never a
        // card over live playback.
        assertNull(orch.nextUp.value)
        assertTrue(orch.state.value is PlaybackState.Active)
    }
}
