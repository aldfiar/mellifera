package tv.mellifera.playback

import android.os.SystemClock
import android.view.SurfaceHolder
import android.view.SurfaceView
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.KeyEvent
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.tv.material3.Button
import androidx.tv.material3.Text
import kotlinx.coroutines.delay
import tv.mellifera.dpad.DpadKey
import tv.mellifera.dpad.PlayerKeyAction
import tv.mellifera.dpad.routePlayerKey
import tv.mellifera.dpad.toDpadKey
import tv.mellifera.state.Phase
import tv.mellifera.state.PlaybackState
import tv.mellifera.ui.TYPE_HEADING
import tv.mellifera.ui.TYPE_META
import tv.mellifera.ui.TYPE_READOUT
import tv.mellifera.ui.TYPE_SMALL
import tv.mellifera.ui.tvAccent
import tv.mellifera.ui.tvInitialFocus

/** The seek bar's track — the D11 chip-bg token (file-local, the idiom the
 * BrowseScreen/SettingsSection tokens use). */
private val chipColor = Color(0xFF2A2F3A)

/**
 * The player as OVERLAY (D1/D8): never a Screen route — it renders above
 * whatever AppState.screen is whenever the machine is not Idle, so playback
 * can start from browse (or any later screen) and leave no navigation
 * residue. Key law (5.9): the Active overlay owns every key through the
 * pure dpad routing (arrows seek ∓/±10s accelerating on hold, Ok reveals
 * the controls then toggles play/pause, Back dismisses the controls else
 * pause-then-exit); on the other states Back exits the overlay. It reads
 * the timeline from the readout flow only (position/buffering never enter
 * AppState).
 */
@Composable
fun PlayerOverlay(playback: PlayerOrchestration) {
    val state by playback.state.collectAsState()
    when (val s = state) {
        PlaybackState.Idle -> Unit
        is PlaybackState.Starting -> PassiveOverlay(playback) {
            val message = when (s.phase) {
                Phase.Polling -> "Сервер готовит файл…"
                else -> "Подготовка воспроизведения…"
            }
            Text(message)
        }
        is PlaybackState.Active -> ActiveOverlay(playback)
        is PlaybackState.Dead -> PassiveOverlay(playback) {
            // Honest terminal banner — no retry affordance (the Dead law).
            Text(s.banner)
        }
        is PlaybackState.Failed -> PassiveOverlay(playback) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(s.banner)
                Button(onClick = { playback.retry() }, modifier = Modifier.padding(top = 16.dp)) {
                    Text("Повторить")
                }
            }
        }
    }
}

/**
 * The Active overlay: focused on entry (the overlay IS the focus target),
 * every key routes through [routePlayerKey]. The control layer is the pure
 * law's [ControlsVisibility] of THIS composable — the reveal/toggle/
 * dismiss branches are exactly the pinned law, and the ~6s auto-hide runs
 * from the LAST DPAD INPUT (5.5), immune to progress ticks.
 */
@Composable
private fun ActiveOverlay(playback: PlayerOrchestration) {
    var controls by remember { mutableStateOf(ControlsVisibility.HIDDEN) }
    val readout by playback.readout.collectAsState()
    val ranges by playback.skipRanges.collectAsState()
    val activeSkip = skipSectionAt(ranges, readout.positionMs / 1000.0)

    fun onAction(action: PlayerKeyAction) {
        when (action) {
            is PlayerKeyAction.Seek -> playback.seekBy(action.deltaMs)
            PlayerKeyAction.ShowControls -> Unit
            PlayerKeyAction.TogglePlay -> {
                // OK's law (D7): inside a served classified range the chip's
                // activation wins — seek a beat past the range's end (which
                // leaves the end-exclusive range); outside it, the
                // reveal/toggle law stands.
                val skip = activeSkip
                if (skip != null) {
                    playback.seekTo(((skip.endSeconds + SKIP_SEEK_PAST_SECONDS) * 1000).toLong())
                } else {
                    playback.playPause()
                }
            }
            PlayerKeyAction.DismissControls -> {
                // Back's first stage (5.9): hide + disarm — the input law
                // does not apply, nothing re-arms here.
                controls = controls.onDismiss()
                return
            }
            PlayerKeyAction.PauseExit -> {
                // Pause first — it flushes the stored position — then exit.
                playback.playPause()
                playback.exit()
                return
            }
        }
        // 5.5: every other consumed input reveals (any key while hidden
        // re-reveals) and re-arms the ~6s hide from NOW.
        controls = controls.onPlayerInput(SystemClock.elapsedRealtime())
    }

    // The 5.5 hide timer: keyed ONLY on the visibility state — every input
    // stamps a new re-arm (restarting this effect), while a progress tick
    // recomposes WITHOUT touching `controls`, so the timer never restarts
    // on playback (the reset-every-frame defect this restores).
    LaunchedEffect(controls) {
        if (!controls.isVisible) return@LaunchedEffect
        delay(CONTROLS_HIDE_MS)
        if (controls.hideDue(SystemClock.elapsedRealtime())) {
            controls = controls.onDismiss()
        }
    }

    BackHandler {
        routePlayerKey(DpadKey.Back, controlsShown = controls.isVisible)?.let(::onAction)
    }

    PlayerOverlayShell(
        modifier = Modifier
            .tvInitialFocus()
            .focusable()
            .onKeyEvent { event ->
                if (event.type != KeyEventType.KeyDown) return@onKeyEvent false
                val key = event.nativeKeyEvent.toDpadKey() ?: return@onKeyEvent false
                routePlayerKey(key, event.nativeKeyEvent.repeatCount, controls.isVisible)
                    ?.let { onAction(it); true } ?: false
            },
    ) {
        // The video-surface lifecycle (5.4): attach ONLY on the holder's
        // callbacks — the surface does not exist at composition time, so a
        // composition-time attach would pin null (Media3 dummy mode: audio,
        // black panel) and nothing would ever re-attach. The controller
        // remembers the latest surface, so an attach that lands before the
        // player exists still applies at player creation.
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { context ->
                SurfaceView(context).apply {
                    holder.addCallback(object : SurfaceHolder.Callback {
                        override fun surfaceCreated(holder: SurfaceHolder) {
                            playback.attachSurface(holder.surface)
                        }

                        override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
                            playback.attachSurface(holder.surface)
                        }

                        override fun surfaceDestroyed(holder: SurfaceHolder) {
                            playback.attachSurface(null)
                        }
                    })
                }
            },
        )
        if (controls.isVisible) {
            ControlsBar(playback)
        }
        activeSkip?.let { SkipChip(it) }
        AutoNextCard(playback)
    }
}

/**
 * The skip chip (D7, SkipChip.tsx): rendered ONLY while the playhead is
 * inside a served classified range, fading after [SKIP_FADE_MS] inside the
 * range (still rendered, just inert) and re-arming when a seek lands back
 * into a range — the `active` key restarts the timer on every entry. It
 * takes no dpad focus: the overlay owns every key, OK's in-range branch IS
 * the activation (D7).
 */
@Composable
private fun BoxScope.SkipChip(active: SkipSection) {
    var faded by remember(active) { mutableStateOf(false) }
    LaunchedEffect(active) {
        delay(SKIP_FADE_MS)
        faded = true
    }
    Column(
        modifier = Modifier
            .align(Alignment.BottomEnd)
            .padding(8.dp)
            .alpha(if (faded) 0f else 1f)
            .background(chipColor, RoundedCornerShape(4.dp)),
    ) {
        Text(
            active.kind.label,
            fontSize = TYPE_SMALL,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
        )
    }
}

/**
 * The «Следующая серия» card (D7, AutoNext.tsx): renders ONLY on an open
 * ended edge with a resolved pick — a film never renders it (no parseable
 * facts → no pick, the loader decided on served facts, never a media-type
 * literal). The countdown line renders only while a countdown runs — an
 * unusable served shape means NO countdown and NEVER autoplay, the client
 * bakes no fallback (the orchestration owns the tick); zero fires the
 * «Смотреть» path from there. «Отмена» suppresses the card for the app
 * session. The card takes the initial focus so the dpad reaches the buttons.
 */
@Composable
private fun BoxScope.AutoNextCard(playback: PlayerOrchestration) {
    val offer by playback.nextUp.collectAsState()
    val countdown by playback.countdown.collectAsState()
    val next = offer ?: return
    Column(
        modifier = Modifier
            .align(Alignment.BottomStart)
            .padding(8.dp)
            .tvInitialFocus()
            .background(chipColor, RoundedCornerShape(4.dp))
            .padding(8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text("Следующая серия", fontSize = TYPE_SMALL)
        if (next.nameLine.isNotEmpty()) {
            Text(next.nameLine, fontSize = TYPE_META, color = Color.LightGray)
        }
        if (next.episodeTitle.isNotEmpty()) {
            Text(next.episodeTitle, fontSize = TYPE_META)
        }
        countdown?.let {
            Text("Автопереход через $it с", fontSize = TYPE_META, color = Color.LightGray)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Button(onClick = { playback.play(next.itemId) }) { Text("Смотреть", fontSize = TYPE_SMALL) }
            Button(onClick = { playback.cancelNextUp() }) { Text("Отмена", fontSize = TYPE_SMALL) }
        }
    }
}

/**
 * The control layer (D7, the §3.5 wireframe): the seek bar + the position /
 * duration readout on top, the dpad hint line under them (the SPA's legend
 * is pointer:fine-only — the TV counterpart is exactly this line, no second
 * legend row), then the OK-revealed info blocks. The bar renders only while
 * the readout knows the duration — never a guessed percent (L1/D2). The
 * next Ok toggles play/pause; Back hides the layer.
 */
@Composable
private fun BoxScope.ControlsBar(playback: PlayerOrchestration) {
    val readout by playback.readout.collectAsState()
    val info by playback.info.collectAsState()
    val durationMs = readout.durationMs
    Column(
        modifier = Modifier
            .align(Alignment.BottomCenter)
            .fillMaxWidth()
            .background(Color(0xCC1A1D24))
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        if (durationMs > 0) {
            // The seek bar: position over duration, clamped (the watchedPercent
            // law) — tvAccent fill on the chip-bg track (the D11 tokens).
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(2.dp)
                    .background(chipColor),
            ) {
                val fraction =
                    (readout.positionMs.toFloat() / durationMs).coerceIn(0f, 1f)
                Box(
                    modifier = Modifier
                        .fillMaxWidth(fraction)
                        .height(2.dp)
                        .background(tvAccent),
                )
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                if (durationMs > 0) {
                    "${formatClock(readout.positionMs)} / ${formatClock(durationMs)}"
                } else {
                    formatClock(readout.positionMs)
                },
                fontSize = TYPE_READOUT,
            )
            Text("← → перемотка · OK пауза · Back скрыть", fontSize = TYPE_SMALL, color = Color.LightGray)
        }
        info?.let { InfoBlocks(it) }
    }
}

/**
 * The info blocks (D7, InfoColumn.tsx's IA): heading (SxxEyy eyebrow +
 * episode title, a film's served display name), «Серия», «В ролях», About.
 * Field-driven: the mapper's nulls render nothing — never a placeholder
 * (L1). The blocks take no dpad focus — the overlay owns every key (5.9).
 */
@Composable
private fun InfoBlocks(info: PlayerInfoBlocks) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        if (info.eyebrow != null || info.heading != null) {
            Column {
                info.eyebrow?.let { Text(it, fontSize = TYPE_META, color = Color.LightGray) }
                info.heading?.let { Text(it, fontSize = TYPE_HEADING) }
            }
        }
        info.episodeDescription?.let {
            Column {
                Text("Серия", fontSize = TYPE_META)
                Text(it, fontSize = TYPE_META, color = Color.LightGray)
            }
        }
        if (info.cast.isNotEmpty()) {
            Column {
                Text("В ролях", fontSize = TYPE_META)
                Text(info.cast.castLine(), fontSize = TYPE_META, color = Color.LightGray)
            }
        }
        info.about?.let { Text(it, fontSize = TYPE_META, color = Color.LightGray) }
    }
}

/** The non-Active surfaces: Back leaves the player (the overlay closes). */
@Composable
private fun PassiveOverlay(playback: PlayerOrchestration, content: @Composable () -> Unit) {
    BackHandler { playback.exit() }
    PlayerOverlayShell { content() }
}

@Composable
private fun PlayerOverlayShell(
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    // The punch-through law (D7): the video's SurfaceView composites BEHIND
    // the app window, so the shell is a plain transparent Box — a Compose
    // Surface's opaque material background would cover the video. The child
    // overlays (controls/chip/auto-next) draw their own backgrounds.
    Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        content()
    }
}
