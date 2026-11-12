package tv.mellifera.dpad

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The player key routing law (5.9), pure: seek acceleration on hold, the
 * Ok reveal-then-toggle branch, and the Back dismiss-vs-pause-exit branch.
 */
class KeyRoutingTest {

    @Test
    fun seek_acceleration_on_hold() {
        // First press and the first repeat: ±10s.
        assertEquals(PlayerKeyAction.Seek(10_000L), routePlayerKey(DpadKey.Right, repeatCount = 0))
        assertEquals(PlayerKeyAction.Seek(10_000L), routePlayerKey(DpadKey.Right, repeatCount = 1))
        // Holding on: ±30s.
        assertEquals(PlayerKeyAction.Seek(30_000L), routePlayerKey(DpadKey.Right, repeatCount = 2))
        assertEquals(PlayerKeyAction.Seek(30_000L), routePlayerKey(DpadKey.Right, repeatCount = 4))
        // Still holding: ±60s.
        assertEquals(PlayerKeyAction.Seek(60_000L), routePlayerKey(DpadKey.Right, repeatCount = 5))
        assertEquals(PlayerKeyAction.Seek(60_000L), routePlayerKey(DpadKey.Right, repeatCount = 12))
        // Left mirrors negative.
        assertEquals(PlayerKeyAction.Seek(-10_000L), routePlayerKey(DpadKey.Left, repeatCount = 0))
        assertEquals(PlayerKeyAction.Seek(-30_000L), routePlayerKey(DpadKey.Left, repeatCount = 3))
        assertEquals(PlayerKeyAction.Seek(-60_000L), routePlayerKey(DpadKey.Left, repeatCount = 6))
    }

    @Test
    fun ok_reveals_then_toggles() {
        // Controls hidden: the first Ok REVEALS the control layer.
        assertEquals(
            PlayerKeyAction.ShowControls,
            routePlayerKey(DpadKey.Ok, controlsShown = false),
        )
        // Controls shown: the next Ok toggles play/pause.
        assertEquals(
            PlayerKeyAction.TogglePlay,
            routePlayerKey(DpadKey.Ok, controlsShown = true),
        )
        // The media play/pause key toggles regardless of the layer.
        assertEquals(
            PlayerKeyAction.TogglePlay,
            routePlayerKey(DpadKey.PlayPause, controlsShown = false),
        )
        assertEquals(
            PlayerKeyAction.TogglePlay,
            routePlayerKey(DpadKey.PlayPause, controlsShown = true),
        )
    }

    @Test
    fun back_dismisses_then_exits() {
        // Controls shown: Back dismisses them.
        assertEquals(
            PlayerKeyAction.DismissControls,
            routePlayerKey(DpadKey.Back, controlsShown = true),
        )
        // Controls hidden: Back pauses (flushing position) then exits.
        assertEquals(
            PlayerKeyAction.PauseExit,
            routePlayerKey(DpadKey.Back, controlsShown = false),
        )
    }

    @Test
    fun arrows_seek_regardless_of_controls_visibility() {
        // The seek law does not gate on the control layer.
        assertEquals(
            PlayerKeyAction.Seek(10_000L),
            routePlayerKey(DpadKey.Right, controlsShown = true),
        )
    }

    @Test
    fun up_down_are_not_player_keys() {
        assertNull(routePlayerKey(DpadKey.Up, controlsShown = true))
        assertNull(routePlayerKey(DpadKey.Down, controlsShown = false))
    }
}
