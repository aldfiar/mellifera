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
    suspend fun play(itemId: String, isRetry: Boolean): PlayResponse
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
 * The watch-INFO seam (D7): the Active overlay's OK-revealed info blocks are
 * an affordance, never a machine effect — they load through THIS seam beside
 * the transport (the machine's effects stay describe/play/progress), the
 * production loader being [apiInfoLoader] (the SPA InfoColumn's reads over
 * the typed wire). The default loader answers nothing: honest absence — a
 * loader failure or an absent projection renders no blocks and never
 * disturbs playback.
 */
fun interface InfoLoader {
    suspend fun load(itemId: String): PlayerInfoBlocks?
}

/**
 * The next-up seam (D7, 5.2): the ended-edge card's offer loads through THIS
 * seam beside the InfoLoader (the same affordance-not-effect law), the
 * production loader being [apiNextUpLoader]. The default loader answers
 * nothing: a film (no parseable facts → no pick), an unmatched series, or a
 * loader failure renders no card — never a guessed pick.
 */
fun interface NextUpLoader {
    suspend fun load(itemId: String): NextUpOffer?
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
    private val infoLoader: () -> InfoLoader = { InfoLoader { null } },
    private val nextUpLoader: () -> NextUpLoader = { NextUpLoader { null } },
    private val scope: CoroutineScope,
    private val delayer: suspend (Long) -> Unit = { delay(it) },
    private val onExitRefresh: suspend () -> Unit = {},
    private val onUnauthorized: () -> Unit = {},
) {
    private val _state = MutableStateFlow<PlaybackState>(PlaybackState.Idle)
    val state: StateFlow<PlaybackState> = _state.asStateFlow()

    /** The timeline leaf's readout — straight out of the player (D8). */
    val readout: StateFlow<PlayerReadout> get() = controller.readout

    private val _info = MutableStateFlow<PlayerInfoBlocks?>(null)

    /**
     * The Active overlay's info blocks (D7) — the served projection only;
     * null = nothing to say. Readout-law sibling: the blocks live HERE,
     * never in AppState, and leave with the session.
     */
    val info: StateFlow<PlayerInfoBlocks?> = _info.asStateFlow()

    private val _skipRanges = MutableStateFlow<List<SkipSection>>(emptyList())

    /**
     * The Active session's served classified skip ranges (D7, 5.2) — the
     * descriptor's sections through [skipSectionsOf]; empty = nothing to
     * skip (the client never fabricates a range). Readout-law sibling: HERE,
     * never in AppState, refreshed by every describe leg and gone with the
     * session.
     */
    val skipRanges: StateFlow<List<SkipSection>> = _skipRanges.asStateFlow()

    private val _nextUp = MutableStateFlow<NextUpOffer?>(null)

    /**
     * The ended-edge card's offer (D7, 5.2) — null = no card (not an
     * episode, no pick, loader failure, or the edge is closed). HERE, never
     * in AppState; leaves with the session and closes on a replay or a seek.
     */
    val nextUp: StateFlow<NextUpOffer?> = _nextUp.asStateFlow()

    private val _countdown = MutableStateFlow<Long?>(null)

    /**
     * The countdown's remaining seconds, or null = no countdown running —
     * either the served shape was not usable at the edge's open (no
     * countdown and NEVER autoplay) or the edge closed.
     */
    val countdown: StateFlow<Long?> = _countdown.asStateFlow()

    /** The open ended edge (the PlayerEvent.Ended state) — the seek/replay
     * law closes it, the departure clear drops it. */
    private var endedEdgeOpen = false

    /** The session-scoped suppression (D7's cancel law — the SPA's
     * sessionStorage posture: set-once, dies with the app session). */
    private var nextUpCancelledForSession = false

    private var countdownJob: Job? = null
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
     * it is the same position). A toggle on an ended media is a REPLAY —
     * the replay law closes the ended edge.
     */
    fun playPause() {
        closeEndedEdge()
        controller.playPause()
        currentItem?.let { item -> scope.launch { flush(item) } }
    }

    /** A seek closes the ended edge (D7: the card never lingers over live
     * playback — a seek is live playback again). */
    fun seekBy(deltaMs: Long) {
        closeEndedEdge()
        controller.seekBy(deltaMs)
    }

    fun seekTo(positionMs: Long) {
        closeEndedEdge()
        controller.seekTo(positionMs)
    }

    /**
     * The card's [Отмена] (D7's cancel law): stops the countdown and
     * suppresses the card for the rest of the app session — every later
     * ended edge in this orchestration's lifetime renders nothing.
     */
    fun cancelNextUp() {
        nextUpCancelledForSession = true
        closeEndedEdge()
    }

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

    /**
     * The controller's ONE event channel: the failure kinds ferry into the
     * machine; [PlayerEvent.Ended] is the AutoNext card's open edge (D7) —
     * consumed here, NEVER ferried into the machine (an ended media is not
     * a flow failure).
     */
    fun onPlayerEvent(event: PlayerEvent) = when (event) {
        PlayerEvent.Ended -> onEnded()
        else -> dispatch(event.toMachine())
    }

    /** The player leaf's surface attaches through the orchestration. */
    fun attachSurface(surface: android.view.Surface?) = controller.attachSurface(surface)

    private fun PlayerEvent.toMachine(): PlaybackEvent = when (this) {
        is PlayerEvent.Fatal -> PlaybackEvent.PlayerFailed("fatal", code, detail)
        is PlayerEvent.VideoError -> PlaybackEvent.PlayerFailed("video-error", code, detail)
        is PlayerEvent.Stalled -> PlaybackEvent.PlayerFailed("stalled", code, detail)
        PlayerEvent.Ended -> error("Ended is consumed at onPlayerEvent, never ferried")
    }

    /**
     * The ended edge opens (D7, 5.2): the offer loads best-effort through
     * the seam; a session suppression renders nothing.
     */
    private fun onEnded() {
        if (nextUpCancelledForSession) return
        val item = currentItem ?: return
        endedEdgeOpen = true
        scope.launch { loadNextUp(item) }
    }

    /**
     * The next-up leg (D7): the loader's offer (a film or a no-pick answers
     * null — no card). A resolve landing after the edge closed (a seek, a
     * replay, the session left Active) is DROPPED — never a stale card over
     * live playback. The 401-anywhere law rides the leg like the info leg's.
     */
    private suspend fun loadNextUp(item: String) {
        val offer = try {
            nextUpLoader().load(item)
        } catch (e: CancellationException) {
            throw e
        } catch (e: HttpException) {
            if (e.code() == 401) dispatch(PlaybackEvent.Unauthorized)
            null
        } catch (e: Exception) {
            null
        }
        if (!endedEdgeOpen || _state.value !is PlaybackState.Active) return
        _nextUp.value = offer ?: return
        startCountdown(offer)
    }

    /**
     * The countdown (D7): one second at a time down to zero off the INJECTED
     * delay (the readout leaf law — never a real clock in JVM tests), zero
     * firing the [Смотреть] path (exit the spent session, play the next).
     * The snapshot is taken at the edge's open — an offer whose served shape
     * was unusable THEN never starts one ([NextUpOffer.countdownSeconds]
     * null → this never launches).
     */
    private fun startCountdown(offer: NextUpOffer) {
        val seconds = offer.countdownSeconds ?: return
        countdownJob?.cancel()
        countdownJob = scope.launch {
            var remaining = seconds
            while (remaining > 0) {
                _countdown.value = remaining
                delayer(COUNTDOWN_TICK_MS)
                remaining -= 1
            }
            _countdown.value = 0
            exit()
            play(offer.itemId)
        }
    }

    /** The seek/replay law: the edge closes with its offer and its countdown
     * — cancellation must never let a countdown land. */
    private fun closeEndedEdge() {
        endedEdgeOpen = false
        countdownJob?.cancel()
        countdownJob = null
        _countdown.value = null
        _nextUp.value = null
    }

    // ---- the machine ferry ----

    /**
     * One reduce + effect drain. Re-entrant by design: an eager scope (the
     * JVM tests run Unconfined) executes effect coroutines inside this call,
     * cascading describe → play → launch deterministically.
     */
    private fun dispatch(event: PlaybackEvent) {
        val wasActive = _state.value is PlaybackState.Active
        val transition = reduce(_state.value, event)
        _state.value = transition.state
        currentItem = when (val s = transition.state) {
            is PlaybackState.Starting -> s.item
            is PlaybackState.Active -> s.session.item
            is PlaybackState.Failed -> s.item
            else -> currentItem
        }
        transition.effects.forEach(::ferry)
        // The session-scoped affordances leave with the session (readout
        // law): only a DEPARTURE from Active clears them. A nested dispatch
        // deeper in the describe→play cascade may have just set them for the
        // new session — the outer frames (whose own state is still Starting)
        // must not clobber it.
        if (wasActive && transition.state !is PlaybackState.Active) {
            _info.value = null
            _skipRanges.value = emptyList()
            closeEndedEdge()
        }
        syncTicker()
    }

    private fun ferry(effect: PlaybackEffect) {
        when (effect) {
            is PlaybackEffect.Describe -> scope.launch { describeLeg() }
            is PlaybackEffect.Play -> scope.launch { playLeg(effect.item, effect.isRetry) }
            is PlaybackEffect.Poll -> {
                val item = currentItem
                scope.launch {
                    delayer(effect.delayMs)
                    if (item != null) describeLeg(item)
                }
            }
            is PlaybackEffect.Launch -> {
                scope.launch { launch(effect.session) }
                scope.launch { loadInfo(effect.session.item) }
            }
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
        val descriptor = try {
            transport().playback(item)
        } catch (e: CancellationException) {
            throw e
        } catch (e: HttpException) {
            dispatch(failureEvent(ApiFailure.Http(e.code())))
            return
        } catch (e: Exception) {
            dispatch(failureEvent(ApiFailure.Transport))
            return
        }
        // The session's served skip ranges ride every describe answer (D7):
        // classified at the seam, honest absence when nothing classifies.
        _skipRanges.value = skipSectionsOf(descriptor.sections)
        dispatch(PlaybackEvent.Described(descriptor))
    }

    private suspend fun playLeg(item: String, isRetry: Boolean) {
        try {
            dispatch(PlaybackEvent.Played(transport().play(item, isRetry).queued))
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

    /**
     * The info leg (D7): the served metadata projection for the Active
     * session's item — best-effort like the flush (a failure leaves the
     * blocks absent and never disturbs playback; the 401-anywhere law rides
     * it too). A resolve landing after the session left Active is DROPPED —
     * never stale blocks over a dead session.
     */
    private suspend fun loadInfo(item: String) {
        val blocks = try {
            infoLoader().load(item)
        } catch (e: CancellationException) {
            throw e
        } catch (e: HttpException) {
            if (e.code() == 401) dispatch(PlaybackEvent.Unauthorized)
            null
        } catch (e: Exception) {
            null
        }
        if (_state.value is PlaybackState.Active) _info.value = blocks
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

        /** The AutoNext countdown tick (D7): one second at a time, off the
         * injected delay. */
        const val COUNTDOWN_TICK_MS = 1_000L
    }
}
