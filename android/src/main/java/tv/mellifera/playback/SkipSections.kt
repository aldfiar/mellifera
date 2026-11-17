package tv.mellifera.playback

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
 * projectChapters projects it. Pure module — no Android, no flow; pinned in
 * SkipSectionsTest.
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
