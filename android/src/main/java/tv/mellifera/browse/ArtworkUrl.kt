package tv.mellifera.browse

import java.net.URI
import java.net.URL

/**
 * One resolved artwork fetch (5.13): the URL Coil loads and whether the
 * request must carry the device bearer token. Server-relative wire paths
 * hit OUR authed server (staged artwork lives under /api/v1/art/...);
 * absolute http(s) URLs are third-party CDN artwork and are fetched
 * anonymously — the device token never rides another host's request.
 */
data class ArtworkRequest(
    val url: String,
    val isAuthorized: Boolean,
)

/**
 * The artwork URL law (5.13), the resolvePlayUrl posture (net/Api.kt) as a
 * PURE resolver beside the DisplayCard model: a RELATIVE wire path resolves
 * against the stored server base, an absolute http(s) URL passes through
 * unchanged (never re-prefixed), absent/blank artwork stays absent — the
 * FIELD-DRIVEN null law (SeriesGrid.kt). A relative path with no stored
 * base cannot load and also stays absent — nothing is fabricated.
 */
fun resolveArtworkUrl(serverBase: String?, wireField: String?): ArtworkRequest? {
    if (wireField.isNullOrBlank()) return null
    if (isAbsoluteUrl(wireField)) return ArtworkRequest(url = wireField, isAuthorized = false)
    val base = serverBase?.takeIf { it.isNotBlank() } ?: return null
    return ArtworkRequest(url = URL(URL(base), wireField).toString(), isAuthorized = true)
}

private fun isAbsoluteUrl(url: String): Boolean =
    try {
        URI(url).isAbsolute
    } catch (_: Exception) {
        false
    }
