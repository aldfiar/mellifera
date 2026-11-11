package tv.mellifera.browse

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

    /** The read-time watched stamp — null means "no watched block";
     * true/false render as their own chip. */
    val watched: Boolean?,
)

/** A series grid card over the served seriesDTO row. */
fun SeriesDto.toCard(): DisplayCard = DisplayCard(
    id = id,
    title = titleBlock(displayName),
    artworkUrl = artwork?.takeIf { it.isNotBlank() },
    watched = watched,
)

/** An episode row over the served itemDTO row. */
fun ItemDto.toCard(): DisplayCard = DisplayCard(
    id = id,
    title = titleBlock(displayName),
    artworkUrl = artwork?.takeIf { it.isNotBlank() },
    watched = watched,
)

/** A blank display name carries no title block — nothing is fabricated. */
private fun titleBlock(displayName: String): String? =
    displayName.takeIf { it.isNotBlank() }
