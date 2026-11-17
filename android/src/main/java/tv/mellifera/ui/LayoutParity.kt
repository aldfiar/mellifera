package tv.mellifera.ui

import androidx.compose.ui.unit.dp

/**
 * The layout-parity constants (the same authoring law as [TypeScale]'s
 * sizes, task 14.1): every geometry value pinned here is the SPA source
 * px ÷ the box's density — the ÷2 law is walk-proven at density 2.0
 * (8.16: sp × 2 = SPA px; the cards' 181.5dp render the SPA's ~363px 1:1
 * twice on-device), so a value authored ÷2 renders its SPA px exactly.
 */

/** 112dp — the collections rail panel (the SPA `.side`'s 224px ÷ 2 —
 * renders exactly 224px at density 2.0). The prior 360dp predates the
 * law and rendered 720px = 3.2× the SPA proportion; design's 8.2/D13
 * «the rail keeps 360dp» prose is superseded by this law. */
val RAIL_PANEL_WIDTH = 112.dp
