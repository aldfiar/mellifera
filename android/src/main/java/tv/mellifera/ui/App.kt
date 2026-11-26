package tv.mellifera.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.tv.material3.ColorScheme
import androidx.tv.material3.LocalContentColor
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.darkColorScheme
import tv.mellifera.AppViewModel
import tv.mellifera.Screen
import tv.mellifera.browse.BrowseScreen
import tv.mellifera.pairing.PairingScreen
import tv.mellifera.playback.PlayerOverlay

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
    // The persisted scale/columns ride the same root provider — every
    // surface re-reads them per emission (the settings overlay's LIVE
    // cycling re-tiles grids while it is open).
    val uiScale by viewModel.uiPrefs.uiScale.collectAsState()
    val gridColumns by viewModel.uiPrefs.gridColumns.collectAsState()
    val episodeColumns by viewModel.uiPrefs.episodeColumns.collectAsState()
    MaterialTheme(colorScheme = MelliferaDarkScheme) {
        // The invisible-titles fix (task 8.12, ledger #15 — walk61d's pixel
        // proof + the operator's live report «episode number and title is
        // not shown»): tv-material 1.0.1's Text resolves LocalContentColor
        // whose DEFAULT is Color.Black and whose MaterialTheme NEVER
        // provides it (only tv.material3.Surface does — decompiled AAR
        // bytecode). This tree has no Surface above the texts, so every
        // default-colored Text drew black on the near-black canvas —
        // titles, labels, headers, invisible. The scheme's own onBackground
        // (measured on-device at (230,225,229) = #E6E1E5 — the library's
        // Neutral-class near-white; the bytecode-derived (244,239,244)
        // citation was wrong) is the readable default the D9/D13 law always
        // intended — provided here at the root, once, so every screen
        // inherits it. Walk62's pixel grade confirmed the paint source:
        // glyphs render at exactly this value. The default is now the SPA
        // foreground token [tvForeground] (#F8FAFC, --foreground in
        // styles/index.css .dark) — the web's own text color — replacing
        // the scheme's onBackground.
        CompositionLocalProvider(
            LocalContentColor provides tvForeground,
            LocalUiScale provides uiScale,
            LocalGridPrefs provides GridPrefs(gridColumns, episodeColumns),
        ) {
            when (state.screen) {
                Screen.Pairing -> PairingScreen(viewModel.pairing)
                Screen.Browse -> BrowseScreen(viewModel)
            }
            PlayerOverlay(viewModel.playback)
        }
    }
}
