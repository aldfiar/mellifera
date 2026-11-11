package tv.mellifera.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.tv.material3.Text
import tv.mellifera.AppViewModel
import tv.mellifera.Screen
import tv.mellifera.pairing.PairingScreen

/**
 * The when-screen shell (D1): `when (state.screen)` IS the navigation —
 * no nav library, no DI. The player is an overlay, never a screen.
 */
@Composable
fun App(viewModel: AppViewModel) {
    val state by viewModel.state.collectAsState()
    when (state.screen) {
        Screen.Pairing -> PairingScreen(viewModel.pairing)
        Screen.Browse -> BrowseScreen()
    }
}

/** Placeholder — the real browse grid lands in 5.6. */
@Composable
private fun BrowseScreen() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text("Mellifera")
    }
}
