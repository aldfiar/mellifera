package tv.mellifera.ui

import androidx.compose.ui.Modifier

/**
 * D-pad focus law placeholder — task 5.9 owns the real surface here
 * (initial-focus law: a screen without initial focus is a bug; accent
 * border + scale 1.1, never pills; per-screen key routing).
 *
 * A screen MUST call a modifier from this file once real focus law lands;
 * the placeholder keeps the import site shaped until then.
 */
val Modifier.tvInitialFocus: Modifier
    get() = this
