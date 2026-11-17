package tv.mellifera.ui

import androidx.compose.ui.unit.dp

/**
 * The layout-parity constants (the same authoring law as [TypeScale]'s
 * sizes, task 14.1): every geometry value pinned here is the SPA source
 * px ÷ the box's density — the ÷2 law is walk-proven at density 2.0
 * (8.16: sp × 2 = SPA px; the cards' 181.5dp render the SPA's ~363px 1:1
 * twice on-device), so a value authored ÷2 renders its SPA px exactly.
 */

/** 96dp — the collections rail panel (design §D amends §B's width law:
 * the operator ruling — deliberately NOT the SPA `.side`'s 224px).
 * 96dp = 192px at density 2.0 — the chosen proportion (the SPA's 224px =
 * 11.7% of 1920, exactly the web sidebar's proportion, reads oversized
 * at 3 m; walk-amend-0.3.13 proved 112dp pixel-exact, so this is the
 * authoring law changing, not a defect fix — the 8.16 precedent).
 * The pixel math: LazyColumn 95dp=190px + 1dp edge → item slot
 * 79dp=158px; card chrome 22dp → text box 57dp=114px ≈ 16–19 one-line
 * chars at TYPE_META 12px; focused card 158×1.1 = 173.8px, right edge
 * 182.9 < 190px — fits the content column; the count slot
 * «Каталоги»+«10472» ≈ 82px ≤ 114px — 5 digits fit. REJECTED FOR CAUSE:
 * 80dp (the count slot sits AT the limit — 5-digit counts overflow Row2
 * — forces an anatomy change); mockup-proportional 38px
 * (mockup-tv.html:33 .rail — a collapsed ICON rail needing a
 * name-on-focus flyout, a new interaction surface, not a width knob). */
val RAIL_PANEL_WIDTH = 96.dp
