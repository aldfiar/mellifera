package tv.mellifera.browse

import androidx.compose.ui.graphics.Color
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import retrofit2.HttpException
import tv.mellifera.net.FolderDto
import tv.mellifera.net.ItemDto
import tv.mellifera.net.LibraryDto
import tv.mellifera.net.LibrarySummaryResponse
import tv.mellifera.net.MelliferaApi
import tv.mellifera.net.SeriesDto

/**
 * The module-label law (5.14 — the SPA's default-dot law, Sidebar.tsx
 * dotClass): a pure label per module_id; an unknown id renders its own id —
 * a server module type the client has never seen still yields a readable
 * label, never a blank entry.
 */
internal fun moduleLabel(moduleId: String): String = when (moduleId) {
    "serial" -> "Каталоги"
    "tv" -> "ТВ"
    "image" -> "Фото"
    else -> moduleId
}

/**
 * The type accents (design D3 — the SPA's pastel dot map, styles/index.css
 * .dot-*): one pastel per module_id, tinting the card's ✓ glyph and the
 * in-progress bar; an unknown id falls to the SPA's default dot pastel (the
 * watched-mark color — type-agnostic), never a blank. `tvAccent` stays the
 * focus ring color and never renders state (D11).
 */
internal fun typeAccent(moduleId: String): Color = when (moduleId) {
    "serial" -> Color(0xFFB7A6F4)
    "tv" -> Color(0xFFF6C3A4)
    "image" -> Color(0xFFA4E3C3)
    "audio" -> Color(0xFFA4C8F4)
    else -> DEFAULT_TYPE_ACCENT
}

/** The SPA's default dot pastel (styles/index.css .watched-mark). */
internal val DEFAULT_TYPE_ACCENT = Color(0xFFA4C8F4)

/**
 * The browse session state: the served collections, the current collection's
 * series grid, and the open series' episodes. [selectedSeries] non-null IS
 * the series page (the when-shell never gains a third Screen — the player
 * is an overlay on any of these, D1). The focus cursors ([gridFocus],
 * [episodeFocus]) live here so Back restores the exact prior position —
 * the classic TV failure mode (grid restarts at 0) is pinned by
 * nav/BackRestorationTest (5.9). The collections rail (5.15) rides the same
 * state: [railOpen] IS the rail (an open rail takes Back before the series
 * page — the BackHandler chain's first link), [railFocus] walks the rows so
 * reopening lands on the current collection, and [summaries] holds the
 * rail's per-collection counts, populated by [BrowseFlow.loadSummaries]; an
 * absent entry IS the count-less row (not fetched or failed — never a
 * placeholder).
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
    val railOpen: Boolean = false,
    val railFocus: Int = 0,
    /**
     * The rail-close restore's owner (task 3.2): true when the rail was
     * opened from a home row's LEFT at row-0 x=0, so the HOME rows' cursor
     * re-requests on the close and the grid's restore stands down — the
     * opener's exact cursor comes back (L3), never a two-surface focus
     * race. Set by every [openRail]; read only by the two surfaces'
     * restore effects, never by the walkers.
     */
    val railRestoreHome: Boolean = false,
    val summaries: Map<Long, LibrarySummaryResponse> = emptyMap(),
    /** The open series' stored positions off the progress wire
     * (GET /progress/{item_id} — the exact read the player's resume makes),
     * episode id → position_seconds. An absent entry IS an unstarted
     * episode: no bar, never a placeholder (L1). Populated best-effort by
     * [loadPositions]. */
    val positions: Map<String, Long> = emptyMap(),
    /**
     * The tv/image bodies' paged stream (design D6, task 4.1): GET /items
     * rows, one PAGE_SIZE page at a time, appended by [extendItems] when the
     * grid cursor reaches the loaded end. A chip pick ([pickFolder])
     * server-filters this SAME stream and restarts it at offset 0 — the grid
     * pages exactly the stream the chips count.
     */
    val items: List<ItemDto> = emptyList(),
    /** The image body's served folder rows ([Все] is the UI's own first
     * chip, not a served row). An absent read degrades to the bare [Все]
     * chip — never an error (the same best-effort law as the rail counts). */
    val folders: List<FolderDto> = emptyList(),
    /** The picked folder: null = Все (no filter), "" = top-level
     * (top_level=true), otherwise the path_prefix filter. */
    val folder: String? = null,
    /** The paged stream's current offset. */
    val itemsOffset: Int = 0,
    /** True once a page came back short — the append trigger stands down
     * (the honest end-of-stream, never an empty extra request). */
    val itemsExhausted: Boolean = false,
    /** The folder-chips row's cursor; -1 = no chip holds focus (the
     * D12 chips row — its Back and the L2 crossings read this). */
    val chipFocus: Int = -1,
    /**
     * The grid re-focus nonce (the chips row's Back → grid, D12): a bump
     * re-requests the parked cursor's card. The walkers never read it.
     */
    val gridFocusNonce: Int = 0,
)

/**
 * The browse flow (5.6): fetch-on-navigate and the player-exit refresh law.
 *
 * - Entering browse fetches /libraries and keeps ALL served collections in
 *   served order (5.14 — the SPA-parity law; the serial+tv client filter is
 *   retired), then loads the first collection's module-keyed body (D6).
 * - Opening a series fetches its episodes via /series/{id}/episodes.
 * - [selectLibrary] swaps the module-keyed body to another collection (5.14).
 * - [loadSummaries] fetches the rail's per-collection counts, best-effort
 *   and only while the collections rail is open (5.14).
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

    /**
     * The rail-OK body swap (task 8.3's visible-swap law): ONE one-shot
     * signal per SUCCESSFUL [activateRailRow] — the UI actuator reads it to
     * bring the opened body's top INTO VIEW (the SPA's page shape: the user
     * SEES the body they opened). A one-shot FLOW, not a state field: a
     * state nonce would re-fire on every fresh composition of the browse
     * content (Back from the series page), racing the restored cursor with
     * a stale page jump. A plain rail close and a FAILED activation emit
     * nothing — the close restores the parked cursor, the failure keeps the
     * rail (the 4.3 keep-focus law).
     */
    private val _bodySwaps = MutableSharedFlow<Unit>(extraBufferCapacity = 4)
    val bodySwaps: SharedFlow<Unit> = _bodySwaps

    /** Navigate into browse: libraries → the first served collection's
     * module-keyed body (D6). */
    suspend fun enter() {
        _state.value = BrowseState(loading = true)
        try {
            val service = apiFor()
            val libraries = service.libraries().items
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
            loadBody(first.id)
        } catch (e: Exception) {
            fail(MESSAGE_LIBRARIES, e)
        }
    }

    /**
     * The collection switch (5.14): fetch-on-navigate over the module-keyed
     * body law (D6) — a new collection is a fresh body, so the cursors
     * reset to 0. On failure the honest RU error surfaces and the PRIOR
     * body stays: rows, cursors and libraryId revert (the flow's failure
     * law — whatever was on screen is kept, never wiped by a failed fetch).
     * Returns whether the body actually opened — the rail-OK law reads it
     * ([activateRailRow] keeps the rail open when it is false).
     */
    suspend fun selectLibrary(libraryId: Long): Boolean {
        val prior = _state.value
        _state.value = prior.copy(
            libraryId = libraryId,
            loading = true,
            error = null,
            gridFocus = 0,
            series = emptyList(),
            items = emptyList(),
            folders = emptyList(),
            folder = null,
            itemsOffset = 0,
            itemsExhausted = false,
            chipFocus = -1,
        )
        try {
            loadBody(libraryId)
            return true
        } catch (e: Exception) {
            _state.value = _state.value.copy(
                libraryId = prior.libraryId,
                gridFocus = prior.gridFocus,
                series = prior.series,
                items = prior.items,
                folders = prior.folders,
                folder = prior.folder,
                itemsOffset = prior.itemsOffset,
                itemsExhausted = prior.itemsExhausted,
            )
            fail(MESSAGE_SWITCH, e)
            return false
        }
    }

    /**
     * The module-keyed body law (design D6): serial → the series grid;
     * tv → the paged items stream; image → the folder rows beside the same
     * stream; an unknown module → NO fetch at all — the honest empty state
     * (the stated TV divergence), the body only ever renders the module
     * label. Serial's series fetch-on-navigate keeps the 5.14 shape.
     */
    private suspend fun loadBody(libraryId: Long) {
        when (moduleOf(libraryId)) {
            "serial" -> {
                val series = apiFor().series(libraryId).items
                _state.value = _state.value.copy(series = series, loading = false)
            }
            "tv" -> loadItems(libraryId, folder = null, offset = 0)
            "image" -> {
                loadFolders(libraryId)
                loadItems(libraryId, folder = null, offset = 0)
            }
            else -> _state.value = _state.value.copy(loading = false)
        }
    }

    /** The current collection's served module id; null when it is gone. */
    private fun moduleOf(libraryId: Long?): String? =
        _state.value.libraries.firstOrNull { it.id == libraryId }?.moduleId

    /**
     * The folder chip's filter params (the SPA's usePagedItems law): a named
     * folder → path_prefix, "" (top level) → top_level=true, null → no
     * filter — the filter rides the request, NEVER a client-side post-filter.
     */
    private fun folderFilter(folder: String?): Pair<String?, Boolean?> =
        folder?.takeIf { it.isNotEmpty() } to (if (folder == "") true else null)

    /**
     * ONE page of the items stream ([PAGE_SIZE] rows at [offset]); a full
     * page appends onto the paged rows, a first page replaces them. A short
     * page marks the stream exhausted — the append trigger stands down.
     */
    private suspend fun loadItems(libraryId: Long, folder: String?, offset: Int) {
        val (pathPrefix, topLevel) = folderFilter(folder)
        val page = apiFor().items(
            libraryId,
            pathPrefix = pathPrefix,
            topLevel = topLevel,
            limit = PAGE_SIZE,
            offset = offset,
        ).items
        _state.value = _state.value.copy(
            items = if (offset == 0) page else _state.value.items + page,
            itemsOffset = offset,
            itemsExhausted = page.size < PAGE_SIZE,
            loading = if (offset == 0) false else _state.value.loading,
        )
    }

    /**
     * The image body's folder rows (the chips' counts, D6): best-effort — a
     * failed read degrades to the bare [Все] chip, never an error. A 401
     * still routes through the app shell (the 401-anywhere law).
     */
    private suspend fun loadFolders(libraryId: Long) {
        try {
            val folders = apiFor().libraryFolders(libraryId).folders
            _state.value = _state.value.copy(folders = folders)
        } catch (e: HttpException) {
            if (e.code() == 401) {
                onUnauthorized()
                return
            }
            // best-effort: the chips row renders [Все] alone
        } catch (_: Exception) {
            // best-effort: the chips row renders [Все] alone
        }
    }

    /**
     * The chips row's pick (design D6): the picked folder SERVER-FILTERS the
     * paged stream — a named folder rides path_prefix, "" (top level) rides
     * top_level=true, null (Все) clears the filter — and the stream
     * RESTARTS at offset 0 with a fresh grid cursor. On failure the prior
     * stream stays with the honest error (the flow's failure law).
     */
    suspend fun pickFolder(path: String?) {
        val prior = _state.value
        val libraryId = prior.libraryId ?: return
        if (prior.folder == path) return
        _state.value = prior.copy(
            folder = path,
            loading = true,
            error = null,
            gridFocus = 0,
            items = emptyList(),
            itemsOffset = 0,
            itemsExhausted = false,
        )
        try {
            loadItems(libraryId, path, offset = 0)
        } catch (e: Exception) {
            _state.value = _state.value.copy(
                folder = prior.folder,
                items = prior.items,
                itemsOffset = prior.itemsOffset,
                itemsExhausted = prior.itemsExhausted,
            )
            fail(MESSAGE_ITEMS, e)
        }
    }

    /**
     * The paged stream's append trigger (D6): the grid cursor landed on the
     * LAST loaded card, so the NEXT page fetches and appends — the walk
     * simply continues into the new rows. Idempotent: an exhausted stream,
     * a mid-switch body, or an in-flight append fires nothing. Best-effort:
     * a failed page leaves the loaded rows untouched and a later landing
     * retries; a 401 routes through the app shell.
     */
    suspend fun extendItems() {
        val current = _state.value
        val libraryId = current.libraryId ?: return
        val module = moduleOf(libraryId) ?: return
        if (module != "tv" && module != "image") return
        if (current.itemsExhausted || current.loading || extending) return
        extending = true
        try {
            loadItems(libraryId, current.folder, current.itemsOffset + PAGE_SIZE)
        } catch (e: HttpException) {
            if (e.code() == 401) onUnauthorized()
            // best-effort: the loaded rows stay; a later landing retries
        } catch (_: Exception) {
            // best-effort: the loaded rows stay; a later landing retries
        } finally {
            extending = false
        }
    }

    /** The chips row's cursor moved (the moveInRow law's landing). */
    fun onChipFocusMoved(index: Int) {
        val max = _state.value.folders.size
        _state.value = _state.value.copy(chipFocus = index.coerceIn(0, max))
    }

    /** No chip holds focus any more (the row lost focus — the BackHandler's
     * enabler stands down with it). */
    fun clearChipFocus() {
        if (_state.value.chipFocus != -1) {
            _state.value = _state.value.copy(chipFocus = -1)
        }
    }

    /**
     * The chips row's Back (D12: chips Back → grid): the filter STAYS
     * applied — only the focus moves back to the parked grid cursor (the
     * nonce bump is the re-request; never a silent state wipe).
     */
    fun refocusGridFromChips() {
        _state.value = _state.value.copy(
            chipFocus = -1,
            gridFocusNonce = _state.value.gridFocusNonce + 1,
        )
    }

    /**
     * The collections rail's counts (5.14 — the SPA's closed-panel D1 law):
     * fetched ONLY when the rail opens (5.15's rail-open path calls this; a
     * closed rail fires no summary requests, so [enter]'s request sequence
     * stays untouched). Per-library BEST-EFFORT: a failed summary degrades
     * to a count-less row — never an error, never a placeholder. A 401
     * anywhere still routes through the app shell (the 401-anywhere law).
     */
    suspend fun loadSummaries() {
        val libraries = _state.value.libraries
        if (libraries.isEmpty()) return
        val service = apiFor()
        val loaded = mutableMapOf<Long, LibrarySummaryResponse>()
        for (library in libraries) {
            try {
                loaded[library.id] = service.librarySummary(library.id)
            } catch (e: HttpException) {
                if (e.code() == 401) {
                    onUnauthorized()
                    return
                }
                // best-effort: this row renders without its count
            } catch (_: Exception) {
                // best-effort: this row renders without its count
            }
        }
        _state.value = _state.value.copy(summaries = loaded)
    }

    /**
     * The rail-open trigger (5.15 — the left-edge LEFT arrow, fired by the
     * grid AND by the home rows' row-0 x=0, task 3.2): the rail opens with
     * the focus on the CURRENT collection's row (the initial-focus law
     * carried into the rail) and the per-collection counts fire through
     * [loadSummaries] ONCE. [fromHome] records the opener — the close's
     * restore law reads [BrowseState.railRestoreHome]. Idempotent: an
     * already-open rail neither moves the focus nor re-fires the summaries.
     */
    suspend fun openRail(fromHome: Boolean = false) {
        val current = _state.value
        if (current.railOpen) return
        val focus = current.libraries.indexOfFirst { it.id == current.libraryId }.coerceAtLeast(0)
        _state.value = current.copy(
            railOpen = true,
            railFocus = focus,
            railRestoreHome = fromHome,
        )
        loadSummaries()
    }

    /**
     * The rail-close law (LEFT or Back anywhere in the rail): only the rail
     * closes — [BrowseState.gridFocus] is deliberately NOT touched, so the
     * grid re-renders with the exact prior cursor (the no-restart law).
     */
    fun closeRail() {
        _state.value = _state.value.copy(railOpen = false)
    }

    /**
     * The rail row's OK (design D12's rail-row act "select+close", task 4.3):
     * the FOCUSED row's collection body opens through [selectLibrary] and the
     * rail closes into it — the fresh body's parked cursor re-lands through
     * the [BrowseState.gridFocusNonce] bump (the refocusGridFromChips
     * re-land idiom), so the focus never drops to a cursor-less surface. When
     * the body cannot open (the fetch failed), the rail STAYS OPEN with its
     * [BrowseState.railFocus] kept — the reverted prior body stays under the
     * scrim carrying the honest error, and the walk continues from the same
     * row. A closed rail (or a cursor outside the served rows) is a no-op.
     */
    suspend fun activateRailRow(): Boolean {
        val current = _state.value
        if (!current.railOpen) return false
        val library = current.libraries.getOrNull(current.railFocus) ?: return false
        val opened = selectLibrary(library.id)
        if (opened) {
            _state.value = _state.value.copy(
                railOpen = false,
                // The activation close restores NOTHING (walk34, task 8.4):
                // the cursor moves INTO the opened body (4.3's re-land
                // below) — a cleared [BrowseState.railRestoreHome] stands
                // HomeRows' restore effect down, so its focus→scroll
                // actuator cannot drag the viewport back onto the home rows
                // over the body-top swap. Only the LEFT/RIGHT/BACK closes
                // ([closeRail]) keep the restore.
                railRestoreHome = false,
                gridFocusNonce = _state.value.gridFocusNonce + 1,
            )
            // The visible-swap law (task 8.3): the opened body's top rides
            // this signal INTO VIEW — the activation is a VISIBLE swap.
            _bodySwaps.tryEmit(Unit)
        }
        return opened
    }

    /** The D-pad moved the rail cursor (the moveInList law's landing,
     * same clamp semantics as [onGridFocusMoved]). */
    fun onRailFocusMoved(index: Int) {
        _state.value = _state.value.copy(
            railFocus = index.coerceIn(0, _state.value.libraries.lastIndex.coerceAtLeast(0)),
        )
    }

    /** Navigate into a series: its episodes, in narrative order, then the
     * best-effort positions walk for the episode rows' in-progress bars.
     * The rows render as soon as the episodes land; the bars arrive with
     * the progress walk. The grid cursor PARKS — untouched — so Back
     * restores the exact card; the episode cursor starts at the first row. */
    suspend fun openSeries(series: SeriesDto) {
        _state.value = _state.value.copy(
            selectedSeries = series,
            episodes = emptyList(),
            positions = emptyMap(),
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
            _state.value = _state.value.copy(positions = loadPositions(episodes))
        } catch (e: Exception) {
            fail(MESSAGE_EPISODES, e)
        }
    }

    /** Back from the series page to the grid — [BrowseState.gridFocus] is
     * deliberately NOT reset: restoring the prior focus position is the law
     * (BackRestorationTest). */
    fun closeSeries() {
        _state.value =
            _state.value.copy(selectedSeries = null, episodes = emptyList(), positions = emptyMap())
    }

    /** The D-pad moved the grid cursor (5.9): the law's computed position
     * lands here and drives which card holds focus. Clamped to the LIVE
     * body's rows (the module-keyed law — serial walks series, tv/image
     * walk the items stream) so a shrunken list never aims past the end. */
    fun onGridFocusMoved(index: Int) {
        val rows = when (moduleOf(_state.value.libraryId)) {
            "tv", "image" -> _state.value.items.size
            else -> _state.value.series.size
        }
        _state.value = _state.value.copy(
            gridFocus = index.coerceIn(0, (rows - 1).coerceAtLeast(0)),
        )
    }

    /** The D-pad moved the episode cursor (same law, list semantics). */
    fun onEpisodeFocusMoved(index: Int) {
        _state.value = _state.value.copy(
            episodeFocus = index.coerceIn(0, _state.value.episodes.lastIndex.coerceAtLeast(0)),
        )
    }

    /**
     * The player-exit refresh law: re-fetch the parked body (the
     * module-keyed law — serial's series rows, tv/image's stream from its
     * top) and, when a series page is open, its episodes — progress/watched
     * surfaces are current without a manual reload. Rows stay on screen
     * while the re-fetch runs (no loading churn, no error wipe on success).
     */
    suspend fun refresh() {
        val current = _state.value
        if (current.libraryId == null) {
            enter()
            return
        }
        try {
            val service = apiFor()
            val selected = current.selectedSeries
            if (selected != null) {
                val series = service.series(current.libraryId).items
                _state.value = current.copy(series = series, error = null)
                val episodes = service.episodes(selected.id).items
                _state.value = _state.value.copy(episodes = episodes)
                _state.value = _state.value.copy(positions = loadPositions(episodes))
            } else {
                when (moduleOf(current.libraryId)) {
                    "serial" -> {
                        val series = service.series(current.libraryId).items
                        _state.value = current.copy(series = series, error = null)
                    }
                    "tv", "image" -> {
                        val (pathPrefix, topLevel) = folderFilter(current.folder)
                        val items = service.items(
                            current.libraryId,
                            pathPrefix = pathPrefix,
                            topLevel = topLevel,
                            limit = PAGE_SIZE,
                            offset = 0,
                        ).items
                        _state.value = current.copy(
                            items = items,
                            itemsOffset = 0,
                            itemsExhausted = items.size < PAGE_SIZE,
                            error = null,
                        )
                    }
                    else -> {}
                }
            }
        } catch (e: Exception) {
            fail(MESSAGE_REFRESH, e)
        }
    }

    /**
     * The episode rows' stored positions (task 2.2 — the progress wire the
     * player's resume already reads): one best-effort GET per served episode
     * row. A 404 IS the never-started episode — the honest absence; any
     * other failure degrades to a bar-less row, never an error, never a
     * placeholder. A 401 anywhere still routes through the app shell (the
     * 401-anywhere law).
     */
    private suspend fun loadPositions(episodes: List<ItemDto>): Map<String, Long> {
        if (episodes.isEmpty()) return emptyMap()
        val service = apiFor()
        val loaded = mutableMapOf<String, Long>()
        for (episode in episodes) {
            try {
                loaded[episode.id] = service.progress(episode.id).positionSeconds
            } catch (e: HttpException) {
                if (e.code() == 401) {
                    onUnauthorized()
                    return emptyMap()
                }
                // 404 = never started; anything else — this row renders
                // without its bar
            } catch (_: Exception) {
                // best-effort: this row renders without its bar
            }
        }
        return loaded
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
        /** The items stream's page size (the server's own default, listItems
         * parsePagination; the SPA PAGE_SIZE law). */
        const val PAGE_SIZE = 50

        const val MESSAGE_NO_LIBRARIES = "Библиотек не найдено"
        const val MESSAGE_LIBRARIES = "Не удалось загрузить библиотеки — проверьте сервер"
        const val MESSAGE_EPISODES = "Не удалось загрузить эпизоды"
        const val MESSAGE_REFRESH = "Не удалось обновить данные"
        const val MESSAGE_SWITCH = "Не удалось открыть коллекцию"
        const val MESSAGE_ITEMS = "Не удалось загрузить элементы"
    }

    /** The append trigger's in-flight guard (idempotency, [extendItems]). */
    private var extending = false
}
