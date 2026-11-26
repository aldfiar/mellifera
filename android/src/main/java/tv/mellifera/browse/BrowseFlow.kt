package tv.mellifera.browse

import androidx.compose.ui.graphics.Color
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import retrofit2.HttpException
import tv.mellifera.net.FacetDto
import tv.mellifera.net.FolderDto
import tv.mellifera.net.ItemDto
import tv.mellifera.net.LibraryDto
import tv.mellifera.net.LibrarySummaryResponse
import tv.mellifera.net.MelliferaApi
import tv.mellifera.net.SeriesDto
import tv.mellifera.ui.dotAudio
import tv.mellifera.ui.dotImage
import tv.mellifera.ui.dotSerial
import tv.mellifera.ui.dotTv

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
 * .dot-*, read from the ui token home): one pastel per module_id, tinting
 * the card's ✓ glyph; the in-progress bar reads its own fill/track tokens;
 * an unknown id falls to the
 * SPA's default dot pastel (the watched-mark color — type-agnostic), never
 * a blank. State colors ride this pastel map; `tvAccent` is not part of it —
 * it marks the selected card's name tint in browse.
 */
internal fun typeAccent(moduleId: String): Color = when (moduleId) {
    "serial" -> dotSerial
    "tv" -> dotTv
    "image" -> dotImage
    "audio" -> dotAudio
    else -> DEFAULT_TYPE_ACCENT
}

/** The SPA's default dot pastel (styles/index.css .watched-mark) — the
 * token-home [tv.mellifera.ui.dotAudio]. */
internal val DEFAULT_TYPE_ACCENT = dotAudio

/**
 * The browse session state: the served collections, the current collection's
 * series grid, and the open series' episodes. [selectedSeries] non-null IS
 * the series page (the when-shell never gains a third Screen — the player
 * is an overlay on any of these, D1). The focus cursors ([gridFocus],
 * [episodeFocus]) live here so Back restores the exact prior position —
 * the classic TV failure mode (grid restarts at 0) is pinned by
 * nav/BackRestorationTest (5.9). The collections rail (5.15) rides the same
 * state: [isRailOpen] IS the rail (an open rail takes Back before the series
 * page — the BackHandler chain's first link), [railFocus] walks the rows so
 * reopening lands on the current collection, and [summaries] holds the
 * rail's per-collection counts, populated by [BrowseFlow.loadSummaries]; an
 * absent entry IS the count-less row (not fetched or failed — never a
 * placeholder).
 */
data class BrowseState(
    val isLoading: Boolean = false,
    val error: String? = null,
    val libraries: List<LibraryDto> = emptyList(),
    val libraryId: Long? = null,
    val series: List<SeriesDto> = emptyList(),
    val selectedSeries: SeriesDto? = null,
    val episodes: List<ItemDto> = emptyList(),
    val gridFocus: Int = 0,
    val episodeFocus: Int = 0,
    val isRailOpen: Boolean = false,
    val railFocus: Int = 0,
    /**
     * The rail-close restore's owner (task 3.2): true when the rail was
     * opened from a home row's LEFT at row-0 x=0, so the HOME rows' cursor
     * re-requests on the close and the grid's restore stands down — the
     * opener's exact cursor comes back (L3), never a two-surface focus
     * race. Set by every [openRail]; read only by the two surfaces'
     * restore effects, never by the walkers.
     */
    val shouldRestoreHome: Boolean = false,
    /**
     * True once a collection body was EXPLICITLY opened — the shared
     * activation commit ([selectLibrary]'s success, task 8.8: EVERY path
     * that renders the body as the active surface raises it there, the
     * anchor path alongside the rail-row OK): the body is a route over the
     * home rows (the SPA parity — the web Collection is a route), and the
     * body-open Back closes it onto the rows. Task 15.2 made the law
     * STRUCTURAL: [enter] loads no body at all, so isBodyOpen=true ⇒ an
     * explicit activation ran — there is no unopened default body left to
     * carve out. Cleared by [closeBody] — the only false transition; the
     * walkers never read it.
     */
    val isBodyOpen: Boolean = false,
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
    /**
     * The serial body's served facet aggregates (task 10.1 — GET
     * /libraries/{id}/facets): ONE best-effort fetch per serial-grid load
     * site ([loadFacets]); a failed read leaves the lane empty-chipped,
     * never an error, never a dead grid.
     */
    val facets: List<FacetDto> = emptyList(),
    /**
     * The active facet conjuncts (task 10.1), facet key → picked value —
     * ONE conjunct value per key (genre/kind/status), AND across keys,
     * riding /series' query ([loadSerialGrid]). A key's absence IS its
     * cleared state ([toggleFacet] is the only writer).
     */
    val facetSelection: Map<String, String> = emptyMap(),
    /** The paged stream's current offset. */
    val itemsOffset: Int = 0,
    /** True once a page came back short — the append trigger stands down
     * (the honest end-of-stream, never an empty extra request). */
    val isStreamExhausted: Boolean = false,
    /** The folder-chips row's cursor; -1 = no chip holds focus (the
     * D12 chips row — its Back and the L2 crossings read this). */
    val chipFocus: Int = -1,
    /**
     * The grid re-focus nonce (the chips row's Back → grid, D12): a bump
     * re-requests the parked cursor's card. The walkers never read it.
     */
    val gridFocusNonce: Int = 0,
    /**
     * The photo viewer's open index into [items] (task 8.13 — the
     * operator-reported gap: OK on a photo tile opened nothing); null = the
     * viewer is closed. The viewer is MODAL — it holds the focus and eats
     * the dpad — so nothing else can move the body beneath it; the viewer's
     * own moves walk the LOADED rows only ([movePhoto]'s bounds law). Any
     * body-content swap (selectLibrary's commit, pickFolder's restart)
     * closes it — never a viewer pointing into a replaced stream.
     */
    val photoIndex: Int? = null,
)

/**
 * The browse flow (5.6): fetch-on-navigate and the player-exit refresh law.
 *
 * - Entering browse fetches /libraries and keeps ALL served collections in
 *   served order (5.14 — the SPA-parity law; the serial+tv client filter is
 *   retired). NO body loads at entry (task 15.2's clean-entry law) — the
 *   first body fetches at the first explicit activation.
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
     * The rail-OK body swap (task 8.3's visible-swap law): TWO one-shot
     * signals per SUCCESSFUL [activateRailRow], in a pinned order — the
     * commit-time emit at the [selectLibrary] commit and the post-load
     * re-emit after the body fetch resolves (task 8.5's determinism law:
     * one signal after the await is not enough — walkG-debug caught a
     * started-and-never-completed swap on a no-focus entry home, 0/3 legs
     * landing). The UI actuator reads them to bring the opened body's top
     * INTO VIEW (the SPA's page shape: the user SEES the body they opened).
     * A one-shot FLOW, not a state field: a state nonce would re-fire on
     * every fresh composition of the browse content (Back from the series
     * page), racing the restored cursor with a stale page jump. A plain
     * rail close emits nothing — the close restores the parked cursor. A
     * FAILED activation emits only the commit-time signal (the fetch fails
     * after the commit); the RE-emit rides success alone — the failure
     * keeps the rail (the 4.3 keep-focus law).
     */
    private val _bodySwaps = MutableSharedFlow<Unit>(extraBufferCapacity = 4)
    val bodySwaps: SharedFlow<Unit> = _bodySwaps

    /**
     * Navigate into browse: /libraries alone (task 15.2's clean-entry law —
     * the operator directive «each collection enter should clean previous
     * collection data»). The entry surface is the home rows; [libraryId]
     * adopts the first served collection (the rail's selected marker and
     * [refresh]'s target) but NO body loads — the first body fetches at the
     * first explicit activation ([selectLibrary]). A closed rail fires no
     * summary requests, so this single request is the whole entry walk.
     */
    suspend fun enter() {
        _state.value = BrowseState(isLoading = true)
        // The body-lifecycle bump (task 15.4): the reset commits a fresh
        // browse session — every in-flight write of the previous one drops.
        bodyEpoch += 1
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
            )
        } catch (e: Exception) {
            fail(MESSAGE_LIBRARIES, e)
        }
    }

    /**
     * The collection switch (5.14): fetch-on-navigate over the module-keyed
     * body law (D6) — a new collection is a fresh body, so the cursors
     * reset to 0 AND the prior collection's series page closes with it
     * (task 8.9's fresh-body law: [selectedSeries], [episodes] and
     * [positions] belong to the OLD collection — the switch lands the new
     * body, never the old collection's episode page over it). On failure
     * the honest RU error surfaces and the PRIOR body stays: rows, cursors,
     * libraryId and the open series page revert (the flow's failure law —
     * whatever was on screen is kept, never wiped by a failed fetch).
     * Returns whether the body actually opened — the rail-OK law reads it
     * ([activateRailRow] keeps the rail open when it is false). A
     * SUCCESSFUL switch is the SHARED explicit-activation commit (task
     * 8.8): [BrowseState.isBodyOpen] rises here, so every path that opens a
     * collection body through this fetch-bearing seam holds the opened
     * body's Back law; a FAILED switch reverts and raises nothing — the
     * prior body keeps its own [BrowseState.isBodyOpen].
     */
    suspend fun selectLibrary(libraryId: Long): Boolean {
        val prior = _state.value
        _state.value = prior.copy(
            libraryId = libraryId,
            isLoading = true,
            error = null,
            gridFocus = 0,
            series = emptyList(),
            selectedSeries = null,
            episodes = emptyList(),
            positions = emptyMap(),
            items = emptyList(),
            folders = emptyList(),
            folder = null,
            facets = emptyList(),
            facetSelection = emptyMap(),
            itemsOffset = 0,
            isStreamExhausted = false,
            chipFocus = -1,
            photoIndex = null,
        )
        // The body-lifecycle bump (task 15.4): THIS commit starts the new
        // body — every in-flight write of the previous collection is now
        // stale and will drop at its own capture/check. The capture rides
        // the bump: the failure revert below compares against it (Q12).
        bodyEpoch += 1
        val epoch = bodyEpoch
        // The commit-time swap signal (task 8.5): the visible swap must not
        // wait out the body fetch — walkG-debug proved fetch latency is NOT
        // the killer (a 1972ms fetch still never landed), but a swap that
        // starts only after the await leaves the no-focus home on screen
        // for the whole load. Firing at the commit brings the body page
        // INTO VIEW immediately; the post-load RE-emit in [activateRailRow]
        // lands the top once the rows are in.
        _bodySwaps.tryEmit(Unit)
        try {
            loadBody(libraryId)
            // The shared explicit-activation raise (task 8.8 — the walk36
            // leg D trap): isBodyOpen was raised ONLY by the rail-row OK's
            // own commit, so an activation that rode THIS fetch-bearing
            // path without the rail left the body the active surface with
            // the BackHandler chain fully disabled — ONE BACK exited to
            // the launcher. The raise lives at the ONE commit every
            // explicit activation shares; post-15.2 the law is structural
            // ([enter] loads no body, so isBodyOpen=true ⇒ an explicit
            // activation) and [closeBody]'s clear stays the only false
            // transition.
            _state.value = _state.value.copy(isBodyOpen = true)
            return true
        } catch (e: Exception) {
            // The stale-revert law (task 15.4, surveyor Q12): a later commit
            // owns the body now — the revert AND its error surface drop; the
            // fast B→C double-switch lands C, never A's rows or libraryId.
            if (bodyEpoch != epoch) return false
            _state.value = _state.value.copy(
                libraryId = prior.libraryId,
                gridFocus = prior.gridFocus,
                series = prior.series,
                selectedSeries = prior.selectedSeries,
                episodes = prior.episodes,
                positions = prior.positions,
                items = prior.items,
                folders = prior.folders,
                folder = prior.folder,
                facets = prior.facets,
                facetSelection = prior.facetSelection,
                itemsOffset = prior.itemsOffset,
                isStreamExhausted = prior.isStreamExhausted,
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
                val epoch = bodyEpoch
                loadFacets(libraryId)
                val series = loadSerialGrid(libraryId)
                // The stale-lane law (task 15.4): a later commit owns the
                // body — the old activation's grid commit drops (a fast
                // B→C double-switch lands C's rows only).
                if (bodyEpoch != epoch) return
                _state.value = _state.value.copy(series = series, isLoading = false)
            }
            "tv" -> loadItems(libraryId, folder = null, offset = 0)
            "image" -> {
                loadFolders(libraryId)
                loadItems(libraryId, folder = null, offset = 0)
            }
            else -> _state.value = _state.value.copy(isLoading = false)
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
        val epoch = bodyEpoch
        val page = apiFor().items(
            libraryId,
            pathPrefix = pathPrefix,
            topLevel = topLevel,
            limit = PAGE_SIZE,
            offset = offset,
        ).items
        // The body-epoch guard (task 15.4): this write covers loadBody's
        // tv/image legs, pickFolder's restart and extendItems' append — a
        // commit during the await drops it, so A's page never appends under
        // B's header (the append-bleed interleaving).
        if (bodyEpoch != epoch) return
        _state.value = _state.value.copy(
            items = if (offset == 0) page else _state.value.items + page,
            itemsOffset = offset,
            isStreamExhausted = page.size < PAGE_SIZE,
            isLoading = if (offset == 0) false else _state.value.isLoading,
        )
    }

    /**
     * The image body's folder rows (the chips' counts, D6): best-effort — a
     * failed read degrades to the bare [Все] chip, never an error. A 401
     * still routes through the app shell (the 401-anywhere law).
     */
    private suspend fun loadFolders(libraryId: Long) {
        try {
            val epoch = bodyEpoch
            val folders = apiFor().libraryFolders(libraryId).folders
            // The stale-lane law (task 15.4): a later commit owns the body —
            // a previous slow activation's folder rows drop.
            if (bodyEpoch != epoch) return
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
     * The serial grid's rows (task 10.1): /series with the ACTIVE facet
     * conjuncts riding the query — ONE value per key, AND across keys (the
     * server intersects the id-sets); an absent key stays off the wire.
     */
    private suspend fun loadSerialGrid(libraryId: Long): List<SeriesDto> {
        val selection = _state.value.facetSelection
        return apiFor().series(libraryId, selection["genre"], selection["kind"], selection["status"]).items
    }

    /**
     * The serial body's facet aggregates (task 10.1): best-effort — a
     * failed read leaves the facet lane empty-chipped and never kills the
     * grid; a 401 still routes through the app shell (the 401-anywhere
     * law). Rides EVERY serial-grid load site ([loadBody]'s serial branch
     * and [refresh]'s two serial legs).
     */
    private suspend fun loadFacets(libraryId: Long) {
        try {
            val epoch = bodyEpoch
            val facets = apiFor().facets(libraryId).facets
            // The stale-lane law (task 15.4): a later commit owns the body —
            // a previous slow activation's facet lane drops.
            if (bodyEpoch != epoch) return
            _state.value = _state.value.copy(facets = facets)
        } catch (e: HttpException) {
            if (e.code() == 401) {
                onUnauthorized()
                return
            }
            // best-effort: the lane renders no chips
        } catch (_: Exception) {
            // best-effort: the lane renders no chips
        }
    }

    /**
     * The facet lane's pick (task 10.1): the active value again CLEARS that
     * key, a different value SETS it — ONE conjunct per key, AND across
     * keys — and every change refetches the serial grid with the current
     * params (the [pickFolder] commit/restart idiom MINUS the revert: a
     * facet toggle is immediate — the selection stands and the honest error
     * surfaces over the cleared grid when the refetch fails).
     */
    suspend fun toggleFacet(key: String, value: String) {
        val current = _state.value
        val libraryId = current.libraryId ?: return
        val selection =
            if (current.facetSelection[key] == value) current.facetSelection - key
            else current.facetSelection + (key to value)
        _state.value = current.copy(
            facetSelection = selection,
            isLoading = true,
            error = null,
            gridFocus = 0,
            series = emptyList(),
        )
        try {
            val epoch = bodyEpoch
            val series = loadSerialGrid(libraryId)
            // The stale-lane law (task 15.4): a commit during the refetch
            // owns the body — the old pick's landing drops.
            if (bodyEpoch != epoch) return
            _state.value = _state.value.copy(series = series, isLoading = false)
        } catch (e: Exception) {
            fail(MESSAGE_FACETS, e)
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
            isLoading = true,
            error = null,
            gridFocus = 0,
            items = emptyList(),
            itemsOffset = 0,
            isStreamExhausted = false,
            photoIndex = null,
        )
        val epoch = bodyEpoch
        try {
            loadItems(libraryId, path, offset = 0)
        } catch (e: Exception) {
            // The stale-revert law (task 15.4, Q12): a commit during the
            // restart owns the body — the revert AND its error surface drop.
            if (bodyEpoch != epoch) return
            _state.value = _state.value.copy(
                folder = prior.folder,
                items = prior.items,
                itemsOffset = prior.itemsOffset,
                isStreamExhausted = prior.isStreamExhausted,
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
        if (current.isStreamExhausted || current.isLoading || extending) return
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

    /** The photo viewer opened on the tile at [index] (task 8.13). A
     * out-of-bounds index is a no-op — the viewer only opens on a loaded
     * row. */
    fun openPhoto(index: Int) {
        if (index < 0 || index >= _state.value.items.size) return
        _state.value = _state.value.copy(photoIndex = index)
    }

    /**
     * The viewer's prev/next (task 8.13): [step] ±1 within the LOADED rows —
     * at either end the index stays (the viewer is modal, there is nothing
     * to cross to; the key stays consumed, the picture stays).
     */
    fun movePhoto(step: Int) {
        val index = _state.value.photoIndex ?: return
        val next = index + step
        if (next < 0 || next >= _state.value.items.size) return
        _state.value = _state.value.copy(photoIndex = next)
    }

    /**
     * The viewer closed (its BACK — task 8.13's close law): the index
     * clears, the body's filter/cursor are untouched, and the grid's
     * re-focus nonce bumps so the parked tile re-lands deterministically —
     * the grid stays composed under the modal viewer, so the nonce
     * actuator's one-shot request targets an ATTACHED node (the 8.11 drop
     * class needs a mid-swap mount; this close has none).
     */
    fun closePhoto() {
        if (_state.value.photoIndex == null) return
        _state.value = _state.value.copy(
            photoIndex = null,
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
     * restore law reads [BrowseState.shouldRestoreHome]. Idempotent: an
     * already-open rail neither moves the focus nor re-fires the summaries.
     */
    suspend fun openRail(fromHome: Boolean = false) {
        val current = _state.value
        if (current.isRailOpen) return
        val focus = current.libraries.indexOfFirst { it.id == current.libraryId }.coerceAtLeast(0)
        _state.value = current.copy(
            isRailOpen = true,
            railFocus = focus,
            shouldRestoreHome = fromHome,
        )
        loadSummaries()
    }

    /**
     * The rail-close law (LEFT or Back anywhere in the rail): only the rail
     * closes — [BrowseState.gridFocus] is deliberately NOT touched, so the
     * grid re-renders with the exact prior cursor (the no-restart law).
     */
    fun closeRail() {
        _state.value = _state.value.copy(isRailOpen = false)
    }

    /**
     * The opened collection body's Back (task 8.7's route parity + task
     * 15.2's clean law — the operator directive «each collection enter
     * should clean previous collection data»): close + CLEAR. [BrowseState.isBodyOpen]
     * falls (the NEXT Back from the restored home rows is the app's own
     * exit) and [BrowseState.shouldRestoreHome] rises — the SAME flag the
     * rail close rides — so HomeRows' restore actuator re-lands the parked
     * home cursor, whose focus→scroll actuator carries the viewport back to
     * the rows. The TWELVE body fields reset to fresh-body defaults (series/
     * items/folders/facets empty, facetSelection empty, folder null,
     * itemsOffset 0, stream not exhausted, chip cursor -1, photo viewer
     * closed, grid cursor 0, positions empty): the minimal state law (audit
     * §B) — a closed body leaves nothing behind, so the next activation is
     * a genuinely fresh body («DOWN re-enters the same body» is retired;
     * the body is unreachable while closed — BrowseScreen mounts it only
     * while [BrowseState.isBodyOpen]). KEPT: [BrowseState.libraryId] (the
     * rail's selected marker, openRail's focus law and [refresh]'s target),
     * [BrowseState.summaries] and [BrowseState.railFocus]. selectedSeries/
     * episodes are unreachable here — the series BackHandler closes them
     * first. Guarded: a body that was never opened stages no restore (Back
     * there is the app's own exit, D12's grid law). No fetch — a pure
     * state flip.
     */
    fun closeBody() {
        val current = _state.value
        if (!current.isBodyOpen) return
        _state.value = current.copy(
            isBodyOpen = false,
            shouldRestoreHome = true,
            series = emptyList(),
            items = emptyList(),
            folders = emptyList(),
            facets = emptyList(),
            facetSelection = emptyMap(),
            folder = null,
            itemsOffset = 0,
            isStreamExhausted = false,
            chipFocus = -1,
            photoIndex = null,
            gridFocus = 0,
            positions = emptyMap(),
        )
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
        if (!current.isRailOpen) return false
        val library = current.libraries.getOrNull(current.railFocus) ?: return false
        val opened = selectLibrary(library.id)
        if (opened) {
            _state.value = _state.value.copy(
                isRailOpen = false,
                // The body is now an OPENED one: [BrowseState.isBodyOpen]
                // already rose at the shared selectLibrary commit (task
                // 8.8) — no second flag-set here.
                // The activation close restores NOTHING (walk34, task 8.4):
                // the cursor moves INTO the opened body (4.3's re-land
                // below) — a cleared [BrowseState.shouldRestoreHome] stands
                // HomeRows' restore effect down, so its focus→scroll
                // actuator cannot drag the viewport back onto the home rows
                // over the body-top swap. Only the LEFT/RIGHT/BACK closes
                // ([closeRail]) keep the restore.
                shouldRestoreHome = false,
                gridFocusNonce = _state.value.gridFocusNonce + 1,
            )
            // The visible-swap law (tasks 8.3 + 8.5): the POST-LOAD re-emit
            // — the commit-time emit already fired at the [selectLibrary]
            // commit; this second signal lands the body top now that the
            // rows are in, so the swap completes deterministically whatever
            // the entry home's focus state was.
            _bodySwaps.tryEmit(Unit)
        }
        return opened
    }

    /**
     * The D-pad moved the rail cursor (the moveInList law's landing, the
     * same clamp-to-the-walker's-count semantics as [onGridFocusMoved]).
     * The rail walk's count is the served libraries PLUS the fixed settings
     * row (18.3): the settings index (libraries.size) is walkable state —
     * the walk lands on it and clamps inside it — but never an activatable
     * library ([activateRailRow]'s getOrNull guard refuses the virtual
     * index; the overlay opens at the composition site instead).
     */
    fun onRailFocusMoved(index: Int) {
        _state.value = _state.value.copy(
            railFocus = index.coerceIn(0, _state.value.libraries.size.coerceAtLeast(0)),
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
            isLoading = true,
            error = null,
            episodeFocus = 0,
        )
        try {
            val epoch = bodyEpoch
            val episodes = apiFor().episodes(series.id).items
            // The stale-page law (task 15.4): a switch committed during the
            // fetch — the OLD collection's series page never opens over the
            // new body (the resurrection interleaving).
            if (bodyEpoch != epoch) return
            _state.value = _state.value.copy(
                selectedSeries = series,
                episodes = episodes,
                isLoading = false,
            )
            // The positions write follows the loadPositions loop await —
            // capture again before the walk, check at the write (Q12).
            val posEpoch = bodyEpoch
            val positions = loadPositions(episodes)
            if (bodyEpoch != posEpoch) return
            _state.value = _state.value.copy(positions = positions)
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
            // The body-epoch guard (task 15.4): the player-exit refresh is
            // the same stale-write class after its awaits — every body write
            // below drops when a commit superseded the body it targeted.
            val epoch = bodyEpoch
            val service = apiFor()
            val selected = current.selectedSeries
            if (selected != null) {
                loadFacets(current.libraryId)
                val series = loadSerialGrid(current.libraryId)
                if (bodyEpoch != epoch) return
                _state.value = _state.value.copy(series = series, error = null)
                val episodes = service.episodes(selected.id).items
                if (bodyEpoch != epoch) return
                _state.value = _state.value.copy(episodes = episodes)
                val posEpoch = bodyEpoch
                val positions = loadPositions(episodes)
                if (bodyEpoch != posEpoch) return
                _state.value = _state.value.copy(positions = positions)
            } else {
                when (moduleOf(current.libraryId)) {
                    "serial" -> {
                        loadFacets(current.libraryId)
                        val series = loadSerialGrid(current.libraryId)
                        if (bodyEpoch != epoch) return
                        _state.value = _state.value.copy(series = series, error = null)
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
                        // Checked against the CAPTURED state's copy too: the
                        // write builds from `current`, so a stale landing
                        // would also revert intermediate field changes.
                        if (bodyEpoch != epoch) return
                        _state.value = current.copy(
                            items = items,
                            itemsOffset = 0,
                            isStreamExhausted = items.size < PAGE_SIZE,
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
            _state.value = _state.value.copy(isLoading = false, error = null)
        } else {
            _state.value = _state.value.copy(isLoading = false, error = message)
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
        const val MESSAGE_FACETS = "Не удалось применить фильтр"
    }

    /** The append trigger's in-flight guard (idempotency, [extendItems]). */
    private var extending = false

    /**
     * The body-epoch race guard (audit S-3, task 15.4 — design §D): [enter]'s
     * reset commit and [selectLibrary]'s commit each bump this counter —
     * the commit IS the body-lifecycle boundary. EVERY body-write site
     * captures the epoch BEFORE its await and drops the write (plain return)
     * when it no longer matches, so an in-flight write from a previous body
     * (the append bleed, the series-page resurrection, the stale lanes, a
     * superseded failure revert — surveyor Q12) never lands under or over
     * the new body. No cancellation, no single-flight — this check IS the
     * guard; no state/UI surface carries it (the UI never reads it).
     */
    private var bodyEpoch = 0L
}
