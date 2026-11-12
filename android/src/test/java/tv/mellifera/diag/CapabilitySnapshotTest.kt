package tv.mellifera.diag

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The capability-snapshot's decoder table shape (5.11): per-mime rows for
 * video/hevc + video/avc carrying name, hw/sw, secure/insecure, max
 * resolution@fps and profiles — and the event is NOT item-scoped (3.2
 * refuses capability-snapshot with item_id/mode/phase set).
 */
class CapabilitySnapshotTest {

    private val facts = DeviceFacts(
        model = "SHIELD Android TV",
        androidVersion = "11",
        apiLevel = 30,
        appVersion = "0.1.0",
        media3Version = "1.4.1",
        display = "1920x1080@60",
        audioPaths = "hdmi",
        decoders = listOf(
            DecoderRow(
                mime = "video/hevc",
                name = "OMX.Nvidia.h265.decode",
                hardware = true,
                secure = false,
                maxWidth = 3840,
                maxHeight = 2160,
                maxFps = 60,
                profiles = "2/1,4/4",
            ),
            DecoderRow(
                mime = "video/avc",
                name = "OMX.Nvidia.h264.decode",
                hardware = true,
                secure = true,
                maxWidth = 1920,
                maxHeight = 1080,
                maxFps = 60,
                profiles = "66/30",
            ),
            DecoderRow(
                mime = "video/avc",
                name = "c2.android.avc.decoder",
                hardware = false,
                secure = false,
            ),
        ),
    )

    @Test
    fun decoder_table_shape() {
        val event = snapshotEvent(facts)

        // The receiving contract's capability-snapshot shape (3.2):
        // detail carries the payload; item_id/mode/phase ABSENT.
        assertEquals("capability-snapshot", event.kind)
        assertEquals("", event.itemId)
        assertEquals("", event.mode)
        assertEquals("", event.phase)
        assertTrue(event.detail.isNotBlank())

        val detail = event.detail

        // Headline device facts ride the first line (the sender truncates
        // to 256 — identity survives the cut).
        assertTrue(detail.startsWith("model=SHIELD Android TV android=11 api=30"))
        assertTrue(detail.contains("app=0.1.0 media3=1.4.1 display=1920x1080@60 audio=hdmi"))

        // The decoder table: hevc + avc rows, hw/sw + secure markers,
        // max res@fps, profiles.
        assertTrue(detail.contains("video/hevc name=OMX.Nvidia.h265.decode hw insecure max=3840x2160@60fps profiles=2/1,4/4"))
        assertTrue(detail.contains("video/avc name=OMX.Nvidia.h264.decode hw secure max=1920x1080@60fps profiles=66/30"))
        assertTrue(detail.contains("video/avc name=c2.android.avc.decoder sw insecure"))

        // A snapshot without facts lines renders no fabricated markers.
        val bare = snapshotEvent(
            DeviceFacts("box", "9", 28, "0.1.0", "1.4.1", "1280x720", "", emptyList()),
        )
        assertFalse(bare.detail.contains("hw"))
        assertFalse(bare.detail.contains("max="))
    }
}
