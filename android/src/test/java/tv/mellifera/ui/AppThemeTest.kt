package tv.mellifera.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import tv.mellifera.browse.DEFAULT_TYPE_ACCENT
import tv.mellifera.browse.typeAccent

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

    @Test
    fun root_text_token_is_the_spa_foreground() {
        // SPA --foreground (210 40% 98%) — web/src/styles/index.css .dark;
        // App's root LocalContentColor provider hands this to every
        // default-colored Text.
        assertEquals(Color(0xFFF8FAFC), tvForeground)
    }

    @Test
    fun muted_and_destructive_tokens_pin_their_spa_values() {
        // SPA --muted-foreground (215 20.2% 65.1%) and --destructive
        // (0 62.8% 30.6%) — web/src/styles/index.css .dark.
        assertEquals(Color(0xFF94A3B8), tvMuted)
        assertEquals(Color(0xFF7F1D1D), tvDestructive)
    }

    @Test
    fun pastel_map_pins_the_spa_dot_tokens() {
        // SPA .dot-* literals — web/src/styles/index.css; BrowseFlow's type
        // map reads the token home (no Color literal left in the map).
        assertEquals(Color(0xFFB7A6F4), dotSerial)
        assertEquals(Color(0xFFF6C3A4), dotTv)
        assertEquals(Color(0xFFA4E3C3), dotImage)
        assertEquals(Color(0xFFA4C8F4), dotAudio)
        assertEquals(Color(0xFFB7A6F4), typeAccent("serial"))
        assertEquals(Color(0xFFF6C3A4), typeAccent("tv"))
        assertEquals(Color(0xFFA4E3C3), typeAccent("image"))
        assertEquals(Color(0xFFA4C8F4), typeAccent("audio"))
        assertEquals(dotAudio, DEFAULT_TYPE_ACCENT)
        assertEquals(dotAudio, typeAccent("unknown-module"))
    }
}
