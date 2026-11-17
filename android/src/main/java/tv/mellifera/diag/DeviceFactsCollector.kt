package tv.mellifera.diag

import android.content.Context
import android.media.AudioManager
import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.os.Build
import androidx.media3.common.MediaLibraryInfo

/**
 * The device-side [DeviceFacts] collector (5.11) — deliberately THIN: it
 * only maps android.media/Build/Display facts onto the pure model; the
 * tested snapshot shape ([snapshotDetail]) lives in CapabilitySnapshot.kt.
 * Never invoked in JVM tests (the wiring injects it as a collector lambda).
 */
fun collectDeviceFacts(context: Context): DeviceFacts {
    val appVersion = try {
        context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "unknown"
    } catch (_: Exception) {
        "unknown"
    }
    val audio = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
    val audioPaths = audio?.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
        ?.joinToString(",") { it.productName?.toString() ?: "unknown" }
        ?: ""
    return DeviceFacts(
        model = Build.MODEL,
        androidVersion = Build.VERSION.RELEASE,
        apiLevel = Build.VERSION.SDK_INT,
        appVersion = appVersion,
        media3Version = MediaLibraryInfo.VERSION,
        display =
            "${context.resources.displayMetrics.widthPixels}x" +
                "${context.resources.displayMetrics.heightPixels}",
        audioPaths = audioPaths,
        decoders = decoderTable(),
    )
}

/**
 * The decoder table for video/hevc + video/avc (5.11): the first codec per
 * mime, hw/sw + secure flags, max supported resolution/fps, and a compact
 * profile/level summary (capped — the full enum list is noise at this
 * bound).
 */
private fun decoderTable(): List<DecoderRow> {
    val codecs = MediaCodecList(MediaCodecList.ALL_CODECS).codecInfos
    return listOf("video/hevc", "video/avc").mapNotNull { mime ->
        val info = codecs.firstOrNull { candidate ->
            candidate.isEncoder.not() && candidate.supportedTypes.any { it.equals(mime, true) }
        } ?: return@mapNotNull null
        val caps = info.getCapabilitiesForType(mime)
        val video = caps.videoCapabilities
        val profiles = caps.profileLevels
            .take(PROFILE_ENTRIES_MAX)
            .joinToString(",") { "${it.profile}/${it.level}" }
        DecoderRow(
            mime = mime,
            name = info.canonicalName,
            hardware = info.isHardwareAccelerated,
            // No public isSecure() — the FEATURE_SecurePlayback capability is
            // the public posture of the same fact.
            secure = caps.isFeatureSupported(
                MediaCodecInfo.CodecCapabilities.FEATURE_SecurePlayback,
            ),
            maxWidth = video.supportedWidths.upper,
            maxHeight = video.supportedHeights.upper,
            maxFps = video.supportedFrameRates.upper,
            profiles = profiles,
        )
    }
}

private const val PROFILE_ENTRIES_MAX = 8
