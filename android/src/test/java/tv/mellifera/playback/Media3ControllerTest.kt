package tv.mellifera.playback

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import tv.mellifera.net.Api
import tv.mellifera.player.launchPlan

/**
 * The launch-prep law (5.7/D8) pinned on the pure launchPlan — the
 * RELATIVE play_url resolves against the configured base through
 * net/Api.resolvePlayUrl, mode picks the config (hls vs direct), and an
 * already-absolute URL passes through unchanged (never re-prefixed). No
 * Android framework: the Media3 mapping (LaunchPlan → MediaItem) hangs off
 * exactly these facts.
 */
class Media3ControllerTest {
    private val api = Api("http://192.168.1.10:8080")
    private val resolve: (String) -> String = { url -> api.resolvePlayUrl(url) }

    @Test
    fun launch_resolves_relative() {
        // hls: the pack's relative play_url against the configured base.
        val hls = launchPlan("/media/e1/master.m3u8?token=tok", "hls", resolve)
        assertEquals("http://192.168.1.10:8080/media/e1/master.m3u8?token=tok", hls.resolvedUrl)
        assertTrue(hls.hls)

        // direct: same resolution law, non-hls config.
        val direct = launchPlan("/media/e1/original.mkv?token=tok", "direct", resolve)
        assertEquals("http://192.168.1.10:8080/media/e1/original.mkv?token=tok", direct.resolvedUrl)
        assertFalse(direct.hls)

        // absolute passthrough: never re-prefixed.
        val absolute = launchPlan("http://other-host/media/original.mkv", "direct", resolve)
        assertEquals("http://other-host/media/original.mkv", absolute.resolvedUrl)
        assertFalse(absolute.hls)
    }
}
