package tv.mellifera.diag

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import tv.mellifera.net.DebugEventRequest
import tv.mellifera.playback.DebugEventPoster
import tv.mellifera.playback.stripQuery

/**
 * The diag sender (5.11): the SEPARATE telemetry path beside the beacon
 * worker (5.8) — own Channel([CAPACITY]) drain loop, own ≤[SESSION_BOUND]
 * events/session bound — posting over the SAME /debug-events endpoint.
 * Telemetry never blocks playback: send only enqueues (drop-oldest on
 * overflow), a 429 parks in a cooldown and keeps dropping (best-effort),
 * and once the session bound is reached every further event is dropped.
 *
 * Before anything leaves the app: the detail is stripQuery'd (INV4 — the
 * trace detail can embed a play URL) and truncated to the [DETAIL_BOUND]
 * the beacon uses (the server truncates at the same bound; the snapshot's
 * headline facts ride the first line so they survive the cut).
 */
class DiagSender(
    private val post: DebugEventPoster,
    private val scope: CoroutineScope,
    private val sessionBound: Int = SESSION_BOUND,
    private val detailBound: Int = DETAIL_BOUND,
    private val cooldownMs: Long = DEFAULT_COOLDOWN_MS,
    private val delayer: suspend (Long) -> Unit = { delay(it) },
) {

    internal val queue = Channel<DebugEventRequest>(
        capacity = CAPACITY,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )

    /** Posted count this session — only the drain loop touches it. */
    private var sent = 0

    private val lock = Any()
    private val recent = mutableListOf<DebugEventRequest>()

    /**
     * The session's sent events with FULL detail (oldest first) — the
     * «Поделиться диагностикой» affordance composes the share text from
     * these, untruncated, so the operator sees the whole snapshot.
     */
    val recentEvents: List<DebugEventRequest>
        get() = synchronized(lock) { recent.toList() }

    fun send(event: DebugEventRequest) {
        queue.trySend(event)
    }

    /** Starts the drain loop on the worker's scope (fire-and-forget). */
    fun start() {
        scope.launch { run() }
    }

    internal suspend fun run() {
        for (event in queue) {
            if (sent >= sessionBound) continue
            val status = post.post(prepare(event))
            sent++
            record(event)
            if (status == HTTP_RATE_LIMITED) delayer(cooldownMs)
        }
    }

    private fun prepare(event: DebugEventRequest): DebugEventRequest =
        event.copy(detail = stripQuery(event.detail).take(detailBound))

    private fun record(event: DebugEventRequest) {
        synchronized(lock) {
            recent += event
            if (recent.size > RECENT_MAX) recent.removeAt(0)
        }
    }

    companion object {
        const val CAPACITY = 16
        const val SESSION_BOUND = 64
        const val DETAIL_BOUND = 256
        const val RECENT_MAX = 64
        const val DEFAULT_COOLDOWN_MS = 30_000L
        const val HTTP_RATE_LIMITED = 429
    }
}
