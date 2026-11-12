package tv.mellifera.playback

import android.view.Surface
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import tv.mellifera.net.PlaybackDescriptor
import tv.mellifera.net.PlayResponse
import tv.mellifera.net.ProgressDto
import tv.mellifera.net.ProgressRequest
import tv.mellifera.player.PlayerController
import tv.mellifera.player.PlayerEvent
import tv.mellifera.player.PlayerReadout
import tv.mellifera.player.voiceoverTrackIndex
import tv.mellifera.state.PlaybackState
import tv.mellifera.state.RenditionPlan

/** The controller-side fake: records the player-track indices it is told to pick. */
private class RecordingVoiceoverController : PlayerController {
    override val readout = MutableStateFlow(PlayerReadout())

    override fun setEventConsumer(consumer: (PlayerEvent) -> Unit) {}

    val picks = mutableListOf<Int>()

    override fun launch(itemId: String, playUrl: String, mode: String) {}
    override fun playPause() {}
    override fun seekBy(deltaMs: Long) {}
    override fun seekTo(positionMs: Long) {}

    override fun selectVoiceover(index: Int) {
        picks += index
    }

    override fun attachSurface(surface: Surface?) {}
    override fun end() {}
}

/** The transport fake: one fixed descriptor, no other behavior. */
private class DescriptorTransport(private val descriptor: PlaybackDescriptor) : PlaybackTransport {
    override suspend fun playback(itemId: String) = descriptor
    override suspend fun play(itemId: String, retry: Boolean) = PlayResponse(false)
    override suspend fun progress(itemId: String) = ProgressDto("i1", 0, "2026-11-12T00:00:00Z")

    override suspend fun putProgress(itemId: String, request: ProgressRequest) =
        ProgressDto("i1", 0, "2026-11-12T00:00:00Z")

    override fun resolvePlayUrl(playUrl: String) = playUrl
}

/** A complete-mode descriptor whose layout/voiceovers pick the rendition plan. */
private fun descriptor(layout: String?, voiceovers: Int) = PlaybackDescriptor(
    mode = "hls",
    state = "complete",
    playUrl = "/media/i1/master.m3u8",
    layout = layout,
    voiceovers = List(voiceovers) { kotlinx.serialization.json.JsonNull },
)

/**
 * The voiceover mapping law (5.8) — pure mapping plus the orchestration
 * joint: the Active session's plan decides what reaches
 * PlayerController.selectVoiceover. Pure JVM.
 */
class VoiceoverSelectionTest {

    @Test
    fun k_plus_1_on_single_variant() = runBlocking {
        // Pure law: pick k selects player audio track k+1 (0 = embedded).
        val plan = RenditionPlan.from("single-variant", voiceoverCount = 3)
        assertEquals(1, voiceoverTrackIndex(plan, 0))
        assertEquals(3, voiceoverTrackIndex(plan, 2))

        // Joint: a single-variant session ferries the MAPPED track down.
        val controller = RecordingVoiceoverController()
        val orch = PlayerOrchestration(
            controller = controller,
            transport = { DescriptorTransport(descriptor("single-variant", 2)) },
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined),
            delayer = { awaitCancellation() },
        )
        orch.play("i1")
        assertTrue(orch.state.value is PlaybackState.Active)

        orch.selectVoiceover(0)
        orch.selectVoiceover(2)
        assertEquals(listOf(1, 3), controller.picks)
    }

    @Test
    fun rendition_native_selection() = runBlocking {
        // Pure law: one variant per audio stream — the pick IS the native
        // audio-track index, no shift.
        val plan = RenditionPlan.from("rendition", voiceoverCount = 3)
        assertEquals(0, voiceoverTrackIndex(plan, 0))
        assertEquals(2, voiceoverTrackIndex(plan, 2))

        // Joint: the native index passes through to the player unchanged.
        val controller = RecordingVoiceoverController()
        val orch = PlayerOrchestration(
            controller = controller,
            transport = { DescriptorTransport(descriptor("rendition", 3)) },
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined),
            delayer = { awaitCancellation() },
        )
        orch.play("i1")
        assertTrue(orch.state.value is PlaybackState.Active)

        orch.selectVoiceover(2)
        assertEquals(listOf(2), controller.picks)
    }

    @Test
    fun absent_layout_fail_open() = runBlocking {
        // Pure law: absent or unknown layout → null (no selection).
        assertNull(voiceoverTrackIndex(RenditionPlan.from(null, voiceoverCount = 2), 0))
        assertNull(voiceoverTrackIndex(RenditionPlan.from("unknown-layout", voiceoverCount = 2), 0))

        // Joint: a legacy (layout-absent) session fail-opens — no selection
        // attempted, playback unaffected (still Active on the default audio).
        val controller = RecordingVoiceoverController()
        val orch = PlayerOrchestration(
            controller = controller,
            transport = { DescriptorTransport(descriptor(layout = null, voiceovers = 2)) },
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined),
            delayer = { awaitCancellation() },
        )
        orch.play("i1")
        assertTrue(orch.state.value is PlaybackState.Active)

        orch.selectVoiceover(0)
        assertEquals(0, controller.picks.size)
        assertTrue(orch.state.value is PlaybackState.Active)
    }
}
