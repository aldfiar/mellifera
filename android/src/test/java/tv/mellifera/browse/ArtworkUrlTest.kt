package tv.mellifera.browse

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The artwork URL law (5.13): the pure resolver beside the DisplayCard
 * model — relative /api/v1/art/... paths prepend the stored server base,
 * absolute http(s) URLs pass through unchanged, absent/blank stays absent.
 * `authorized` marks OUR server's artwork (bearer rides the Coil request)
 * vs third-party CDN artwork (fetched anonymously).
 */
class ArtworkUrlTest {
    @Test
    fun relative_art_path_prepends_base() {
        val request = resolveArtworkUrl("http://192.168.1.10:8080", "/api/v1/art/object/t-1")
        assertEquals("http://192.168.1.10:8080/api/v1/art/object/t-1", request?.url)
        assertEquals(true, request?.authorized)
    }

    @Test
    fun absolute_url_passes_through() {
        val request = resolveArtworkUrl(
            "http://192.168.1.10:8080",
            "https://image.tmdb.org/t/p/w500/poster.jpg",
        )
        assertEquals("https://image.tmdb.org/t/p/w500/poster.jpg", request?.url)
        assertFalse(request?.authorized ?: true)
    }

    @Test
    fun absent_or_blank_stays_absent() {
        assertNull(resolveArtworkUrl("http://192.168.1.10:8080", null))
        assertNull(resolveArtworkUrl("http://192.168.1.10:8080", ""))
        assertNull(resolveArtworkUrl("http://192.168.1.10:8080", "   "))
    }

    @Test
    fun relative_path_without_base_stays_absent() {
        // No stored server base → a relative path cannot load; the null law
        // fabricates nothing.
        assertNull(resolveArtworkUrl(null, "/api/v1/art/object/t-1"))
    }
}
