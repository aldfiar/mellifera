package tv.mellifera.playback

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
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.KeyEvent
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.tv.material3.Button
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import tv.mellifera.dpad.DpadKey
import tv.mellifera.dpad.PlayerKeyAction
import tv.mellifera.dpad.routePlayerKey
import tv.mellifera.dpad.toDpadKey
import tv.mellifera.state.Phase
import tv.mellifera.state.PlaybackState
import tv.mellifera.ui.tvInitialFocus

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
 * every key routes through [routePlayerKey]. The control layer is a
 * visibility flag of THIS composable — the pure law's controlsShown — so
 * the reveal/toggle/dismiss branches are exactly the pinned law.
 */
@Composable
private fun ActiveOverlay(playback: PlayerOrchestration) {
    var controlsShown by remember { mutableStateOf(false) }

    fun onAction(action: PlayerKeyAction) {
        when (action) {
            is PlayerKeyAction.Seek -> playback.seekBy(action.deltaMs)
            PlayerKeyAction.ShowControls -> controlsShown = true
            PlayerKeyAction.TogglePlay -> playback.playPause()
            PlayerKeyAction.DismissControls -> controlsShown = false
            PlayerKeyAction.PauseExit -> {
                // Pause first — it flushes the stored position — then exit.
                playback.playPause()
                playback.exit()
            }
        }
    }

    BackHandler {
        routePlayerKey(DpadKey.Back, controlsShown = controlsShown)?.let(::onAction)
    }

    PlayerOverlayShell(
        modifier = Modifier
            .tvInitialFocus()
            .focusable()
            .onKeyEvent { event ->
                if (event.type != KeyEventType.KeyDown) return@onKeyEvent false
                val key = event.nativeKeyEvent.toDpadKey() ?: return@onKeyEvent false
                routePlayerKey(key, event.nativeKeyEvent.repeatCount, controlsShown)
                    ?.let { onAction(it); true } ?: false
            },
    ) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { context -> SurfaceView(context) },
            update = { view -> playback.attachSurface(view.holder.surface) },
        )
        if (controlsShown) {
            ControlsBar(playback)
        }
    }
}

/**
 * The control layer (RU copy): the position readout and the key hints. The
 * next Ok toggles play/pause; Back hides the layer.
 */
@Composable
private fun BoxScope.ControlsBar(playback: PlayerOrchestration) {
    val readout by playback.readout.collectAsState()
    Row(
        modifier = Modifier
            .align(Alignment.BottomCenter)
            .fillMaxWidth()
            .background(Color(0xCC1A1D24))
            .padding(horizontal = 24.dp, vertical = 16.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(formatPosition(readout.positionMs), fontSize = 20.sp)
        Text("← → перемотка · OK пауза · Back скрыть", fontSize = 14.sp, color = Color.LightGray)
    }
}

/** mm:ss readout for the control layer (the timeline leaf, D8). */
private fun formatPosition(positionMs: Long): String {
    val totalSeconds = positionMs / 1000
    return "%d:%02d".format(totalSeconds / 60, totalSeconds % 60)
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
    Surface(modifier = modifier.fillMaxSize()) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            content()
        }
    }
}
