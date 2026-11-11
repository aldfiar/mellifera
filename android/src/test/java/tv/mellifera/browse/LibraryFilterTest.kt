package tv.mellifera.browse

import org.junit.Assert.assertEquals
import org.junit.Test
import tv.mellifera.net.LibraryDto

/** The serial+tv library scope law (5.6): the filter is CLIENT-side. */
class LibraryFilterTest {
    private fun library(id: Long, moduleId: String) = LibraryDto(
        id = id,
        moduleId = moduleId,
        displayName = "Библиотека $id",
    )

    @Test
    fun serial_tv_only() {
        // GET /libraries serves every visible module; the client keeps only
        // the serial+tv pair, in the served order.
        val served = listOf(
            library(1, "serial"),
            library(2, "movie"),
            library(3, "tv"),
            library(4, "music"),
            library(5, "image"),
        )
        val kept = LibraryFilter.serialAndTv(served)
        assertEquals(listOf(1L, 3L), kept.map { it.id })
        assertEquals(listOf("serial", "tv"), kept.map { it.moduleId })
    }

    @Test
    fun no_browse_modules_filters_empty() {
        val kept = LibraryFilter.serialAndTv(listOf(library(2, "movie"), library(4, "music")))
        assertEquals(emptyList<LibraryDto>(), kept)
    }

    @Test
    fun empty_input_stays_empty() {
        assertEquals(emptyList<LibraryDto>(), LibraryFilter.serialAndTv(emptyList()))
    }
}
