package tv.mellifera.browse

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The fallback's CSS gradient-line geometry pin: the endpoints follow the
 * CSS spec's own law (0° = "to top", clockwise; line length
 * W·|sin θ| + H·|cos θ|; stops at center ± length/2) so the 140° pairing
 * renders the same diagonal the SPA's `linear-gradient(140deg, from, to)`
 * does.
 */
class FallbackArtworkTest {

    @Test
    fun zero_degrees_runs_bottom_to_top() {
        // 0° points up: the first stop sits at the bottom edge, the last at
        // the top edge, x centered.
        val (start, end) = gradientEndpoints(0f, Size(100f, 200f))
        assertEquals(Offset(50f, 200f), start)
        assertEquals(Offset(50f, 0f), end)
    }

    @Test
    fun ninety_degrees_runs_left_to_right() {
        val (start, end) = gradientEndpoints(90f, Size(100f, 200f))
        assertEquals(Offset(0f, 100f), start)
        assertEquals(Offset(100f, 100f), end)
    }

    @Test
    fun one_forty_degrees_runs_down_right_through_the_corners() {
        // 140° on a square: the line runs down-right, length
        // W·sin 140° + H·|cos 140°|, its endpoints just inside the corners —
        // `linear-gradient(140deg, ...)`'s diagonal, the SPA PosterFrame law.
        val rad = Math.toRadians(140.0)
        val dx = kotlin.math.sin(rad)
        val dy = -kotlin.math.cos(rad)
        val half = (100.0 * dx + 100.0 * kotlin.math.abs(dy)) / 2.0
        val (start, end) = gradientEndpoints(140f, Size(100f, 100f))
        assertEquals(50.0 - dx * half, start.x.toDouble(), 0.01)
        assertEquals(50.0 - dy * half, start.y.toDouble(), 0.01)
        assertEquals(50.0 + dx * half, end.x.toDouble(), 0.01)
        assertEquals(50.0 + dy * half, end.y.toDouble(), 0.01)
    }
}
