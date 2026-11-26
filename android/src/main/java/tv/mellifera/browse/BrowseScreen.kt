package tv.mellifera.browse

import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.ui.layout.ContentScale
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.KeyEvent
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import coil.compose.rememberAsyncImagePainter
import coil.request.ImageRequest
import kotlinx.coroutines.launch
import tv.mellifera.AppViewModel
import tv.mellifera.dpad.DpadKey
import tv.mellifera.dpad.isDirectional
import tv.mellifera.dpad.moveInGrid
import tv.mellifera.dpad.moveInList
import tv.mellifera.dpad.moveInRow
import tv.mellifera.dpad.toDpadKey
import tv.mellifera.home.entryLandsOnHome
import tv.mellifera.net.ItemDto
import tv.mellifera.net.SeriesDto
import tv.mellifera.ui.LocalGridPrefs
import tv.mellifera.ui.LocalUiScale
import tv.mellifera.ui.chipHeight
import tv.mellifera.ui.railPanelWidth
import tv.mellifera.ui.railRowHeight
import tv.mellifera.ui.SettingsOverlay
import tv.mellifera.ui.typeBody
import tv.mellifera.ui.typeDisplay
import tv.mellifera.ui.typeHeading
import tv.mellifera.ui.typeMeta
import tv.mellifera.ui.typeSmall
import tv.mellifera.ui.AppCanvas
import tv.mellifera.ui.chipActiveBg
import tv.mellifera.ui.chipActiveText
import tv.mellifera.ui.inProgressFill
import tv.mellifera.ui.inProgressTrack
import tv.mellifera.ui.railBorder
import tv.mellifera.ui.requestFocusSafely
import tv.mellifera.ui.tvAccent
import tv.mellifera.ui.tvFocusStyle
import tv.mellifera.ui.tvMuted
import tv.mellifera.ui.tvRailFocusStyle

/**
 * The browse surface (5.6): the serial+tv series grid and, one level down,
 * the open series' episode rows. Fetch-on-navigate runs on entry; the
 * player-exit refresh arrives through AppViewModel.onPlayerExit (5.7).
 * Every optional field renders through the DisplayCard model — a null
 * block renders NOTHING (the field-driven law, SeriesGrid.kt).
 *
 * Focus/key law (5.9): the grid and episode cursors live in BrowseState —
 * arrows route through the pure dpad law, the focused card carries the
 * accent-border + scale visual, and Back restores the exact prior grid
 * position (nav/BackRestorationTest). An arrow the law cannot satisfy
 * inside the surface is left UNCONSUMED, so Compose's focus search carries
 * it across rails (grid top row → settings) — with ONE exception (5.15):
 * the grid's left-edge LEFT arrow opens the collections rail instead of
 * crossing natively.
 */
/** The watched title's dim (design D2 — the SPA's .watched-dim, 0.55). */
internal const val WATCHED_DIM = 0.55f

/**
 * The photo tile's fill blur: strong enough that the fill reads
 * as atmosphere, never as a second image.
 */
private val PHOTO_FILL_BLUR = 16.dp

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun BrowseScreen(viewModel: AppViewModel) {
    val browse = viewModel.browse
    val state by browse.state.collectAsState()
    val appState by viewModel.state.collectAsState()
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) {
        browse.enter()
        viewModel.home.load()
    }
    val selected = state.selectedSeries
    BackHandler(enabled = selected != null) { browse.closeSeries() }
    // The chain's first link (5.15): an open rail takes Back BEFORE the
    // series page — this handler is composed after the series one, so it
    // wins when both are enabled. Closing keeps the grid's parked cursor.
    BackHandler(enabled = state.isRailOpen) { browse.closeRail() }
    // The chips row's Back (D12's dpad map): focus returns to the grid —
    // never a silent state wipe, the photo body's filter stays applied.
    BackHandler(enabled = selected == null && !state.isRailOpen && state.chipFocus >= 0) {
        browse.refocusGridFromChips()
    }
    // The opened collection body's Back (task 8.7 — the back-stack hole the
    // on-device walk found: with every prior handler disabled, ONE Back
    // here fell through to the Activity default and EXITED to the launcher).
    // The SPA route parity: the web Collection is a route, back returns
    // home — the body CLOSES + CLEARS onto the home rows (task 15.2's clean
    // law: closeBody resets the twelve body fields, the body unmounts
    // below), and the home rows' restore actuator re-lands the parked
    // cursor. Composed LAST in the chain: series, rail and chips-focused
    // Back keep their own laws; the enabler stays isBodyOpen.
    BackHandler(
        enabled = selected == null && !state.isRailOpen && state.chipFocus < 0 && state.isBodyOpen,
    ) {
        browse.closeBody()
    }
    // The photo viewer's Back (task 8.13): the modal viewer is Back's whole
    // act while open — composed after the body handler so it wins the chain;
    // the close clears the viewer and re-lands the parked tile (closePhoto's
    // law), never the body.
    BackHandler(enabled = state.photoIndex != null) { browse.closePhoto() }
    // The render-time session facts (5.13): the stored server base resolves
    // relative artwork paths, the device token authorizes OUR server's
    // artwork fetches (Api.kt's interceptor covers Retrofit only, not Coil).
    val serverBase = viewModel.serverAddress
    val token = appState.token
    // The settings overlay's open state: composition-local — the
    // rail stays open beneath it ([BrowseState.isRailOpen] untouched) and
    // BACK is the overlay's own BackHandler (it composes last in the
    // chain). The nonce re-arms the rail's focus actuator on dismiss: the
    // actuator's state keys cannot change across a state-less overlay, so
    // the dismiss bump is the re-land trigger (the gridFocusNonce idiom).
    var settingsOpen by remember { mutableStateOf(false) }
    var settingsFocusNonce by remember { mutableStateOf(0) }
    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
            if (selected != null) {
                // The series' served library row — the accent and the hero
                // breadcrumb's shared source (the same field-driven idiom the
                // rail rows and the body header read: no separate fetch, and
                // an unmatched library renders no breadcrumb).
                val library = state.libraries.firstOrNull { it.id == selected.libraryId }
                SeriesPage(
                    series = selected,
                    episodes = state.episodes,
                    positions = state.positions,
                    isLoading = state.isLoading,
                    focusIndex = state.episodeFocus,
                    accent = typeAccent(library?.moduleId ?: ""),
                    breadcrumbLabel = library?.let { moduleLabel(it.moduleId) },
                    serverBase = serverBase,
                    token = token,
                    onFocusMoved = { browse.onEpisodeFocusMoved(it) },
                    onPlay = { episode -> viewModel.playback.play(episode.id) },
                )
            } else {
                // The parity content column (design D13, task 8.2): the home
                // rows and the collection body sit in a CENTERED column —
                // the SPA tv shell's `max-width: min(92vw, 1800px)`
                // proportion. The rail overlay is NOT part of it: while the
                // rail is open the column offsets by the panel's width (the
                // rail-open offset law — the first card's left edge clears
                // the panel, never hides under it).
                ContentColumn(
                    railOffset = if (state.isRailOpen) railPanelWidth(LocalUiScale.current) else 0.dp,
                ) { columnWidth, bodyHeight ->
                    // The reachability law (task 8.3, the walk-found fix):
                    // the home column SCROLLS vertically — HomeRows + the
                    // body stack into one verticalScroll column, so the
                    // below-fold body renders and bring-into-view rides the
                    // focus moves. The body page gets the column's viewport
                    // height (bounded — a lazy grid cannot measure into a
                    // scrollable parent's infinite axis), so once its top
                    // lands at the viewport top the whole body IS the visible
                    // page (the SPA's page shape).
                    val scrollState = rememberScrollState()
                    // The visible-swap actuator (task 8.3, hardened by 15.3's
                    // body-top landing law): a rail-OK body swap brings the
                    // body's top INTO VIEW — the activation is a VISIBLE swap
                    // (the user SEES the body they opened), never an invisible
                    // focus land below the fold. The actuation RE-ARMS until
                    // the landing holds (swapUntilLanded) — a bringIntoView
                    // fired mid-remount no-ops against the detached grid, and
                    // the one-shot drop left ledger #24's inert swap-scroll
                    // leg.
                    val bodyIntoView = remember { BringIntoViewRequester() }
                    LaunchedEffect(Unit) {
                        browse.bodySwaps.collect {
                            swapUntilLanded(bodyIntoView, scrollState)
                        }
                    }
                    Column(
                        // The bottom headroom retires the walk-measured 27px
                        // home sliver above the body: end-of-scroll may
                        // now rest one [PARITY_OVERSCAN_Y] past the body's top
                        // edge, and the body's own top overscan absorbs it —
                        // the body lands at y=0 with no scroll range left for
                        // the home rows to peek into.
                        modifier = Modifier
                            .fillMaxSize()
                            .verticalScroll(scrollState)
                            .padding(bottom = PARITY_OVERSCAN_Y),
                    ) {
                        // The home surface (design D4, task 3.2): the served
                        // Continue/Next-up rows above the collection body — an
                        // empty served array renders no row (L1). Its fetch rides
                        // the same on-navigate round-trip window as browse.enter().
                        val homeState by viewModel.home.state.collectAsState()
                        // The entry-destination verdict (task 8.15): while the
                        // home surface holds (or is still fetching toward) a
                        // focusable card, the grid's entry actuator stands
                        // down — the home rows' first card takes the entry.
                        val homeHoldsEntry = entryLandsOnHome(homeState)
                        HomeRows(
                            home = homeState,
                            isRailOpen = state.isRailOpen,
                            shouldRestoreHome = state.shouldRestoreHome,
                            libraries = state.libraries,
                            viewportHeight = bodyHeight,
                            serverBase = serverBase,
                            token = token,
                            onContinueFocusMoved = { viewModel.home.onContinueFocusMoved(it) },
                            onNextUpFocusMoved = { viewModel.home.onNextUpFocusMoved(it) },
                            onResume = { itemId -> viewModel.playback.play(itemId) },
                            onNext = { itemId -> viewModel.playback.play(itemId) },
                            onOpenRail = { scope.launch { browse.openRail(fromHome = true) } },
                        )
                        // The body mounts ONLY while it is open (task 15.2's
                        // clean law, one visual state — one state meaning):
                        // closeBody cleared the body cluster, so a
                        // still-mounted body would render the operator-
                        // rejected hybrid shape (home rows over a stale
                        // body — the on-device md5 28c2f029, fingerprint
                        // class home-with-mounted-body). Closed, the entry
                        // surface is the bare home rows alone.
                        if (state.isBodyOpen) {
                            SeriesGrid(
                                state = state,
                                columnWidth = columnWidth,
                                bodyHeight = bodyHeight,
                                intoView = bodyIntoView,
                                homeHoldsEntry = homeHoldsEntry,
                                onOpen = { series -> scope.launch { browse.openSeries(series) } },
                                onPlay = { itemId -> viewModel.playback.play(itemId) },
                                onFocusMoved = { browse.onGridFocusMoved(it) },
                                onOpenRail = { scope.launch { browse.openRail() } },
                                onExtendItems = { scope.launch { browse.extendItems() } },
                                onChipFocused = { browse.onChipFocusMoved(it) },
                                onChipsLeft = { browse.clearChipFocus() },
                                onPickFolder = { path -> scope.launch { browse.pickFolder(path) } },
                                onToggleFacet = { key, value -> scope.launch { browse.toggleFacet(key, value) } },
                                onPhotoOpened = { browse.openPhoto(it) },
                                serverBase = serverBase,
                                token = token,
                            )
                        }
                    }
                }
            }
        }
        // The collections rail (5.15): slides in at the screen's left edge —
        // the content column offsets aside while it is open (the
        // ContentColumn railOffset law), so nothing hides under the panel.
        // It is a rail of the Browse surface — never a third Screen (the
        // when-shell law, ui/App.kt). Focus crosses INTO the rail's rows on
        // open (the current-collection row holds it); OK enters the focused
        // row's collection body, and when that body cannot open the rail
        // STAYS OPEN with its focus kept (the walk-found 4.3 law — never a
        // focus-less surface); LEFT, RIGHT or Back close it with the
        // content's prior focus position intact.
        AnimatedVisibility(
            visible = state.isRailOpen && selected == null,
            enter = slideInHorizontally(initialOffsetX = { -it }),
            exit = slideOutHorizontally(targetOffsetX = { -it }),
        ) {
            CollectionsRail(
                state = state,
                settingsFocusNonce = settingsFocusNonce,
                // The rail row's OK (design D12's "select+close", task 4.3):
                // the focused row's body opens and the rail closes into it;
                // a body that cannot open keeps the rail open with its focus
                // (the activation law, BrowseFlow.activateRailRow). The fixed
                // settings row is NOT a library — its OK lands here instead:
                // open the overlay, never a collection body.
                onSelect = { scope.launch { browse.activateRailRow() } },
                onOpenSettings = { settingsOpen = true },
                onClose = { browse.closeRail() },
                onFocusMoved = { browse.onRailFocusMoved(it) },
            )
        }
        // The settings overlay: composed after the rail so its
        // BackHandler sits at the chain's top — while it is open, BACK's
        // whole act is the close (the standard overlay law). The dismiss
        // bumps the nonce that re-lands the rail's focus on the settings
        // row (the rail-focus-restore law extended to the new index).
        if (settingsOpen) {
            SettingsOverlay(
                prefs = viewModel.uiPrefs,
                viewModel = viewModel,
                onDismiss = {
                    settingsOpen = false
                    settingsFocusNonce++
                },
            )
        }
        // The photo viewer (task 8.13): a MODAL full-screen surface over the
        // whole browse tree — index-checked against the loaded rows so a
        // stale index (a body swapped mid-view is a state-law impossibility,
        // belt-and-suspenders anyway) renders nothing rather than a broken
        // viewer.
        val photoIndex = state.photoIndex
        if (photoIndex != null && photoIndex < state.items.size) {
            val item = state.items[photoIndex]
            PhotoViewer(
                artwork = resolveArtworkUrl(serverBase, item.toPhotoViewerUrl()),
                token = token,
                index = photoIndex,
                count = state.items.size,
                document = item.document,
                onDismiss = { browse.closePhoto() },
                onMove = { step -> browse.movePhoto(step) },
            )
        }
    }
}

/**
 * The rail-open offset's width law: while the collections rail is open the
 * column's fraction reads the REDUCED width — the screen minus the panel's
 * [railOffset] ([railPanelWidth] at the active scale) — so the rendered
 * column never overflows past the right edge and the grid plans
 * ([gridPlan]'s W) against exactly the width that renders. A closed rail
 * passes offset 0 and this is the untouched parity width
 * ([CONTENT_COLUMN_FRACTION] × screen).
 */
internal fun railOpenColumnWidth(screenWidth: Dp, railOffset: Dp): Dp =
    (screenWidth - railOffset) * CONTENT_COLUMN_FRACTION

/**
 * The rail-open offset's landing law: the narrowed column re-centers inside
 * the reduced area, so its left edge — the first card's left edge — clears
 * the open panel (≥ 192px at Обычный, the panel's own 192px) instead of
 * hiding under it. Pure so [RailLawTest] pins the acceptance at the box
 * geometry.
 */
internal fun railOpenColumnLeft(screenWidth: Dp, railOffset: Dp): Dp =
    railOffset + (screenWidth - railOffset - railOpenColumnWidth(screenWidth, railOffset)) / 2f

/**
 * The centered content column (design D13, task 8.2): a
 * [CONTENT_COLUMN_FRACTION]-width column centered on the screen — the SPA
 * tv shell's `html.tv main { max-width: min(92vw, 1800px) }` proportion.
 * Compose has no widthFraction modifier, so the width is fraction math on
 * BoxWithConstraints' maxWidth. The content lambda receives the column's
 * width (the density law's W) and the viewport height (maxHeight) — the
 * body page sizes itself to the height (task 8.3: the body top-aligned at
 * the viewport top IS the visible page) and plans its grids against the
 * width. While the collections rail is open the caller passes
 * [railOffset] — the panel's width at the active scale — and the column
 * narrows ([railOpenColumnWidth]) and re-centers inside the reduced area
 * ([railOpenColumnLeft]), the offset arriving as a parameter the same way
 * the measurements travel, never read from a global.
 */
@Composable
private fun ContentColumn(railOffset: Dp, content: @Composable (Dp, Dp) -> Unit) {
    BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
        val columnWidth = railOpenColumnWidth(maxWidth, railOffset)
        val columnHeight = maxHeight
        Box(
            modifier = Modifier.fillMaxWidth().padding(start = railOffset),
            contentAlignment = Alignment.TopCenter,
        ) {
            Box(modifier = Modifier.width(columnWidth)) { content(columnWidth, columnHeight) }
        }
    }
}

/**
 * The collection body switch (design D6, task 4.1 — the SPA CollectionBody's
 * module-keyed arm): serial → the series poster grid; tv → episode file
 * cards in the same grid (the MovieCard idiom); image → the folder-chips row
 * above the photo grid; an unknown module → its own label + an honest empty
 * state (the stated TV divergence — never an error, never a hardcoded type
 * list). The collections rail stays the entry for every body.
 *
 * The body is a bounded PAGE (task 8.3): exactly [bodyHeight] — the content
 * column's viewport — so every branch node (header, chips row, grid) composes
 * and renders within the viewport once the section's top is scrolled to it
 * (the [intoView] anchor the rail-OK swap targets). The fixed height is also
 * what lets the lazy grid measure inside the scrollable home column.
 * [columnWidth] is the content column's width — the density law's W
 * ([gridPlan]).
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun SeriesGrid(
    state: BrowseState,
    columnWidth: Dp,
    bodyHeight: Dp,
    intoView: BringIntoViewRequester,
    // The entry-destination verdict (task 8.15, the 15.1 split): true while
    // the home rows hold — or are still fetching toward — a focusable card;
    // the grid's ENTRY claim (fresh mount, cursor 0) stands down for the
    // whole window, taking the entry only when the home surface resolved to
    // nothing focusable. Law moves never read it (D1).
    homeHoldsEntry: Boolean,
    onOpen: (SeriesDto) -> Unit,
    onPlay: (String) -> Unit,
    onFocusMoved: (Int) -> Unit,
    onOpenRail: () -> Unit,
    onExtendItems: () -> Unit,
    onChipFocused: (Int) -> Unit,
    onChipsLeft: () -> Unit,
    onPickFolder: (String?) -> Unit,
    // The facet chip's OK act (task 10.2): toggle the facet conjunct — the
    // active value again CLEARS the key — and refetch the serial grid with
    // the current params (BrowseFlow.toggleFacet's law).
    onToggleFacet: (String, String) -> Unit,
    // The photo tile's OK act (task 8.13): open the modal viewer on this
    // loaded row.
    onPhotoOpened: (Int) -> Unit,
    serverBase: String?,
    token: String?,
) {
    Column(
        modifier = Modifier
            .height(bodyHeight)
            .bringIntoViewRequester(intoView)
            .padding(horizontal = PARITY_OVERSCAN_X, vertical = PARITY_OVERSCAN_Y),
    ) {
        val library = state.libraries.firstOrNull { it.id == state.libraryId }
        val accent = typeAccent(library?.moduleId ?: "")
        if (library != null) {
            // The ONE-line header: the title at DISPLAY plus the
            // module's type badge chip in its pastel (the rail dot map) — the
            // chip's label is the rail rows' own moduleLabel (the same served
            // module_id, field-driven), and no count or description line
            // follows (the rail carries the count).
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(library.displayName, fontSize = typeDisplay(), fontWeight = FontWeight.SemiBold)
                Text(
                    moduleLabel(library.moduleId),
                    fontSize = typeMeta(),
                    color = chipActiveText,
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(accent)
                        .padding(horizontal = 6.dp, vertical = 2.dp),
                )
            }
        }
        // The density law's scale mode — every grid branch's [gridPlan] reads
        // its surface reserves through it.
        val mode = LocalUiScale.current
        when (library?.moduleId) {
            "serial" -> Column(modifier = Modifier.fillMaxSize()) {
                // The facet lane (task 10.2 — the SPA's facetLane law) renders
                // in EVERY serial body state — loading, error, empty, grid —
                // ABOVE the body content: it is the control driving the
                // /series refetch, never a data block. Undefined facets (the
                // best-effort fetch failed or served nothing) render no chips;
                // the lane shell still owns its row.
                FacetChipsRow(
                    state = state,
                    onFocused = onChipFocused,
                    onLeft = onChipsLeft,
                    onToggle = onToggleFacet,
                    modifier = Modifier.padding(top = 8.dp),
                )
                when {
                    state.error != null -> Text(state.error, fontSize = typeBody(), modifier = Modifier.padding(top = 8.dp))
                    state.isLoading -> Text("Загрузка…", fontSize = typeBody(), modifier = Modifier.padding(top = 8.dp))
                    state.series.isEmpty() -> EmptyCollection()
                    else -> {
                        // The density law's reserves ride the surface and the
                        // scale mode; the plan derives from the viewport
                        // (LayoutParity gridPlan) — the column count is the
                        // height budget's output, the operator's «Постеров в
                        // ряду» override clamps inside the planner.
                        val plan = gridPlan(
                            width = columnWidth,
                            height = bodyHeight,
                            chrome = chromeReserve(mode, GridSurface.SERIAL),
                            caption = captionReserve(mode, GridSurface.SERIAL),
                            aspect = POSTER_ASPECT,
                            columnOverride = LocalGridPrefs.current.posterColumns,
                        )
                        CardGrid(
                            state = state,
                            columns = plan.columns,
                            surface = GridSurface.SERIAL,
                            homeHoldsEntry = homeHoldsEntry,
                            // The poster's FIXED aspect — never unified with
                            // the tv/photo tiles.
                            tileAspect = POSTER_ASPECT,
                            count = state.series.size,
                            keyOf = { index -> state.series[index].id },
                            cardOf = { index -> state.series[index].toCard() },
                            accent = accent,
                            onClick = { index -> onOpen(state.series[index]) },
                            onFocusMoved = onFocusMoved,
                            onExtend = onExtendItems,
                            onOpenRail = onOpenRail,
                            serverBase = serverBase,
                            token = token,
                        )
                    }
                }
            }
            "tv" -> when {
                state.error != null -> Text(state.error, fontSize = typeBody(), modifier = Modifier.padding(top = 8.dp))
                state.isLoading -> Text("Загрузка…", fontSize = typeBody(), modifier = Modifier.padding(top = 8.dp))
                state.items.isEmpty() -> EmptyCollection()
                else -> {
                    // The same planner the poster grid reads — the still grid
                    // plans under the TV surface's reserves with the 16:9
                    // aspect; the column count is the height budget's output,
                    // no tv special case (the caption stays title + duration).
                    val plan = gridPlan(
                        width = columnWidth,
                        height = bodyHeight,
                        chrome = chromeReserve(mode, GridSurface.TV),
                        caption = captionReserve(mode, GridSurface.TV),
                        aspect = STILL_ASPECT,
                    )
                    CardGrid(
                        state = state,
                        columns = plan.columns,
                        surface = GridSurface.TV,
                        homeHoldsEntry = homeHoldsEntry,
                        tileAspect = STILL_ASPECT,
                        count = state.items.size,
                        keyOf = { index -> state.items[index].id },
                        cardOf = { index -> state.items[index].toFileCard() },
                        accent = accent,
                        // The file card's OK act: play the file (D2's card OK
                        // keeps its act — the play verb is the item's own).
                        onClick = { index -> onPlay(state.items[index].id) },
                        onFocusMoved = onFocusMoved,
                        onExtend = onExtendItems,
                        onOpenRail = onOpenRail,
                        serverBase = serverBase,
                        token = token,
                    )
                }
            }
            "image" -> Column(modifier = Modifier.fillMaxSize()) {
                // The chip lane renders in EVERY body state (the SPA's
                // PhotosBody law): it is the control driving the listing —
                // unmounting it behind the refetch it triggered would
                // strand the cursor mid-interaction.
                FolderChipsRow(
                    state = state,
                    onFocused = onChipFocused,
                    onLeft = onChipsLeft,
                    onPick = onPickFolder,
                    modifier = Modifier.padding(top = 8.dp),
                )
                when {
                    state.error != null -> Text(state.error, fontSize = typeBody(), modifier = Modifier.padding(top = 8.dp))
                    state.isLoading -> Text("Загрузка…", fontSize = typeBody(), modifier = Modifier.padding(top = 8.dp))
                    state.items.isEmpty() -> EmptyCollection()
                    else -> {
                        // The planner's photo cell («Авто» = 4, 216dp squares
                        // at 540dp/Обычный — the uniform-row ruling keeps the
                        // 1:1 aspect; the tile RENDERING stays the photo
                        // grid's own): the columns law only, the poster
                        // override rides null («Авто») until the photo prefs
                        // lane lands.
                        val plan = gridPlan(
                            width = columnWidth,
                            height = bodyHeight,
                            chrome = chromeReserve(mode, GridSurface.PHOTO),
                            caption = captionReserve(mode, GridSurface.PHOTO),
                            aspect = PHOTO_TILE_ASPECT,
                            columnOverride = LocalGridPrefs.current.posterColumns,
                        )
                        CardGrid(
                            state = state,
                            columns = plan.columns,
                            surface = GridSurface.PHOTO,
                            homeHoldsEntry = homeHoldsEntry,
                            tileAspect = PHOTO_TILE_ASPECT,
                            count = state.items.size,
                            keyOf = { index -> state.items[index].id },
                            cardOf = { index -> state.items[index].toPhotoCard() },
                            accent = accent,
                            // The tile's OK act (task 8.13 — was an empty lambda,
                            // the operator-reported gap): open the photo viewer
                            // on this row.
                            onClick = { index -> onPhotoOpened(index) },
                            onFocusMoved = onFocusMoved,
                            onExtend = onExtendItems,
                            onOpenRail = onOpenRail,
                            serverBase = serverBase,
                            token = token,
                        )
                    }
                }
            }
            // The unknown module's honest empty state (D6's stated TV
            // divergence): the module's own id as label — never an error,
            // never a hardcoded type list.
            else -> Column(modifier = Modifier.padding(top = 8.dp)) {
                if (library != null) {
                    Text(moduleLabel(library.moduleId), fontSize = typeHeading())
                }
                EmptyCollection()
            }
        }
    }
}

/** The honest empty state under a served-but-empty (or unknown-module) body. */
@Composable
private fun EmptyCollection() {
    Text(
        "В коллекции пока нет элементов",
        fontSize = typeBody(),
        modifier = Modifier.padding(top = 8.dp),
        color = tvMuted,
    )
}

/**
 * The card grid walker (the law's one landing for every body): the caller's
 * plan (the density law's [gridPlan] output per surface), the cursor-in-state
 * law, the left-edge rail-open trigger, and the paged stream's append
 * trigger — the cursor landing on the LAST loaded card asks the flow for the
 * next page (D6's paged stream; a chip pick restarts it at offset 0).
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun CardGrid(
    state: BrowseState,
    // The entry-destination verdict (task 8.15, the 15.1 split): when true
    // the ENTRY claim below (fresh mount, cursor 0) stands down — the home
    // rows' first card takes the entry (the #18 fix: OK at entry used to
    // actuate this INVISIBLE below-fold tile, opening a series page instead
    // of playing the resume the user was looking at). The claim's key rides
    // the verdict, so a flip re-runs it — a resolved-empty home (empty
    // served array, fetch failure, only bare rows) hands the entry back to
    // the grid's cursor 0. The law-move cursor actuator reads it NOT (D1).
    homeHoldsEntry: Boolean,
    columns: Int,
    // The grid's surface — each card renders its surface's caption law
    // (the serial caption reads the lane width).
    surface: GridSurface,
    // The grid's uniform tile aspect (the uniform-row law, task 8.10): every
    // card in THIS grid renders the same fixed-aspect art block.
    tileAspect: Float,
    count: Int,
    keyOf: (Int) -> Any,
    cardOf: (Int) -> DisplayCard,
    accent: Color,
    onClick: (Int) -> Unit,
    onFocusMoved: (Int) -> Unit,
    onExtend: () -> Unit,
    onOpenRail: () -> Unit,
    serverBase: String?,
    token: String?,
) {
    // The focus→scroll actuator's scope (task 8.3): every focus move below
    // asks the scrolling ancestors (the lazy grid, then the home column) to
    // bring the focused card INTO VIEW — DOWNs never move the cursor with
    // zero viewport change again.
    val scope = rememberCoroutineScope()
    LazyVerticalGrid(
        columns = GridCells.Fixed(columns),
        modifier = Modifier.fillMaxSize().padding(top = 8.dp),
        verticalArrangement = Arrangement.spacedBy(PARITY_GUTTER),
        horizontalArrangement = Arrangement.spacedBy(PARITY_GUTTER),
    ) {
        items(count = count, key = keyOf) { index ->
            val requester = remember { FocusRequester() }
            val intoView = remember { BringIntoViewRequester() }
            // The cursor state is the focus source of truth: on every law
            // move (task 15.1's D1 split — ledger #27's consumed-but-inert
            // arrows were the entry gate outliving its window), and again
            // after the chips row's Back (the gridFocusNonce bump — D12's
            // chips Back → grid). While the rail is open the grid holds no
            // focus.
            //
            // EVERY actuation below is RE-ARMING (task 8.11, ledger #13 —
            // the walk61d proven race): a body swap unmounts/remounts the
            // grid across the loading branch, and the one-shot
            // requestFocusSafely dropped with no retry when its fire lost
            // the frame-phase coin flip against the remount — 2 LAND /
            // 2 NO-OP on identical presses. The re-arming actuator keeps
            // asking once per frame until the request lands, the key
            // changes, or the frame cap elapses — the same idiom the rail's
            // own actuator has used since the walk-found 4.2 fix. The
            // two-emit law (commit → post-load) is the flow's and is
            // untouched.
            // The CURSOR actuator (task 15.1's split): keyed on
            // (state.gridFocus, state.isRailOpen) with isRailOpen REQUIRED in
            // the key (surveyor Q10) — the only production mount path
            // (activateRailRow) composes the body while the rail is still
            // open (selectLibrary commits and awaits loadBody BEFORE the rail
            // close), so a gridFocus-only key would let the mount-run's
            // re-arming request steal focus from the open rail's focused row
            // for the whole fetch window; with isRailOpen in the key the
            // mount-run stands down and the landing fires on the rail-close
            // flip (doubling the nonce actuator there, by design). The gate
            // reads NO homeHoldsEntry — the entry gate is the separate ENTRY
            // claim below — so every gridFocus change re-lands the ring for
            // the actuator's whole body lifetime.
            LaunchedEffect(state.gridFocus, state.isRailOpen) {
                if (state.gridFocus == index && !state.isRailOpen) {
                    requester.focusUntilAttached()
                }
            }
            // The ENTRY claim (the 8.15 law, task 15.1's split): the
            // entryLandsOnHome verdict gates ONLY the fresh-mount cursor-0
            // claim — a SEPARATE effect keyed on (mountMarker,
            // homeHoldsEntry), never the cursor key (surveyor Q11: keying the
            // verdict re-runs the claim when the verdict flips — the
            // resolved-empty home hands the entry back to the grid's cursor
            // 0). While the verdict holds, the home rows' first card takes
            // the entry (the #18 fix); the claim's live role is the
            // home-failed/empty box, where it lands the grid. Post-15.2 every
            // mount is a switch mount with home already resolved — the claim
            // stands down there and the activation landing owns the cursor
            // (8.4).
            val mountMarker = remember { Any() } // per-mounted-instance identity
            LaunchedEffect(mountMarker, homeHoldsEntry) {
                if (index == 0 && state.gridFocus == 0 && !state.isRailOpen && !homeHoldsEntry) {
                    requester.focusUntilAttached()
                }
            }
            LaunchedEffect(state.gridFocusNonce) {
                if (state.gridFocusNonce > 0 && state.gridFocus == index && !state.isRailOpen) {
                    requester.focusUntilAttached()
                }
            }
            // The rail-close restore is gated on the CLOSE TRANSITION, not
            // the key value: it stands down when the rail was opened from a
            // home row (shouldRestoreHome — the opener's own cursor
            // restores, task 3.2), and its first run at a fresh composition
            // is NOT a close — an ungated mount-run would fire at the body
            // swap's remount (where the landing belongs to the nonce
            // actuator) and at entry (where the home owns the focus, task
            // 8.15) — a one-frame steal of the #18 class. Only a watched
            // open→close flip re-lands the parked cursor.
            val railWasOpen = remember { mutableStateOf(state.isRailOpen) }
            LaunchedEffect(state.isRailOpen) {
                val closedNow = railWasOpen.value && !state.isRailOpen
                railWasOpen.value = state.isRailOpen
                if (closedNow && !state.shouldRestoreHome && state.gridFocus == index) {
                    requester.focusUntilAttached()
                }
            }
            CardView(
                card = cardOf(index),
                accent = accent,
                tileAspect = tileAspect,
                surface = surface,
                laneColumns = columns,
                onClick = { onClick(index) },
                onFocused = {
                    onFocusMoved(index)
                    if (index == count - 1) onExtend() // the paged stream's append trigger
                    scope.launch { intoView.bringIntoView() } // the scroll rides the focus (8.3)
                },
                serverBase = serverBase,
                token = token,
                onDirection = { key ->
                    val next = moveInGrid(index, columns, count, key)
                    when {
                        next != index -> {
                            onFocusMoved(next)
                            true // consumed inside the grid
                        }
                        key == DpadKey.Left -> {
                            onOpenRail() // the rail-open trigger (5.15)
                            true
                        }
                        else -> false // a law-unsatisfiable arrow crosses natively
                    }
                },
                modifier = Modifier
                    .bringIntoViewRequester(intoView)
                    .focusRequester(requester)
                    .tvFocusStyle(),
            )
        }
    }
}

/**
 * The chips lane's scroll-to-focused: a walked cursor can point at a chip
 * the lane has not composed yet — the walk consumed the arrow and the
 * target's [FocusRequester] does not exist past the composed window, so
 * the walk would stall at the viewport edge. The lane scrolls only when
 * the cursor's chip is missing from the viewport (a visible walk never
 * moves the lane), and an out-of-range cursor (a stale one carried across
 * a body swap) scrolls nowhere.
 */
private suspend fun LazyListState.revealChip(cursor: Int) {
    if (cursor >= 0 &&
        cursor < layoutInfo.totalItemsCount &&
        layoutInfo.visibleItemsInfo.none { it.index == cursor }
    ) {
        animateScrollToItem(cursor)
    }
}

/**
 * The photo body's folder-chips row (design D6, wireframe 3.6 — the SPA's
 * PhotosBody FolderChip lane): [Все] + the served GET /libraries/{id}/folders
 * rows with their counts. A chip pick SERVER-FILTERS the paged stream
 * (path_prefix / top_level=true) and restarts it at offset 0 — the grid
 * pages exactly the stream a chip counts. The row walks Left/Right under the
 * moveInRow law, the lane scrolling the focused chip into view. DOWN stays
 * UNCONSUMED so the cursor crosses into the grid
 * below natively (D12's chips row, the L2 law); UP is always clamped (the
 * body-top clamp — with the settings affordance retired into the overlay,
 * nothing focusable ever sits above the body): the key is consumed,
 * the chip keeps focus, and focus never escapes the body by a runaway
 * native search into the home rows.
 */
@Composable
private fun FolderChipsRow(
    state: BrowseState,
    onFocused: (Int) -> Unit,
    onLeft: () -> Unit,
    onPick: (String?) -> Unit,
    modifier: Modifier = Modifier,
) {
    // Chip 0 = [Все] (no filter); chip i > 0 = the served folders[i - 1] —
    // the top-level chip reports path "" and filters with top_level=true.
    val chipCount = state.folders.size + 1
    val laneScroll = rememberLazyListState()
    // The scroll rides the cursor: every walk landing re-reveals the
    // focused chip (a no-op inside the visible window).
    LaunchedEffect(state.chipFocus) { laneScroll.revealChip(state.chipFocus) }
    LazyRow(
        state = laneScroll,
        modifier = modifier
            // The BackHandler's enabler reads the cursor: no chip focused →
            // the law stands down and Back reaches the app's own behavior.
            .onFocusChanged { if (!it.hasFocus) onLeft() },
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(
            count = chipCount,
            key = { index -> if (index == 0) "all" else state.folders[index - 1].path },
        ) { index ->
            val requester = remember { FocusRequester() }
            LaunchedEffect(state.chipFocus) {
                if (state.chipFocus == index) requester.requestFocusSafely()
            }
            val folderPath = if (index == 0) null else state.folders[index - 1].path
            FolderChip(
                label = when {
                    index == 0 -> "Все"
                    folderPath.isNullOrEmpty() -> "Корневые"
                    else -> folderPath
                },
                count = if (index == 0) null else state.folders[index - 1].items,
                active = state.folder == folderPath,
                onClick = { onPick(folderPath) },
                onFocused = { onFocused(index) },
                onDirection = { key ->
                    val next = moveInRow(index, chipCount, key)
                    when {
                        next != index -> {
                            onFocused(next)
                            true // consumed inside the chips row
                        }
                        // The body-boundary clamp (task 8.6): with the
                        // settings affordance retired into the overlay,
                        // nothing focusable ever sits above the body
                        // — UP is consumed and the chip keeps focus (never
                        // a runaway native search into the home rows).
                        key == DpadKey.Up -> true
                        else -> false // DOWN (→ grid) and the edge clamps cross natively
                    }
                },
                modifier = Modifier.focusRequester(requester).tvFocusStyle(shape = RoundedCornerShape(50)),
            )
        }
    }
}

/**
 * The serial body's facet lane (the SPA's facetLane): the served facet
 * values verbatim with their counts (GET /libraries/{id}/facets, served
 * order) in ONE horizontally scrollable lane, the active conjunct in the
 * accent (the FolderChip active law). The call site is UNCONDITIONAL —
 * the lane renders in EVERY serial body state (loading, error, empty,
 * grid) above the body content, because it is the CONTROL driving the
 * /series refetch, not a data block; undefined facets (the best-effort
 * fetch failed or served nothing) render no chips while the shell still
 * owns its row above the body.
 *
 * It reuses the FolderChipsRow shell: the shared [BrowseState.chipFocus]
 * cursor carries the Back law (the top-level chips link — chips Back
 * re-lands the parked grid cursor, and the body-closed Back stands down
 * while a facet chip holds focus). The LEFT/RIGHT landing walk itself
 * stays LOCAL: the shared cursor's writer is folder-sized
 * (BrowseFlow.onChipFocusMoved clamps to folders.size — the serial body
 * serves no folders), so consuming and re-landing through it would
 * dead-end the walk. The lane keeps its own cursor for the walk + scroll
 * ([revealChip]); every focus report still rides [onFocused] into the
 * shared cursor for the Back law. UP rides the body-top clamp (the one-row
 * lane IS the body's top row — with the settings affordance retired into
 * the overlay, nothing focusable ever sits above it, so focus never
 * escapes by a runaway native search into the home rows); DOWN crosses
 * natively into the grid below.
 */
@Composable
private fun FacetChipsRow(
    state: BrowseState,
    onFocused: (Int) -> Unit,
    onLeft: () -> Unit,
    onToggle: (String, String) -> Unit,
    modifier: Modifier = Modifier,
) {
    // The flat chip index across the lane (served order, facet-major) —
    // the cursor report's index space.
    val rowOffsets = state.facets.runningFold(0) { acc, facet -> acc + facet.values.size }
    val chipTotal = rowOffsets.lastOrNull() ?: 0
    // The lane-local landing cursor: the walk's law state, deliberately
    // separate from the folder-sized shared cursor (the KDoc).
    var laneCursor by remember { mutableStateOf(-1) }
    val laneScroll = rememberLazyListState()
    // The scroll rides the cursor: every walk landing re-reveals the
    // focused chip (a no-op inside the visible window).
    LaunchedEffect(laneCursor) { laneScroll.revealChip(laneCursor) }
    LazyRow(
        state = laneScroll,
        modifier = modifier.onFocusChanged {
            // The lane-level focus watcher (the FolderChipsRow law): no
            // chip focused → the Back link stands down and the local walk
            // cursor resets.
            if (!it.hasFocus) {
                laneCursor = -1
                onLeft()
            }
        },
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(
            count = chipTotal,
            key = { flat ->
                val facetIndex = rowOffsets.indexOfLast { it <= flat }
                val facet = state.facets[facetIndex]
                "${facet.key}:${facet.values[flat - rowOffsets[facetIndex]].value}"
            },
        ) { flat ->
            val facetIndex = rowOffsets.indexOfLast { it <= flat }
            val facet = state.facets[facetIndex]
            val value = facet.values[flat - rowOffsets[facetIndex]]
            val requester = remember { FocusRequester() }
            LaunchedEffect(laneCursor) {
                if (laneCursor == flat) requester.requestFocusSafely()
            }
            FolderChip(
                label = value.value,
                count = value.count.toLong(),
                active = state.facetSelection[facet.key] == value.value,
                onClick = { onToggle(facet.key, value.value) },
                onFocused = {
                    laneCursor = flat
                    onFocused(flat)
                },
                onDirection = { key ->
                    val next = moveInRow(flat, chipTotal, key)
                    when {
                        next != flat -> {
                            laneCursor = next
                            true // consumed inside the chips row
                        }
                        // The body-top clamp: nothing sits between this
                        // one-row lane and the body top — with the settings
                        // affordance retired into the overlay, no
                        // target above ever exists, so UP is consumed
                        // (never a runaway native search into the home
                        // rows).
                        key == DpadKey.Up -> true
                        else -> false // DOWN crosses natively into the grid
                    }
                },
                modifier = Modifier
                    .focusRequester(requester)
                    .tvFocusStyle(shape = RoundedCornerShape(50)),
            )
        }
    }
}

/**
 * One folder filter chip (the SPA's FolderChip): the label, the folder's
 * count (the folders-endpoint total the filtered stream pages 1:1 — the
 * [Все] chip carries none), and the chip-active surface on the active chip
 * (the SPA .chip idiom). Every chip measures the mode-derived lane height
 * (chipHeight) — one uniform pill row per lane at any label length, at any
 * scale. Focus rides the L4 visual law; OK applies the filter.
 */
@Composable
private fun FolderChip(
    label: String,
    count: Long?,
    active: Boolean,
    onClick: () -> Unit,
    onFocused: () -> Unit,
    onDirection: (DpadKey) -> Boolean,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(50))
            .then(if (active) Modifier.background(chipActiveBg) else Modifier)
            .border(1.dp, railBorder, RoundedCornerShape(50))
            .onFocusChanged { if (it.isFocused) onFocused() }
            .onKeyEvent { event -> routeDirectionEvent(event, onDirection) }
            .clickable(onClick = onClick)
            .height(chipHeight(LocalUiScale.current))
            .padding(horizontal = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            label,
            fontSize = typeSmall(),
            color = if (active) chipActiveText else tvMuted,
        )
        if (count != null) {
            Text(
                count.toString(),
                fontSize = typeMeta(),
                color = if (active) chipActiveText else tvMuted,
            )
        }
    }
}

/**
 * The collections rail (5.15 — the SPA sidebar translated to remote-native
 * navigation): one scrollable row per served collection, then the FIXED
 * settings row — a divider, then the always-present «Настройки»
 * row. The settings row renders through the SAME [RailRow] (the uniform
 * width/height and one-line clamp row laws hold by construction) and is
 * count-less forever — no summary exists for it. The rail cursor walks
 * through the moveInList law with the walker's count = libraries.size + 1
 * (the bounds ride the count — DOWN from the last library lands the
 * settings index, the walk clamps inside it); the settings row is NOT a
 * library: its OK opens the overlay ([onOpenSettings], never
 * [BrowseFlow.activateRailRow] — the flow's getOrNull guard refuses the
 * virtual index). The overlay's BACK dismiss bumps [settingsFocusNonce],
 * re-arming this rail's focus actuators (the restore law — the state keys
 * cannot change across a state-less overlay, so the nonce is the re-land
 * trigger). LEFT/RIGHT close the rail (consumed — focus returns to the
 * content's parked cursor, the L3 restore law); the rail-top UP stays
 * unconsumed (native crossing — nothing focusable sits above the rail
 * since the settings section retired into the overlay, so the key drops
 * harmlessly).
 * Rows render field-driven — name, module label (the pure 5.14 law) and
 * the count only when a summary answered; the current collection carries
 * the accent. OK on a LIBRARY row acts on the FOCUSED row through
 * clickable — the activation routes to BrowseFlow.activateRailRow (the
 * row's body opens, the rail closes into it, and a body that cannot open
 * keeps the rail + focus).
 *
 * Presentation (14.1, amendment §B): the panel is [AppCanvas] at
 * [railPanelWidth] (96dp at Компактный/Обычный, 112dp at Крупный) with a
 * 1dp end-edge [railBorder] border — D11's rail scrim is retired; the flow
 * laws (slide-in 5.15, hidden-by-default, focus restore) stand untouched.
 * The focused row's ring is the design's rail-scoped exception
 * ([tvRailFocusStyle]): a fixed 2dp band in the row's module type-pastel —
 * the settings row's empty-module case resolves the neutral default —
 * while every other focusable keeps the slate outline law.
 */
@Composable
private fun CollectionsRail(
    state: BrowseState,
    settingsFocusNonce: Int,
    onSelect: () -> Unit,
    onOpenSettings: () -> Unit,
    onClose: () -> Unit,
    onFocusMoved: (Int) -> Unit,
) {
    val uiScale = LocalUiScale.current
    Row(
        modifier = Modifier
            .fillMaxHeight()
            .width(railPanelWidth(uiScale))
            .background(AppCanvas),
    ) {
        LazyColumn(
            modifier = Modifier.weight(1f).fillMaxHeight(),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 8.dp),
        ) {
            items(
                count = state.libraries.size,
                key = { index -> state.libraries[index].id },
            ) { index ->
                val library = state.libraries[index]
                val requester = remember { FocusRequester() }
                // The cursor state is the rail's focus source of truth: on
                // open it lands on the current collection's row, on every
                // law move it follows the walk. The rail composes INSIDE the
                // slide-in transition, so a one-shot request drops on the
                // transition's first frames (the row's focus target is not
                // attached to the window yet — the walk-found 4.2 dead rail:
                // rows render, no row ever focused). The re-arming actuator
                // keeps asking until the request lands or the rail closes.
                // The nonce joins the keys: the overlay's BACK dismiss
                // bumps it, restarting every row's effect — only the row
                // matching [BrowseState.railFocus] passes the guard and
                // re-lands (the settings row when the overlay was opened
                // from it).
                LaunchedEffect(state.isRailOpen, state.railFocus, settingsFocusNonce) {
                    if (state.isRailOpen && state.railFocus == index) {
                        requester.focusUntilAttached()
                    }
                }
                RailRow(
                    name = library.displayName,
                    module = moduleLabel(library.moduleId),
                    dot = typeAccent(library.moduleId),
                    count = state.summaries[library.id]?.items,
                    selected = library.id == state.libraryId,
                    onClick = onSelect,
                    onFocused = { onFocusMoved(index) },
                    onDirection = { key ->
                        // The walker's count is libraries.size + 1 —
                        // the fixed settings row rides the SAME count, so
                        // DOWN from the last library lands it (consumed) and
                        // the bounds still clamp inside the rail.
                        val next = moveInList(index, state.libraries.size + 1, key)
                        when {
                            next != index -> {
                                onFocusMoved(next)
                                true // consumed inside the rail
                            }
                            key == DpadKey.Left || key == DpadKey.Right -> {
                                // LEFT/RIGHT anywhere in the rail close it —
                                // focus returns to the content's parked cursor.
                                onClose()
                                true
                            }
                            else -> false // rail-top UP still crosses natively
                        }
                    },
                    modifier = Modifier.focusRequester(requester)
                        .tvRailFocusStyle(ringColor = typeAccent(library.moduleId), shape = RoundedCornerShape(4.dp)),
                )
            }
            // The fixed settings row: the walk's +1 row. The divider
            // rides its own item (spacedBy spaces it like every row); the
            // row itself is a RailRow — «Настройки», no module, no count,
            // never selected — so the uniform width/height and one-line
            // clamp laws hold by construction. Its OK opens the overlay,
            // never a collection body.
            item(key = "settings-divider") {
                Box(Modifier.fillMaxWidth().height(1.dp).background(railBorder))
            }
            item(key = "settings") {
                val requester = remember { FocusRequester() }
                val settingsIndex = state.libraries.size
                // The same re-arming actuator as the library rows (the 4.2
                // dead-rail law), with the nonce key that re-lands it after
                // the overlay's BACK dismiss (the restore law).
                LaunchedEffect(state.isRailOpen, state.railFocus, settingsFocusNonce) {
                    if (state.isRailOpen && state.railFocus == settingsIndex) {
                        requester.focusUntilAttached()
                    }
                }
                RailRow(
                    name = "Настройки",
                    module = "",
                    dot = typeAccent(""),
                    count = null,
                    selected = false,
                    onClick = onOpenSettings,
                    onFocused = { onFocusMoved(settingsIndex) },
                    onDirection = { key ->
                        val next = moveInList(settingsIndex, state.libraries.size + 1, key)
                        when {
                            next != settingsIndex -> {
                                onFocusMoved(next)
                                true // consumed inside the rail
                            }
                            key == DpadKey.Left || key == DpadKey.Right -> {
                                onClose()
                                true
                            }
                            else -> false // the rail's bottom edge: unconsumed
                        }
                    },
                    modifier = Modifier.focusRequester(requester)
                        .tvRailFocusStyle(ringColor = typeAccent(""), shape = RoundedCornerShape(4.dp)),
                )
            }
        }
        // The panel's end-edge border (14.1 — the SPA .side border-right).
        Box(Modifier.fillMaxHeight().width(1.dp).background(railBorder))
    }
}

/**
 * The transition-composed focus actuator (the walk-found 4.2 fix, now the
 * SHARED actuation idiom — task 8.11 extended it to the grid's
 * cursor/nonce/rail-close actuators): a focus request aimed at a node still
 * entering a slide-in transition — or detached across a body swap's
 * unmount/remount (ledger #13's proven race) — throws until the node's
 * focus target attaches to the window; a one-shot drop leaves the surface
 * rendered but never focused. The request re-arms once per frame until it
 * lands, the caller's effect is cancelled (another row walked, the cursor
 * moved, or the rail closed again), or [FOCUS_RETRY_FRAMES] elapse.
 */
private suspend fun FocusRequester.focusUntilAttached() {
    repeat(FOCUS_RETRY_FRAMES) {
        try {
            requestFocus()
            return
        } catch (_: IllegalStateException) {
            withFrameNanos { } // one frame, then re-arm against the attached target
        }
    }
}

/** The actuator's frame cap (~1s at 60fps) — past it the request gives up. */
private const val FOCUS_RETRY_FRAMES = 60

/**
 * The SCROLL actuator of the two-emit law (task 15.3 — the same drop class
 * 8.11 fixed for the FOCUS actuators, ledger #24): on an unattached
 * [BringIntoViewRequester] — the grid swapped out mid-remount —
 * bringIntoView no-ops against the empty modifier vector, and a one-shot
 * call leaves the swap-scroll leg inert forever. Mirroring the
 * [focusUntilAttached] idiom, the request re-arms once per frame until the
 * body section's top holds the viewport top — the column scroll rests at
 * its end (the body takes the column's viewport height, so end-of-scroll
 * IS the landing; settled when already there) — until the collector is
 * cancelled (the next swap emit replaces it), or [SWAP_RETRY_FRAMES]
 * elapse (~1s at 60fps). The two-emit law stands: the re-arm keys on the
 * SAME commit/post-load emits; only the consumer now persists past a lost
 * frame.
 */
@OptIn(ExperimentalFoundationApi::class)
private suspend fun swapUntilLanded(requester: BringIntoViewRequester, scroll: ScrollState) {
    repeat(SWAP_RETRY_FRAMES) {
        requester.bringIntoView()
        if (scroll.value == scroll.maxValue && !scroll.isScrollInProgress) return
        withFrameNanos { } // one frame, then re-ask against the mounted grid
    }
}

/** The landing actuator's frame cap (~1s at 60fps) — past it the re-arm gives up. */
private const val SWAP_RETRY_FRAMES = 60

/**
 * One bordered rounded card (14.1 — the mockup's card anatomy, the SPA
 * SideColl's colors): a 1dp [railBorder] border at 4dp radius (SPA
 * --radius ÷ 2), a 4dp module dot in the type pastel (the D3 map = SPA
 * dotClass), the name at TYPE_META (.clink ÷ 2) — [tvAccent] when selected
 * (the existing law), [tvMuted] otherwise — and the count TYPE_META
 * [tvMuted] (.cnt). The FOCUS law rides the caller's [tvRailFocusStyle] —
 * the rail-scoped exception: a 2dp ring in the row's module type-pastel
 * ([dot]) at this row's own 4dp corner — plus the .clink-active slate fill
 * over the panel bg. Field-driven: a blank name renders nothing; the
 * module label is always readable (moduleLabel's law); the count renders
 * ONLY when a summary answered — no count yet, no count block.
 */
@Composable
private fun RailRow(
    name: String,
    module: String,
    dot: Color,
    count: Long?,
    selected: Boolean,
    onClick: () -> Unit,
    onFocused: () -> Unit,
    onDirection: (DpadKey) -> Boolean,
    modifier: Modifier = Modifier,
) {
    val cardShape = RoundedCornerShape(4.dp)
    var focused by remember { mutableStateOf(false) }
    Column(
        modifier = modifier
            .onFocusChanged {
                focused = it.isFocused
                if (it.isFocused) onFocused()
            }
            .onKeyEvent { event -> routeDirectionEvent(event, onDirection) }
            .clickable(onClick = onClick)
            // The selection fill (SPA .clink-active / --accent, #1E293B)
            // under the bordered card surface — the panel bg always stands
            // beneath; the accent blue is never a selection wash.
            // Full-width BEFORE background/border (design §D): every row's
            // card is the same width at any data state — the count-less row
            // (no summary yet) never wraps narrower than a count-ful one,
            // and Row2's weight(1f) spacer stays deterministic.
            .fillMaxWidth()
            // The mode-derived rail row height: every row's card is the
            // same height at any data state, riding the scale tier.
            .height(railRowHeight(LocalUiScale.current))
            .background(if (focused) Color(0xFF1E293B) else Color.Transparent, cardShape)
            .border(1.dp, railBorder, cardShape)
            // The TV collection card's padding (SPA Home.tsx:266 p-4 16px ÷ 2)
            .padding(horizontal = 8.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(4.dp).clip(CircleShape).background(dot))
            if (name.isNotBlank()) {
                Text(
                    name,
                    maxLines = 1,
                    // The SPA's .clink truncates (design §B): one line, no
                    // wrap — a long Cyrillic name must not grow the card.
                    overflow = TextOverflow.Ellipsis,
                    fontSize = typeMeta(),
                    color = if (selected) tvAccent else tvMuted,
                    modifier = Modifier.padding(start = 6.dp),
                )
            }
        }
        Row(modifier = Modifier.padding(top = 2.dp)) {
            Text(module,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                fontSize = typeMeta(),
                color = tvMuted,
            )
            if (count != null) {
                Spacer(Modifier.weight(1f))
                Text(count.toString(), fontSize = typeMeta(), color = tvMuted)
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun SeriesPage(
    series: SeriesDto,
    episodes: List<ItemDto>,
    positions: Map<String, Long>,
    isLoading: Boolean,
    focusIndex: Int,
    accent: Color,
    breadcrumbLabel: String?,
    serverBase: String?,
    token: String?,
    onFocusMoved: (Int) -> Unit,
    onPlay: (ItemDto) -> Unit,
) {
    // The plan reads the RAW viewport (the pinned episode cell's W×H = the
    // 0.92 column over the full panel), the overscan edges padding INSIDE —
    // the same measure law every body grid follows.
    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val columnWidth = maxWidth * CONTENT_COLUMN_FRACTION
        val viewportHeight = maxHeight
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
            Column(
                modifier = Modifier
                    .width(columnWidth)
                    .padding(horizontal = PARITY_OVERSCAN_X, vertical = PARITY_OVERSCAN_Y),
            ) {
                // The hero zone (design D5, wireframe 3.3): poster, title,
                // and the served about panel — facts line + Synopsis + genre
                // chips. The hero carries NO focus modifiers: the episode
                // grid below is the walker's home and keeps the initial
                // focus (nav/InitialFocus.kt's first-unwatched law seeds it).
                SeriesHeroView(series, breadcrumbLabel, serverBase, token)
                when {
                    isLoading && episodes.isEmpty() -> Text("Загрузка…", fontSize = typeBody(), modifier = Modifier.padding(top = 8.dp))
                    episodes.isEmpty() -> Text("Эпизоды не найдены", fontSize = typeBody(), modifier = Modifier.padding(top = 8.dp))
                    else -> {
                        // The density law: «Эпизодов в ряду» — null
                        // = Авто → the plan over the ~100dp hero reserve
                        // (3 across at Обычный @960×540); 2/3/4 override,
                        // clamped inside the planner so a caption never
                        // clips.
                        val mode = LocalUiScale.current
                        val plan = gridPlan(
                            width = columnWidth,
                            height = viewportHeight,
                            chrome = chromeReserve(mode, GridSurface.EPISODE),
                            caption = captionReserve(mode, GridSurface.EPISODE),
                            aspect = STILL_ASPECT,
                            columnOverride = LocalGridPrefs.current.episodeColumns,
                        )
                        // The scroll-rides-focus actuator (task 8.3): a
                        // walked cursor brings its card into view.
                        val scope = rememberCoroutineScope()
                        LazyVerticalGrid(
                            columns = GridCells.Fixed(plan.columns),
                            modifier = Modifier.fillMaxSize().padding(top = 8.dp),
                            verticalArrangement = Arrangement.spacedBy(PARITY_GUTTER),
                            horizontalArrangement = Arrangement.spacedBy(PARITY_GUTTER),
                            contentPadding = PaddingValues(bottom = PARITY_OVERSCAN_Y),
                        ) {
                            items(
                                count = episodes.size,
                                key = { index -> episodes[index].id },
                            ) { index ->
                                val episode = episodes[index]
                                val requester = remember { FocusRequester() }
                                val intoView = remember { BringIntoViewRequester() }
                                // The cursor state is the focus source of
                                // truth (the re-arming actuator — task 8.11):
                                // the first-unwatched seed lands on mount,
                                // every law move re-lands the walked cursor.
                                LaunchedEffect(focusIndex) {
                                    if (focusIndex == index) requester.focusUntilAttached()
                                }
                                EpisodeCard(
                                    // The stored position rides in from the
                                    // flow's progress walk; the mapping owns
                                    // the tri-state (a watched row or a
                                    // duration-less row renders no bar) and
                                    // the served-title precedence.
                                    card = episode.toCard(positions[episode.id]),
                                    accent = accent,
                                    onFocused = {
                                        onFocusMoved(index)
                                        scope.launch { intoView.bringIntoView() }
                                    },
                                    serverBase = serverBase,
                                    token = token,
                                    onClick = { onPlay(episode) },
                                    onDirection = { key ->
                                        // The poster grid's walker law
                                        // (moveInGrid); a clamp — an edge
                                        // arrow the law cannot satisfy —
                                        // stays unconsumed and crosses
                                        // natively (the hero above is not
                                        // focusable, so the crossing is
                                        // harmless).
                                        val next = moveInGrid(index, plan.columns, episodes.size, key)
                                        if (next != index) {
                                            onFocusMoved(next)
                                            true // consumed inside the grid
                                        } else {
                                            false
                                        }
                                    },
                                    modifier = Modifier
                                        .bringIntoViewRequester(intoView)
                                        .focusRequester(requester)
                                        .tvFocusStyle(),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * The hero zone (design D5 — the SPA's ItemDetail hero + Synopsis.tsx):
 * the breadcrumb line «<library label> › <title>» at META on top (the web's
 * back link is BACK on TV — no on-screen link; an unmatched served library
 * or a title-less row renders no breadcrumb), then the poster at its
 * natural 2:3 from a 72dp width (aspect-ratio, uncropped — no fixed box),
 * the title, facts line, Synopsis and the genre chips, every block a
 * null-check on the [SeriesHero] carriers — absent metadata or an empty
 * description renders NO panel, no facts line, no chips (L1). The muted
 * Synopsis clamps at 3 lines. Nothing here is focusable (the episode grid
 * below holds the initial focus).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SeriesHeroView(
    series: SeriesDto,
    breadcrumbLabel: String?,
    serverBase: String?,
    token: String?,
) {
    val hero = series.toHero()
    if (hero.title == null && hero.posterUrl == null && hero.about == null) return
    Column(modifier = Modifier.padding(bottom = 8.dp)) {
        val title = hero.title
        if (breadcrumbLabel != null && title != null) {
            Text(
                "$breadcrumbLabel › $title",
                fontSize = typeMeta(),
                color = tvMuted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(bottom = 2.dp),
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            // FIELD-DRIVEN: absent artwork → no poster block, nothing fabricated
            // (the same artwork law as the cards — 5.13).
            val artwork = resolveArtworkUrl(serverBase, hero.posterUrl)
            if (artwork != null) {
                ArtworkImage(
                    artwork = artwork,
                    token = token,
                    modifier = Modifier.width(72.dp).aspectRatio(POSTER_ASPECT),
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                if (title != null) {
                    Text(
                        title,
                        fontSize = typeDisplay(),
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                val about = hero.about
                if (about != null) {
                    if (about.facts != null) {
                        Text(
                            about.facts,
                            fontSize = typeMeta(),
                            color = tvMuted,
                            modifier = Modifier.padding(top = 3.dp),
                        )
                    }
                    Text(
                        about.description,
                        fontSize = typeSmall(),
                        color = tvMuted,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                    if (about.genres.isNotEmpty()) {
                        FlowRow(
                            modifier = Modifier.padding(top = 4.dp),
                            horizontalArrangement = Arrangement.spacedBy(3.dp),
                        ) {
                            about.genres.forEach { genre ->
                                Text(
                                    genre,
                                    fontSize = typeMeta(),
                                    color = tvMuted,
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(50))
                                        .border(1.dp, railBorder, RoundedCornerShape(50))
                                        .padding(horizontal = 4.dp, vertical = 1.dp),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * The grid card (design D2 — the SPA card law, TV-rendered): artwork with
 * the ✓ corner mark OVER the art (WatchedCornerMark, task 12.1 — it LEFT the
 * text stack so card heights are watched-independent), the in-progress bar
 * UNDER the art, the title (dimmed when watched), and the ONE caption line
 * — the serial card reads the lane WIDTH ([laneColumns] against
 * [FACTS_LINE_MAX_COLUMNS]: the compact ★ score at a denser lane, the full
 * facts line at a lane the line fits), tv keeps the ONE meta line, and the
 * photo tile renders NO text under its art (fit-over-blur via
 * [PhotoTileImage]; the masonry stays retired — its date footer with it, the
 * capture date lives in the viewer's status line).
 * ONE glyph, type-agnostic (the SPA .watched-mark pastel, D3) at meta scale,
 * never a word chip. The tri-state is a rendering null-check on the
 * DisplayCard carriers: watched → corner mark + dim + NO bar; in-progress →
 * the bar only; new → clean.
 */
@Composable
private fun CardView(
    card: DisplayCard,
    accent: Color,
    // This grid's uniform tile aspect (the uniform-row law, task 8.10): the
    // art block ALWAYS renders at this aspect — artwork Crop-fills it, its
    // absence leaves a placeholder surface — so a row's heights and the
    // title/meta baselines can never go ragged.
    tileAspect: Float,
    // The caption law's inputs: which surface's caption renders and the
    // lane's column count (the plan's — the serial caption decides on the
    // lane WIDTH, never a per-card count).
    surface: GridSurface,
    laneColumns: Int,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    serverBase: String? = null,
    token: String? = null,
    onFocused: () -> Unit = {},
    onDirection: (DpadKey) -> Boolean = { false },
) {
    // The grid card's tile radius (SPA .scard, index.css:434 border-radius
    // var(--radius) 8px ÷ 2 — the file's card radius): the artwork box
    // clips to it so the tile renders the SPA's radius-clipped look.
    val cardShape = RoundedCornerShape(4.dp)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .onFocusChanged { if (it.isFocused) onFocused() }
            .onKeyEvent { event -> routeDirectionEvent(event, onDirection) }
            .clickable(onClick = onClick),
    ) {
        // The fixed-aspect art block — unconditional (the uniform-row law):
        // field-driven ABSENCE still occupies the tile's geometry (a bare
        // surface), never a shorter card that shifts the row's text rows.
        Box(modifier = Modifier.fillMaxWidth().aspectRatio(tileAspect).clip(cardShape)) {
            val artwork = resolveArtworkUrl(serverBase, card.artworkUrl)
            if (surface == GridSurface.PHOTO && artwork != null) {
                // The photo tile's fit-over-blur law: the photo
                // FITS whole over a blurred fill — one request, two layers.
                PhotoTileImage(
                    artwork = artwork,
                    token = token,
                    modifier = Modifier.fillMaxSize(),
                )
            } else if (artwork != null) {
                ArtworkImage(
                    artwork = artwork,
                    token = token,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                // Absent artwork renders the deterministic hashed fallback,
                // never a bare rectangle (the SPA Artwork.tsx law).
                FallbackArtwork(name = card.title, modifier = Modifier.fillMaxSize())
            }
            // The watched ✓ rides the art's top-end corner (task 12.1) —
            // OUT of the text stack, so the card's height never depends on
            // watched; unwatched renders absence (no mark, no space — L1).
            WatchedCornerMark(
                watched = card.watched == true,
                modifier = Modifier.align(Alignment.TopEnd),
            )
        }
        // In-progress ONLY — a watched card never renders a bar (D2).
        if (card.watched != true && card.progress != null) {
            InProgressBar(
                percent = card.progress,
                accent = accent,
                modifier = Modifier.padding(top = 3.dp),
            )
        }
        if (card.title != null) {
            Text(
                card.title,
                fontSize = typeSmall(),
                fontWeight = FontWeight.SemiBold, // the SPA .scard-title font-semibold
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier
                    .padding(top = 4.dp)
                    .alpha(if (card.watched == true) WATCHED_DIM else 1f),
            )
        }
        // The ONE caption line. The serial card decides on the lane WIDTH
        // (the plan's column count): denser than [FACTS_LINE_MAX_COLUMNS] →
        // the compact caption (the ★ score; the Season chip's slot renders
        // absent — season has no carrier on the series wire, the SPA derives
        // it from the opaque series document the TV client does not carry);
        // at a lane the facts line fits → the full facts line. tv keeps the
        // meta line at any lane width (the photo tile renders NO text under
        // its art — the footer guard below). Every slot is a null-check on
        // the served carrier — absent → absent, never a placeholder (L1).
        val compactLane = surface == GridSurface.SERIAL && laneColumns > FACTS_LINE_MAX_COLUMNS
        val caption = if (compactLane) {
            card.score?.let { "★ ${scoreText(it)}" }
        } else {
            card.meta
        }
        if (caption != null) {
            Text(
                caption,
                fontSize = typeMeta(),
                color = tvMuted,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
        // The photo grid renders NO caption at all (the masonry stays
        // retired — its date footer retired with it; the capture date lives
        // in the viewer's status line): the photo surface renders no footer
        // even when the card carries one. Every other surface's footer is a
        // null-check on the served carrier — absent → absent (L1).
        if (surface != GridSurface.PHOTO && card.footer != null) {
            Text(
                card.footer,
                fontSize = typeMeta(),
                color = tvMuted,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
    }
}

/**
 * The watched corner mark (the watched-signal law's corner placement, task
 * 12.1): ONE type-agnostic ✓ (the SPA .watched-mark pastel, D3) pinned to
 * the art block's top-end corner — never a word chip, never a text-stack
 * row. Callers overlay it on the art Box; unwatched renders ABSENCE (no
 * mark, no space — L1), so watched never changes card or row heights (the
 * uniform-row law restored).
 */
@Composable
internal fun WatchedCornerMark(watched: Boolean, modifier: Modifier = Modifier) {
    if (!watched) return
    Text(
        "✓",
        fontSize = typeMeta(),
        color = DEFAULT_TYPE_ACCENT, // the SPA .watched-mark law: the mark is type-agnostic
        modifier = modifier.padding(3.dp),
    )
}

/**
 * The one Coil image request (5.13): the resolved URL, and the bearer token
 * ONLY on our server's artwork (relative wire path) — a CDN fetch never
 * carries the device credential. The image Crop-fills whatever bounds its
 * modifier gives it (the uniform-row law, 8.10): a fixed-aspect tile shows
 * its art edge-to-edge, never letterboxed inside the track.
 */
@Composable
internal fun ArtworkImage(
    artwork: ArtworkRequest,
    token: String?,
    modifier: Modifier = Modifier,
    // The uniform-row law's default (8.10): tiles Crop-fill. The one
    // Fit exception is the photo viewer (8.13) — a photograph is SHOWN,
    // never cropped away.
    contentScale: ContentScale = ContentScale.Crop,
) {
    AsyncImage(
        model = ImageRequest.Builder(LocalContext.current)
            .data(artwork.url)
            .apply {
                if (artwork.isAuthorized && !token.isNullOrBlank()) {
                    setHeader("Authorization", "Bearer $token")
                }
            }
            .build(),
        contentDescription = null,
        contentScale = contentScale,
        modifier = modifier,
    )
}

/**
 * The photo tile's fit-over-blur rendering: ONE Coil
 * request per tile — one [ImageRequest] remembered over the resolved
 * artwork, its painter shared by BOTH layers — so a tile can never issue
 * two independent fetches. The background layer Crop-fills the square under
 * [Modifier.blur] (API 31+; below 31 the fill is the solid canvas color —
 * a one-line branch, not a strategy split), the foreground layer FITs whole
 * (the viewer's law: a photograph is shown, never cropped away) — a portrait
 * photo keeps head and feet inside the square, the blurred fill carries the
 * side bands.
 */
@Composable
private fun PhotoTileImage(
    artwork: ArtworkRequest,
    token: String?,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val request = remember(artwork, token) {
        ImageRequest.Builder(context)
            .data(artwork.url)
            .apply {
                if (artwork.isAuthorized && !token.isNullOrBlank()) {
                    setHeader("Authorization", "Bearer $token")
                }
            }
            .build()
    }
    // One painter, two Image nodes: both draw the same load state, so the
    // fetch happens exactly once per tile.
    val painter = rememberAsyncImagePainter(request)
    Box(modifier) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Image(
                painter = painter,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .fillMaxSize()
                    .blur(PHOTO_FILL_BLUR),
            )
        } else {
            Box(modifier = Modifier.fillMaxSize().background(AppCanvas))
        }
        Image(
            painter = painter,
            contentDescription = null,
            contentScale = ContentScale.Fit,
            modifier = Modifier.fillMaxSize(),
        )
    }
}

/**
 * One directional key event → the pure law. Acts on the DOWN event (native
 * repeats scroll naturally); Ok/Back are NOT intercepted here — clickable
 * owns Ok, BackHandler owns Back.
 */
internal fun routeDirectionEvent(
    event: KeyEvent,
    onDirection: (DpadKey) -> Boolean,
): Boolean {
    if (event.type != KeyEventType.KeyDown) return false
    val key = event.nativeKeyEvent.toDpadKey() ?: return false
    if (!key.isDirectional) return false
    return onDirection(key)
}

/**
 * The in-progress bar (the SPA's InProgressBar idiom, WatchedStates.tsx): a
 * rounded --border track ([inProgressTrack]) with the bg-primary fill
 * ([inProgressFill]) at the served percent. The caller owns the tri-state —
 * a watched card never reaches here.
 */
@Composable
internal fun InProgressBar(percent: Int, accent: Color, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .height(3.dp)
            .clip(RoundedCornerShape(2.dp))
            .background(inProgressTrack),
    ) {
        Box(
            modifier = Modifier
                .fillMaxHeight()
                .fillMaxWidth(percent / 100f)
                .background(inProgressFill),
        )
    }
}
