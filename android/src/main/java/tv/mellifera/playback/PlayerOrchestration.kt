package tv.mellifera.playback

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import retrofit2.HttpException
import tv.mellifera.net.DebugEventRequest
import tv.mellifera.net.PlaybackDescriptor
import tv.mellifera.net.PlayResponse
import tv.mellifera.net.ProgressDto
import tv.mellifera.net.ProgressRequest
import tv.mellifera.player.PlayerController
import tv.mellifera.player.PlayerEvent
import tv.mellifera.player.PlayerReadout
import tv.mellifera.player.voiceoverTrackIndex
import tv.mellifera.state.ApiFailure
import tv.mellifera.state.Phase
import tv.mellifera.state.RenditionPlan
import tv.mellifera.state.PlaybackEffect
import tv.mellifera.state.PlaybackEvent
import tv.mellifera.state.PlaybackState
import tv.mellifera.state.PlaySession
import tv.mellifera.state.reduce

/**
 * The net legs the machine's effects consume (descriptor/play/progress +
 * the play_url resolver) — narrowed so the JVM tests can stand a fake in
 * for the whole transport without Retrofit/OkHttp.
 */
interface PlaybackTransport {
    suspend fun playback(itemId: String): PlaybackDescriptor
    suspend fun play(itemId: String, retry: Boolean): PlayResponse
    suspend fun progress(itemId: String): ProgressDto
    suspend fun putProgress(itemId: String, request: ProgressRequest): ProgressDto
    fun resolvePlayUrl(playUrl: String): String
}

/**
 * The beacon SENDER seam (5.7 defines it, 5.8 implements the Channel(16)
 * worker over MelliferaApi.debugEvent with the 429 cooldown and the
 * INV4 strip-query-before-send): the orchestration ferries the machine's
 * Beacon effect here, fire-and-forget. The event arrives already shaped to
 * the debug-events five-field contract (phase = the kind, 3.2).
 */
fun interface BeaconSender {
    suspend fun send(event: DebugEventRequest)
}

/**
 * The effect ferry + progress ticker (D8, 5.7): the flow machine
 * (state/Playback.kt, 5.5 — FROZEN) decides; this class executes each
 * effect and ferries controller events back in as machine events.
 *
 * Position/buffering live ONLY in the controller's readout flow — never in
 * AppState; the ticker samples it every [SAMPLE_PERIOD_MS] while Active and
 * flushes on pause and exit (the exit flush rides the machine's own
 * FlushProgress effect, and EndPlayer fires the browse refresh hook).
 */
class PlayerOrchestration(
    private val controller: PlayerController,
    private val transport: () -> PlaybackTransport,
    private val sender: BeaconSender = BeaconSender { },
    private val scope: CoroutineScope,
    private val delayer: suspend (Long) -> Unit = { delay(it) },
    private val onExitRefresh: suspend () -> Unit = {},
    private val onUnauthorized: () -> Unit = {},
) {
    private val _state = MutableStateFlow<PlaybackState>(PlaybackState.Idle)
    val state: StateFlow<PlaybackState> = _state.asStateFlow()

    /** The timeline leaf's readout — straight out of the player (D8). */
    val readout: StateFlow<PlayerReadout> get() = controller.readout

    private var tickerJob: Job? = null
    private var currentItem: String? = null

    init {
        controller.setEventConsumer { onPlayerEvent(it) }
    }

    // ---- user intents ----

    fun play(item: String) = dispatch(PlaybackEvent.PlayRequested(item))

    /** The Failed state's retry chip. */
    fun retry() = dispatch(PlaybackEvent.RetryRequested)

    /** Back out of the player. */
    fun exit() = dispatch(PlaybackEvent.ExitRequested)

    /**
     * Toggles pause; both directions flush the stored position immediately
     * (the pause leg of the flush law — flushing on resume is harmless,
     * it is the same position).
     */
    fun playPause() {
        controller.playPause()
        currentItem?.let { item -> scope.launch { flush(item) } }
    }

    fun seekBy(deltaMs: Long) = controller.seekBy(deltaMs)

    fun seekTo(positionMs: Long) = controller.seekTo(positionMs)

    /**
     * The voiceover pick (5.8): the Active session's rendition plan maps
     * the pick onto the player track ([voiceoverTrackIndex] — k+1 on a
     * single-variant master, native passthrough on rendition); NoPicker
     * (or nothing playing) fail-opens — no selection attempted.
     */
    fun selectVoiceover(index: Int) {
        val plan = (_state.value as? PlaybackState.Active)?.session?.plan ?: RenditionPlan.NoPicker
        val track = voiceoverTrackIndex(plan, index) ?: return
        controller.selectVoiceover(track)
    }

    /** The controller's ONE event channel ferried into the machine. */
    fun onPlayerEvent(event: PlayerEvent) = dispatch(event.toMachine())

    /** The player leaf's surface attaches through the orchestration. */
    fun attachSurface(surface: android.view.Surface?) = controller.attachSurface(surface)

    private fun PlayerEvent.toMachine(): PlaybackEvent = when (this) {
        is PlayerEvent.Fatal -> PlaybackEvent.PlayerFailed("fatal", code, detail)
        is PlayerEvent.VideoError -> PlaybackEvent.PlayerFailed("video-error", code, detail)
        is PlayerEvent.Stalled -> PlaybackEvent.PlayerFailed("stalled", code, detail)
    }

    // ---- the machine ferry ----

    /**
     * One reduce + effect drain. Re-entrant by design: an eager scope (the
     * JVM tests run Unconfined) executes effect coroutines inside this call,
     * cascading describe → play → launch deterministically.
     */
    private fun dispatch(event: PlaybackEvent) {
        val transition = reduce(_state.value, event)
        _state.value = transition.state
        currentItem = when (val s = transition.state) {
            is PlaybackState.Starting -> s.item
            is PlaybackState.Active -> s.session.item
            is PlaybackState.Failed -> s.item
            else -> currentItem
        }
        transition.effects.forEach(::ferry)
        syncTicker()
    }

    private fun ferry(effect: PlaybackEffect) {
        when (effect) {
            is PlaybackEffect.Describe -> scope.launch { describeLeg() }
            is PlaybackEffect.Play -> scope.launch { playLeg(effect.item, effect.retry) }
            is PlaybackEffect.Poll -> {
                val item = currentItem
                scope.launch {
                    delayer(effect.delayMs)
                    if (item != null) describeLeg(item)
                }
            }
            is PlaybackEffect.Launch -> scope.launch { launch(effect.session) }
            is PlaybackEffect.Beacon -> {
                val item = currentItem
                scope.launch {
                    sender.send(
                        DebugEventRequest(
                            kind = effect.kind,
                            itemId = item ?: "",
                            mode = effect.mode,
                            phase = effect.kind,
                            code = effect.code,
                            detail = effect.detail,
                        ),
                    )
                }
            }
            is PlaybackEffect.FlushProgress -> scope.launch { flush(effect.item) }
            PlaybackEffect.EndPlayer -> {
                controller.end()
                scope.launch { onExitRefresh() }
            }
            PlaybackEffect.WipeToPairing -> onUnauthorized()
        }
    }

    /**
     * The describe/poll leg — one wire call, GET /items/{id}/playback; the
     * machine event follows the current phase (PollFailed under Polling so
     * the 404-dead/backoff rows rule).
     */
    private suspend fun describeLeg() {
        val item = currentItem ?: return
        describeLeg(item)
    }

    private suspend fun describeLeg(item: String) {
        try {
            dispatch(PlaybackEvent.Described(transport().playback(item)))
        } catch (e: CancellationException) {
            throw e
        } catch (e: HttpException) {
            dispatch(failureEvent(ApiFailure.Http(e.code())))
        } catch (e: Exception) {
            dispatch(failureEvent(ApiFailure.Transport))
        }
    }

    private suspend fun playLeg(item: String, retry: Boolean) {
        try {
            dispatch(PlaybackEvent.Played(transport().play(item, retry).queued))
        } catch (e: CancellationException) {
            throw e
        } catch (e: HttpException) {
            dispatch(PlaybackEvent.PlayRejected(ApiFailure.Http(e.code())))
        } catch (e: Exception) {
            dispatch(PlaybackEvent.PlayRejected(ApiFailure.Transport))
        }
    }

    /**
     * The launch leg: the stored progress seeds the resume seek (fail-open
     * on any transport failure — playback starts from zero), the RELATIVE
     * play_url resolves against the configured base, and the machine stays
     * Active (nothing here can rule the flow).
     */
    private suspend fun launch(session: PlaySession) {
        val resumeMs = try {
            transport().progress(session.item).positionSeconds * 1000
        } catch (e: CancellationException) {
            throw e
        } catch (e: HttpException) {
            if (e.code() == 401) {
                dispatch(PlaybackEvent.Unauthorized)
                return
            }
            0
        } catch (e: Exception) {
            0
        }
        controller.launch(session.item, transport().resolvePlayUrl(session.url), session.mode)
        if (resumeMs > 0) controller.seekTo(resumeMs)
    }

    /** Best-effort PUT progress from the player readout — never surfaces. */
    private suspend fun flush(item: String) {
        try {
            transport().putProgress(item, ProgressRequest(controller.readout.value.positionMs / 1000))
        } catch (e: CancellationException) {
            throw e
        } catch (e: HttpException) {
            if (e.code() == 401) dispatch(PlaybackEvent.Unauthorized)
        } catch (e: Exception) {
            // A lost progress flush must never disturb playback.
        }
    }

    private fun failureEvent(failure: ApiFailure): PlaybackEvent =
        if (isPolling()) PlaybackEvent.PollFailed(failure) else PlaybackEvent.DescribeFailed(failure)

    private fun isPolling(): Boolean =
        (_state.value as? PlaybackState.Starting)?.phase == Phase.Polling

    /** The ticker lives exactly while Active — position leaves with the session. */
    private fun syncTicker() {
        val active = _state.value is PlaybackState.Active
        if (active && tickerJob == null) {
            tickerJob = scope.launch {
                while (_state.value is PlaybackState.Active) {
                    delayer(SAMPLE_PERIOD_MS)
                    currentItem?.let { flush(it) }
                }
            }
        } else if (!active) {
            tickerJob?.cancel()
            tickerJob = null
        }
    }

    companion object {
        /** The readout.sample cadence (D8): one progress PUT per 10s playing. */
        const val SAMPLE_PERIOD_MS = 10_000L
    }
}
