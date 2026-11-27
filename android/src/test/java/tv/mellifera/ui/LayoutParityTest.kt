package tv.mellifera.ui

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The layout-parity law's JVM pin (14.1, the same shape as TypeScaleTest):
 * the geometry values ARE the SPA sources ÷ the box's density, so that
 * at the box's 2.0× density every value renders its SPA px exactly. If one
 * of these moves, the on-device proportions move with it: re-derive from
 * the SPA sources, and re-walk (6.1) before shipping.
 */
class LayoutParityTest {
    @Test
    fun the_rail_panel_is_the_chosen_192px_proportion_at_compact_and_regular() {
        // 96dp = the chosen 192px ÷ 2 (NOT the SPA .side's 224px — design §D
        // operator ruling); identical at Компактный/Обычный.
        assertEquals(96f, railPanelWidth(UiScaleMode.COMPACT).value, 1e-6f)
        assertEquals(96f, railPanelWidth(UiScaleMode.REGULAR).value, 1e-6f)
    }

    @Test
    fun the_rail_panel_widens_to_112dp_at_large() {
        // The Крупный leg serves the 8-char name floor with the mode's
        // larger type (the ruled default; the on-device walk confirms).
        assertEquals(112f, railPanelWidth(UiScaleMode.LARGE).value, 1e-6f)
    }

    @Test
    fun the_rail_panel_renders_the_spa_px_at_density_2() {
        // density = 320dpi / 160 = 2.0 — dp × 2 = the on-panel px.
        assertEquals(192, (railPanelWidth(UiScaleMode.REGULAR).value * 2).toInt())
        assertEquals(224, (railPanelWidth(UiScaleMode.LARGE).value * 2).toInt())
    }
}
