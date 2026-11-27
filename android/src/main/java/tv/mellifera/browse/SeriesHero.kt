package tv.mellifera.browse

import tv.mellifera.net.MetadataAbout
import tv.mellifera.net.SeriesDto

/**
 * The series hero (design D5 — the SPA's ItemDetail hero + Synopsis.tsx):
 * poster, title, and the about panel — facts line + Synopsis + genre chips —
 * read from the SERVED `metadata.about` projection. The client walks NO
 * namespaces: the about block arrives already resolved first-wins on the
 * served row (internal/naming/metadata.go MetadataFor), exactly the block
 * Synopsis.tsx consumes.
 *
 * The FIELD-DRIVEN law lives in this mapping (5.6): an absent metadata block
 * or an about block whose description strips to nothing yields NO panel —
 * no synopsis, no facts line, no chips, nothing fabricated (the SPA's
 * panelOf law verbatim, Synopsis.tsx).
 */
data class SeriesHero(
    /** The served display name — null means "no title block". */
    val title: String?,

    /** The served poster URL — null means "no poster block". */
    val posterUrl: String?,

    /** The served about panel — null means the whole panel is absent: no
     * synopsis, no facts line, no genre chips (L1/D5). */
    val about: AboutPanel?,
)

/**
 * The presentation view of one served about block (Synopsis.tsx's
 * SynopsisPanel): the description paragraph, the joined fact words, the
 * genre names. The description is non-blank by construction.
 */
data class AboutPanel(
    val description: String,
    val facts: String?,
    val genres: List<String>,
)

/** The hero over the served seriesDTO row. */
fun SeriesDto.toHero(): SeriesHero = SeriesHero(
    title = displayName.takeIf { it.isNotBlank() },
    posterUrl = artwork?.takeIf { it.isNotBlank() },
    about = metadata?.about?.let { panelOf(it) },
)

/**
 * The SPA's panelOf verbatim (Synopsis.tsx): null when the block's
 * description strips to nothing — the description is the carrier the server
 * resolved on, so an empty one is no panel. Blank genre names filter out;
 * an empty fact row renders no facts line.
 */
private fun panelOf(about: MetadataAbout): AboutPanel? {
    val description = plainText(about.description).trim()
    if (description.isEmpty()) return null
    val genres = about.genres.orEmpty().filter { it.isNotBlank() }
    return AboutPanel(description, factsOf(about), genres)
}

/**
 * The joined fact words (Synopsis.tsx's fixed order): ★ score · kind ·
 * status · N эп · year. An absent or blank fact skips its slot; kind/status
 * render verbatim (the source's own vocabulary); the year is aired_on's
 * "YYYY" prefix. RU copy law (L7) for the episode-count word.
 */
internal fun factsOf(about: MetadataAbout): String? {
    val facts = mutableListOf<String>()
    if (about.score != null) facts.add("★ ${scoreText(about.score)}")
    if (!about.kind.isNullOrBlank()) facts.add(about.kind)
    if (!about.status.isNullOrBlank()) facts.add(about.status)
    if (about.episodes != null) facts.add("${about.episodes} эп")
    yearOf(about.airedOn ?: "")?.let { facts.add(it.toString()) }
    return if (facts.isEmpty()) null else facts.joinToString(" · ")
}

/**
 * The JS String(n) rendering the SPA's score fact rides (Synopsis.tsx): an
 * integral value renders without the fraction ("8", never "8.0").
 */
internal fun scoreText(score: Double): String =
    if (score == Math.floor(score)) score.toLong().toString() else score.toString()

/**
 * The "YYYY" prefix of an aired_on date ("1998-02-20"). Anything shorter or
 * non-numeric yields null — never a guess (Synopsis.tsx's yearOf).
 */
internal fun yearOf(value: String): Int? {
    if (value.length < 4) return null
    val year = value.take(4).toIntOrNull() ?: return null
    return if (year > 0) year else null
}

/**
 * Strip the BBCode wrapper tags sources wrap descriptions in
 * ("[character=124731]Аста[/character] и…" → "Аста и…"), keeping the INNER
 * text: the tags are markup, not data. Untagged input passes through
 * untouched — never a guess, never a crash (Synopsis.tsx's plainText).
 */
internal fun plainText(value: String): String =
    value.replace(Regex("""\[/?[a-z*]+(?:=[^\]]*)?]""", RegexOption.IGNORE_CASE), "")
