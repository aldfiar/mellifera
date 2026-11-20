package tv.mellifera.ui

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import kotlin.math.floor

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
 * The SPA html.tv :focus-visible ring color — --ring resolves to slate
 * #CBD5E1 (hsl 212.7 26.8% 83.9%, web/src/styles/index.css html.tv block).
 * Private to Focus.kt — the ring color lives beside its consumer;
 * promoting it into the Colors.kt token home is a one-line follow-up,
 * not a call-site sweep.
 */
private val RingSlate = Color(0xFFCBD5E1)

/**
 * The SPA html.tv :focus-visible outline-width law in device px
 * (web/src/styles/index.css html.tv block: clamp(calc(2px / dpr), 0.2vw,
 * calc(5px / dpr))): the ÷dpr bounds floor to whole device px, the 0.2vw
 * preference reads viewportWidthPx * 0.002, and the bounds are inclusive —
 * CSS clamp semantics, max(low, min(preference, high)). JVM-pure so
 * [FocusRingTest] pins it against the SPA's own arithmetic.
 */
fun tvFocusRingWidth(dpr: Float, viewportWidthPx: Float): Float {
    val low = floor(2f / dpr)
    val high = floor(5f / dpr)
    val preferred = viewportWidthPx * 0.002f
    return maxOf(low, minOf(preferred, high))
}

/**
 * The SPA html.tv outline-offset law in device px: clamp(2px, 0.2vw, 4px) —
 * the SPA offset carries no ÷dpr, so neither does this.
 */
private fun tvFocusRingOffset(viewportWidthPx: Float): Float {
    val preferred = viewportWidthPx * 0.002f
    return maxOf(2f, minOf(preferred, 4f))
}

/**
 * The focus VISUAL law (SPA html.tv :focus-visible): a slate ring drawn
 * OUTSIDE the element with an offset — never a scale, never a fill — its
 * width from [tvFocusRingWidth], its offset from the SPA clamp(2px, 0.2vw,
 * 4px) law, and it follows the element's own [shape] (the 6dp corner
 * default; RailRow passes its 4dp cardShape, pill chips their pill).
 * drawBehind keeps the ring out of layout entirely — the CSS outline's own
 * property; a scroll viewport can clip it exactly like an SPA outline.
 * Apply alongside the element's own clickability.
 */
@Composable
fun Modifier.tvFocusStyle(shape: Shape = RoundedCornerShape(6.dp)): Modifier {
    val density = LocalDensity.current
    val viewportWidthPx = with(density) { LocalConfiguration.current.screenWidthDp.dp.toPx() }
    var focused by remember { mutableStateOf(false) }
    return this
        .onFocusChanged { focused = it.isFocused }
        .drawBehind {
            if (!focused) return@drawBehind
            val width = tvFocusRingWidth(density.density, viewportWidthPx)
            // The stroke centers on the outline path, so the path sits one
            // half-width past the offset and the band spans [offset,
            // offset + width] outside the bounds — the CSS outline geometry.
            val centerline = tvFocusRingOffset(viewportWidthPx) + width / 2f
            val outline = shape.createOutline(
                Size(size.width + 2 * centerline, size.height + 2 * centerline),
                layoutDirection,
                this,
            )
            withTransform({ translate(-centerline, -centerline) }) {
                drawOutline(outline, RingSlate, style = Stroke(width))
            }
        }
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
