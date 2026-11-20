package tv.mellifera.browse

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.tv.material3.Text
import tv.mellifera.ui.TYPE_FALLBACK_INITIAL
import tv.mellifera.ui.tvForeground
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

/**
 * The missing-artwork fallback (the SPA Artwork.tsx PosterFrame fallback
 * branch): the hashed pastel gradient at 140° with the name's first
 * grapheme centered on it — never a bare rectangle. Rendered ONLY by the
 * fixed-aspect art boxes whose absence branch would otherwise draw bare
 * canvas (the grid card, the home resume + anchor cards); the hero poster
 * and the episode thumb keep field-driven absence (no box, no fallback), and
 * a resolving artwork URL renders the artwork instead (spec: Present artwork
 * never shows the fallback).
 *
 * The gradient geometry is CSS's own: the gradient line runs at `angleDeg`
 * clockwise from "to top" (CSS y-up → screen y-down flips the dy sign),
 * its length is W·|sin θ| + H·|cos θ|, and the two stops sit at its
 * endpoints around the center — `linear-gradient(140deg, from, to)`
 * verbatim (PosterFrame's style law).
 */
@Composable
internal fun FallbackArtwork(
    name: String?,
    modifier: Modifier = Modifier,
) {
    val gradient = fallbackGradient(name ?: "")
    Box(
        modifier = modifier.drawBehind {
            val (start, end) = gradientEndpoints(FALLBACK_GRADIENT_ANGLE_DEG, size)
            drawRect(
                brush = Brush.linearGradient(
                    colors = listOf(gradient.from, gradient.to),
                    start = start,
                    end = end,
                ),
            )
        },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            gradient.initial,
            fontSize = TYPE_FALLBACK_INITIAL,
            fontWeight = FontWeight.SemiBold,
            color = tvForeground.copy(alpha = FALLBACK_INITIAL_ALPHA),
        )
    }
}

/** The SPA fallback's gradient angle — PosterFrame's `linear-gradient(140deg, ...)`. */
internal const val FALLBACK_GRADIENT_ANGLE_DEG = 140f

/** The initial glyph's foreground/70 — PosterFrame's `text-foreground/70`. */
internal const val FALLBACK_INITIAL_ALPHA = 0.7f

/**
 * The CSS gradient line's endpoints for `angleDeg` (0° = "to top",
 * clockwise) across a [size] canvas: direction (sin θ, −cos θ) in screen
 * coordinates, line length W·|sin θ| + H·|cos θ|, stops at center ± length/2.
 */
internal fun gradientEndpoints(angleDeg: Float, size: Size): Pair<Offset, Offset> {
    val rad = Math.toRadians(angleDeg.toDouble())
    val dx = sin(rad)
    val dy = -cos(rad)
    val half = (abs(size.width * dx) + abs(size.height * dy)) / 2.0
    val center = Offset(size.width / 2f, size.height / 2f)
    val offset = Offset((dx * half).toFloat(), (dy * half).toFloat())
    return center - offset to center + offset
}
