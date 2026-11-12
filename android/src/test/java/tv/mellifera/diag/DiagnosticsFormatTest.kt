package tv.mellifera.diag

import org.junit.Assert.assertEquals
import org.junit.Test
import tv.mellifera.net.DebugEventRequest

/**
 * The share-text composer (5.11): «Поделиться диагностикой» hands the
 * session's sent events to the share sheet, one line per event, oldest
 * first — the snapshot's full (untruncated) detail included.
 */
class DiagnosticsFormatTest {

    @Test
    fun share_text_composes_events() {
        val text = formatDiagnostics(
            listOf(
                DebugEventRequest(
                    kind = "capability-snapshot",
                    detail = "model=box api=30 " + "x".repeat(400),
                ),
                DebugEventRequest(
                    kind = "playback-trace",
                    itemId = "i1",
                    mode = "hls",
                    phase = "trace",
                    code = "first-frame",
                    detail = "code=first-frame first_frame_ms=812",
                ),
            ),
        )
        assertEquals(
            listOf(
                "mellifera-tv diagnostics",
                "- kind=capability-snapshot phase= code=: model=box api=30 " + "x".repeat(400),
                "- kind=playback-trace phase=trace code=first-frame: " +
                    "code=first-frame first_frame_ms=812",
            ),
            text.trim().lines(),
        )
    }
}
