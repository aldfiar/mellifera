package tv.mellifera.ui

import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * The in-app UI scale (G16, design D1/F-4). The columns are the operator's
 * RULED values, not a multiplier: «×2» (SPA px authored 1:1) was ruled too
 * large on the panel (2026-11-17) and «×1» too small (2026-11-25), so each
 * token's column was ruled individually and deviates from pure
 * multiplication (READOUT Обычный = 24 panel px, not 30) — the table is the
 * acceptance floor, TypeScaleTest pins every cell. An in-app setting rather
 * than the system font scale because system scale grows sp without the dp
 * geometry (captions would overflow).
 */

/** The three scale settings; [label] is the settings string. */
enum class UiScaleMode(val label: String) {
    COMPACT("Компактный"),
    REGULAR("Обычный"),
    LARGE("Крупный"),
}

/** The type-scale slots; the slot → call-site mapping is design D1's used-by law. */
enum class TypeToken {
    META, SMALL, BODY, HEADING, READOUT, DISPLAY, CODE, FALLBACK_INITIAL
}

// The ruled F-1 columns in sp (sp = panel px ÷ 2 — the box renders at 2.0×
// density), [COMPACT, REGULAR, LARGE] per row. CODE's constant row is the
// operator's ruling too (mode-independent 36px).
private val TYPE_TABLE: Map<TypeToken, FloatArray> = mapOf(
    TypeToken.META to floatArrayOf(7.5f, 9f, 12f),
    TypeToken.SMALL to floatArrayOf(8.75f, 10f, 14f),
    TypeToken.BODY to floatArrayOf(10f, 12f, 16f),
    TypeToken.HEADING to floatArrayOf(11.25f, 14f, 18f),
    TypeToken.READOUT to floatArrayOf(12.5f, 12f, 16f),
    TypeToken.DISPLAY to floatArrayOf(12.5f, 16f, 20f),
    TypeToken.CODE to floatArrayOf(18f, 18f, 18f),
    TypeToken.FALLBACK_INITIAL to floatArrayOf(22.5f, 27f, 36f),
)

/** The ruled type size for [token] at [mode]. */
fun typeSize(mode: UiScaleMode, token: TypeToken): TextUnit =
    TYPE_TABLE.getValue(token)[mode.ordinal].sp

// F-4's ruled chips lane heights in dp: [COMPACT, REGULAR, LARGE].
private val CHIP_HEIGHTS = floatArrayOf(30f, 36f, 48f)

/** The chips lane height at [mode] (F-4 ruled). */
fun chipHeight(mode: UiScaleMode): Dp = CHIP_HEIGHTS[mode.ordinal].dp

/** The rail row height at [mode] — chipHeight × 4/3 (the §3.2 ruled anchor
 * 48dp at Обычный derives the tier; 40/48/64dp). */
fun railRowHeight(mode: UiScaleMode): Dp = chipHeight(mode) * 4f / 3f

/** The composition-wide scale; default REGULAR (the settings screen provides
 * the persisted mode). */
val LocalUiScale: ProvidableCompositionLocal<UiScaleMode> =
    staticCompositionLocalOf { UiScaleMode.REGULAR }

/** The persisted grid-column overrides; null = «Авто» (the planner decides). */
data class GridPrefs(val posterColumns: Int?, val episodeColumns: Int?)

/** The composition-wide grid overrides; defaults to «Авто» for both lanes.
 * Declared beside [LocalUiScale] — one home — so the planner, SessionStore
 * and settings screen compile against it. */
val LocalGridPrefs: ProvidableCompositionLocal<GridPrefs> =
    staticCompositionLocalOf { GridPrefs(null, null) }
