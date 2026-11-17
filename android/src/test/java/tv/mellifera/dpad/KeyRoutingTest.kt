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
    fun audio_track_routes_cycle_voiceover_regardless_of_controls_visibility() {
        // The audio-track media key is transport-class (9.2): it cycles the
        // voiceover whether or not the control layer is revealed.
        assertEquals(
            PlayerKeyAction.CycleVoiceover,
            routePlayerKey(DpadKey.AudioTrack, controlsShown = false),
        )
        assertEquals(
            PlayerKeyAction.CycleVoiceover,
            routePlayerKey(DpadKey.AudioTrack, controlsShown = true),
        )
    }

    @Test
    fun up_down_are_not_player_keys() {
        assertNull(routePlayerKey(DpadKey.Up, controlsShown = true))
        assertNull(routePlayerKey(DpadKey.Down, controlsShown = false))
    }

    @Test
    fun row_walks_horizontally_and_clamps() {
        // Left/Right step inside the row.
        assertEquals(1, moveInRow(0, 4, DpadKey.Right))
        assertEquals(2, moveInRow(1, 4, DpadKey.Right))
        assertEquals(0, moveInRow(1, 4, DpadKey.Left))
        // Edges clamp INSIDE the row — the wiring reads the clamp as
        // "not consumed" (LEFT at x=0 → the rail trigger; RIGHT at the
        // last card stays put).
        assertEquals(0, moveInRow(0, 4, DpadKey.Left))
        assertEquals(3, moveInRow(3, 4, DpadKey.Right))
    }

    @Test
    fun row_up_down_keep_the_cursor_so_arrows_cross_natively() {
        // Up/Down are not row keys: the cursor keeps its position and the
        // wiring leaves the arrow unconsumed — Compose's focus search
        // crosses rows/settings/grid natively (the L2 law).
        assertEquals(2, moveInRow(2, 4, DpadKey.Up))
        assertEquals(2, moveInRow(2, 4, DpadKey.Down))
    }

    @Test
    fun row_handles_empty_and_out_of_range() {
        // An empty row never moves; an out-of-range cursor coerces in first.
        assertEquals(0, moveInRow(0, 0, DpadKey.Right))
        assertEquals(2, moveInRow(9, 3, DpadKey.Up))
        assertEquals(1, moveInRow(-1, 3, DpadKey.Right))
    }
}
