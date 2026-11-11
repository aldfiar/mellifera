package tv.mellifera.state

import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test
import tv.mellifera.net.PlaybackDescriptor

/**
 * The voiceover/track plan pins (5.5): single-variant k → audioTrack k+1,
 * rendition → native selection, absent/unknown layout → fail-open.
 */
class RenditionPlanTest {

    private fun desc(layout: String?, voiceovers: Int = 0) = PlaybackDescriptor(
        mode = "hls",
        state = "complete",
        playUrl = "/media/items/i1/hls/index.m3u8?token=tok",
        layout = layout,
        voiceovers = List(voiceovers) { JsonPrimitive("v$it") },
    )

    @Test
    fun single_variant_k_plus_1() {
        // The flat one-audio master: pick k maps to player audio track k+1
        // (0 = embedded audio).
        val plan = RenditionPlan.from("single-variant", voiceoverCount = 3)
        assertEquals(RenditionPlan.SingleVariant(3), plan)
        assertEquals(1, (plan as RenditionPlan.SingleVariant).audioTrack(0))
        assertEquals(2, plan.audioTrack(1))
        assertEquals(3, plan.audioTrack(2))
        // The descriptor-facts shortcut reads layout + the voiceover list.
        assertEquals(RenditionPlan.SingleVariant(2), renditionPlanOf(desc("single-variant", 2)))
    }

    @Test
    fun rendition_native() {
        // One variant per audio stream: native track selection, no k+1
        // mapping.
        assertEquals(RenditionPlan.Rendition, RenditionPlan.from("rendition", 5))
        assertEquals(RenditionPlan.Rendition, renditionPlanOf(desc("rendition", 4)))
    }

    @Test
    fun absent_fail_open() {
        // Absent layout (legacy build) — and any unknown layout value —
        // fail open: default audio, no picker, never a type hole.
        assertEquals(RenditionPlan.NoPicker, RenditionPlan.from(null, 0))
        assertEquals(RenditionPlan.NoPicker, RenditionPlan.from("", 3))
        assertEquals(RenditionPlan.NoPicker, RenditionPlan.from("mystery", 1))
        assertEquals(RenditionPlan.NoPicker, renditionPlanOf(desc(layout = null)))
        // Direct answers carry no layout either — fail-open by the same law.
        assertEquals(
            RenditionPlan.NoPicker,
            renditionPlanOf(desc(layout = null).copy(mode = "direct")),
        )
    }
}
