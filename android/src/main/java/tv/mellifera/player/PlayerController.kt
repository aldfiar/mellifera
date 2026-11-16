package tv.mellifera.player

import android.view.Surface
import kotlinx.coroutines.flow.StateFlow

/**
 * Timeline readout pumped OUT of the player (D8): position/buffering never
 * enter AppState — the player leaf reads this flow at render time only.
 * [durationMs] floors to 0 while the media has none yet (unknown length —
 * the seek bar's honest absence: no duration, no bar, never a guessed
 * percent).
 */
data class PlayerReadout(
    val positionMs: Long = 0,
    val bufferedMs: Long = 0,
    val buffering: Boolean = false,
    val durationMs: Long = 0,
)

/**
 * The one player-level event vocabulary (D8, reconciled with the concrete
 * 5.5 event set): the controller REPORTS these to the consumer the wiring
 * installs. The failure kinds are ferried by the orchestration (playback/,
 * 5.7) into the flow machine as one PlaybackEvent.PlayerFailed — they are
 * the debug-events beacon vocabulary (3.2): fatal | video-error | stalled.
 * [Ended] is the ended EDGE (D7, 5.2): the media reached its end with no
 * error — the orchestration consumes it as the AutoNext card's open edge,
 * NEVER ferried into the machine (an ended media is not a flow failure).
 */
sealed interface PlayerEvent {
    data class Fatal(val code: String, val detail: String = "") : PlayerEvent
    data class VideoError(val code: String, val detail: String = "") : PlayerEvent
    data class Stalled(val code: String, val detail: String = "") : PlayerEvent

    /** The media's ended edge — the AutoNext card's open (D7). */
    data object Ended : PlayerEvent
}

/**
 * The player seam (D8): the ONLY owner of ExoPlayer/Media3. The Media3
 * implementation lands here in 5.7; the MediaSessionService fallback
 * (OQ-T3 miss) stays a one-file change behind this seam (5.10).
 */
interface PlayerController {
    val readout: StateFlow<PlayerReadout>

    /**
     * Launch playback. [playUrl] arrives RESOLVED (the orchestration runs
     * the RELATIVE play_url through transport.resolvePlayUrl — the pure
     * launchPlan pins the law, JVM-tested); [mode] direct|hls picks the
     * media config.
     */
    fun launch(itemId: String, playUrl: String, mode: String)
    fun playPause()
    fun seekBy(deltaMs: Long)
    fun seekTo(positionMs: Long)
    fun selectVoiceover(index: Int)

    /** The video surface the player renders into (null detaches). */
    fun attachSurface(surface: Surface?)
    fun end()

    /**
     * The ONE event channel (D8): the wiring installs a single consumer —
     * the orchestration — and every player-level event lands there.
     * Replaces the 5.1 placeholder onEvent, whose player → machine
     * direction this makes explicit.
     */
    fun setEventConsumer(consumer: (PlayerEvent) -> Unit)
}
