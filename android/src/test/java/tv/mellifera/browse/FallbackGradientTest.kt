package tv.mellifera.browse

import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The fallback-gradient law's JVM pin. Every golden below was
 * computed by the SPA's own `fallbackGradient` (web/src/components/
 * Artwork.tsx, Intl.Segmenter included) and cross-checked against an
 * independent FNV-1a over the UTF-16 bytes — the Kotlin law must reproduce
 * these numbers exactly, or the same title renders a different card on the
 * SPA and this client.
 */
class FallbackGradientTest {

    @Test
    fun the_same_name_always_yields_the_same_vector() {
        for (name in listOf("Breaking Bad", "", "  JoJo  ", "Слово", "𠀋")) {
            assertEquals(fallbackGradient(name), fallbackGradient(name))
        }
    }

    @Test
    fun golden_names_pin_the_spa_hue_pairs() {
        // hue1 = h mod 360, hue2 = (hue1 + 40 + (h/360 mod 80)) mod 360 —
        // h the unsigned FNV-1a over the UNTRIMMED name (only the initial
        // trims).
        assertEquals(FallbackGradient(307, 21, "B"), fallbackGradient("Breaking Bad"))
        assertEquals(FallbackGradient(77, 148, "D"), fallbackGradient("Dark"))
        assertEquals(FallbackGradient(61, 106, ""), fallbackGradient(""))
        assertEquals(FallbackGradient(297, 346, "J"), fallbackGradient("  JoJo  "))
        assertEquals(FallbackGradient(181, 299, "С"), fallbackGradient("Слово"))
    }

    @Test
    fun the_initial_is_the_first_grapheme_not_the_first_code_unit() {
        // U+2000B rides TWO UTF-16 code units but is ONE character — the
        // initial is the code point, never a lone surrogate.
        assertEquals(FallbackGradient(308, 9, "𠀋"), fallbackGradient("𠀋"))
        // e + combining acute (U+0301) stays ONE character — the initial is
        // the clustered "é", never the bare "e".
        assertEquals(FallbackGradient(80, 158, "é"), fallbackGradient("éclair"))
        // A blank name still hashes (untrimmed) and carries no initial.
        assertEquals(FallbackGradient(183, 243, ""), fallbackGradient("   "))
    }

    @Test
    fun the_pastel_stops_pin_the_spa_hsl_strings_as_rendered() {
        // The browser's quantized rendering of `hsl(307 68% 82%)` etc. —
        // byte-comparable ARGB against the SPA pixels.
        assertEquals(Color(0xFFF0B2E9), fallbackGradient("Breaking Bad").from)
        assertEquals(Color(0xFFE6B094), fallbackGradient("Breaking Bad").to)
        assertEquals(Color(0xFFDFF0B2), fallbackGradient("Dark").from)
        assertEquals(Color(0xFF94E6BA), fallbackGradient("Dark").to)
        assertEquals(Color(0xFFEFF0B2), fallbackGradient("").from)
        assertEquals(Color(0xFFA7E694), fallbackGradient("").to)
    }

    @Test
    fun hsl_color_quantizes_like_css_and_wraps_the_hue() {
        assertEquals(Color(0xFFF0B2B2), hslColor(0, 0.68, 0.82))
        assertEquals(Color(0xFFB2D1F0), hslColor(210, 0.68, 0.82))
        assertEquals(Color(0xFFF0B2B3), hslColor(359, 0.68, 0.82))
        // The hue wraps like CSS hsl(): -40 ≡ 680 ≡ 320.
        assertEquals(hslColor(320, 0.68, 0.82), hslColor(-40, 0.68, 0.82))
        assertEquals(hslColor(320, 0.68, 0.82), hslColor(680, 0.68, 0.82))
    }
}
