package tv.mellifera.ui

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The 8.16 type-scale law's JVM pin (the operator's 2026-11-17 density
 * ruling): the constants ARE the SPA Tailwind scale halved, so that at the
 * box's 2.0× density every text renders its SPA px exactly. The floors die
 * with the D11 amendment — the SPA's own sizes are the floors. If one of
 * these moves, the on-device text size moves with it: re-derive from the SPA
 * sources, and re-walk (6.1) before shipping.
 */
class TypeScaleTest {
    @Test
    fun the_scale_is_the_spa_px_divided_by_the_box_density() {
        assertEquals(10f, TYPE_DISPLAY.value) // SPA 20px, text-xl: hero / library title
        assertEquals(10f, TYPE_READOUT.value) // SPA 20px: seek readout
        assertEquals(9f, TYPE_HEADING.value)  // SPA 18px: labels, rows, headings
        assertEquals(8f, TYPE_BODY.value)     // SPA 16px: body
        assertEquals(7f, TYPE_SMALL.value)    // SPA 14px: chips, hints
        assertEquals(6f, TYPE_META.value)     // SPA 12px: meta, counts, ✓
        assertEquals(18f, TYPE_CODE.value)    // SPA 36px: pairing code
        assertEquals(18f, TYPE_FALLBACK_INITIAL.value) // SPA 36px: fallback initial
    }

    @Test
    fun the_scale_renders_the_spa_px_at_density_2() {
        // density = 320dpi / 160 = 2.0 — sp × 2 = the on-panel px.
        assertEquals(20, (TYPE_DISPLAY.value * 2).toInt())
        assertEquals(12, (TYPE_META.value * 2).toInt())
    }
}
