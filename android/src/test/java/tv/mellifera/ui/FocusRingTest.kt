package tv.mellifera.ui

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The focus-ring width law's JVM pin — the SPA html.tv :focus-visible
 * outline-width law (web/src/styles/index.css html.tv block): outline width
 * clamp(calc(2px / dpr), 0.2vw, calc(5px / dpr)), arithmetic pinned as
 * 0.2vw = viewportWidthPx * 0.002 with the ÷dpr bounds floored to whole
 * device px and inclusive clamp semantics. The golden IS the SPA's own
 * computation at the box's geometry (dpr 2.0, 1920px wide). If one of these
 * moves, the on-panel ring width moves with it: re-derive from the SPA
 * sources before shipping.
 */
class FocusRingTest {
    @Test
    fun golden_dpr2_at_1920_is_the_spa_computed_width() {
        // Bounds floor(2/2)=1 .. floor(5/2)=2; the 0.2vw preference 3.84
        // rides past the 2px cap — the SPA computes a 2px outline there.
        assertEquals(2f, tvFocusRingWidth(2f, 1920f))
    }

    @Test
    fun the_mid_band_is_the_unclamped_0_2vw_preference() {
        // dpr 1.0: bounds 2 .. 5 — 1920px * 0.002 = 3.84 sits between.
        assertEquals(3.84f, tvFocusRingWidth(1f, 1920f), 1e-4f)
        // 2000px * 0.002 = 4.0 — still mid-band.
        assertEquals(4f, tvFocusRingWidth(1f, 2000f), 1e-4f)
    }

    @Test
    fun the_low_bound_clamps_and_is_inclusive() {
        // 500px * 0.002 = 1.0 < 2 — floored at the 2px/dpr low bound.
        assertEquals(2f, tvFocusRingWidth(1f, 500f))
        // 1000px * 0.002 = 2.0 — the preference rides AT the bound, stays 2.
        assertEquals(2f, tvFocusRingWidth(1f, 1000f))
        // dpr 2.0 @ 400px: preference 0.8 < the floored low bound 1.
        assertEquals(1f, tvFocusRingWidth(2f, 400f))
    }

    @Test
    fun the_high_bound_clamps_and_is_inclusive() {
        // 3000px * 0.002 = 6.0 > 5 — capped at the 5px/dpr high bound.
        assertEquals(5f, tvFocusRingWidth(1f, 3000f))
        // 2500px * 0.002 = 5.0 — the preference rides AT the bound, stays 5.
        assertEquals(5f, tvFocusRingWidth(1f, 2500f))
    }

    @Test
    fun the_dpr_bounds_floor_to_whole_device_px() {
        // dpr 1.5: bounds floor(1.33)=1 .. floor(3.33)=3 — 1920px caps at 3.
        assertEquals(3f, tvFocusRingWidth(1.5f, 1920f))
        // dpr 3.0: bounds floor(0.67)=0 .. floor(1.67)=1 — 1920px caps at 1.
        assertEquals(1f, tvFocusRingWidth(3f, 1920f))
    }
}
