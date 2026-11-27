package tv.mellifera.ui

import androidx.compose.ui.unit.sp

/**
 * The type scale (task 8.16, the operator's 2026-11-17 density ruling:
 * «currently too large rows and text»): every text size in the app reads one
 * of these constants — never a raw sp literal. The box renders at density
 * 320 (2.0×), so a value authored 1:1 from the SPA's CSS px renders DOUBLE
 * the SPA proportion on the same 1080p panel; the correct authoring is
 * SPA px ÷ density = SPA px ÷ 2 (the same law the geometry already follows —
 * the cards' 181.5dp render the SPA's ~363px 1:1). These constants are the
 * SPA Tailwind scale halved; at density 2.0 each renders its SPA px exactly:
 *
 *   sp × 2 = SPA px — TYPE_META 6→12 (text-xs), SMALL 7→14 (text-sm),
 *   BODY 8→16 (text-base), HEADING 9→18 (text-lg), READOUT 10→20 (text-xl),
 *   DISPLAY 14→28, CODE 24→48.
 *
 * The D11 type floors (large text on small tiles) are RETIRED by the same
 * ruling — the SPA's own sizes ARE the floors; a single-target app rescales
 * by re-deriving these, not by per-device branching (the design's «576dp at
 * density 320» precedent). sp keeps honoring the system font scale.
 */

/** 14sp — the hero's and the library body's title (SPA 28px). */
val TYPE_DISPLAY = 14.sp

/** 10sp — the player's position/duration readout (SPA 20px, text-xl). */
val TYPE_READOUT = 10.sp

/** 9sp — section labels, episode titles, info headings
 * (SPA 18px, text-lg). */
val TYPE_HEADING = 9.sp

/** 8sp — card titles and default body text (SPA 16px, text-base). */
val TYPE_BODY = 8.sp

/** 7sp — chip labels, hints, descriptions, the skip label
 * (SPA 14px, text-sm). */
val TYPE_SMALL = 7.sp

/** 6sp — meta lines, counts, facts, eyebrows, the ✓ mark, footers
 * (SPA 12px, text-xs). */
val TYPE_META = 6.sp

/** 24sp — the pairing code (SPA 48px). */
val TYPE_CODE = 24.sp
