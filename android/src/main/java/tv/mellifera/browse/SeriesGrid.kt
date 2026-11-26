package tv.mellifera.browse

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.longOrNull
import tv.mellifera.net.ItemDto
import tv.mellifera.net.SeriesDto

/**
 * The grid/list rendering model (5.6) — the FIELD-DRIVEN law lives here,
 * not in Compose: every optional server field maps to a nullable block
 * carrier, and a null renders NO block — never a placeholder, never a
 * fabricated value. The composables only null-check what this model says.
 *
 * display_name/artwork/watched are rendered verbatim from the served row.
 * display_name is always on the wire (itemDTO/seriesDTO law); the server's
 * "" placeholder (the SPA's em-dash case) carries no title block on TV.
 */
data class DisplayCard(
    val id: String,

    /** The composed name — null means "no title block". */
    val title: String?,

    /** The composed poster URL — null means "no artwork block". */
    val artworkUrl: String?,

    /** The read-time watched stamp — true renders the ✓ glyph + a dimmed
     * title and NO bar (the D2 tri-state); null/false means not watched. */
    val watched: Boolean?,

    /** The in-progress bar's fill percent — null means "no bar". Follows
     * [watchedPercent]: a percent exists only when a duration did. */
    val progress: Int?,

    /** The ONE field-driven meta/facts line — null means "no meta block". */
    val meta: String?,

    /** The served ★ score off the about block — the serial caption's
     * compact fact at lanes denser than the facts line fits
     * ([FACTS_LINE_MAX_COLUMNS]). Absent → null renders no fact, never a
     * placeholder. */
    val score: Double? = null,

    /** The tile's footer line (the photo tile's capture date, D6) — null
     * means "no footer block" (an absent fact renders no date, never a
     * faked one). */
    val footer: String? = null,

    /** The episode card's duration line (the document's ffprobe duration,
     * display-formatted) — null means "no duration line" (an absent or
     * unparseable duration renders absence, never a guessed value). The
     * episode grid is its only reader (F-3's episode anatomy). */
    val duration: String? = null,
)

/**
 * Tile GEOMETRY lives with the GRID, not the card (the operator's
 * 2026-11-16 uniform-row ruling, task 8.10): every card in a grid renders
 * the SAME fixed-aspect art block — the grid passes its tile aspect
 * (POSTER_ASPECT / STILL_ASPECT / PHOTO_TILE_ASPECT) down to [CardView], so
 * a row's heights and text baselines can never go ragged, and a card with
 * no artwork still occupies its art block (a placeholder surface, never a
 * shorter card). The per-card aspect carrier is retired. */


/**
 * watchedPercent — the SPA's bar law verbatim (WatchedStates.tsx): position
 * over duration, rounded, clamped to 100. A missing or non-positive duration
 * → null: the caller renders NO bar — never a guessed percent.
 */
fun watchedPercent(positionSeconds: Long, durationSeconds: Long?): Int? {
    if (durationSeconds == null || durationSeconds <= 0) return null
    return Math.round(positionSeconds.toDouble() / durationSeconds * 100).toInt().coerceAtMost(100)
}

/** A series grid card over the served seriesDTO row — geometry rides the
 * grid (the uniform-row law: the serial grid passes POSTER_ASPECT down). */
fun SeriesDto.toCard(): DisplayCard = DisplayCard(
    id = id,
    title = titleBlock(displayName),
    artworkUrl = artwork?.takeIf { it.isNotBlank() },
    watched = watched,
    // No position/duration on the served seriesDTO — the progress wire reads
    // items, not series; absent → null, never a guessed percent (L1).
    progress = null,
    // The hero's factsOf projection over the served about block — ONE
    // formatter, never a duplicate. Absent metadata/about (or a block with
    // no facts at all) → null: no meta block, never a padded line (L1).
    meta = metadata?.about?.let(::factsOf),
    // The served about.score — the caption's compact ★ fact; absent → null.
    score = metadata?.about?.score,
)

/**
 * An episode row over the served itemDTO row. [positionSeconds] is the
 * stored position off the progress wire (GET /progress/{id} — the exact
 * read the player's resume already makes); the bar exists only for an
 * UNwatched row that carries BOTH that position and a real document
 * duration — watched → NO bar (D2), missing either side → no bar, never a
 * guessed percent. The meta line is the document's field-driven fact line.
 * The title rides the served-title precedence ([episodeTitle]); the
 * duration line is the document duration, display-formatted, absent → no
 * line (the episode card's F-3 anatomy).
 */
fun ItemDto.toCard(positionSeconds: Long? = null): DisplayCard {
    val duration = documentDuration(document)
    return DisplayCard(
        id = id,
        title = episodeTitle(document, displayName),
        artworkUrl = artwork?.takeIf { it.isNotBlank() },
        watched = watched,
        progress =
            if (watched == true) {
                null
            } else {
                positionSeconds?.let { watchedPercent(it, duration) }
            },
        meta = documentMeta(document),
        duration = duration?.let(::formatPosition),
    )
}

/** A blank display name carries no title block — nothing is fabricated. */
private fun titleBlock(displayName: String): String? =
    displayName.takeIf { it.isNotBlank() }

/**
 * documentDuration — the item document's total whole-second duration (the
 * SPA's durationSeconds law verbatim, Collection.tsx): the verbatim ffprobe
 * blob's format.duration (a decimal-seconds STRING on the ffprobe wire; a
 * number is accepted too). Missing/unparseable/non-positive → null: the bar
 * then has no denominator and renders nothing, never a guessed percent.
 */
internal fun documentDuration(doc: JsonElement): Long? {
    val format =
        ((doc as? JsonObject)?.get("ffprobe") as? JsonObject)
            ?.get("format") as? JsonObject
            ?: return null
    val raw = format["duration"] as? JsonPrimitive ?: return null
    val seconds = raw.doubleOrNull ?: return null
    return if (seconds.isFinite() && seconds > 0) Math.round(seconds).toLong() else null
}

/**
 * episodeTitle — the served-title precedence (design D3's episode row): the
 * SERVED document's own title (the read-time `_view.title` accessor, the
 * same family [documentDuration] reads ffprobe through) when present, else
 * the composed name ([ItemDto.displayName] — the server's ItemName chain
 * verbatim, never re-derived client-side). A string value passes verbatim;
 * a number renders its literal bytes (the JS String(value) law, INV-
 * no-rounding); anything else — absent, null, object — floors to the
 * composed name, whose blank carries no title block (nothing fabricated).
 */
internal fun episodeTitle(doc: JsonElement, displayName: String): String? {
    val view = (doc as? JsonObject)?.get("_view") as? JsonObject
    val title = view?.get("title") as? JsonObject
    val served = (title?.get("value") as? JsonPrimitive)?.takeIf {
        it.isString || it.longOrNull != null || it.doubleOrNull != null
    }
    return served?.content ?: titleBlock(displayName)
}

/**
 * documentMeta — the ONE field-driven fact line (the SPA's metaLine law
 * verbatim, Collection.tsx): the parsed facts plus the ffprobe duration when
 * known, dot-separated. No fact at all → null: the row renders NO meta
 * block, never a padded one (L1).
 */
internal fun documentMeta(doc: JsonElement): String? {
    val facts = parsedFacts(doc)
    val duration = documentDuration(doc)
    if (duration != null) facts += formatPosition(duration)
    return facts.takeIf { it.isNotEmpty() }?.joinToString(" · ")
}

/**
 * parsedFacts — the SPA's parsedChips law: the release year and the
 * resolution read generically across the document's source namespaces — the
 * FIRST namespace that carries either wins, its partial facts kept (one
 * parser's facts are enough — never mixed across namespaces). The SxxExx
 * token is deliberately NOT here: the served display_name carries it.
 */
private fun parsedFacts(doc: JsonElement): MutableList<String> {
    for (namespace in sourceNamespaces(doc)) {
        val facts = mutableListOf<String>()
        (namespace["year"] as? JsonPrimitive)?.longOrNull?.let { facts += it.toString() }
        (namespace["resolution"] as? JsonPrimitive)
            ?.takeIf { it.isString && it.content.isNotEmpty() }
            ?.let { facts += it.content }
        if (facts.isNotEmpty()) return facts
    }
    return mutableListOf()
}

/**
 * formatPosition — the SPA's formatPosition law verbatim (Home.tsx): whole
 * seconds as H:MM:SS / MM:SS. Display formatting only — the served value is
 * rendered, never rewritten.
 */
internal fun formatPosition(seconds: Long): String {
    val s = seconds.coerceAtLeast(0)
    val h = s / 3600
    val m = (s % 3600) / 60
    val ss = (s % 60).toString().padStart(2, '0')
    return if (h > 0) {
        "$h:${m.toString().padStart(2, '0')}:$ss"
    } else {
        "${m.toString().padStart(2, '0')}:$ss"
    }
}
