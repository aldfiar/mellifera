package tv.mellifera.playback

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.yield
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.coroutines.ContinuationInterceptor
import tv.mellifera.net.DebugEventRequest

private fun beaconEvent(itemId: String) = DebugEventRequest(
    kind = "stalled",
    itemId = itemId,
    mode = "hls",
    phase = "stalled",
    code = "STALL",
    detail = "",
)

/**
 * The beacon worker's best-effort law (5.8): the 429 cooldown, the
 * 16-cap drop-oldest overflow, and the INV4 strip-before-send. Pure JVM —
 * the injected poster records and steers statuses, the injected delayer
 * parks the loop on a test-controlled gate.
 */
class BeaconWorkerTest {

    @Test
    fun cooldown_then_drop_oldest() = runBlocking {
        val posted = mutableListOf<DebugEventRequest>()
        val cooldowns = mutableListOf<Long>()
        val gate = CompletableDeferred<Unit>()
        // The worker owns its own root scope on this runBlocking's event
        // loop (the interceptor only — NOT the runBlocking job) — cancelled
        // at the end so the parked receive never outlives the test body.
        val workerScope = CoroutineScope(
            SupervisorJob() + coroutineContext[ContinuationInterceptor]!!,
        )
        val worker = BeaconWorker(
            post = { e ->
                posted += e
                if (posted.size == 1) 429 else 200
            },
            scope = workerScope,
            cooldownMs = 7_500,
            delayer = { ms ->
                cooldowns += ms
                gate.await()
            },
        )
        worker.start()

        // e1 posts, answers 429 — the loop parks in the cooldown gate.
        worker.send(beaconEvent("e1"))
        while (cooldowns.isEmpty()) yield()
        assertEquals(listOf(7_500L), cooldowns)
        assertEquals(listOf("e1"), posted.map { it.itemId })

        // The loop is parked: 17 arrivals meet the 16-cap queue —
        // drop-oldest keeps the freshest 16 (e2 falls out), nothing blocks.
        (2..18).forEach { worker.send(beaconEvent("e$it")) }
        gate.complete(Unit)

        // The parked window drains in arrival order: e3..e18, e2 gone.
        while (posted.size < 17) yield()
        assertEquals((3..18).map { "e$it" }, posted.drop(1).map { it.itemId })
        workerScope.cancel()
    }

    @Test
    fun strip_query_before_send() = runBlocking {
        val posted = mutableListOf<DebugEventRequest>()
        val workerScope = CoroutineScope(
            SupervisorJob() + coroutineContext[ContinuationInterceptor]!!,
        )
        val worker = BeaconWorker(
            post = { e ->
                posted += e
                200
            },
            scope = workerScope,
        )
        worker.start()

        worker.send(
            DebugEventRequest(
                kind = "video-error",
                itemId = "i1",
                mode = "hls",
                phase = "video-error",
                code = "ERROR_CODE_DECODING_FAILED",
                detail = "decode failed on http://192.168.1.10:8080/media/i1/master.m3u8?token=SUPER-SECRET",
            ),
        )
        while (posted.isEmpty()) yield()

        // INV4: the query (the media token) never leaves the app; the path
        // itself survives for the operator's reading.
        val detail = posted[0].detail
        assertFalse(detail.contains("token"))
        assertFalse(detail.contains("SUPER-SECRET"))
        assertTrue(detail.contains("/media/i1/master.m3u8"))
        assertFalse(posted[0].itemId.contains("token"))
        workerScope.cancel()
    }
}
