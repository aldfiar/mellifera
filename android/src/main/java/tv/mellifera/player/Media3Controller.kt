package tv.mellifera.player

import android.content.Context
import android.view.Surface
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.exoplayer.ExoPlayer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * The pure launch prep (D8): the RELATIVE play_url is resolved against the
 * configured base through the injected resolver (net/Api.resolvePlayUrl,
 * 5.3) and the media config is picked by mode. Free of android.* so the
 * JVM test (Media3ControllerTest::launch_resolves_relative) pins the law
 * directly — the controller maps [LaunchPlan] onto Media3 types.
 */
data class LaunchPlan(
    val resolvedUrl: String,
    val mode: String,
    val isHls: Boolean,
)

fun launchPlan(playUrl: String, mode: String, resolve: (String) -> String): LaunchPlan =
    LaunchPlan(
        resolvedUrl = resolve(playUrl),
        mode = mode,
        isHls = mode == "hls",
    )

/**
 * The Media3/ExoPlayer implementation of [PlayerController] (D8) — the one
 * ExoPlayer owner. Player ops are posted to [scope] (main on device) so a
 * call from any coroutine is safe; the readout flow is a ~500ms poll of the
 * player, and video errors surface as [PlayerEvent.VideoError] through the
 * single event consumer (the orchestration, 5.7).
 */
class Media3Controller(
    context: Context,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main),

    /**
     * The ONE analytics hook (5.11): invoked per launch with the freshly
     * built player and the launch facts (itemId+mode) — the tracer attaches
     * itself. Null (JVM tests, no-telemetry wiring) keeps the player bare.
     */
    private val analyticsAttach: ((ExoPlayer, String, String) -> Unit)? = null,
) : PlayerController {

    private val appContext = context.applicationContext

    private val _readout = MutableStateFlow(PlayerReadout())
    override val readout: StateFlow<PlayerReadout> = _readout.asStateFlow()

    private var eventConsumer: ((PlayerEvent) -> Unit)? = null
    override fun setEventConsumer(consumer: (PlayerEvent) -> Unit) {
        eventConsumer = consumer
    }

    private var player: ExoPlayer? = null
    private var readoutPoller: Job? = null

    /**
     * The latest video surface the holder callbacks handed us — remembered
     * across player recreation, because surfaceCreated can fire BEFORE
     * [launch] finishes building the player and the attach must not be
     * lost: the freshly built player applies it at creation. NOT cleared
     * by [releasePlayer]: the holder owns the surface's lifecycle
     * (surfaceDestroyed is what detaches-null), and a fresh play() onto
     * the still-composed SurfaceView must re-attach immediately — no new
     * surfaceCreated will fire for an already-created holder.
     */
    private var latestSurface: Surface? = null

    override fun launch(itemId: String, playUrl: String, mode: String) {
        // Resolution already happened at the wiring (transport.resolvePlayUrl);
        // the plan here only picks the media config by mode.
        val plan = launchPlan(playUrl, mode, resolve = { it })
        scope.launch {
            releasePlayer()
            val item = MediaItem.Builder()
                .setUri(plan.resolvedUrl)
                .apply { if (plan.isHls) setMimeType(MimeTypes.APPLICATION_M3U8) }
                .build()
            val p = ExoPlayer.Builder(appContext).build()
            // The punch-through law (D7/5.4): a surface the holder handed us
            // before this player existed is applied HERE, at creation —
            // null (no holder surface yet) keeps dummy mode until
            // surfaceCreated attaches.
            p.setVideoSurface(latestSurface)
            analyticsAttach?.invoke(p, itemId, mode)
            p.addListener(object : Player.Listener {
                override fun onPlayerError(error: PlaybackException) {
                    eventConsumer?.invoke(
                        PlayerEvent.VideoError(
                            code = error.errorCodeName,
                            detail = error.message ?: "",
                        ),
                    )
                }

                override fun onPlaybackStateChanged(playbackState: Int) {
                    // The ended edge (D7, 5.2): STATE_ENDED with no error is
                    // the AutoNext card's open — the orchestration consumes
                    // it beside the failure kinds, never into the machine.
                    if (playbackState == Player.STATE_ENDED) {
                        eventConsumer?.invoke(PlayerEvent.Ended)
                    }
                }
            })
            p.setMediaItem(item)
            p.prepare()
            p.playWhenReady = true
            player = p
            startReadoutPoller(p)
        }
    }

    override fun playPause() {
        scope.launch { player?.let { it.playWhenReady = !it.playWhenReady } }
    }

    override fun seekBy(deltaMs: Long) {
        scope.launch { player?.let { it.seekTo(it.currentPosition + deltaMs) } }
    }

    override fun seekTo(positionMs: Long) {
        scope.launch { player?.seekTo(positionMs) }
    }

    override fun selectVoiceover(index: Int) {
        scope.launch { selectAudioTrack(index) }
    }

    override fun attachSurface(surface: Surface?) {
        scope.launch {
            latestSurface = surface
            player?.setVideoSurface(surface)
        }
    }

    override fun end() {
        scope.launch { releasePlayer() }
    }

    /** Release the player and reset the readout — leaving Active or relaunching. */
    private fun releasePlayer() {
        readoutPoller?.cancel()
        readoutPoller = null
        player?.release()
        player = null
        _readout.value = PlayerReadout()
    }

    private fun startReadoutPoller(p: ExoPlayer) {
        readoutPoller?.cancel()
        readoutPoller = scope.launch {
            while (player === p) {
                _readout.value = PlayerReadout(
                    positionMs = p.currentPosition,
                    bufferedMs = p.bufferedPosition,
                    isBuffering = p.playbackState == Player.STATE_BUFFERING,
                    durationMs = p.duration.takeIf { it != C.TIME_UNSET && it > 0 } ?: 0,
                )
                delay(READOUT_PERIOD_MS)
            }
        }
    }

    /**
     * Best-effort audio track pick by index (the voiceover law's player leg;
     * the k → k+1 mapping lives in the flow layer, 5.8).
     */
    private fun selectAudioTrack(index: Int) {
        val p = player ?: return
        val audioGroups = p.currentTracks.groups.filter { it.type == C.TRACK_TYPE_AUDIO }
        if (audioGroups.isEmpty()) return
        val selected = audioGroups[index.coerceIn(0, audioGroups.lastIndex)]
        p.trackSelectionParameters = p.trackSelectionParameters.buildUpon()
            .setOverrideForType(TrackSelectionOverride(selected.mediaTrackGroup, 0))
            .build()
    }

    private companion object {
        const val READOUT_PERIOD_MS = 500L
    }
}
