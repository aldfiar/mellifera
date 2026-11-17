package tv.mellifera.diag

import android.os.SystemClock
import androidx.media3.common.C
import androidx.media3.common.PlaybackException
import androidx.media3.common.Tracks
import androidx.media3.datasource.HttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.analytics.AnalyticsListener
import androidx.media3.exoplayer.source.LoadEventInfo
import androidx.media3.exoplayer.source.MediaLoadData
import java.io.IOException
import tv.mellifera.net.DebugEventRequest

/**
 * The AnalyticsListener half of the tracer (5.11) — deliberately THIN: it
 * only maps Media3 callbacks onto [TraceFacts] and composes each timeline
 * event through the pure [traceEvent]; all testable logic lives there. The
 * wiring attaches it per launch (Media3Controller's analyticsAttach hook);
 * emissions go through [sink] — the app wiring points it at
 * DiagTelemetry.emit, so the two-tier gate + the bounded sender stand
 * between this listener and the wire.
 *
 * Frugality law: the tracer shares the beacon's 30/min per-IP budget with
 * everything else, so it emits once per milestone — manifest load, decoder
 * inits, selected audio track, first frame, FIRST bandwidth estimate only,
 * dropped frames throttled to one line per [DROPPED_TRACE_INTERVAL_MS] —
 * never per segment.
 */
class PlaybackTracer : AnalyticsListener {

    /** The emission seam the app wiring sets (DiagTelemetry.emit). */
    var sink: ((DebugEventRequest) -> Unit)? = null

    private var itemId = ""
    private var mode = ""
    private var startedAtMs = 0L
    private var bandwidthEmitted = false
    private var lastDroppedAtMs = 0L

    /** Attaches to a freshly built player for one launch (itemId+mode are
     * the launch facts the listener callbacks don't carry). */
    fun attach(player: ExoPlayer, itemId: String, mode: String) {
        this.itemId = itemId
        this.mode = mode
        startedAtMs = SystemClock.elapsedRealtime()
        bandwidthEmitted = false
        player.addAnalyticsListener(this)
    }

    private fun emit(facts: TraceFacts) {
        if (itemId.isEmpty()) return
        sink?.invoke(traceEvent(itemId, mode, facts))
    }

    override fun onLoadCompleted(
        eventTime: AnalyticsListener.EventTime,
        loadEventInfo: LoadEventInfo,
        mediaLoadData: MediaLoadData,
    ) {
        if (mediaLoadData.dataType != C.DATA_TYPE_MANIFEST) return
        emit(
            TraceFacts(
                code = "manifest",
                url = loadEventInfo.uri.path,
                format = mediaLoadData.trackFormat?.sampleMimeType,
                bytes = loadEventInfo.bytesLoaded,
            ),
        )
    }

    override fun onLoadError(
        eventTime: AnalyticsListener.EventTime,
        loadEventInfo: LoadEventInfo,
        mediaLoadData: MediaLoadData,
        error: IOException,
        wasCanceled: Boolean,
    ) {
        val status = (error as? HttpDataSource.InvalidResponseCodeException)?.responseCode
        emit(
            TraceFacts(
                code = "load-error",
                httpStatus = status,
                url = loadEventInfo.uri.path,
                format = mediaLoadData.trackFormat?.sampleMimeType,
            ),
        )
    }

    override fun onVideoDecoderInitialized(
        eventTime: AnalyticsListener.EventTime,
        decoderName: String,
        initializedTimestampMs: Long,
        initializationDurationMs: Long,
    ) {
        emit(TraceFacts(code = "video-decoder", decoderBackend = decoderName))
    }

    override fun onAudioDecoderInitialized(
        eventTime: AnalyticsListener.EventTime,
        decoderName: String,
        initializedTimestampMs: Long,
        initializationDurationMs: Long,
    ) {
        emit(TraceFacts(code = "audio-decoder", decoderBackend = decoderName))
    }

    override fun onTracksChanged(eventTime: AnalyticsListener.EventTime, tracks: Tracks) {
        val audio = tracks.groups.firstOrNull { it.type == C.TRACK_TYPE_AUDIO && it.isSelected }
            ?: return
        val format = audio.getTrackFormat(0)
        // The k+1 voiceover mapping verified live (5.8): the label/language
        // the player actually picked.
        emit(
            TraceFacts(
                code = "audio-track",
                audioTrack = format.label ?: format.language ?: format.id ?: "track",
            ),
        )
    }

    override fun onRenderedFirstFrame(
        eventTime: AnalyticsListener.EventTime,
        output: Any,
        renderTimeMs: Long,
    ) {
        emit(
            TraceFacts(
                code = "first-frame",
                firstFrameMs = SystemClock.elapsedRealtime() - startedAtMs,
            ),
        )
    }

    override fun onDroppedVideoFrames(
        eventTime: AnalyticsListener.EventTime,
        droppedFrames: Int,
        elapsedRealtimeMs: Long,
    ) {
        if (droppedFrames <= 0) return
        val now = SystemClock.elapsedRealtime()
        if (now - lastDroppedAtMs < DROPPED_TRACE_INTERVAL_MS) return
        lastDroppedAtMs = now
        emit(TraceFacts(code = "dropped-frames", droppedFrames = droppedFrames))
    }

    override fun onBandwidthEstimate(
        eventTime: AnalyticsListener.EventTime,
        totalLoadBytes: Int,
        bandwidthEstimate: Long,
        bitrateEstimate: Long,
    ) {
        if (bandwidthEmitted) return
        bandwidthEmitted = true
        emit(TraceFacts(code = "bandwidth", bandwidthBps = bandwidthEstimate))
    }

    override fun onPlayerError(eventTime: AnalyticsListener.EventTime, error: PlaybackException) {
        emit(TraceFacts(code = "error", errorCode = error.errorCodeName))
    }

    private companion object {
        const val DROPPED_TRACE_INTERVAL_MS = 30_000L
    }
}
