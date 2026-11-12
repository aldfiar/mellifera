package tv.mellifera.playback

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import tv.mellifera.net.DebugEventRequest

/**
 * The wire seam the worker posts over: the HTTP status of one
 * POST /debug-events (200 accepted; 429 rate-limited). Narrowed so the JVM
 * tests record and steer statuses without Retrofit — the production seam
 * adapts [tv.mellifera.net.MelliferaApi.debugEvent] (its Response<Unit>
 * answer IS the status read).
 */
fun interface DebugEventPoster {
    suspend fun post(event: DebugEventRequest): Int
}

/**
 * Strip every URL's query string from a free-text beacon field BEFORE the
 * event leaves the app (INV4 client half — the media token rides play
 * URLs' queries; it never reaches the wire or the server log, mirroring
 * internal/api/debug_events.go). Only `/?`-shaped tokens are touched, so
 * plain prose with a bare `?` survives.
 */
fun stripQuery(text: String): String = URL_WITH_QUERY.replace(text) { it.groupValues[1] }

private val URL_WITH_QUERY = Regex("""(/\S*?)\?\S*""")

/**
 * The beacon worker (5.8): the production [BeaconSender]. One drain loop
 * over a Channel([CAPACITY]) bounded queue; [send] only enqueues — it never
 * blocks and never throws, playback never waits on telemetry.
 *
 * Best-effort law: a full queue drops the OLDEST queued event
 * (DROP_OLDEST — freshest telemetry wins); a 429 parks the loop in a
 * [cooldownMs] cooldown (injectable for tests) and the parked window keeps
 * dropping — never an unbounded retry; a 200 or any other status is
 * one-shot, dropped silently. INV4: [stripQuery] runs on the free-text
 * detail BEFORE anything leaves the app (detail is the one field that can
 * embed a play URL; kind/item_id/mode/phase/code are structured ids and
 * vocab, never URLs).
 */
class BeaconWorker(
    private val post: DebugEventPoster,
    private val scope: CoroutineScope,
    private val cooldownMs: Long = DEFAULT_COOLDOWN_MS,
    private val delayer: suspend (Long) -> Unit = { delay(it) },
) : BeaconSender {

    internal val queue = Channel<DebugEventRequest>(
        capacity = CAPACITY,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )

    override suspend fun send(event: DebugEventRequest) {
        queue.trySend(event)
    }

    /** Starts the drain loop on the worker's scope (fire-and-forget). */
    fun start() {
        scope.launch { run() }
    }

    internal suspend fun run() {
        for (event in queue) {
            val status = post.post(stripEvent(event))
            if (status == HTTP_RATE_LIMITED) delayer(cooldownMs)
        }
    }

    private fun stripEvent(event: DebugEventRequest): DebugEventRequest =
        event.copy(detail = stripQuery(event.detail))

    companion object {
        const val CAPACITY = 16
        const val DEFAULT_COOLDOWN_MS = 30_000L
        const val HTTP_RATE_LIMITED = 429
    }
}
