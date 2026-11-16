package tv.mellifera.ui

import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Pins the applied scheme (D13 visual parity scale): background AND surface
 * are the web canvas — the SPA dark token `--background: hsl(222.2 84%
 * 4.9%)` ≈ #020617 — not darkColorScheme()'s ≈ #1C1B1F default.
 */
class AppThemeTest {
    @Test
    fun scheme_pins_web_canvas_background_and_surface() {
        val canvas = Color(0xFF020617)
        assertEquals(canvas, MelliferaDarkScheme.background)
        assertEquals(canvas, MelliferaDarkScheme.surface)
    }

    @Test
    fun app_canvas_is_the_spa_dark_token() {
        // hsl(222.2 84% 4.9%) → #020617 (web/src/styles/index.css).
        assertEquals(Color(0xFF020617), AppCanvas)
    }
}
