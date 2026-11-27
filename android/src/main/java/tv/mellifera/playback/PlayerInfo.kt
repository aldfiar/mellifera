package tv.mellifera.playback

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import tv.mellifera.browse.ArtworkRequest
import tv.mellifera.browse.plainText
import tv.mellifera.browse.resolveArtworkUrl
import tv.mellifera.net.ItemDto
import tv.mellifera.net.MetadataAbout
import tv.mellifera.net.MetadataCastEntry
import tv.mellifera.net.MelliferaApi
import tv.mellifera.net.SeriesDto

/**
 * The Active overlay's OK-revealed info blocks (design D7 — the SPA's
 * InfoColumn.tsx IA, TV-rendered): heading (the SxxEyy eyebrow + episode
 * title; a film floors to its SERVED display name), «Серия» (the served
 * episode description), «В ролях» (the served cast, entries verbatim),
 * About (the served about block's description — the series row matched by
 * the parsed path anchor, else the item's own block). The FIELD-DRIVEN law
 * lives here: every block is a nullable carrier — a null renders NO block,
 * never a placeholder, never a fabricated value (L1); nothing to say →
 * [playerInfo] answers null and the overlay renders no blocks at all.
 */
data class PlayerInfoBlocks(
    /** "S01E02" out of the parsed facts — null for a film (no parseable
     * numbers) or a title-less episode row (the SPA's eyebrow law). */
    val eyebrow: String?,
    /** The served episode title, else — for a film only — the served
     * display name; null means no heading. */
    val heading: String?,
    /** The served episode description — the «Серия» block. */
    val episodeDescription: String?,
    /** The served cast entries; empty = the block is absent. */
    val cast: List<MetadataCastEntry>,
    /** The About description (BBCode stripped, Synopsis.tsx's panelOf law);
     * null = the block is absent. */
    val about: String?,
)

/**
 * The mapper over the SERVED projection only (no client derivation): the
 * same reads the SPA InfoColumn makes on the item + matched series rows.
 */
fun playerInfo(item: ItemDto, series: SeriesDto?): PlayerInfoBlocks? {
    val facts = episodeFactsOf(item)
    val eyebrow = facts?.let {
        "S" + it.season.toString().padStart(2, '0') + "E" + it.episode.toString().padStart(2, '0')
    }
    // SPA InfoColumn: the served title; with no parseable facts (a film) the
    // SERVED display name heads the column — never a fabricated heading.
    val heading = presentText(item.metadata?.episode?.title)
        ?: (if (facts == null) presentText(item.displayName) else null)
    val description = presentText(item.metadata?.episode?.description)
    val cast = item.metadata?.cast.orEmpty()
    // SPA InfoColumn's About source law verbatim: the matched series row's
    // block when a row matched, else the item's own — an unmatched anchor
    // does NOT fall through to the item's block (the expression's shape).
    val about = when {
        series != null -> series.metadata?.about
        else -> item.metadata?.about
    }?.let(::aboutText)

    if (eyebrow == null && heading == null && description == null && cast.isEmpty() && about == null) {
        return null
    }
    return PlayerInfoBlocks(eyebrow, heading, description, cast, about)
}

/**
 * The controls' top title bar label, over the SAME served projection the
 * info column reads: the SxxEyy eyebrow and the served heading joined « · »
 * — a film carries no eyebrow, so it floors to its served display name
 * alone. Field-driven (L1): no blocks at all, or nothing to show on them →
 * null, and the overlay renders NO bar — never a placeholder.
 */
internal fun controlsTitle(info: PlayerInfoBlocks?): String? =
    info?.let {
        listOfNotNull(it.eyebrow, it.heading)
            .joinToString(" · ")
            .takeIf { label -> label.isNotEmpty() }
    }

/** A non-empty served string, else null — "" is absence (InfoColumn's presentText). */
private fun presentText(value: String?): String? = value?.takeIf { it.isNotEmpty() }

/**
 * The about block's description is the carrier (Synopsis.tsx's panelOf): the
 * BBCode wrapper strips ([browse.plainText]) and an empty remainder is no
 * block — never an empty frame.
 */
private fun aboutText(about: MetadataAbout): String? =
    plainText(about.description).trim().takeIf { it.isNotEmpty() }

/**
 * The episode's series fact anchor: parsed.series_relative_path — null when
 * the document carries none (InfoColumn.tsx's seriesAnchorOf); the About
 * source floors to the item's own block and a series row is never guessed.
 * The parsed (season, episode) facts ride [episodeFactsOf] (NextUp.kt — the
 * ONE parsing law shared with the ended-edge pick).
 */
fun seriesAnchorOf(item: ItemDto): String? {
    val parsed = (item.document as? JsonObject)?.get("parsed") as? JsonObject ?: return null
    val path = parsed["series_relative_path"] as? JsonPrimitive ?: return null
    return path.takeIf { it.isString && it.content.isNotEmpty() }?.content
}

/**
 * One «В ролях» row (12.4, the SPA CastRow — the audit P3-2 per-entry law):
 * the served entry verbatim — the name, its optional role, and the portrait
 * fetch when the served photo_url resolves. Field-driven: a null portrait
 * is a plain row — never a fabricated tile (L1; the SPA's initial-grapheme
 * avatar fallback stays web-only).
 */
data class CastRow(
    val portrait: ArtworkRequest?,
    val name: String,
    val role: String?,
)

/**
 * The per-entry mapping: the portrait rides the resolveArtworkUrl law — a
 * served absolute URL passes through anonymously (both plugins compose
 * photo_url absolute), a relative path with no server base cannot load and
 * resolves to null (a plain row, nothing fabricated).
 */
fun MetadataCastEntry.toCastRow(): CastRow = CastRow(
    portrait = resolveArtworkUrl(serverBase = null, wireField = photoUrl),
    name = name,
    role = presentText(role),
)

/**
 * m:ss / h:mm:ss clock (the SPA's formatTime law — the readout and the
 * seek bar's both sides ride it).
 */
internal fun formatClock(positionMs: Long): String {
    val total = positionMs / 1000
    val h = total / 3600
    val m = (total % 3600) / 60
    val s = total % 60
    val mm = if (h > 0) m.toString().padStart(2, '0') else m.toString()
    val ss = s.toString().padStart(2, '0')
    return if (h > 0) "$h:$mm:$ss" else "$m:$ss"
}

/**
 * The production info loader (D7): the SPA InfoColumn's reads over the typed
 * wire — GET /items/{id} for the played item's projection, then — only when
 * the document carries a parsed series anchor — GET /series?library matched
 * BY PATH on [seriesAnchorOf]. No TV-specific wire: the same served shapes
 * the SPA reads. Failures surface at the caller (the orchestration swallows
 * — the blocks are best-effort, never load-bearing).
 */
fun apiInfoLoader(api: MelliferaApi): InfoLoader = InfoLoader { itemId ->
    val item = api.item(itemId).item
    val series = seriesAnchorOf(item)?.let { anchor ->
        api.series(item.libraryId).items.find { it.relativePath == anchor }
    }
    playerInfo(item, series)
}
