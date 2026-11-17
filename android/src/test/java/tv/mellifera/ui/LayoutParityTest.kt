package tv.mellifera.ui

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The layout-parity law's JVM pin (14.1, the same shape as TypeScaleTest):
 * the geometry constants ARE the SPA sources ÷ the box's density, so that
 * at the box's 2.0× density every value renders its SPA px exactly. If one
 * of these moves, the on-device proportions move with it: re-derive from
 * the SPA sources, and re-walk (6.1) before shipping.
 */
class LayoutParityTest {
    @Test
    fun the_rail_panel_is_the_spa_sidebar_divided_by_the_box_density() {
        assertEquals(112f, RAIL_PANEL_WIDTH.value) // SPA .side 224px ÷ 2
    }

    @Test
    fun the_rail_panel_renders_the_spa_px_at_density_2() {
        // density = 320dpi / 160 = 2.0 — dp × 2 = the on-panel px.
        assertEquals(224, (RAIL_PANEL_WIDTH.value * 2).toInt())
    }
}
