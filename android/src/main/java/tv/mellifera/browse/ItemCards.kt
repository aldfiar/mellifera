package tv.mellifera.browse

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import tv.mellifera.net.ItemDto

/**
 * The tv/image bodies' card mappings (design D6, task 4.1 — the SPA's
 * MovieCard/PhotoTile idioms, Collection.tsx): every optional fact is a
 * nullable DisplayCard carrier and a null renders NO block — the field-driven
 * law lives in the mapping, never in Compose (SeriesGrid.kt).
 *
 * Facts read generically across the document's source namespaces (the SPA's
 * namespaces() law): a fact that is absent is omitted — never guessed, never
 * padded (L1). The served values render verbatim; display formatting
 * (a date stamp's day part) is the only rewrite.
 */

/** A filename extension: 2–4 alphanumerics anchored at the end. */
private val EXT_RE = Regex("\\.[A-Za-z0-9]{2,4}$")

/** An RFC3339 stamp's YYYY-MM-DDT prefix (the SPA's formatDatePart law). */
private val RFC3339_DAY_RE = Regex("^\\d{4}-\\d{2}-\\d{2}T")

/**
 * sourceNamespaces — the document's `sources` namespaces as objects in
 * served order (the SPA's namespaces() law); missing/non-object entries
 * skipped. Plugin-defined fields stay raw — the callers read only the named
 * facts.
 */
internal fun sourceNamespaces(doc: JsonElement): List<JsonObject> {
    val sources = (doc as? JsonObject)?.get("sources") as? JsonObject ?: return emptyList()
    return sources.values.filterIsInstance<JsonObject>()
}

/**
 * fileTitle — the MovieCard idiom's title law (the SPA's itemTitle): the
 * SERVED display_name, floored to the extension-less stem when it is blank
 * or IS the raw filename. A blank floor too carries no title block — nothing
 * fabricated. Raw filenames never render (INV-no-filenames).
 */
internal fun fileTitle(displayName: String, relativePath: String): String? {
    val name = displayName.takeIf { it.isNotBlank() }
    val last = relativePath.substringAfterLast('/')
    if (name == null || name == last) {
        return pathStem(relativePath).takeIf { it.isNotBlank() }
    }
    return name
}

/**
 * pathStem — the extension-less final segment: the unidentified rows' title
 * floor (the SPA's pathStem law; the 2–4 anchor keeps "Part.2" alive).
 */
internal fun pathStem(relativePath: String): String =
    relativePath.substringAfterLast('/').replace(EXT_RE, "")

/**
 * hasThumbFact — the document carries the frame-grabber thumbnail fact
 * (sources["frame-grabber"].thumbnail_path, non-empty string — the EXACT
 * fact the server's documentMediaPath reads). Only a TRUE answer may request
 * ?variant=thumb: the endpoint answers a thumb miss with 404.
 */
internal fun hasThumbFact(doc: JsonElement): Boolean {
    val grabber = (doc as? JsonObject)?.get("sources")?.let { source ->
        (source as? JsonObject)?.get("frame-grabber")
    } as? JsonObject ?: return false
    val path = grabber["thumbnail_path"] as? JsonPrimitive ?: return false
    return path.isString && path.content.isNotEmpty()
}

/**
 * hasOriginalFile — the scan-stamped original-path fact (parsed.absolute_path,
 * non-empty string): the plain media variant can resolve.
 */
internal fun hasOriginalFile(doc: JsonElement): Boolean {
    val parsed = (doc as? JsonObject)?.get("parsed") as? JsonObject ?: return false
    val absolute = parsed["absolute_path"] as? JsonPrimitive ?: return false
    return absolute.isString && absolute.content.isNotEmpty()
}

/**
 * mediaWirePath — the item's relative media URL (GET /items/{id}/media,
 * media-preview D2): ?variant=thumb only when the document names a thumb.
 * A RELATIVE wire path — resolveArtworkUrl resolves it against the stored
 * server base with the device token (the artwork law, ArtworkUrl.kt).
 */
internal fun mediaWirePath(itemId: String, thumb: Boolean): String =
    if (thumb) "/api/v1/items/$itemId/media?variant=thumb" else "/api/v1/items/$itemId/media"

/**
 * captureDate — the capture date read from the enricher's date_taken fact
 * (the SPA's captureDate law): the first namespace carrying a non-empty
 * string wins. Null when none does — the caller omits the footer, never
 * fakes a date.
 */
internal fun captureDate(doc: JsonElement): String? {
    for (namespace in sourceNamespaces(doc)) {
        val date = namespace["date_taken"] as? JsonPrimitive ?: continue
        if (date.isString && date.content.isNotEmpty()) return date.content
    }
    return null
}

/**
 * formatDatePart — the display form of a stored stamp: the YYYY-MM-DD prefix
 * of an RFC3339 value, the raw string verbatim otherwise (unparseable EXIF
 * values pass through — never re-encoded).
 */
internal fun formatDatePart(stamp: String): String =
    if (RFC3339_DAY_RE.containsMatchIn(stamp)) stamp.take(10) else stamp

/**
 * toFileCard — the tv body's episode file card (the MovieCard idiom, D6):
 * thumb ONLY when the frame-grabber fact exists, the floored served title,
 * ONE parsed-facts meta line (documentMeta — the shared law, SeriesGrid.kt),
 * and the served watched stamp (the D2 ✓/dim law renders it; per-file
 * identity is the tv model, NOT a grouping bug). Geometry rides the tv
 * grid's STILL_ASPECT (the uniform-row law).
 */
fun ItemDto.toFileCard(): DisplayCard = DisplayCard(
    id = id,
    title = fileTitle(displayName, relativePath),
    artworkUrl = if (hasThumbFact(document)) mediaWirePath(id, thumb = true) else null,
    watched = watched,
    progress = null,
    meta = documentMeta(document),
)

/**
 * toPhotoCard — the image body's photo tile (the PhotoTile idiom, D6):
 * media when a fact resolves it (thumb fact first, else the original file),
 * NO title/meta row (photo identity is the thumbnail; INV-no-filenames), the
 * capture-date footer ONLY when date_taken exists. Geometry rides the photo
 * grid's fixed square (PHOTO_TILE_ASPECT) — Crop fills it either orientation.
 */
fun ItemDto.toPhotoCard(): DisplayCard {
    val thumb = hasThumbFact(document)
    return DisplayCard(
        id = id,
        title = null,
        artworkUrl = when {
            thumb -> mediaWirePath(id, thumb = true)
            hasOriginalFile(document) -> mediaWirePath(id, thumb = false)
            else -> null
        },
        watched = null,
        progress = null,
        meta = null,
        footer = captureDate(document)?.let(::formatDatePart),
    )
}

/**
 * toPhotoViewerUrl — the full-screen viewer's artifact (task 8.13): the
 * ORIGINAL file when the scan-stamped fact resolves it (a viewer shows the
 * photograph, not its tile thumbnail), else the thumb when the frame-grabber
 * fact exists, else null — the honest no-artifact tile opens nothing (never
 * a broken viewer). The tile's own order is thumb-first (a small square);
 * the viewer's is original-first (full-screen Fit).
 */
internal fun ItemDto.toPhotoViewerUrl(): String? = when {
    hasOriginalFile(document) -> mediaWirePath(id, thumb = false)
    hasThumbFact(document) -> mediaWirePath(id, thumb = true)
    else -> null
}
