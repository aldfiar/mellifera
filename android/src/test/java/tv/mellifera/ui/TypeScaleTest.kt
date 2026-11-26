package tv.mellifera.ui

import androidx.compose.runtime.Applier
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Composition
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Recomposer
import androidx.compose.ui.unit.TextUnit
import org.junit.Assert.assertEquals
import org.junit.Test
import kotlin.coroutines.EmptyCoroutineContext

/**
 * The G16 scale law's JVM pin: the ruled F-1 table (design D1) cell by cell,
 * both geometry ladders, and a per-token canary proving every composable
 * getter resolves through [typeSize] under a stub-provided [LocalUiScale] —
 * a wrong token→getter swap at a sweep site fails a named test here, not on
 * the panel. If one of these moves, the on-device text size moves with it:
 * re-derive from the operator's rulings, and re-walk before shipping.
 */
class TypeScaleTest {

    private fun assertColumns(token: TypeToken, compact: Float, regular: Float, large: Float) {
        assertEquals("$token @ Компактный", compact, typeSize(UiScaleMode.COMPACT, token).value)
        assertEquals("$token @ Обычный", regular, typeSize(UiScaleMode.REGULAR, token).value)
        assertEquals("$token @ Крупный", large, typeSize(UiScaleMode.LARGE, token).value)
    }

    @Test
    fun meta_rides_the_ruled_columns() = assertColumns(TypeToken.META, 7.5f, 9f, 12f)

    @Test
    fun small_rides_the_ruled_columns() = assertColumns(TypeToken.SMALL, 8.75f, 10f, 14f)

    @Test
    fun body_rides_the_ruled_columns() = assertColumns(TypeToken.BODY, 10f, 12f, 16f)

    @Test
    fun heading_rides_the_ruled_columns() = assertColumns(TypeToken.HEADING, 11.25f, 14f, 18f)

    @Test
    fun readout_rides_the_ruled_columns() = assertColumns(TypeToken.READOUT, 12.5f, 12f, 16f)

    @Test
    fun display_rides_the_ruled_columns() = assertColumns(TypeToken.DISPLAY, 12.5f, 16f, 20f)

    @Test
    fun code_is_mode_independent() = assertColumns(TypeToken.CODE, 18f, 18f, 18f)

    @Test
    fun fallback_initial_rides_the_ruled_columns() =
        assertColumns(TypeToken.FALLBACK_INITIAL, 22.5f, 27f, 36f)

    @Test
    fun chip_height_rides_the_ruled_ladder() {
        assertEquals("chips @ Компактный", 30f, chipHeight(UiScaleMode.COMPACT).value)
        assertEquals("chips @ Обычный", 36f, chipHeight(UiScaleMode.REGULAR).value)
        assertEquals("chips @ Крупный", 48f, chipHeight(UiScaleMode.LARGE).value)
    }

    @Test
    fun rail_row_height_is_chip_height_times_four_thirds() {
        assertEquals("rail @ Компактный", 40f, railRowHeight(UiScaleMode.COMPACT).value)
        assertEquals("rail @ Обычный", 48f, railRowHeight(UiScaleMode.REGULAR).value)
        assertEquals("rail @ Крупный", 64f, railRowHeight(UiScaleMode.LARGE).value)
    }

    @Test
    fun local_ui_scale_defaults_to_regular() {
        assertEquals(UiScaleMode.REGULAR, composeHeadless { LocalUiScale.current })
    }

    /**
     * The canary: under a stub-provided [LocalUiScale] the getter must return
     * its OWN token's ruled cell — at both non-default modes, the pair on
     * which no two swept tokens collide (READOUT ≠ DISPLAY only at Крупный,
     * BODY ≠ READOUT only at Компактный). CODE is mode-independent — no
     * canary; its cell pin above already covers the constant.
     */
    private fun assertCanary(token: TypeToken, compact: Float, large: Float, getter: @Composable () -> TextUnit) {
        assertEquals(
            "$token @ Компактный",
            compact,
            composeHeadless {
                var value: TextUnit? = null
                CompositionLocalProvider(LocalUiScale provides UiScaleMode.COMPACT) { value = getter() }
                value ?: throw AssertionError("the getter never ran")
            }.value,
        )
        assertEquals(
            "$token @ Крупный",
            large,
            composeHeadless {
                var value: TextUnit? = null
                CompositionLocalProvider(LocalUiScale provides UiScaleMode.LARGE) { value = getter() }
                value ?: throw AssertionError("the getter never ran")
            }.value,
        )
    }

    @Test
    fun canary_typeMeta_resolves_through_the_local() =
        assertCanary(TypeToken.META, 7.5f, 12f) { typeMeta() }

    @Test
    fun canary_typeSmall_resolves_through_the_local() =
        assertCanary(TypeToken.SMALL, 8.75f, 14f) { typeSmall() }

    @Test
    fun canary_typeBody_resolves_through_the_local() =
        assertCanary(TypeToken.BODY, 10f, 16f) { typeBody() }

    @Test
    fun canary_typeHeading_resolves_through_the_local() =
        assertCanary(TypeToken.HEADING, 11.25f, 18f) { typeHeading() }

    @Test
    fun canary_typeReadout_resolves_through_the_local() =
        assertCanary(TypeToken.READOUT, 12.5f, 16f) { typeReadout() }

    @Test
    fun canary_typeDisplay_resolves_through_the_local() =
        assertCanary(TypeToken.DISPLAY, 12.5f, 20f) { typeDisplay() }

    @Test
    fun canary_typeFallbackInitial_resolves_through_the_local() =
        assertCanary(TypeToken.FALLBACK_INITIAL, 22.5f, 36f) { typeFallbackInitial() }

    /** No-op applier — the canaries read locals only, they build no node tree. */
    private class NullApplier : Applier<Unit> {
        override val current: Unit = Unit
        override fun down(node: Unit) {}
        override fun up() {}
        override fun insertTopDown(index: Int, instance: Unit) {}
        override fun insertBottomUp(index: Int, instance: Unit) {}
        override fun remove(index: Int, count: Int) {}
        override fun move(from: Int, to: Int, count: Int) {}
        override fun clear() {}
    }

    /**
     * One-shot composition on the JVM without the ui-test dependency: the
     * initial composition runs synchronously on the calling thread, which is
     * all a local read needs — no recomposition loop, no frame clock, no
     * dispose (Composition.dispose traces android.os.Trace, unmocked on the
     * JVM; nothing is attached here, so the objects are simply garbage).
     */
    private fun <T> composeHeadless(content: @Composable () -> T): T {
        val composition = Composition(NullApplier(), Recomposer(EmptyCoroutineContext))
        var result: T? = null
        composition.setContent { result = content() }
        return result ?: throw AssertionError("the composition body never ran")
    }
}
