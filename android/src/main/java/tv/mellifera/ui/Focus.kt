package tv.mellifera.ui

import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp

/**
 * The focus law's accent — the one color a focused element carries (the
 * focused state is a 2dp accent border + scale 1.1, NEVER a pill; 5.9).
 */
val tvAccent = Color(0xFF4C8DFF)

private val FOCUSED_SCALE = 1.1f

/**
 * Initial-focus law: the element this modifier sits on takes focus when it
 * composes. A screen without initial focus is a bug (5.9) — every screen
 * calls this on the element [tv.mellifera.nav]'s law names, or drives
 * focus from the browse cursor state via [requestFocusSafely].
 */
@Composable
fun Modifier.tvInitialFocus(): Modifier {
    val requester = remember { FocusRequester() }
    LaunchedEffect(requester) { requester.requestFocusSafely() }
    return this.focusRequester(requester)
}

/**
 * The focus VISUAL law: accent border + scale 1.1 while focused, nothing
 * while not — never a pill highlight. Apply alongside the element's own
 * clickability.
 */
@Composable
fun Modifier.tvFocusStyle(): Modifier {
    var focused by remember { mutableStateOf(false) }
    return this
        .onFocusChanged { focused = it.isFocused }
        .graphicsLayer {
            scaleX = if (focused) FOCUSED_SCALE else 1f
            scaleY = if (focused) FOCUSED_SCALE else 1f
        }
        .then(
            if (focused) {
                Modifier.border(2.dp, tvAccent, RoundedCornerShape(6.dp))
            } else {
                Modifier
            },
        )
}

/**
 * Focus a node from the browse cursor state (grid/episode position, back
 * restoration). Best-effort: the node may have left composition between the
 * state flip and this effect (the item scrolled out in the same frame) —
 * the next state change re-runs the actuator, so the request is simply
 * dropped, never retried against a detached node.
 */
fun FocusRequester.requestFocusSafely() {
    try {
        requestFocus()
    } catch (_: IllegalStateException) {
        // Detached mid-frame — dropped, the next actuation re-targets.
    }
}
