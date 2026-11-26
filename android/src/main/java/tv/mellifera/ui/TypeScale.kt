package tv.mellifera.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp

/**
 * The type scale (G16). The old derivation — SPA Tailwind px authored 1:1
 * (×2 at the box's 2.0× density) — was ruled too large on the panel
 * (2026-11-17), and the ×1 sp literal was ruled too small (2026-11-25). The
 * operator therefore ruled the F-1 table per mode column ([typeSize], the
 * acceptance floor), and ÷2 stays the px→sp law: a column's sp value renders
 * its panel px at the box's 2.0× density. Call sites read the composable
 * getters below — never a raw sp literal. The TYPE_* constants are the
 * table's base column kept public only so the not-yet-swept call sites
 * compile; the 16.3 sweep privatizes them.
 */

/** Facts, durations, counts, eyebrows, hints, the ✓ mark, status lines
 * (META slot). */
@Composable
fun typeMeta(): TextUnit = typeSize(LocalUiScale.current, TypeToken.META)

/** Card titles, chip labels, synopses (SMALL slot). */
@Composable
fun typeSmall(): TextUnit = typeSize(LocalUiScale.current, TypeToken.SMALL)

/** Messages, empty and error lines (BODY slot). */
@Composable
fun typeBody(): TextUnit = typeSize(LocalUiScale.current, TypeToken.BODY)

/** «Продолжить», «Следующая серия», info headings (HEADING slot). */
@Composable
fun typeHeading(): TextUnit = typeSize(LocalUiScale.current, TypeToken.HEADING)

/** The player's position/duration clock (READOUT slot). */
@Composable
fun typeReadout(): TextUnit = typeSize(LocalUiScale.current, TypeToken.READOUT)

/** Page and hero titles (DISPLAY slot). */
@Composable
fun typeDisplay(): TextUnit = typeSize(LocalUiScale.current, TypeToken.DISPLAY)

/** The pairing code (CODE slot — mode-independent 36px). */
@Composable
fun typeCode(): TextUnit = typeSize(LocalUiScale.current, TypeToken.CODE)

/** The missing-artwork fallback's initial glyph (FALLBACK_INITIAL slot). */
@Composable
fun typeFallbackInitial(): TextUnit =
    typeSize(LocalUiScale.current, TypeToken.FALLBACK_INITIAL)

/** 10sp — the pre-scale base of the DISPLAY slot (kept public until the
 * 16.3 sweep; new call sites read [typeDisplay]). */
val TYPE_DISPLAY = 10.sp

/** 10sp — the pre-scale base of the READOUT slot (kept public until the
 * 16.3 sweep; new call sites read [typeReadout]). */
val TYPE_READOUT = 10.sp

/** 9sp — the pre-scale base of the HEADING slot (kept public until the
 * 16.3 sweep; new call sites read [typeHeading]). */
val TYPE_HEADING = 9.sp

/** 8sp — the pre-scale base of the BODY slot (kept public until the
 * 16.3 sweep; new call sites read [typeBody]). */
val TYPE_BODY = 8.sp

/** 7sp — the pre-scale base of the SMALL slot (kept public until the
 * 16.3 sweep; new call sites read [typeSmall]). */
val TYPE_SMALL = 7.sp

/** 6sp — the pre-scale base of the META slot (kept public until the
 * 16.3 sweep; new call sites read [typeMeta]). */
val TYPE_META = 6.sp

/** 18sp — the pre-scale base of the CODE slot (kept public until the
 * 16.3 sweep; new call sites read [typeCode]). */
val TYPE_CODE = 18.sp

/** 18sp — the pre-scale base of the FALLBACK_INITIAL slot (kept public
 * until the 16.3 sweep; new call sites read [typeFallbackInitial]). */
val TYPE_FALLBACK_INITIAL = 18.sp
