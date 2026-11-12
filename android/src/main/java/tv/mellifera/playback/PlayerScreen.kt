package tv.mellifera.playback

import android.view.SurfaceView
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.tv.material3.Button
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import tv.mellifera.state.Phase
import tv.mellifera.state.PlaybackState

/**
 * The player as OVERLAY (D1/D8): never a Screen route — it renders above
 * whatever AppState.screen is whenever the machine is not Idle, so playback
 * can start from browse (or any later screen) and leave no navigation
 * residue. Key/focus polish is 5.9's; this surface wires the video through
 * [PlayerOrchestration.attachSurface] and reads the timeline from the
 * readout flow only (position/buffering never enter AppState).
 */
@Composable
fun PlayerOverlay(playback: PlayerOrchestration) {
    val state by playback.state.collectAsState()
    when (val s = state) {
        PlaybackState.Idle -> Unit
        is PlaybackState.Starting -> PlayerOverlayShell {
            val message = when (s.phase) {
                Phase.Polling -> "Сервер готовит файл…"
                else -> "Подготовка воспроизведения…"
            }
            Text(message)
        }
        is PlaybackState.Active -> PlayerOverlayShell {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { context -> SurfaceView(context) },
                update = { view -> playback.attachSurface(view.holder.surface) },
            )
        }
        is PlaybackState.Dead -> PlayerOverlayShell {
            // Honest terminal banner — no retry affordance (the Dead law).
            Text(s.banner)
        }
        is PlaybackState.Failed -> PlayerOverlayShell {
            Text(s.banner)
            Button(onClick = { playback.retry() }) { Text("Повторить") }
        }
    }
}

@Composable
private fun PlayerOverlayShell(content: @Composable () -> Unit) {
    Surface(modifier = Modifier.fillMaxSize()) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                content()
            }
        }
    }
}
