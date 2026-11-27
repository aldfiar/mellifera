package tv.mellifera.ui

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * The layout-parity constants (the same authoring law as [TypeScale]'s
 * sizes, task 14.1): every geometry value pinned here is the SPA source
 * px ÷ the box's density — the ÷2 law is walk-proven at density 2.0
 * (8.16: sp × 2 = SPA px; the cards' 181.5dp render the SPA's ~363px 1:1
 * twice on-device), so a value authored ÷2 renders its SPA px exactly.
 */

/**
 * railPanelWidth — the collections rail panel's width at [mode]:
 * 96dp at Компактный/Обычный, 112dp at Крупный (the Крупный leg serves the
 * 8-char name floor with the mode's larger type).
 *
 * 96dp = 192px at density 2.0 — the chosen proportion (the SPA `.side`'s
 * 224px = 11.7% of 1920, exactly the web sidebar's proportion, reads
 * oversized at 3 m; the design §D operator ruling, deliberately NOT the
 * SPA value; walk-amend-0.3.13 proved 112dp pixel-exact for the predecessor
 * walk, so this is the authoring law, not a defect fix — the 8.16
 * precedent). The pixel math at 96dp: LazyColumn 95dp=190px + 1dp edge →
 * item slot 79dp=158px; card chrome 22dp → text box 57dp=114px ≈ 16–19
 * one-line chars at TYPE_META 12px; focused card 158×1.1 = 173.8px, right
 * edge 182.9 < 190px — fits the content column; the count slot
 * «Каталоги»+«10472» ≈ 82px ≤ 114px — 5 digits fit. REJECTED FOR CAUSE:
 * 80dp (the count slot sits AT the limit — 5-digit counts overflow Row2
 * — forces an anatomy change); mockup-proportional 38px
 * (mockup-tv.html:33 .rail — a collapsed ICON rail needing a
 * name-on-focus flyout, a new interaction surface, not a width knob).
 */
fun railPanelWidth(mode: UiScaleMode): Dp = when (mode) {
    UiScaleMode.LARGE -> 112.dp
    UiScaleMode.COMPACT, UiScaleMode.REGULAR -> 96.dp
}
