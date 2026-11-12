package tv.mellifera.browse

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import retrofit2.HttpException
import tv.mellifera.net.ItemDto
import tv.mellifera.net.LibraryDto
import tv.mellifera.net.MelliferaApi
import tv.mellifera.net.SeriesDto

/**
 * The browse session state: the filtered libraries, the current library's
 * series grid, and the open series' episodes. [selectedSeries] non-null IS
 * the series page (the when-shell never gains a third Screen — the player
 * is an overlay on any of these, D1). The focus cursors ([gridFocus],
 * [episodeFocus]) live here so Back restores the exact prior position —
 * the classic TV failure mode (grid restarts at 0) is pinned by
 * nav/BackRestorationTest (5.9).
 */
data class BrowseState(
    val loading: Boolean = false,
    val error: String? = null,
    val libraries: List<LibraryDto> = emptyList(),
    val libraryId: Long? = null,
    val series: List<SeriesDto> = emptyList(),
    val selectedSeries: SeriesDto? = null,
    val episodes: List<ItemDto> = emptyList(),
    val gridFocus: Int = 0,
    val episodeFocus: Int = 0,
)

/**
 * The browse flow (5.6): fetch-on-navigate and the player-exit refresh law.
 *
 * - Entering browse fetches /libraries, keeps serial+tv ([LibraryFilter]),
 *   and loads the first library's series.
 * - Opening a series fetches its episodes via /series/{id}/episodes.
 * - [refresh] is the player-exit hook: the series rows (watched/rec stamps
 *   are read-time) and the open series' episodes re-fetch WITHOUT a manual
 *   reload. 5.7's player-exit path fires it through AppViewModel.
 *
 * The fetches are suspend so the JVM tests drive them deterministically;
 * the composables launch them from composition/click scopes.
 */
class BrowseFlow(
    private val apiFor: () -> MelliferaApi,
    private val onUnauthorized: () -> Unit = {},
) {
    private val _state = MutableStateFlow(BrowseState())
    val state: StateFlow<BrowseState> = _state.asStateFlow()

    /** Navigate into browse: libraries → serial+tv filter → first library. */
    suspend fun enter() {
        _state.value = BrowseState(loading = true)
        try {
            val service = apiFor()
            val libraries = LibraryFilter.serialAndTv(service.libraries().items)
            if (libraries.isEmpty()) {
                _state.value = BrowseState(error = MESSAGE_NO_LIBRARIES)
                return
            }
            val first = libraries.first()
            _state.value = BrowseState(
                libraries = libraries,
                libraryId = first.id,
                loading = true,
            )
            val series = service.series(first.id).items
            _state.value = BrowseState(
                libraries = libraries,
                libraryId = first.id,
                series = series,
            )
        } catch (e: Exception) {
            fail(MESSAGE_LIBRARIES, e)
        }
    }

    /** Navigate into a series: its episodes, in narrative order. The grid
     * cursor PARKS — untouched — so Back restores the exact card; the
     * episode cursor starts at the first row. */
    suspend fun openSeries(series: SeriesDto) {
        _state.value = _state.value.copy(
            selectedSeries = series,
            episodes = emptyList(),
            loading = true,
            error = null,
            episodeFocus = 0,
        )
        try {
            val episodes = apiFor().episodes(series.id).items
            _state.value = _state.value.copy(
                selectedSeries = series,
                episodes = episodes,
                loading = false,
            )
        } catch (e: Exception) {
            fail(MESSAGE_EPISODES, e)
        }
    }

    /** Back from the series page to the grid — [BrowseState.gridFocus] is
     * deliberately NOT reset: restoring the prior focus position is the law
     * (BackRestorationTest). */
    fun closeSeries() {
        _state.value = _state.value.copy(selectedSeries = null, episodes = emptyList())
    }

    /** The D-pad moved the grid cursor (5.9): the law's computed position
     * lands here and drives which card holds focus. Clamped to the live
     * rows so a shrunken series list never aims past the end. */
    fun onGridFocusMoved(index: Int) {
        _state.value = _state.value.copy(
            gridFocus = index.coerceIn(0, _state.value.series.lastIndex.coerceAtLeast(0)),
        )
    }

    /** The D-pad moved the episode cursor (same law, list semantics). */
    fun onEpisodeFocusMoved(index: Int) {
        _state.value = _state.value.copy(
            episodeFocus = index.coerceIn(0, _state.value.episodes.lastIndex.coerceAtLeast(0)),
        )
    }

    /**
     * The player-exit refresh law: re-fetch the current library's series
     * rows and, when one is open, its episodes — progress/watched surfaces
     * are current without a manual reload. Rows stay on screen while the
     * re-fetch runs (no loading churn, no error wipe on success).
     */
    suspend fun refresh() {
        val current = _state.value
        if (current.libraryId == null) {
            enter()
            return
        }
        try {
            val service = apiFor()
            val series = service.series(current.libraryId).items
            _state.value = current.copy(series = series, error = null)
            val selected = current.selectedSeries
            if (selected != null) {
                val episodes = service.episodes(selected.id).items
                _state.value = _state.value.copy(episodes = episodes)
            }
        } catch (e: Exception) {
            fail(MESSAGE_REFRESH, e)
        }
    }

    /**
     * The 401-anywhere law routes through the app shell (token wiped →
     * Pairing); every other failure surfaces an honest RU message and keeps
     * whatever rows are already on screen.
     */
    private fun fail(message: String, e: Exception) {
        if (e is HttpException && e.code() == 401) {
            onUnauthorized()
            _state.value = _state.value.copy(loading = false, error = null)
        } else {
            _state.value = _state.value.copy(loading = false, error = message)
        }
    }

    private companion object {
        const val MESSAGE_NO_LIBRARIES = "Подходящих библиотек не найдено"
        const val MESSAGE_LIBRARIES = "Не удалось загрузить библиотеки — проверьте сервер"
        const val MESSAGE_EPISODES = "Не удалось загрузить эпизоды"
        const val MESSAGE_REFRESH = "Не удалось обновить данные"
    }
}
