package tv.mellifera.diag

import tv.mellifera.net.DebugEventRequest

/** The capability-snapshot kind of 3.2's closed debug-events vocabulary. */
const val KIND_CAPABILITY_SNAPSHOT = "capability-snapshot"

/**
 * One decoder row of the MediaCodecList table (5.11): what the box can
 * actually decode, per mime. On device the collector maps android.media's
 * codec info onto this pure row; tests provide the values.
 */
data class DecoderRow(
    val mime: String,
    val name: String,
    val hardware: Boolean,
    /** Secure (DRM) decoder variant. */
    val secure: Boolean,
    val maxWidth: Int? = null,
    val maxHeight: Int? = null,
    val maxFps: Int? = null,
    /** Compact profile/level summary (codec-specific encodings). */
    val profiles: String = "",
)

/**
 * The device facts the snapshot answers "old box?" with (5.11): identity,
 * versions, display, audio outputs, and the decoder table for video/hevc +
 * video/avc. Pure — on device [DeviceFactsCollector] builds it from
 * Build/MediaCodecList/Display; tests inject the values.
 */
data class DeviceFacts(
    val model: String,
    val androidVersion: String,
    val apiLevel: Int,
    val appVersion: String,
    val media3Version: String,
    /** e.g. "1920x1080@60" or "1280x720". */
    val display: String,
    /** Output audio paths, comma-joined; blank when unavailable. */
    val audioPaths: String,
    val decoders: List<DecoderRow>,
)

/**
 * One decoder table line — the shape CapabilitySnapshotTest pins: mime,
 * name, hw/sw, secure/insecure, max resolution@fps, profiles.
 */
fun decoderLine(row: DecoderRow): String = buildString {
    append("${row.mime} name=${row.name}")
    append(if (row.hardware) " hw" else " sw")
    append(if (row.secure) " secure" else " insecure")
    if (row.maxWidth != null && row.maxHeight != null) {
        append(" max=${row.maxWidth}x${row.maxHeight}")
        row.maxFps?.let { append("@${it}fps") }
    }
    if (row.profiles.isNotBlank()) append(" profiles=${row.profiles}")
}

/**
 * The snapshot's detail payload. Headline facts (model, versions, display)
 * ride the FIRST line deliberately: the sender truncates detail to the
 * beacon bound (256) before send, so the identity facts survive even when
 * the decoder table is cut — the full text still reaches the operator via
 * the share affordance, which composes the untruncated snapshot.
 */
fun snapshotDetail(facts: DeviceFacts): String = buildString {
    append("model=${facts.model}")
    append(" android=${facts.androidVersion}")
    append(" api=${facts.apiLevel}")
    append(" app=${facts.appVersion}")
    append(" media3=${facts.media3Version}")
    append(" display=${facts.display}")
    if (facts.audioPaths.isNotBlank()) append(" audio=${facts.audioPaths}")
    facts.decoders.forEach { row ->
        appendLine()
        append(decoderLine(row))
    }
}

/**
 * The capability-snapshot event (3.2): detail carries the whole payload and
 * the event is NOT item-scoped — item_id/mode/phase stay ABSENT (the server
 * refuses the kind with them set).
 */
fun snapshotEvent(facts: DeviceFacts): DebugEventRequest = DebugEventRequest(
    kind = KIND_CAPABILITY_SNAPSHOT,
    detail = snapshotDetail(facts),
)
