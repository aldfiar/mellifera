package tv.mellifera.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import tv.mellifera.AppViewModel
import tv.mellifera.Screen
import tv.mellifera.browse.BrowseScreen
import tv.mellifera.pairing.PairingScreen
import tv.mellifera.playback.PlayerOverlay

/**
 * The when-screen shell (D1): `when (state.screen)` IS the navigation —
 * no nav library, no DI. The player is an overlay, never a screen — it
 * renders above whatever screen is showing whenever the machine is not
 * Idle (D8, 5.7).
 */
@Composable
fun App(viewModel: AppViewModel) {
    val state by viewModel.state.collectAsState()
    when (state.screen) {
        Screen.Pairing -> PairingScreen(viewModel.pairing)
        Screen.Browse -> BrowseScreen(viewModel)
    }
    PlayerOverlay(viewModel.playback)
}
