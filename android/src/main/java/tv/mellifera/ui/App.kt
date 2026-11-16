package tv.mellifera.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.graphics.Color
import androidx.tv.material3.ColorScheme
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.darkColorScheme
import tv.mellifera.AppViewModel
import tv.mellifera.Screen
import tv.mellifera.browse.BrowseScreen
import tv.mellifera.pairing.PairingScreen
import tv.mellifera.playback.PlayerOverlay

/**
 * The web canvas color: the SPA dark token `--background: hsl(222.2 84%
 * 4.9%)` (web/src/styles/index.css) ≈ #020617 — the near-black canvas the
 * web renders, visibly darker than darkColorScheme()'s default background
 * (≈ #1C1B1F gray) the app showed before (D13 visual parity scale).
 */
val AppCanvas = Color(0xFF020617)

/**
 * The app-wide scheme (D9 + D13): the dark defaults with background and
 * surface pinned to the web canvas — the shell, browse surface, rail scrim
 * and home rows read it; the derived on-colors keep the dark defaults.
 * The player overlay is NOT part of this law — its shell stays a
 * transparent container (D7 punch-through law, controls draw their own
 * scrim) and reads nothing from this scheme.
 */
val MelliferaDarkScheme: ColorScheme = darkColorScheme(
    background = AppCanvas,
    surface = AppCanvas,
)

/**
 * The when-screen shell (D1): `when (state.screen)` IS the navigation —
 * no nav library, no DI. The player is an overlay, never a screen — it
 * renders above whatever screen is showing whenever the machine is not
 * Idle (D8, 5.7).
 *
 * The scheme is pinned here, JVM-side, once (D9 Visibility default law +
 * D13 canvas parity): MainActivity's root `MaterialTheme { }` keeps the
 * library default; this wrapper applies [MelliferaDarkScheme] to the whole
 * app tree, so every screen — present and future — inherits readable text
 * defaults on the web's near-black canvas. Permanent: never a per-screen
 * patch, and a `Text()` that needs an explicit color outside the theme is
 * a review flag, not a style choice.
 */
@Composable
fun App(viewModel: AppViewModel) {
    val state by viewModel.state.collectAsState()
    MaterialTheme(colorScheme = MelliferaDarkScheme) {
        when (state.screen) {
            Screen.Pairing -> PairingScreen(viewModel.pairing)
            Screen.Browse -> BrowseScreen(viewModel)
        }
        PlayerOverlay(viewModel.playback)
    }
}
