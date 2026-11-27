package tv.mellifera.diag

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The playback-trace event shape + the INV4 PATH ONLY law (5.11): the
 * composed detail carries the timeline facts as key=value pairs, and any
 * URL loses its query before the event exists — the media token never
 * leaves the app, the path survives for the operator's reading.
 */
class TracerTest {

    @Test
    fun timeline_events_path_only() {
        val event = traceEvent(
            itemId = "i1",
            mode = "hls",
            facts = TraceFacts(
                code = "manifest",
                httpStatus = 200,
                url = "http://192.168.1.10:8080/media/i1/master.m3u8?token=SUPER-SECRET",
                format = "application/x-mpegURL",
                bytes = 1024,
            ),
        )

        // The receiving contract's playback-trace shape (3.2).
        assertEquals("playback-trace", event.kind)
        assertEquals("i1", event.itemId)
        assertEquals("hls", event.mode)
        assertEquals("trace", event.phase)
        assertEquals("manifest", event.code)

        // PATH ONLY: query stripped, path preserved.
        assertFalse(event.detail.contains("SUPER-SECRET"))
        assertFalse(event.detail.contains("?"))
        assertTrue(event.detail.contains("/media/i1/master.m3u8"))

        // The timeline facts ride the detail as key=value pairs.
        assertTrue(event.detail.contains("status=200"))
        assertTrue(event.detail.contains("format=application/x-mpegURL"))
        assertTrue(event.detail.contains("bytes=1024"))

        // The structured PlaybackException.errorCode on error traces.
        val error = traceEvent(
            itemId = "i1",
            mode = "hls",
            facts = TraceFacts(
                code = "error",
                errorCode = "ERROR_CODE_DECODING_FAILED",
            ),
        )
        assertEquals("error", error.code)
        assertTrue(error.detail.contains("error=ERROR_CODE_DECODING_FAILED"))
    }
}
