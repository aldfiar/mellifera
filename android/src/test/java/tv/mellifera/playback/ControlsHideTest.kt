package tv.mellifera.playback

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The controls auto-hide law's pins (5.5): the timer arms on reveal and on
 * every later input, is immune to playback progress ticks, and fires ~6s
 * after the LAST input — never earlier. Pure JVM.
 */
class ControlsHideTest {

    @Test
    fun starts_hidden_and_disarmed() {
        assertFalse(ControlsVisibility.HIDDEN.isVisible)
        // Disarmed: no elapsed span can fire a timer that was never armed.
        assertFalse(ControlsVisibility.HIDDEN.hideDue(Long.MAX_VALUE))
    }

    @Test
    fun input_reveals_and_arms_from_now() {
        val revealed = ControlsVisibility.HIDDEN.onPlayerInput(nowMs = 100_000L)
        assertTrue(revealed.isVisible)
        assertEquals(100_000L, revealed.armedAtMs)
        // Fires ~6s: not a beat before, exactly at the span.
        assertFalse(revealed.hideDue(100_000L + CONTROLS_HIDE_MS - 1))
        assertTrue(revealed.hideDue(100_000L + CONTROLS_HIDE_MS))
    }

    @Test
    fun input_while_shown_re_arms_from_the_latest_input() {
        var controls = ControlsVisibility.HIDDEN.onPlayerInput(nowMs = 0L)
        // A second input 3s in: the original arm dies — the 6s mark of the
        // FIRST input no longer fires; the timer runs from the LAST input.
        controls = controls.onPlayerInput(nowMs = 3_000L)
        assertFalse(controls.hideDue(6_000L))
        assertTrue(controls.hideDue(3_000L + CONTROLS_HIDE_MS))
    }

    @Test
    fun progress_ticks_never_reset_or_re_arm_the_timer() {
        var controls = ControlsVisibility.HIDDEN.onPlayerInput(nowMs = 0L)
        // Playback runs: a tick a second in, every shape of position update —
        // none of them may push the armed stamp forward.
        controls = controls.onProgressTick()
        controls = controls.onProgressTick()
        assertEquals(0L, controls.armedAtMs)
        assertTrue(controls.isVisible)
        // The hide still fires at the ORIGINAL input's 6s mark — the 0.3.2
        // defect was exactly this mark being pushed every frame.
        assertTrue(controls.hideDue(CONTROLS_HIDE_MS))
        assertFalse(controls.hideDue(CONTROLS_HIDE_MS - 1))
    }

    @Test
    fun dismiss_hides_and_disarms() {
        val dismissed = ControlsVisibility.HIDDEN
            .onPlayerInput(nowMs = 0L)
            .onDismiss()
        assertFalse(dismissed.isVisible)
        assertFalse(dismissed.hideDue(Long.MAX_VALUE))
    }
}
