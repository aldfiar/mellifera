package tv.mellifera.browse

import tv.mellifera.net.LibraryDto

/**
 * The TV client's library scope (5.6): the box browses narrative video
 * only — the "serial" (catalog libraries) and "tv" (episodic files)
 * modules. The filter is CLIENT law: GET /libraries returns every visible
 * module (movie, music, image, …) and the client keeps the serial+tv pair,
 * preserving the server's order.
 */
object LibraryFilter {
    val browseModuleIds: Set<String> = setOf("serial", "tv")

    fun serialAndTv(libraries: List<LibraryDto>): List<LibraryDto> =
        libraries.filter { it.moduleId in browseModuleIds }
}
