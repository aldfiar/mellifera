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
 * are the web canvas — the SPA dark token `--background: hsl(230.8 28.9%
 * 8.8%)` ≈ #10121d (the mockup family's lifted-ink base) — not
 * darkColorScheme()'s ≈ #1C1B1F default.
 */
class AppThemeTest {
    @Test
    fun scheme_pins_web_canvas_background_and_surface() {
        val canvas = Color(0xFF10121D)
        assertEquals(canvas, MelliferaDarkScheme.background)
        assertEquals(canvas, MelliferaDarkScheme.surface)
    }

    @Test
    fun app_canvas_is_the_spa_dark_token() {
        // hsl(230.8 28.9% 8.8%) → #10121d (web/src/styles/index.css .dark).
        assertEquals(Color(0xFF10121D), AppCanvas)
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
            "onBackground must stay readable on the dark ink canvas",
            onBackground.luminance() > 0.5f,
        )
    }

    @Test
    fun root_text_token_is_the_spa_foreground() {
        // SPA --foreground (230 31.6% 92.5% = #e6e8f2) —
        // web/src/styles/index.css .dark; App's root LocalContentColor
        // provider hands this to every default-colored Text.
        assertEquals(Color(0xFFE6E8F2), tvForeground)
    }

    @Test
    fun muted_and_destructive_tokens_pin_their_spa_values() {
        // SPA --muted-foreground (222.2 15.1% 64.9% = #98a0b3) and
        // --destructive (0 62.8% 30.6%) — web/src/styles/index.css .dark.
        assertEquals(Color(0xFF98A0B3), tvMuted)
        assertEquals(Color(0xFF7F1D1D), tvDestructive)
    }

    @Test
    fun pastel_map_pins_the_spa_dot_tokens() {
        // SPA .dot-* literals — web/src/styles/index.css; both clients
        // carry the mockup :root pastels (.tmp/mockup-tv.html). BrowseFlow's
        // type map reads the token home (no Color literal left in the map).
        assertEquals(Color(0xFFD8CEF2), dotSerial)
        assertEquals(Color(0xFFF6D3B8), dotTv)
        assertEquals(Color(0xFFCDEBD7), dotImage)
        assertEquals(Color(0xFFCFE4F6), dotAudio)
        assertEquals(Color(0xFFD8CEF2), typeAccent("serial"))
        assertEquals(Color(0xFFF6D3B8), typeAccent("tv"))
        assertEquals(Color(0xFFCDEBD7), typeAccent("image"))
        assertEquals(Color(0xFFCFE4F6), typeAccent("audio"))
        assertEquals(dotAudio, DEFAULT_TYPE_ACCENT)
        assertEquals(dotAudio, typeAccent("unknown-module"))
    }
}
