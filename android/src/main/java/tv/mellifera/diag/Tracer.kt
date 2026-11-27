package tv.mellifera.diag

import tv.mellifera.net.DebugEventRequest
import tv.mellifera.playback.stripQuery

/** The playback-trace kind of 3.2's closed debug-events vocabulary. */
const val KIND_PLAYBACK_TRACE = "playback-trace"

/**
 * The player-side facts one trace event carries (5.11): the AnalyticsListener
 * timeline as available from the Media3 readout — HTTP status, format,
 * decoder backend actually used, audio track selected, first-frame
 * timestamp, dropped frames, bandwidth, and a structured
 * PlaybackException.errorCode on errors. Every field is optional; the pure
 * composer joins the present ones into the detail line.
 */
data class TraceFacts(
    /** The trace code — this event's name in the timeline (manifest,
     * video-decoder, first-frame, error, …); rides the wire `code` field. */
    val code: String,
    val httpStatus: Int? = null,
    /** The loaded resource's URL — PATH ONLY by law: the composer runs
     * stripQuery over the composed detail, so the media token that rides a
     * play URL's query never leaves the app (INV4, the client half 5.8 owns
     * for the beacon; this is the same law on the trace path). */
    val url: String? = null,
    val format: String? = null,
    val decoderBackend: String? = null,
    val audioTrack: String? = null,
    val firstFrameMs: Long? = null,
    val droppedFrames: Int? = null,
    val bandwidthBps: Long? = null,
    val bytes: Long? = null,
    /** Structured PlaybackException.errorCodeName (player errors only). */
    val errorCode: String? = null,
)

/**
 * Composes one playback-trace event (3.2's shape: item_id + mode direct|hls
 * + phase="trace" + code; detail optional but always composed here). INV4
 * runs LAST: the composed detail is stripQuery'd, so any URL-shaped token
 * loses its query before the event exists — the path survives for the
 * operator's reading.
 */
fun traceEvent(itemId: String, mode: String, facts: TraceFacts): DebugEventRequest {
    val parts = mutableListOf("code=${facts.code}")
    facts.httpStatus?.let { parts += "status=$it" }
    facts.url?.let { parts += "url=$it" }
    facts.format?.let { parts += "format=$it" }
    facts.decoderBackend?.let { parts += "backend=$it" }
    facts.audioTrack?.let { parts += "audio=$it" }
    facts.firstFrameMs?.let { parts += "first_frame_ms=$it" }
    facts.droppedFrames?.let { parts += "dropped=$it" }
    facts.bandwidthBps?.let { parts += "bw_bps=$it" }
    facts.bytes?.let { parts += "bytes=$it" }
    facts.errorCode?.let { parts += "error=$it" }
    return DebugEventRequest(
        kind = KIND_PLAYBACK_TRACE,
        itemId = itemId,
        mode = mode,
        phase = "trace",
        code = facts.code,
        detail = stripQuery(parts.joinToString(" ")),
    )
}
