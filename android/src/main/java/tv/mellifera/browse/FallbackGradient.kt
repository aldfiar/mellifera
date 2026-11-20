package tv.mellifera.browse

import androidx.compose.ui.graphics.Color
import java.text.BreakIterator
import java.util.Locale
import kotlin.math.abs

/**
 * The SPA artwork-fallback law, ported verbatim from
 * web/src/components/Artwork.tsx (`fallbackGradient`): a title's name
 * deterministically picks two pastel hues and carries its first grapheme as
 * the initial — an absent poster renders THIS vector, never a blank
 * rectangle, and the same name renders the same card on the SPA and this
 * client (FallbackGradientTest's goldens were computed by the SPA function
 * itself).
 *
 * The hash is FNV-1a 32-bit over the UTF-16 code units — a Kotlin Char IS a
 * UTF-16 code unit, so the SPA's exact hash semantics port directly:
 * hue1 = h mod 360, hue2 = (hue1 + 40 + (h/360 mod 80))
 * mod 360. Both stops stay in the pastel bands hsl(hue1 68% 82%) /
 * hsl(hue2 62% 74%) so any name lands on a quiet card. The file is pure
 * law: no framework call — Compose Color appears only as the packed return
 * type, the ui/Colors.kt token pattern. The 140° gradient between the stops
 * is the FallbackArtwork composable's geometry, not this carrier's.
 */
data class FallbackGradient(
    val hue1: Int,
    val hue2: Int,
    val initial: String,
) {
    /** The gradient's first stop — the SPA's `hsl(hue1 68% 82%)`. */
    val from: Color get() = hslColor(hue1, FROM_SATURATION, FROM_LIGHTNESS)

    /** The gradient's second stop — the SPA's `hsl(hue2 62% 74%)`. */
    val to: Color get() = hslColor(hue2, TO_SATURATION, TO_LIGHTNESS)
}

// The pastel bands, Artwork.tsx: `hsl(${hue1} 68% 82%)` / `hsl(${hue2} 62% 74%)`.
private const val FROM_SATURATION = 0.68
private const val FROM_LIGHTNESS = 0.82
private const val TO_SATURATION = 0.62
private const val TO_LIGHTNESS = 0.74

/**
 * The name → vector law itself (Artwork.tsx `fallbackGradient` verbatim):
 * the FNV-1a hash picks the two hues, the first grapheme rides as the
 * initial. The name is hashed UNTRIMMED — only the initial trims.
 */
fun fallbackGradient(name: String): FallbackGradient {
    val h = fnv1a(name)
    val hue1 = (h % 360).toInt()
    val hue2 = (hue1 + 40 + (h / 360 % 80).toInt()) % 360
    return FallbackGradient(hue1, hue2, firstGrapheme(name))
}

/**
 * The pure HSL→sRGB conversion the stops read — CSS `hsl()`'s own
 * algorithm, quantized to the 8-bit grid CSS serializes to, so the ARGB is
 * byte-comparable with the SPA's rendering of the same `hsl(h s% l%)`
 * string. No framework call — the math IS the law, Color(int) only packs
 * the bytes (JVM-testable like the ui/Colors.kt tokens). Double math
 * throughout: the goldens are IEEE-754 doubles, and a float32 slip could
 * flip the last quantized bit against them. The hue wraps like CSS — -40
 * and 680 both land on 320.
 */
fun hslColor(hue: Int, saturation: Double, lightness: Double): Color {
    val h = ((hue % 360) + 360) % 360 / 60.0
    val c = (1 - abs(2 * lightness - 1)) * saturation
    val x = c * (1 - abs(h % 2 - 1))
    val m = lightness - c / 2
    val (r, g, b) = when (h.toInt()) {
        0 -> Triple(c, x, 0.0)
        1 -> Triple(x, c, 0.0)
        2 -> Triple(0.0, c, x)
        3 -> Triple(0.0, x, c)
        4 -> Triple(x, 0.0, c)
        else -> Triple(c, 0.0, x)
    }
    fun channel(v: Double): Int = Math.round((v + m) * 255.0).toInt().coerceIn(0, 255)
    return Color((0xFF shl 24) or (channel(r) shl 16) or (channel(g) shl 8) or channel(b))
}

// FNV-1a 32-bit (Artwork.tsx `fnv1a`): the Int multiply wraps exactly like
// Math.imul; the final `and 0xFFFFFFFFL` is the JS `>>> 0` — the unsigned
// value the hue mods read.
private fun fnv1a(name: String): Long {
    var h = 0x811C9DC5.toInt()
    for (unit in name) {
        h = (h xor unit.code) * 16777619
    }
    return h.toLong() and 0xFFFFFFFFL
}

// The SPA `firstGrapheme`: trim, then the first USER-PERCEIVED character —
// surrogate pairs and combining marks stay ONE character. The JVM
// character BreakIterator IS that law (UAX #29 extended grapheme clusters,
// Intl.Segmenter's granularity — and stronger than the SPA's Segmenter-less
// code-point fallback). The glyph rides through VERBATIM: Cyrillic is never
// transliterated or case-folded (the mockup's «С» stays «С»).
private fun firstGrapheme(name: String): String {
    val trimmed = name.trim()
    if (trimmed.isEmpty()) return ""
    val edges = BreakIterator.getCharacterInstance(Locale.ROOT)
    edges.setText(trimmed)
    return trimmed.substring(edges.first(), edges.next())
}
