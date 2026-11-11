package tv.mellifera.player

import kotlinx.coroutines.flow.StateFlow

/**
 * Timeline readout pumped OUT of the player (D8): position/buffering never
 * enter AppState — the player leaf reads this flow at render time only.
 */
data class PlayerReadout(
    val positionMs: Long = 0,
    val bufferedMs: Long = 0,
    val buffering: Boolean = false,
)

/**
 * The one playback event channel IN (D8): the flow machine (state/, 5.5)
 * classifies these into Idle/Starting/Active/Dead/Failed transitions.
 * Concrete event set arrives with 5.5.
 */
sealed interface PlayerEvent

/**
 * The player seam (D8): the ONLY owner of ExoPlayer/Media3. One interface,
 * ~6 methods + the readout StateFlow out + one event channel in — the
 * Media3 implementation lands in 5.7; the MediaSessionService fallback
 * (OQ-T3 miss) stays a one-file change behind this seam (5.10).
 */
interface PlayerController {
    val readout: StateFlow<PlayerReadout>

    fun launch(itemId: String, playUrl: String)
    fun playPause()
    fun seekBy(deltaMs: Long)
    fun seekTo(positionMs: Long)
    fun selectVoiceover(index: Int)
    fun end()

    fun onEvent(event: PlayerEvent)
}
