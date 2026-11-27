package tv.mellifera

import java.util.concurrent.TimeUnit
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.Assert.assertEquals

/**
 * The suite's wall-time guards (android-tv-layout-parity 7.1, TEST-INFRA
 * only): every MockWebServer take is bounded and every request walk proves
 * its queue drained at walk end. The two stall mechanisms this kills:
 * - the no-timeout takeRequest() overload blocks a gradle worker FOREVER
 *   when the walk issues fewer requests than the test takes (the
 *   2026-11-16 wedge: ApiContractTest.item_detail_decodes_metadata_projection
 *   double-took one request and hung a worker ~9h);
 * - a walk issuing a request with NO enqueued MockResponse hangs on
 *   OkHttp's 10s default read timeout and surfaces as a swallowed
 *   best-effort failure — the test stays green while the class pays 10s
 *   (EpisodesTest 20.05s / RefreshTest 10.03s / BackRestorationTest
 *   10.02s per-class wall time before the fix).
 */

/**
 * The timed take: fails fast naming [walk] instead of blocking a worker
 * forever. Every MockWebServer take rides this — never the bare
 * no-timeout overload.
 */
internal fun MockWebServer.takeRequestOrFail(walk: String): RecordedRequest =
    takeRequest(5, TimeUnit.SECONDS)
        ?: error(
            "MockWebServer: no request arrived within 5s for walk '$walk' " +
                "— the walk issued fewer requests than the test takes",
        )

/**
 * The drain law: at walk end every request the walk made was ANSWERED —
 * [expected] is the count the test's enqueued fixtures cover. An extra
 * unanswered request rides OkHttp's 10s default read timeout and surfaces
 * as a swallowed best-effort failure; this assert turns that drift into a
 * named failure.
 */
internal fun MockWebServer.assertDrained(walk: String, expected: Int) {
    assertEquals(
        "walk '$walk' must drain its request queue at walk end " +
            "(every walked request answered by an enqueued fixture)",
        expected,
        requestCount,
    )
}
