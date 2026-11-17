package tv.mellifera.browse

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.LazyRow
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import coil.request.ImageRequest
import kotlinx.coroutines.launch
import tv.mellifera.AppViewModel
import tv.mellifera.dpad.DpadKey
import tv.mellifera.dpad.chipsRowConsumesUp
import tv.mellifera.dpad.isDirectional
import tv.mellifera.dpad.moveInGrid
import tv.mellifera.dpad.moveInList
import tv.mellifera.dpad.moveInRow
import tv.mellifera.dpad.toDpadKey
import tv.mellifera.home.entryLandsOnHome
import tv.mellifera.net.ItemDto
import tv.mellifera.net.SeriesDto
import tv.mellifera.ui.RAIL_PANEL_WIDTH
import tv.mellifera.ui.TYPE_BODY
import tv.mellifera.ui.TYPE_DISPLAY
import tv.mellifera.ui.TYPE_HEADING
import tv.mellifera.ui.TYPE_META
import tv.mellifera.ui.TYPE_SMALL
import tv.mellifera.ui.AppCanvas
import tv.mellifera.ui.SettingsSection
import tv.mellifera.ui.chipColor
import tv.mellifera.ui.railBorder
import tv.mellifera.ui.railMuted
import tv.mellifera.ui.requestFocusSafely
import tv.mellifera.ui.tvAccent
import tv.mellifera.ui.tvFocusStyle

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
private const val WATCHED_DIM = 0.55f

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun BrowseScreen(viewModel: AppViewModel) {
    val browse = viewModel.browse
    val state by browse.state.collectAsState()
    val appState by viewModel.state.collectAsState()
    // The settings affordance above the body is focusable only while the
    // telemetry gate is on — the chips row's UP clamp reads it (task 8.6).
    val settingsFocusable by viewModel.telemetry.isOpen.collectAsState()
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
    // home — the body closes onto the home rows (the cursor and rail state
    // stay, closeBody's law), and the home rows' restore actuator re-lands
    // the parked cursor. Composed LAST in the chain: series, rail and
    // chips-focused Back keep their own laws.
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
    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
            // The minimal settings surface (5.11): the share affordance, gated.
            SettingsSection(viewModel)
            if (selected != null) {
                SeriesPage(
                    series = selected,
                    episodes = state.episodes,
                    positions = state.positions,
                    isLoading = state.isLoading,
                    focusIndex = state.episodeFocus,
                    accent = typeAccent(
                        state.libraries.firstOrNull { it.id == selected.libraryId }?.moduleId ?: "",
                    ),
                    serverBase = serverBase,
                    token = token,
                    onFocusMoved = { browse.onEpisodeFocusMoved(it) },
                    onPlay = { episode -> viewModel.playback.play(episode.id) },
                )
            } else {
                // The parity content column (design D13, task 8.2): the home
                // rows and the collection body sit in a CENTERED 60%-width
                // column — the SPA's `mx-auto max-w-6xl` proportion. The
                // rail overlay is NOT part of it (360dp, unchanged).
                ContentColumn { bodyHeight ->
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
                    // The visible-swap actuator (task 8.3): a rail-OK body
                    // swap brings the body's top INTO VIEW — the activation
                    // is a VISIBLE swap (the user SEES the body they opened),
                    // never an invisible focus land below the fold.
                    val bodyIntoView = remember { BringIntoViewRequester() }
                    LaunchedEffect(Unit) {
                        browse.bodySwaps.collect { bodyIntoView.bringIntoView() }
                    }
                    Column(modifier = Modifier.fillMaxSize().verticalScroll(scrollState)) {
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
                            serverBase = serverBase,
                            token = token,
                            onContinueFocusMoved = { viewModel.home.onContinueFocusMoved(it) },
                            onNextUpFocusMoved = { viewModel.home.onNextUpFocusMoved(it) },
                            onResume = { itemId -> viewModel.playback.play(itemId) },
                            onNext = { itemId -> viewModel.playback.play(itemId) },
                            onOpenRail = { scope.launch { browse.openRail(fromHome = true) } },
                        )
                        SeriesGrid(
                            state = state,
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
                            aboveFocusable = settingsFocusable,
                            serverBase = serverBase,
                            token = token,
                        )
                    }
                }
            }
        }
        // The collections rail (5.15): slides in over the grid's left edge.
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
                // The rail row's OK (design D12's "select+close", task 4.3):
                // the focused row's body opens and the rail closes into it;
                // a body that cannot open keeps the rail open with its focus
                // (the activation law, BrowseFlow.activateRailRow).
                onSelect = { scope.launch { browse.activateRailRow() } },
                onClose = { browse.closeRail() },
                onFocusMoved = { browse.onRailFocusMoved(it) },
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
 * The centered content column (design D13, task 8.2): a 60%-width column
 * centered on the screen — the SPA's `mx-auto max-w-6xl` proportion
 * (1152px of 1920 = 60%, i.e. 576dp at the box's density 320). Compose has
 * no widthFraction modifier, so the width is fraction math on
 * BoxWithConstraints' maxWidth. The content lambda receives the column's
 * viewport height (maxHeight) — the body page sizes itself to it (task
 * 8.3: the body top-aligned at the viewport top IS the visible page).
 */
@Composable
private fun ContentColumn(content: @Composable (Dp) -> Unit) {
    BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
        val columnWidth = maxWidth * CONTENT_COLUMN_FRACTION
        val columnHeight = maxHeight
        Box(
            modifier = Modifier.fillMaxWidth(),
            contentAlignment = Alignment.TopCenter,
        ) {
            Box(modifier = Modifier.width(columnWidth)) { content(columnHeight) }
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
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun SeriesGrid(
    state: BrowseState,
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
    // Whether a focusable target (the gated settings affordance) exists
    // above the body — the chips row's UP clamp consumes UP without one
    // (task 8.6), so focus never escapes the body by native search.
    aboveFocusable: Boolean,
    serverBase: String?,
    token: String?,
) {
    Column(
        modifier = Modifier
            .height(bodyHeight)
            .bringIntoViewRequester(intoView)
            .padding(32.dp),
    ) {
        val library = state.libraries.firstOrNull { it.id == state.libraryId }
        if (library != null) {
            Text(library.displayName, fontSize = TYPE_DISPLAY)
        }
        val accent = typeAccent(library?.moduleId ?: "")
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
                    aboveFocusable = aboveFocusable,
                    modifier = Modifier.padding(top = 8.dp),
                )
                when {
                    state.error != null -> Text(state.error, fontSize = TYPE_BODY, modifier = Modifier.padding(top = 8.dp))
                    state.isLoading -> Text("Загрузка…", fontSize = TYPE_BODY, modifier = Modifier.padding(top = 8.dp))
                    state.series.isEmpty() -> EmptyCollection()
                    else -> CardGrid(
                        state = state,
                        // 3 posters across (the count ruling, 8.10): each poster
                        // consumes a third of the column — the fixed 2:3 tile.
                        columns = SERIES_GRID_COLUMNS,
                        homeHoldsEntry = homeHoldsEntry,
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
            "tv" -> when {
                state.error != null -> Text(state.error, fontSize = TYPE_BODY, modifier = Modifier.padding(top = 8.dp))
                state.isLoading -> Text("Загрузка…", fontSize = TYPE_BODY, modifier = Modifier.padding(top = 8.dp))
                state.items.isEmpty() -> EmptyCollection()
                else -> CardGrid(
                    state = state,
                    // D13: 3 stills across the column (the fixed 16:9 tile).
                    columns = TV_FILE_GRID_COLUMNS,
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
                    aboveFocusable = aboveFocusable,
                    modifier = Modifier.padding(top = 8.dp),
                )
                when {
                    state.error != null -> Text(state.error, fontSize = TYPE_BODY, modifier = Modifier.padding(top = 8.dp))
                    state.isLoading -> Text("Загрузка…", fontSize = TYPE_BODY, modifier = Modifier.padding(top = 8.dp))
                    state.items.isEmpty() -> EmptyCollection()
                    else -> CardGrid(
                        state = state,
                        // 3 uniform squares across (the count + uniform-row
                        // laws, 8.10): every photo tile the same fixed square.
                        columns = PHOTO_GRID_COLUMNS,
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
            // The unknown module's honest empty state (D6's stated TV
            // divergence): the module's own id as label — never an error,
            // never a hardcoded type list.
            else -> Column(modifier = Modifier.padding(top = 8.dp)) {
                if (library != null) {
                    Text(moduleLabel(library.moduleId), fontSize = TYPE_HEADING)
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
        fontSize = TYPE_BODY,
        modifier = Modifier.padding(top = 8.dp),
        color = Color.White.copy(alpha = 0.6f),
    )
}

/**
 * The card grid walker (the law's one landing for every body): the module's
 * width-driven tracks (D13 as amended by the count ruling, 8.10 — serial /
 * tv / photo all 3 across the centered
 * column), the cursor-in-state law, the left-edge rail-open trigger, and the
 * paged stream's append trigger — the cursor landing on the LAST loaded card
 * asks the flow for the next page (D6's paged stream; a chip pick restarts
 * it at offset 0).
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
 * The photo body's folder-chips row (design D6, wireframe 3.6 — the SPA's
 * PhotosBody FolderChip lane): [Все] + the served GET /libraries/{id}/folders
 * rows with their counts. A chip pick SERVER-FILTERS the paged stream
 * (path_prefix / top_level=true) and restarts it at offset 0 — the grid
 * pages exactly the stream a chip counts. The row walks Left/Right under the
 * moveInRow law. DOWN stays UNCONSUMED so the cursor crosses into the grid
 * below natively (D12's chips row, the L2 law); UP is clamped when nothing
 * focusable sits above the body ([aboveFocusable] — task 8.6): the key is
 * consumed, the chip keeps focus, and focus never escapes the body by a
 * runaway native search into the home rows.
 */
@Composable
private fun FolderChipsRow(
    state: BrowseState,
    onFocused: (Int) -> Unit,
    onLeft: () -> Unit,
    onPick: (String?) -> Unit,
    aboveFocusable: Boolean,
    modifier: Modifier = Modifier,
) {
    // Chip 0 = [Все] (no filter); chip i > 0 = the served folders[i - 1] —
    // the top-level chip reports path "" and filters with top_level=true.
    val chipCount = state.folders.size + 1
    LazyRow(
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
                        // The body-boundary clamp (task 8.6): no focusable
                        // target above the body — the key is consumed and
                        // the chip keeps focus (never a runaway native
                        // search into the home rows).
                        chipsRowConsumesUp(key, aboveFocusable) -> true
                        else -> false // DOWN (→ grid) and the edge clamps cross natively
                    }
                },
                modifier = Modifier.focusRequester(requester).tvFocusStyle(),
            )
        }
    }
}

/**
 * The serial body's facet lane (task 10.2 — the SPA's facetLane, audit
 * P1-3): one chips row per served facet key (GET /libraries/{id}/facets,
 * served order), the values verbatim with their counts, the active conjunct
 * in the accent (the FolderChip active law). The call site is UNCONDITIONAL
 * — the lane renders in EVERY serial body state (loading, error, empty,
 * grid) above the body content, because it is the CONTROL driving the
 * /series refetch, not a data block; undefined facets (the best-effort
 * fetch failed or served nothing) render no chips while the shell still
 * owns its row above the body.
 *
 * It reuses the FolderChipsRow shell: the shared [BrowseState.chipFocus]
 * cursor carries the Back law (the top-level chips link — chips Back
 * re-lands the parked grid cursor, and the body-closed Back stands down
 * while a facet chip holds focus), and the lane's TOP row rides the
 * [chipsRowConsumesUp] clamp so focus never escapes the body by a runaway
 * native search into the home rows. The cursor WALK itself is left to
 * Compose's native focus search (LEFT/RIGHT inside a row, DOWN across the
 * facet rows and into the grid below): the cursor writer's clamp is
 * folder-sized and the serial body serves no folders, so consuming and
 * re-landing through it would dead-end the walk — the same native crossing
 * the grid's law-unsatisfiable arrows ride (5.9).
 */
@Composable
private fun FacetChipsRow(
    state: BrowseState,
    onFocused: (Int) -> Unit,
    onLeft: () -> Unit,
    onToggle: (String, String) -> Unit,
    aboveFocusable: Boolean,
    modifier: Modifier = Modifier,
) {
    // The lane-level focus watcher, NOT a per-row one: a walk BETWEEN facet
    // rows must never drop the cursor — the Back link stands while any chip
    // of any row holds focus (the FolderChipsRow !hasFocus law, lifted to
    // the whole lane).
    Column(
        modifier = modifier.onFocusChanged { if (!it.hasFocus) onLeft() },
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        // The flat chip index across the lane's rows (row-major, served
        // order) — the cursor report's index space.
        val rowOffsets = state.facets.runningFold(0) { acc, facet -> acc + facet.values.size }
        state.facets.forEachIndexed { rowIndex, facet ->
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(
                    count = facet.values.size,
                    key = { index -> facet.values[index].value },
                ) { index ->
                    val value = facet.values[index]
                    FolderChip(
                        label = value.value,
                        count = value.count.toLong(),
                        active = state.facetSelection[facet.key] == value.value,
                        onClick = { onToggle(facet.key, value.value) },
                        onFocused = { onFocused(rowOffsets[rowIndex] + index) },
                        onDirection = { key ->
                            // The body-top clamp (task 8.6) rides the lane's
                            // FIRST row only — from the rows below, UP crosses
                            // natively into the facet row above.
                            chipsRowConsumesUp(key, aboveFocusable && rowIndex == 0)
                        },
                        modifier = Modifier.tvFocusStyle(),
                    )
                }
            }
        }
    }
}

/**
 * One folder filter chip (the SPA's FolderChip): the label, the folder's
 * count (the folders-endpoint total the filtered stream pages 1:1 — the
 * [Все] chip carries none), and the accent-colored active state. Focus rides
 * the L4 visual law; OK applies the filter.
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
            .clip(RoundedCornerShape(5.dp))
            .background(chipColor)
            .onFocusChanged { if (it.isFocused) onFocused() }
            .onKeyEvent { event -> routeDirectionEvent(event, onDirection) }
            .clickable(onClick = onClick)
            .padding(horizontal = 6.dp, vertical = 3.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            label,
            fontSize = TYPE_SMALL,
            color = if (active) tvAccent else Color.White,
        )
        if (count != null) {
            Text(
                count.toString(),
                fontSize = TYPE_META,
                color = tvAccent,
            )
        }
    }
}

/**
 * The collections rail (5.15 — the SPA sidebar translated to remote-native
 * navigation): one scrollable row per served collection. The rail cursor
 * walks through the moveInList law; LEFT/RIGHT close the rail (consumed —
 * focus returns to the content's parked cursor, the L3 restore law), and a
 * rail-top UP stays unconsumed so it still crosses to settings natively.
 * Rows render field-driven — name, module label (the pure 5.14 law) and the
 * count only when a summary answered; the current collection carries the
 * accent. OK acts on the FOCUSED row through clickable — the activation
 * routes to BrowseFlow.activateRailRow (the row's body opens, the rail
 * closes into it, and a body that cannot open keeps the rail + focus).
 *
 * Presentation (14.1, amendment §B): the panel is [AppCanvas] at
 * [RAIL_PANEL_WIDTH] (the SPA `.side`'s 224px ÷ 2) with a 1dp end-edge
 * [railBorder] border — D11's rail scrim is retired; the flow laws
 * (slide-in 5.15, hidden-by-default, focus restore) stand untouched.
 */
@Composable
private fun CollectionsRail(
    state: BrowseState,
    onSelect: () -> Unit,
    onClose: () -> Unit,
    onFocusMoved: (Int) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxHeight()
            .width(RAIL_PANEL_WIDTH)
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
                LaunchedEffect(state.isRailOpen, state.railFocus) {
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
                        val next = moveInList(index, state.libraries.size, key)
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
                    modifier = Modifier.focusRequester(requester).tvFocusStyle(),
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
 * One bordered rounded card (14.1 — the mockup's card anatomy, the SPA
 * SideColl's colors): a 1dp [railBorder] border at 4dp radius (SPA
 * --radius ÷ 2), a 4dp module dot in the type pastel (the D3 map = SPA
 * dotClass), the name at TYPE_META (.clink ÷ 2) — [tvAccent] when selected
 * (the existing law), [railMuted] otherwise — and the count TYPE_META
 * [railMuted] (.cnt). The FOCUS law rides the caller's [tvFocusStyle] (2dp
 * accent border + 1.1 scale) plus the mockup's accent-14% background tint
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
            // The focus tint (the mockup's color-mix accent-14%) under the
            // bordered card surface — the panel bg always stands beneath.
            .background(if (focused) tvAccent.copy(alpha = 0.14f) else Color.Transparent, cardShape)
            .border(1.dp, railBorder, cardShape)
            .padding(horizontal = 10.dp, vertical = 8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(4.dp).clip(CircleShape).background(dot))
            if (name.isNotBlank()) {
                Text(
                    name,
                    fontSize = TYPE_META,
                    color = if (selected) tvAccent else railMuted,
                    modifier = Modifier.padding(start = 6.dp),
                )
            }
        }
        Row(modifier = Modifier.padding(top = 2.dp)) {
            Text(module, fontSize = TYPE_META, color = railMuted)
            if (count != null) {
                Spacer(Modifier.weight(1f))
                Text(count.toString(), fontSize = TYPE_META, color = railMuted)
            }
        }
    }
}

@Composable
private fun SeriesPage(
    series: SeriesDto,
    episodes: List<ItemDto>,
    positions: Map<String, Long>,
    isLoading: Boolean,
    focusIndex: Int,
    accent: Color,
    serverBase: String?,
    token: String?,
    onFocusMoved: (Int) -> Unit,
    onPlay: (ItemDto) -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize().padding(32.dp)) {
        // The hero zone (design D5, wireframe 3.3): poster, title
        // (TYPE_DISPLAY — the 8.16 scale) and
        // the served about panel — facts line + Synopsis + genre chips. The
        // hero carries NO focus modifiers: the episode list below is the
        // walker's home and keeps the initial focus.
        SeriesHeroView(series, serverBase, token)
        when {
            isLoading && episodes.isEmpty() -> Text("Загрузка…", fontSize = TYPE_BODY, modifier = Modifier.padding(top = 8.dp))
            episodes.isEmpty() -> Text("Эпизоды не найдены", fontSize = TYPE_BODY, modifier = Modifier.padding(top = 8.dp))
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize().padding(top = 8.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                items(
                    count = episodes.size,
                    key = { index -> episodes[index].id },
                ) { index ->
                    val episode = episodes[index]
                    val requester = remember { FocusRequester() }
                    LaunchedEffect(focusIndex) {
                        if (focusIndex == index) requester.focusUntilAttached()
                    }
                    EpisodeRow(
                        // The stored position rides in from the flow's
                        // progress walk; the mapping owns the tri-state (a
                        // watched row or a duration-less row renders no bar).
                        card = episode.toCard(positions[episode.id]),
                        accent = accent,
                        onFocused = { onFocusMoved(index) },
                        serverBase = serverBase,
                        token = token,
                        onClick = { onPlay(episode) },
                        onDirection = { key ->
                            val next = moveInList(index, episodes.size, key)
                            if (next != index) {
                                onFocusMoved(next)
                                true
                            } else {
                                false
                            }
                        },
                        modifier = Modifier.focusRequester(requester).tvFocusStyle(),
                    )
                }
            }
        }
    }
}

/**
 * The hero zone (design D5 — the SPA's ItemDetail hero + Synopsis.tsx):
 * poster, title, facts line, Synopsis and the genre chips, every block a
 * null-check on the [SeriesHero] carriers — absent metadata or an empty
 * description renders NO panel, no facts line, no chips (L1). The muted
 * Synopsis clamps at 3 lines so the hero never towers (the SPA's clamp law;
 * the task's 2–4 line band). Nothing here is focusable.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SeriesHeroView(series: SeriesDto, serverBase: String?, token: String?) {
    val hero = series.toHero()
    if (hero.title == null && hero.posterUrl == null && hero.about == null) return
    Row(
        modifier = Modifier.padding(bottom = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        // FIELD-DRIVEN: absent artwork → no poster block, nothing fabricated
        // (the same artwork law as the cards — 5.13).
        val artwork = resolveArtworkUrl(serverBase, hero.posterUrl)
        if (artwork != null) {
            ArtworkImage(
                artwork = artwork,
                token = token,
                modifier = Modifier.width(60.dp).height(90.dp),
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            if (hero.title != null) {
                Text(
                    hero.title,
                    fontSize = TYPE_DISPLAY,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            val about = hero.about
            if (about != null) {
                if (about.facts != null) {
                    Text(
                        about.facts,
                        fontSize = TYPE_META,
                        color = Color.White.copy(alpha = 0.6f),
                        modifier = Modifier.padding(top = 3.dp),
                    )
                }
                Text(
                    about.description,
                    fontSize = TYPE_SMALL,
                    color = Color.White.copy(alpha = 0.6f),
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
                                fontSize = TYPE_META,
                                color = Color.White.copy(alpha = 0.6f),
                                modifier = Modifier
                                    .clip(RoundedCornerShape(5.dp))
                                    .background(chipColor)
                                    .padding(horizontal = 4.dp, vertical = 1.dp),
                            )
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
 * UNDER the art, the title (dimmed when watched), and the ONE meta line —
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
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    serverBase: String? = null,
    token: String? = null,
    onFocused: () -> Unit = {},
    onDirection: (DpadKey) -> Boolean = { false },
) {
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
        Box(modifier = Modifier.fillMaxWidth().aspectRatio(tileAspect)) {
            val artwork = resolveArtworkUrl(serverBase, card.artworkUrl)
            if (artwork != null) {
                ArtworkImage(
                    artwork = artwork,
                    token = token,
                    modifier = Modifier.fillMaxSize(),
                )
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
                fontSize = TYPE_BODY,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier
                    .padding(top = 4.dp)
                    .alpha(if (card.watched == true) WATCHED_DIM else 1f),
            )
        }
        if (card.meta != null) {
            Text(
                card.meta,
                fontSize = TYPE_META,
                color = Color.White.copy(alpha = 0.6f),
                modifier = Modifier.padding(top = 2.dp),
            )
        }
        // The photo tile's capture-date footer (D6): the served date ONLY —
        // an absent fact carries no footer block (L1).
        if (card.footer != null) {
            Text(
                card.footer,
                fontSize = TYPE_META,
                color = Color.White.copy(alpha = 0.6f),
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
private fun WatchedCornerMark(watched: Boolean, modifier: Modifier = Modifier) {
    if (!watched) return
    Text(
        "✓",
        fontSize = TYPE_META,
        color = DEFAULT_TYPE_ACCENT, // the SPA .watched-mark law: the mark is type-agnostic
        modifier = modifier.padding(3.dp),
    )
}

/**
 * The episode row (design D2, anatomy 3.4): the composed served name at
 * TYPE_HEADING (the 8.16 scale — SPA 18px), the ONE field-driven meta line,
 * and the same tri-state as the grid card — the in-progress bar rides the
 * still's bottom edge (the 36dp row has no room under the art), the watched
 * title dims, and the ✓ corner mark rides the thumb's top-end corner
 * (WatchedCornerMark, task 12.1 — OUT of the text stack, so row heights are
 * watched-independent), type-agnostic (the SPA .watched-mark pastel, D3) at
 * meta scale, NO bar. Word chips are RETIRED.
 * OK plays through clickable — the shipped play verb's launch leg resumes
 * from the stored position (no client seek math).
 */
@Composable
private fun EpisodeRow(
    card: DisplayCard,
    accent: Color,
    modifier: Modifier = Modifier,
    serverBase: String? = null,
    token: String? = null,
    onClick: () -> Unit = {},
    onFocused: () -> Unit = {},
    onDirection: (DpadKey) -> Boolean = { false },
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(36.dp)
            .onFocusChanged { if (it.isFocused) onFocused() }
            .onKeyEvent { event -> routeDirectionEvent(event, onDirection) }
            .clickable(onClick = onClick),
    ) {
        val artwork = resolveArtworkUrl(serverBase, card.artworkUrl)
        if (artwork != null) {
            Box(modifier = Modifier.width(60.dp).height(36.dp)) {
                ArtworkImage(
                    artwork = artwork,
                    token = token,
                    modifier = Modifier.fillMaxSize(),
                )
                // In-progress ONLY — a watched row never renders a bar (D2).
                if (card.watched != true && card.progress != null) {
                    InProgressBar(
                        percent = card.progress,
                        accent = accent,
                        modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth(),
                    )
                }
                // The watched ✓ rides the thumb's top-end corner (task 12.1)
                // — OUT of the text stack, so the row's height never depends
                // on watched; unwatched renders absence (no mark, no space).
                WatchedCornerMark(
                    watched = card.watched == true,
                    modifier = Modifier.align(Alignment.TopEnd),
                )
            }
        }
        Column(modifier = Modifier.padding(start = 6.dp)) {
            if (card.title != null) {
                Text(
                    card.title,
                    fontSize = TYPE_HEADING,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.alpha(if (card.watched == true) WATCHED_DIM else 1f),
                )
            }
            if (card.meta != null) {
                Text(
                    card.meta,
                    fontSize = TYPE_META,
                    color = Color.White.copy(alpha = 0.6f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
    }
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
 * rounded muted track with the type-accent fill at the served percent. The
 * caller owns the tri-state — a watched card never reaches here.
 */
@Composable
internal fun InProgressBar(percent: Int, accent: Color, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .height(3.dp)
            .clip(RoundedCornerShape(2.dp))
            .background(chipColor),
    ) {
        Box(
            modifier = Modifier
                .fillMaxHeight()
                .fillMaxWidth(percent / 100f)
                .background(accent),
        )
    }
}
