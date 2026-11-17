package tv.mellifera.home

import tv.mellifera.browse.formatPosition
import tv.mellifera.browse.watchedPercent
import tv.mellifera.net.ContinueRow

/**
 * The home cards' rendering model (design D4 — the FIELD-DRIVEN law lives
 * here, not in Compose, exactly as the grid's DisplayCard model does): the
 * per-row `current` branch is a pure mapping into nullable block carriers,
 * and a null renders NO block — never a placeholder, never a fabricated
 * value. The composables only null-check what these models say.
 *
 * The branch (D4): `current` present → the RESUME card (the row's
 * resume facts, OK resumes through the play verb); absent → the ANCHOR
 * card, the served `next` offer being its primary OK affordance. A row
 * carrying neither renders BARE — artwork and title, no OK affordance,
 * never a fabricated link (the SPA ContinueCard's honest bare branch).
 */
data class ResumeCardModel(
    /** The item the play verb resumes into. */
    val itemId: String,

    /** The served library — the card's type accent reads its module (D3). */
    val libraryId: Long,

    /** The served series display name — the card's eyebrow (parity P3-3);
     * null means "no eyebrow block" (a film row serves ""). */
    val seriesName: String?,

    /** The served current display name — null means "no title block". */
    val title: String?,

    /** The served episode title (parity P3-3) — null means "no episode
     * title block". */
    val episodeTitle: String?,

    /** The served artwork wire path — null means "no artwork block". */
    val artworkUrl: String?,

    /** The bar's fill percent — null means "no bar": the bar exists only
     * when the row serves duration_seconds (the honest-absence law — an
     * unfilled track would read as "not started", a lie). */
    val percent: Int?,

    /**
     * The SERVED position line (the SPA ContinueCard's meta line): the
     * percent part only when a duration made one possible, the served
     * position always, the library name when present — never a
     * client-computed remaining label (D4).
     */
    val positionLine: String,
)

data class AnchorCardModel(
    /** The served next.item_id — null means the BARE card: no OK
     * affordance, the walker's focus search skips it. */
    val nextItemId: String?,

    /** The served library — the card's type accent reads its module (D3). */
    val libraryId: Long,

    /** The served next.label, verbatim — null means "no label block". */
    val nextLabel: String?,

    /** The served series display name — null means "no title block". */
    val title: String?,

    /** The served library name (parity P3-3) — null means "no library
     * block". */
    val libraryName: String?,

    /** The served artwork wire path — null means "no artwork block". */
    val artworkUrl: String?,
)

/** The resume card over a `current`-carrying row; null on an anchor row. */
fun ContinueRow.toResumeCard(): ResumeCardModel? {
    val cur = current ?: return null
    val percent = watchedPercent(cur.positionSeconds, cur.durationSeconds)
    return ResumeCardModel(
        itemId = cur.itemId,
        libraryId = libraryId,
        seriesName = seriesDisplayName.takeIf { it.isNotBlank() },
        title = cur.displayName.takeIf { it.isNotBlank() },
        episodeTitle = cur.episodeTitle.takeIf { it.isNotBlank() },
        artworkUrl = artwork?.takeIf { it.isNotBlank() },
        percent = percent,
        positionLine = positionLine(percent, cur.positionSeconds, libraryName),
    )
}

/** The anchor card over a `current`-less row; null on a resume row. */
fun ContinueRow.toAnchorCard(): AnchorCardModel? {
    if (current != null) return null
    return AnchorCardModel(
        nextItemId = next?.itemId,
        libraryId = libraryId,
        nextLabel = next?.label?.takeIf { it.isNotBlank() },
        title = seriesDisplayName.takeIf { it.isNotBlank() },
        libraryName = libraryName.takeIf { it.isNotBlank() },
        artworkUrl = artwork?.takeIf { it.isNotBlank() },
    )
}

/**
 * The position line's composition (the SPA Home.tsx resume branch verbatim):
 * `$percent% · $position · $library`, the percent and library parts
 * field-driven — absent → the part is absent, never padded.
 */
private fun positionLine(percent: Int?, positionSeconds: Long, libraryName: String): String =
    buildList {
        if (percent != null) add("$percent%")
        add(formatPosition(positionSeconds))
        if (libraryName.isNotBlank()) add(libraryName)
    }.joinToString(" · ")
