package tv.mellifera.probe

import android.annotation.SuppressLint
import android.app.Activity
import android.media.MediaCodecList
import android.media.MediaFormat
import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
import android.view.SurfaceView
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession

/**
 * Throwaway T0 probe (task 1.2, deleted by 5.1). One screen, one button per
 * probe stream: HEVC pack HLS (OQ-T1), MKV original, translated multi-EXT-X-MAP
 * HLS (OQ-T2), with a MediaSession so media keys route (OQ-T3). The operator
 * pastes a full play URL per row (adb or on-screen), presses PLAY, and reads
 * the outcome off the always-visible status line.
 */
class ProbeActivity : Activity() {

    private lateinit var player: ExoPlayer
    private lateinit var mediaSession: MediaSession
    private lateinit var controls: ScrollView
    private lateinit var status: TextView
    private lateinit var urls: Map<Int, EditText>

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_probe)

        val surface = findViewById<SurfaceView>(R.id.surface)
        controls = findViewById(R.id.controls)
        status = findViewById(R.id.status)

        player = ExoPlayer.Builder(this).build()
        player.setVideoSurfaceView(surface)
        player.addListener(PlayerListener())
        // OQ-T3: hold a wake lock through the player so a screen-off/Home-press
        // probe reflects real playback behavior, not CPU doze artifacts.
        player.setWakeMode(C.WAKE_MODE_LOCAL)
        // OQ-T3: the session is the media-key route; whether it survives
        // backgrounding is exactly what task 1.3 measures.
        mediaSession = MediaSession.Builder(this, player).build()

        urls = mapOf(
            R.id.play_hevc to findViewById<EditText>(R.id.url_hevc),
            R.id.play_mkv to findViewById<EditText>(R.id.url_mkv),
            R.id.play_map to findViewById<EditText>(R.id.url_map),
        )
        urls.forEach { (buttonId, edit) ->
            edit.setText(prefs().getString(key(buttonId), ""))
            findViewById<Button>(buttonId).setOnClickListener { playProbe(buttonId, edit) }
        }

        findViewById<Button>(R.id.stop).setOnClickListener { player.stop() }
        findViewById<Button>(R.id.hide).setOnClickListener { setControlsVisible(false) }
        findViewById<Button>(R.id.cycle_audio).setOnClickListener { cycleAudioTrack() }

        status.text = deviceLine()
    }

    /** OK on the hidden surface brings the controls back; media keys pass through. */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (controls.visibility == View.GONE && isDpadKey(event.keyCode)) {
            setControlsVisible(true)
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    private fun isDpadKey(keyCode: Int) = when (keyCode) {
        KeyEvent.KEYCODE_DPAD_CENTER,
        KeyEvent.KEYCODE_ENTER,
        KeyEvent.KEYCODE_DPAD_UP,
        KeyEvent.KEYCODE_DPAD_DOWN,
        KeyEvent.KEYCODE_DPAD_LEFT,
        KeyEvent.KEYCODE_DPAD_RIGHT,
        KeyEvent.KEYCODE_BACK -> true
        else -> false
    }

    override fun onDestroy() {
        mediaSession.release()
        player.release()
        super.onDestroy()
    }

    private fun prefs() = getSharedPreferences("probe", MODE_PRIVATE)

    private fun key(buttonId: Int) = "url_$buttonId"

    @SuppressLint("SetTextI18n")
    private fun playProbe(buttonId: Int, edit: EditText) {
        val url = edit.text.toString().trim()
        if (url.isEmpty()) {
            toast("Paste a play URL first")
            return
        }
        prefs().edit().putString(key(buttonId), url).apply()
        player.setMediaItem(MediaItem.fromUri(url))
        player.prepare()
        player.play()
        setControlsVisible(false)
        setStatus("PLAY $buttonId: ${url.takeLast(60)}")
    }

    /** OQ-T2: the translated-stream probe needs voiceover switching on the box. */
    private fun cycleAudioTrack() {
        val groups = player.currentTracks.groups.filter { it.type == C.TRACK_TYPE_AUDIO }
        if (groups.isEmpty()) {
            toast("No audio tracks")
            return
        }
        val selected = groups.indexOfFirst { it.isSelected }.coerceAtLeast(0)
        val next = groups[(selected + 1) % groups.size]
        val format = next.getTrackFormat(0)
        player.trackSelectionParameters = player.trackSelectionParameters
            .buildUpon()
            .setOverrideForType(TrackSelectionOverride(next.mediaTrackGroup, 0))
            .build()
        setStatus("AUDIO -> ${format.label ?: format.language ?: "track ${groups.indexOf(next)}"}")
    }

    private fun setControlsVisible(visible: Boolean) {
        controls.visibility = if (visible) View.VISIBLE else View.GONE
        if (visible) findViewById<Button>(R.id.play_hevc).requestFocus()
    }

    @SuppressLint("SetTextI18n")
    private fun deviceLine(): String {
        val hevc = hasDecoder(MediaFormat.MIMETYPE_VIDEO_HEVC)
        val avc = hasDecoder(MediaFormat.MIMETYPE_VIDEO_AVC)
        return "${Build.MODEL} | Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT}) | " +
            "hw hevc=$hevc hw avc=$avc"
    }

    private fun hasDecoder(mime: String): Boolean {
        val codecs = MediaCodecList(MediaCodecList.REGULAR_CODECS)
        return codecs.codecInfos.any { it.isHardwareAccelerated && mime in it.supportedTypes }
    }

    private fun setStatus(line: String) {
        status.text = line
    }

    private fun toast(msg: String) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
    }

    private inner class PlayerListener : Player.Listener {
        override fun onPlaybackStateChanged(state: Int) {
            val name = when (state) {
                Player.STATE_IDLE -> "IDLE"
                Player.STATE_BUFFERING -> "BUFFERING"
                Player.STATE_READY -> "READY"
                Player.STATE_ENDED -> "ENDED"
                else -> "?"
            }
            setStatus(name)
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            if (isPlaying) setStatus("PLAYING")
        }

        override fun onPlayerError(error: PlaybackException) {
            val cause = error.cause
            setStatus(
                "ERROR ${error.errorCodeName}: ${error.message}" +
                    (cause?.let { " <- ${it.javaClass.simpleName}: ${it.message}" } ?: "")
            )
        }
    }
}
