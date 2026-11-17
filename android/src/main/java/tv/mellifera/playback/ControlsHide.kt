package tv.mellifera.playback

/**
 * The controls auto-hide law (5.5, the SPA overlay idiom): revealing the
 * controls arms a ~[CONTROLS_HIDE_MS] hide timer that runs from the LAST
 * DPAD INPUT — every later input re-arms it — and the timer is IMMUNE to
 * playback progress ticks (a position update must never restart it; that
 * reset-every-frame shape is exactly the 0.3.2 defect this restores). Back
 * stays outside this law: its two-stage dismiss-vs-exit routing (5.9) is
 * untouched. Pure module — no Android, no flow; pinned in ControlsHideTest.
 */

/** How long the control layer stays visible after the last dpad input —
 * the SPA's ~6s overlay hide. */
const val CONTROLS_HIDE_MS = 6_000L

/**
 * The control layer's visibility: whether it is shown plus the re-arm
 * stamp (a monotonic clock reading) the hide timer runs from. [HIDDEN] is
 * the entry state — the overlay never opens with controls up.
 */
data class ControlsVisibility(
    val isVisible: Boolean,
    val armedAtMs: Long,
) {
    companion object {
        val HIDDEN = ControlsVisibility(isVisible = false, armedAtMs = 0L)
    }
}

/**
 * A dpad input the overlay consumed (reveal, seek, toggle, media key):
 * the controls REVEAL — any key while hidden re-reveals — and the hide
 * timer re-arms from NOW, so the layer survives only [CONTROLS_HIDE_MS]
 * past the latest input, never past the reveal.
 */
fun ControlsVisibility.onPlayerInput(nowMs: Long): ControlsVisibility =
    ControlsVisibility(isVisible = true, armedAtMs = nowMs)

/**
 * Back's first stage (5.9): the controls hide and the timer disarms —
 * hidden means disarmed, no stray timer firing later.
 */
fun ControlsVisibility.onDismiss(): ControlsVisibility = ControlsVisibility.HIDDEN

/**
 * A playback progress tick. No visibility event — the state is returned
 * UNCHANGED, which is the immunity law: the armed stamp never moves on a
 * tick, so the hide timer cannot be restarted by playback.
 */
fun ControlsVisibility.onProgressTick(): ControlsVisibility = this

/**
 * Whether the hide has fired by [nowMs]: only while shown, and only once
 * the full [CONTROLS_HIDE_MS] span has elapsed since the last input — the
 * boundary is inclusive (at exactly 6s the controls hide).
 */
fun ControlsVisibility.hideDue(nowMs: Long): Boolean =
    isVisible && nowMs - armedAtMs >= CONTROLS_HIDE_MS
