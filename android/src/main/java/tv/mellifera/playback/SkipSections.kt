package tv.mellifera.playback

import androidx.compose.ui.graphics.Color
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull

/**
 * Skip-section classification (D7 — the SPA lib/skipSections.ts, TV-side over
 * the SAME served descriptor sections): a descriptor section classifies as a
 * skippable intro or credits range ONLY when it is a served chapter
 * (`kind === "chapter"`), both `start` and `end` are usable numbers, the end
 * is past the start, and the served lowercase title matches the small
 * intro/credits lexicon. Anything else — a marker section, an end-less
 * chapter, an unknown or absent title — classifies to nothing: the client
 * never fabricates a skip range (honest absence, L1). The lexicon is UI
 * vocabulary — presentation copy classifying what the chip says — never a
 * new wire field; the served shape is consumed exactly as internal/stream's
 * projectChapters projects it. Pure module — no Android, no flow; Compose
 * Color appears only as the packed tone constants (the FallbackGradient
 * pattern). Pinned in SkipSectionsTest.
 */

/** The two presentation classes a chapter can carry. */
enum class SkipKind(val label: String) {
    Intro("Пропустить вступление"),
    Credits("Пропустить титры"),
}

/** One classified range: the presentation kind plus the seconds range the
 * chip may appear in. */
data class SkipSection(
    val kind: SkipKind,
    val startSeconds: Double,
    val endSeconds: Double,
)

/**
 * One playback chip's pastel tone: the surface fill plus the dark text hue.
 * [border] is the 1dp hairline drawn around the surface on TV — the same
 * dark text hue as the edge color (the SPA chip's soft `shadow-lg` rendered
 * as a defined edge instead).
 */
data class SkipTone(
    val surface: Color,
    val text: Color,
) {
    val border: Color get() = text
}

/** Intro chip — SPA SkipChip.tsx CHIP_TONE intro `bg-sky-100/95
 * text-sky-900`: Tailwind sky-100 #E0F2FE and sky-900 #0C4A6E, the /95
 * opacity folded into the surface alpha (0.95 → 0xF2). */
private val SKIP_TONE_INTRO = SkipTone(
    surface = Color(0xF2E0F2FE),
    text = Color(0xFF0C4A6E),
)

/** Credits chip — SPA SkipChip.tsx CHIP_TONE credits `bg-violet-100/95
 * text-violet-900`: Tailwind violet-100 #EDE9FE and violet-900 #4C1D95,
 * the /95 opacity folded into the surface alpha (0.95 → 0xF2). */
private val SKIP_TONE_CREDITS = SkipTone(
    surface = Color(0xF2EDE9FE),
    text = Color(0xFF4C1D95),
)

/** «Следующая серия» card — SPA AutoNext.tsx:340 `bg-emerald-100/95
 * text-emerald-900` (the watch affordance's tone, rendered as the TV
 * card's surface): Tailwind emerald-100 #D1FAE5 and emerald-900 #064E3B,
 * the /95 opacity folded into the surface alpha (0.95 → 0xF2). */
val AUTO_NEXT_TONE = SkipTone(
    surface = Color(0xF2D1FAE5),
    text = Color(0xFF064E3B),
)

/**
 * The pure kind→pastel tone mapping: intro = sky pastel, credits = violet
 * pastel — SPA SkipChip.tsx CHIP_TONE verbatim. Pure; pinned in
 * SkipSectionsTest.
 */
fun skipToneOf(kind: SkipKind): SkipTone = when (kind) {
    SkipKind.Intro -> SKIP_TONE_INTRO
    SkipKind.Credits -> SKIP_TONE_CREDITS
}

/** How long the chip stays fully visible inside the range before it fades
 * (still rendered, just inert) — the SPA's SKIP_FADE_MS. */
const val SKIP_FADE_MS = 4_000L

/** The beat past the range's end the OK activation seeks to: clearing the
 * boundary keeps the (end-exclusive) range closed even if the player snaps
 * the playhead a frame short — the SPA's SKIP_SEEK_PAST_SECONDS. */
const val SKIP_SEEK_PAST_SECONDS = 0.5

/** The lexicons — exact matches on the served title, trimmed and lowercased
 * (Cyrillic muxer titles included). Substring matching is deliberately NOT
 * used: "ed" inside "Wedding" would fabricate a credits chip. */
private val INTRO_TITLES = setOf("intro", "опенинг", "opening")
private val CREDITS_TITLES = setOf("credits", "титры", "ending", "outro", "ed")

/** A seconds value out of the section JSON: a JSON number only — a string
 * "12.5" is not one (the numberField law, double precision — the wire
 * boundaries are round3 floats). */
private fun numberSeconds(value: JsonElement?): Double? {
    val primitive = value as? JsonPrimitive ?: return null
    if (primitive.isString) return null
    return primitive.doubleOrNull
}

/**
 * One served section → its classified range, or null when it does not
 * qualify (non-chapter kind, missing start/end, unknown or absent title,
 * degenerate range) — classifySkipSection's law verbatim.
 */
fun skipSectionOf(section: JsonElement): SkipSection? {
    val obj = section as? JsonObject ?: return null
    val kind = (obj["kind"] as? JsonPrimitive)?.takeIf { it.isString }?.content
    if (kind != "chapter") return null
    val start = numberSeconds(obj["start"]) ?: return null
    val end = numberSeconds(obj["end"]) ?: return null
    if (end <= start) return null
    val title = (obj["title"] as? JsonPrimitive)
        ?.takeIf { it.isString }
        ?.content
        ?.trim()
        ?.lowercase()
        ?: ""
    return when (title) {
        in INTRO_TITLES -> SkipSection(SkipKind.Intro, start, end)
        in CREDITS_TITLES -> SkipSection(SkipKind.Credits, start, end)
        else -> null
    }
}

/**
 * The descriptor's section list projected to its classified ranges, served
 * order preserved (the Go projection orders by start).
 */
fun skipSectionsOf(sections: List<JsonElement>): List<SkipSection> =
    sections.mapNotNull(::skipSectionOf)

/**
 * The classified range containing [positionSeconds], or null when the
 * playhead is outside every range — start INCLUSIVE, end EXCLUSIVE: the OK
 * activation seeks past the end, which must leave the range.
 */
fun skipSectionAt(sections: List<SkipSection>, positionSeconds: Double): SkipSection? =
    sections.firstOrNull { positionSeconds >= it.startSeconds && positionSeconds < it.endSeconds }
