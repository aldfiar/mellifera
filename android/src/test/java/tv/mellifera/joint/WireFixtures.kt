package tv.mellifera.joint

import android.view.Surface
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import okhttp3.mockwebserver.MockResponse
import tv.mellifera.net.Api
import tv.mellifera.net.PlayRequest
import tv.mellifera.net.ProgressRequest
import tv.mellifera.playback.DebugEventPoster
import tv.mellifera.playback.PlaybackTransport
import tv.mellifera.player.PlayerController
import tv.mellifera.player.PlayerEvent
import tv.mellifera.player.PlayerReadout

/**
 * Shared fixtures for the 7.1 server↔app wire joints (pure JVM). Every
 * fixture string mirrors the LIVE Go handler's wire bytes (the handlers are
 * the shape authority; the Go-side tests pin them): struct field order, the
 * omitempty absences, and the canonical error envelope.
 */

/** A JSON fixture response with the Content-Type the handlers set (writeJSON). */
fun json(body: String): MockResponse =
    MockResponse().setBody(body).addHeader("Content-Type", "application/json")

/** The canonical error envelope (handlers.go errorBody) as fixture bytes. */
fun errorJson(code: String, message: String): String =
    """{"error":{"code":"$code","message":"$message","retryable":false}}"""

/**
 * The production transport adapter (AppViewModel.playbackTransport's exact
 * posture) — the joint runs the REAL orchestration against the REAL
 * Api/Retrofit/OkHttp stack, no fake in the wire path.
 */
fun productionTransport(api: Api): PlaybackTransport = object : PlaybackTransport {
    override suspend fun playback(itemId: String) = api.service.playback(itemId)
    override suspend fun play(itemId: String, retry: Boolean) =
        api.service.play(itemId, PlayRequest(retry))

    override suspend fun progress(itemId: String) = api.service.progress(itemId)
    override suspend fun putProgress(itemId: String, request: ProgressRequest) =
        api.service.putProgress(itemId, request)

    override fun resolvePlayUrl(playUrl: String) = api.resolvePlayUrl(playUrl)
}

/**
 * The production debug-events poster (AppViewModel's exact posture:
 * `sharedApi().service.debugEvent(event).code()` — the Response<Unit>
 * answer IS the status read).
 */
fun debugPoster(api: Api): DebugEventPoster = DebugEventPoster { event ->
    api.service.debugEvent(event).code()
}

/**
 * The player leaf's recording stand-in at the 5.7 seam: the ONLY non-real
 * module in the playback/progress/debug joints — media3 cannot start on the
 * JVM, and the launch law under test is what the orchestration hands it.
 * Everything behind the seam (descriptor → play → resolve → launch) is the
 * app's real net + flow code.
 */
class RecordingController(initial: PlayerReadout = PlayerReadout()) : PlayerController {
    override val readout = MutableStateFlow(initial)

    private var consumer: ((PlayerEvent) -> Unit)? = null

    val launched = mutableListOf<Triple<String, String, String>>()
    val seeks = mutableListOf<Long>()
    val playPauseCalls = mutableListOf<Unit>()
    val endCalls = mutableListOf<Unit>()

    override fun launch(itemId: String, playUrl: String, mode: String) {
        launched += Triple(itemId, playUrl, mode)
    }

    override fun playPause() {
        playPauseCalls += Unit
    }

    override fun seekBy(deltaMs: Long) {}

    override fun seekTo(positionMs: Long) {
        seeks += positionMs
    }

    override fun selectVoiceover(index: Int) {}

    override fun attachSurface(surface: Surface?) {}

    override fun end() {
        endCalls += Unit
    }

    override fun setEventConsumer(consumer: (PlayerEvent) -> Unit) {
        this.consumer = consumer
    }

    /** The controller reports a player-level event through the ONE channel. */
    fun emit(event: PlayerEvent) {
        consumer?.invoke(event)
    }
}
