package tv.mellifera.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
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

    @Test
    fun default_on_color_is_readable_on_the_canvas() {
        // Task 8.12 (ledger #15 — the invisible-titles defect): the root
        // provider hands default-colored Text the scheme's onBackground.
        // That value must never itself be dark — tv-material's
        // ContentColor default was Color.Black (invisible on the canvas);
        // the scheme's own dark default is the library's Neutral90,
        // near-white. Pin the law, not the library's palette: readable
        // luminance, never black.
        val onBackground = MelliferaDarkScheme.onBackground
        assertTrue(onBackground != Color.Black)
        assertTrue(
            "onBackground must stay readable on the near-black canvas",
            onBackground.luminance() > 0.5f,
        )
    }
}
