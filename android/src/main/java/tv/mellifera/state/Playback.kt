package tv.mellifera.state

import tv.mellifera.net.PlaybackDescriptor

/**
 * The playback flow machine (5.5, D1/D8) — the ONE pure surface for the
 * flow law: `reduce(state, event)` over
 * Idle | Starting | Active | Dead | Failed, plus the RenditionPlan and the
 * preparing-poll classification. No android.* imports, no transport, no
 * time: the same (state, event) always yields the same (state, effects).
 * Every flow behavior is pinned in PlaybackReduceTest/RenditionPlanTest;
 * the wiring (5.7) merely ferries events in and effects out — a flow fix is
 * a reduce fix plus a table row.
 *
 * States carry [PlaybackDescriptor] where the law needs the wire facts it
 * encodes (play_url verbatim, state_reason vocabulary, layout); the pinned
 * law fields (item/phase/attempt/usedMaybePlay, banner) keep their names.
 */

/** The five flow states. Dead renders NO retry affordance; Failed does. */
sealed class PlaybackState {
    data object Idle : PlaybackState()

    /**
     * The describe→play→poll in-between. [phase] says which leg is in
     * flight; [attempt] counts plays dispatched (0 until the first) — the
     * retry chip's play leg carries retry = attempt > 0; under [Phase.Polling]
     * it counts polls scheduled and drives the 2s→30s backoff.
     * [usedMaybePlay] pins the ONCE of the optimistic retry:false play.
     * [descriptor] carries the last wire answer the law reads.
     */
    data class Starting(
        val item: String,
        val phase: Phase,
        val attempt: Int,
        val usedMaybePlay: Boolean,
        val descriptor: PlaybackDescriptor? = null,
    ) : PlaybackState()

    /** Playing. [PlaySession.url] is the descriptor's play_url VERBATIM —
     * relative; resolution against the configured base is transport law
     * (net/Api.resolvePlayUrl, 5.3) and the token rides the query, never a
     * log line (INV4). */
    data class Active(val session: PlaySession) : PlaybackState()

    /** Terminal, honest, NO retry: missing/unsupported/404-describe. */
    data class Dead(val banner: String) : PlaybackState()

    /** Player- or play-level failure with the retry chip. [banner] surfaces
     * the descriptor's own state_reason verbatim when it has one. */
    data class Failed(
        val banner: String,
        val item: String,
        val attempt: Int,
        val descriptor: PlaybackDescriptor? = null,
    ) : PlaybackState()
}

/** Which leg of Starting is in flight. */
enum class Phase { Describing, Playing, Polling }

/** What the player launch needs (D8) — built only from descriptor facts. */
data class PlaySession(
    val item: String,
    val url: String,
    val mode: String,
    val plan: RenditionPlan,
)

/**
 * The voiceover/track law (api.ts:314-334, serial-watch-flow D-2):
 * - [SingleVariant] — the flat one-audio master; voiceover pick k maps to
 *   player audio track k+1 (0 = embedded audio).
 * - [Rendition] — one variant per audio stream; native track selection.
 * - [NoPicker] — layout absent (legacy build) or unknown → fail-open:
 *   default audio, no voiceover control rendered.
 */
sealed class RenditionPlan {
    data class SingleVariant(val voiceovers: Int) : RenditionPlan() {
        /** The k → k+1 mapping (0 = embedded). */
        fun audioTrack(pick: Int): Int = pick + 1
    }

    data object Rendition : RenditionPlan()
    data object NoPicker : RenditionPlan()

    companion object {
        fun from(layout: String?, voiceoverCount: Int): RenditionPlan = when (layout) {
            "single-variant" -> SingleVariant(voiceoverCount)
            "rendition" -> Rendition
            // Absent or unknown layout fails open — never a type hole.
            else -> NoPicker
        }
    }
}

/** The descriptor-facts shortcut the session builder uses. */
fun renditionPlanOf(d: PlaybackDescriptor): RenditionPlan =
    RenditionPlan.from(d.layout, d.voiceovers.size)

/** A failed transport outcome as the wiring hands it over. */
sealed class ApiFailure {
    data class Http(val code: Int) : ApiFailure()
    data object Transport : ApiFailure()
}

sealed class PlaybackEvent {
    /** User selected an item (or the retry chip re-enters via describe). */
    data class PlayRequested(val item: String) : PlaybackEvent()

    /** GET /items/{id}/playback answered (the describe leg or — under
     * Polling — a poll answer). */
    data class Described(val descriptor: PlaybackDescriptor) : PlaybackEvent()
    data class DescribeFailed(val failure: ApiFailure) : PlaybackEvent()

    /** POST /items/{id}/play answered. */
    data class Played(val queued: Boolean) : PlaybackEvent()
    data class PlayRejected(val failure: ApiFailure) : PlaybackEvent()

    /** A playback-poll's transport outcome (5xx/transport/404/401). */
    data class PollFailed(val failure: ApiFailure) : PlaybackEvent()

    /** Player-level failure; [kind] is the beacon vocab
     * fatal|video-error|stalled (debug-events ingest, 3.2). */
    data class PlayerFailed(val kind: String, val code: String, val detail: String = "") : PlaybackEvent()

    /** The Failed state's retry chip. */
    data object RetryRequested : PlaybackEvent()

    /** Back out of the player. */
    data object ExitRequested : PlaybackEvent()

    /** 401 on ANY api call (or the wiring's own detection) — the wipe law. */
    data object Unauthorized : PlaybackEvent()
}

sealed class PlaybackEffect {
    data class Describe(val item: String) : PlaybackEffect()
    data class Play(val item: String, val retry: Boolean) : PlaybackEffect()

    /** Sleep this long, then re-describe; the answer arrives as
     * Described/PollFailed. */
    data class Poll(val delayMs: Long) : PlaybackEffect()
    data class Launch(val session: PlaySession) : PlaybackEffect()

    /** Fire-and-forget beacon (5.8 sends it; the reduce only classifies). */
    data class Beacon(val kind: String, val mode: String, val code: String, val detail: String) : PlaybackEffect()
    data class FlushProgress(val item: String) : PlaybackEffect()
    data object EndPlayer : PlaybackEffect()

    /** The 401 law: wipe the stored token, screen = Pairing; POST /pair
     * stays user-action-only (5.4's onUnauthorized posture). */
    data object WipeToPairing : PlaybackEffect()
}

/** One deterministic step: the next state plus the effects to ferry out. */
data class Transition(val state: PlaybackState, val effects: List<PlaybackEffect>)

const val POLL_FIRST_MS = 2_000L
const val POLL_MAX_MS = 30_000L

/**
 * The preparing-poll backoff: 2s doubling to a 30s cap, UNCAPPED in count —
 * server-down mid-poll is harmless and the curve never runs out.
 * attempt 1→2000, 2→4000, 3→8000, 4→16000, 5→30000 (cap), 6+→30000.
 */
fun pollDelayMs(attempt: Int): Long =
    minOf(POLL_FIRST_MS shl (attempt - 1), POLL_MAX_MS)

const val BANNER_MISSING = "Файл отсутствует на сервере"
const val BANNER_UNSUPPORTED = "Формат недоступен на этом устройстве"
const val BANNER_FAILED = "Не удалось воспроизвести — попробуйте ещё раз"

/**
 * The truth table. Rows not pinned by the table are identity steps with no
 * effects — the reduce is total and never throws on an unexpected pairing.
 */
fun reduce(state: PlaybackState, event: PlaybackEvent): Transition {
    // The 401 law, ANY api call: wipe to Pairing, playback abandoned.
    if (event == PlaybackEvent.Unauthorized) {
        return Transition(PlaybackState.Idle, listOf(PlaybackEffect.WipeToPairing))
    }
    if (event is PlaybackEvent.DescribeFailed && event.failure.code() == 401 ||
        event is PlaybackEvent.PlayRejected && event.failure.code() == 401 ||
        event is PlaybackEvent.PollFailed && event.failure.code() == 401
    ) {
        return Transition(PlaybackState.Idle, listOf(PlaybackEffect.WipeToPairing))
    }

    return when (state) {
        is PlaybackState.Idle -> when (event) {
            is PlaybackEvent.PlayRequested ->
                Transition(
                    PlaybackState.Starting(event.item, Phase.Describing, 0, false),
                    listOf(PlaybackEffect.Describe(event.item)),
                )
            else -> Transition(state, emptyList())
        }

        is PlaybackState.Starting -> when (state.phase) {
            Phase.Describing -> when (event) {
                is PlaybackEvent.Described -> onDescribed(state, event.descriptor)
                is PlaybackEvent.DescribeFailed ->
                    if (event.failure.code() == 404) {
                        Transition(PlaybackState.Dead(BANNER_MISSING), emptyList())
                    } else {
                        // Transport/5xx/other-4xx on describe: honest failed
                        // state, the retry chip re-describes.
                        Transition(
                            PlaybackState.Failed(BANNER_FAILED, state.item, state.attempt),
                            emptyList(),
                        )
                    }
                else -> Transition(state, emptyList())
            }

            Phase.Playing -> when (event) {
                is PlaybackEvent.Played -> onPlayed(state, event.queued)
                is PlaybackEvent.PlayRejected -> {
                    // The 400-nothing_failed leg surfaces the descriptor's
                    // own state_reason vocabulary; anything else is honest
                    // generic. Both keep the retry chip.
                    val banner = if ((event.failure as? ApiFailure.Http)?.code == 400) {
                        state.descriptor?.stateReason ?: BANNER_FAILED
                    } else {
                        BANNER_FAILED
                    }
                    Transition(
                        PlaybackState.Failed(banner, state.item, state.attempt, state.descriptor),
                        emptyList(),
                    )
                }
                else -> Transition(state, emptyList())
            }

            Phase.Polling -> when (event) {
                is PlaybackEvent.Described -> onPolled(state, event.descriptor)
                is PlaybackEvent.PollFailed ->
                    if (event.failure.code() == 404) {
                        // 404 mid-poll: the item is gone — Dead immediately.
                        Transition(PlaybackState.Dead(BANNER_MISSING), emptyList())
                    } else {
                        // Same uncapped backoff — server-down mid-poll is
                        // harmless; the curve never runs out.
                        val next = state.attempt + 1
                        Transition(
                            state.copy(phase = Phase.Polling, attempt = next),
                            listOf(PlaybackEffect.Poll(pollDelayMs(next))),
                        )
                    }
                else -> Transition(state, emptyList())
            }
        }

        is PlaybackState.Active -> when (event) {
            is PlaybackEvent.PlayerFailed -> Transition(
                PlaybackState.Failed(BANNER_FAILED, state.session.item, 0),
                listOf(
                    PlaybackEffect.Beacon(event.kind, state.session.mode, event.code, event.detail),
                ),
            )
            is PlaybackEvent.ExitRequested -> Transition(
                PlaybackState.Idle,
                listOf(PlaybackEffect.FlushProgress(state.session.item), PlaybackEffect.EndPlayer),
            )
            else -> Transition(state, emptyList())
        }

        is PlaybackState.Dead -> Transition(state, emptyList())

        is PlaybackState.Failed -> when (event) {
            is PlaybackEvent.RetryRequested -> Transition(
                PlaybackState.Starting(
                    state.item,
                    Phase.Describing,
                    state.attempt + 1,
                    false,
                    state.descriptor,
                ),
                listOf(PlaybackEffect.Describe(state.item)),
            )
            is PlaybackEvent.ExitRequested ->
                Transition(PlaybackState.Idle, emptyList())
            else -> Transition(state, emptyList())
        }
    }
}

/**
 * The describe answer's law (rows 1-5): missing/unsupported end Dead with
 * the honest RU banner and NO retry; a failed descriptor lands in Failed
 * with the state_reason banner (its retry:true is what re-enqueues);
 * everything playable-ish proceeds to the ONE optimistic retry:false play.
 */
private fun onDescribed(state: PlaybackState.Starting, d: PlaybackDescriptor): Transition =
    when (d.state) {
        "missing" -> Transition(PlaybackState.Dead(BANNER_MISSING), emptyList())
        "unsupported" -> Transition(PlaybackState.Dead(BANNER_UNSUPPORTED), emptyList())
        "failed" -> Transition(
            PlaybackState.Failed(d.stateReason ?: BANNER_FAILED, state.item, state.attempt, d),
            emptyList(),
        )
        else -> Transition(
            state.copy(phase = Phase.Playing, attempt = state.attempt + 1, usedMaybePlay = true, descriptor = d),
            listOf(PlaybackEffect.Play(state.item, retry = state.attempt > 0)),
        )
    }

/**
 * The play answer's law: queued:true means a re-enqueue happened — poll for
 * the pack. queued:false is the degrade: direct/partial/complete launch
 * NOW (row 1: proceed, never enqueue-wait; row 2: partial is ALREADY
 * playable, the EVENT playlist grows live); none/preparing fall through to
 * the 2s→30s poll (row 3) — the one retry:false play was already spent.
 */
private fun onPlayed(state: PlaybackState.Starting, queued: Boolean): Transition {
    val d = state.descriptor
    if (d == null) {
        // No descriptor in hand cannot happen on the wired path; fail closed
        // into Failed deterministically rather than guess.
        return Transition(PlaybackState.Failed(BANNER_FAILED, state.item, state.attempt), emptyList())
    }
    // queued:true means a re-enqueue happened — poll for the pack. On
    // queued:false only an HLS pack still building (none|preparing) falls
    // through to the poll; the DIRECT degrade (row 1) proceeds — never an
    // enqueue-wait on a direct answer.
    val waitForPack = queued || (d.mode == "hls" && (d.state == "none" || d.state == "preparing"))
    return if (waitForPack) {
        val next = state.copy(phase = Phase.Polling, attempt = 1, descriptor = d)
        Transition(next, listOf(PlaybackEffect.Poll(pollDelayMs(1))))
    } else {
        val session = PlaySession(state.item, d.playUrl, d.mode, renditionPlanOf(d))
        Transition(PlaybackState.Active(session), listOf(PlaybackEffect.Launch(session)))
    }
}

/**
 * The poll answer's law (rows 3/4/6): none|preparing keeps the SAME curve
 * (2s doubling to 30s, uncapped count); partial|complete launch immediately
 * — no second play, the original playlist URL is already the event URL;
 * failed/missing/unsupported rule as in onDescribed.
 */
private fun onPolled(state: PlaybackState.Starting, d: PlaybackDescriptor): Transition =
    when (d.state) {
        "none", "preparing" -> {
            val next = state.copy(phase = Phase.Polling, attempt = state.attempt + 1, descriptor = d)
            Transition(next, listOf(PlaybackEffect.Poll(pollDelayMs(next.attempt))))
        }
        "partial", "complete" -> {
            val session = PlaySession(state.item, d.playUrl, d.mode, renditionPlanOf(d))
            Transition(PlaybackState.Active(session), listOf(PlaybackEffect.Launch(session)))
        }
        "failed" -> Transition(
            PlaybackState.Failed(d.stateReason ?: BANNER_FAILED, state.item, state.attempt, d),
            emptyList(),
        )
        "missing" -> Transition(PlaybackState.Dead(BANNER_MISSING), emptyList())
        "unsupported" -> Transition(PlaybackState.Dead(BANNER_UNSUPPORTED), emptyList())
        else -> {
            // The descriptor's state vocabulary is additive by law; an
            // unknown state keeps the same uncapped curve until a known one
            // rules (the pending-answer posture of the pairing classifier).
            val next = state.copy(phase = Phase.Polling, attempt = state.attempt + 1, descriptor = d)
            Transition(next, listOf(PlaybackEffect.Poll(pollDelayMs(next.attempt))))
        }
    }

/** The 401 probe for the wipe guard. */
private fun ApiFailure.code(): Int? = (this as? ApiFailure.Http)?.code
