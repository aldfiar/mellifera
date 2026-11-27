package tv.mellifera.diag

import kotlin.coroutines.ContinuationInterceptor
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.yield
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import tv.mellifera.net.DebugEventRequest

private fun traceEvent(itemId: String, detail: String = "") = DebugEventRequest(
    kind = "playback-trace",
    itemId = itemId,
    mode = "hls",
    phase = "trace",
    code = "manifest",
    detail = detail,
)

/**
 * The diag sender's bounds (5.11): ≤64 events posted per session, every
 * sent event's detail stripQuery'd then truncated to the beacon bound
 * BEFORE send — past the bound events drop silently (best-effort, telemetry
 * never blocks playback).
 */
class SenderTest {

    @Test
    fun bounded_session_64() = runBlocking {
        val posted = mutableListOf<DebugEventRequest>()
        val workerScope = CoroutineScope(
            SupervisorJob() + coroutineContext[ContinuationInterceptor]!!,
        )
        val sender = DiagSender(
            post = { e ->
                posted += e
                200
            },
            scope = workerScope,
        )
        sender.start()

        // e1 carries a tokened URL and an oversized detail — the INV4 strip
        // and the 256 truncation must both apply BEFORE the send.
        val oversized =
            "url=http://192.168.1.10:8080/media/e1/master.m3u8?token=SUPER-SECRET " +
                "code=manifest bytes=999 ".repeat(20)
        // PACED sends: the drain loop keeps up, so every event reaches a
        // post until the SESSION BOUND — not the 16-cap queue — is what
        // stops posting at 64. Past the bound the loop still drains the
        // queue (skip-and-drop), so the tail never hangs.
        (1..80).forEach { i ->
            sender.send(traceEvent("e$i", detail = if (i == 1) oversized else "ok $i"))
            repeat(4) { yield() }
        }
        repeat(50) { yield() }

        assertEquals(64, posted.size)
        assertEquals(64, sender.recentEvents.size)

        // e1's posted detail: stripped (no token, no query), path kept,
        // truncated to the 256 bound.
        val first = posted[0].detail
        assertFalse(first.contains("SUPER-SECRET"))
        assertFalse(first.contains("?"))
        assertTrue(first.contains("/media/e1/master.m3u8"))
        assertTrue(first.length <= 256)

        workerScope.cancel()
    }
}
