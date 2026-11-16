package tv.mellifera.browse

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
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
import tv.mellifera.dpad.isDirectional
import tv.mellifera.dpad.moveInGrid
import tv.mellifera.dpad.moveInList
import tv.mellifera.dpad.moveInRow
import tv.mellifera.dpad.toDpadKey
import tv.mellifera.net.ItemDto
import tv.mellifera.net.SeriesDto
import tv.mellifera.ui.SettingsSection
import tv.mellifera.ui.requestFocusSafely
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
private val accentColor = Color(0xFF4C8DFF)
private val chipColor = Color(0xFF2A2F3A)

/** The watched title's dim (design D2 — the SPA's .watched-dim, 0.55). */
private const val WATCHED_DIM = 0.55f

/** The collections rail (5.15): the slide-over panel and its scrim. */
private val railColor = Color(0xFF171A21)
private val railWidth = 360.dp

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
    BackHandler(enabled = state.railOpen) { browse.closeRail() }
    // The chips row's Back (D12's dpad map): focus returns to the grid —
    // never a silent state wipe, the photo body's filter stays applied.
    BackHandler(enabled = selected == null && !state.railOpen && state.chipFocus >= 0) {
        browse.refocusGridFromChips()
    }
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
                    loading = state.loading,
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
                        HomeRows(
                            home = homeState,
                            railOpen = state.railOpen,
                            railRestoreHome = state.railRestoreHome,
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
                            onOpen = { series -> scope.launch { browse.openSeries(series) } },
                            onPlay = { itemId -> viewModel.playback.play(itemId) },
                            onFocusMoved = { browse.onGridFocusMoved(it) },
                            onOpenRail = { scope.launch { browse.openRail() } },
                            onExtendItems = { scope.launch { browse.extendItems() } },
                            onChipFocused = { browse.onChipFocusMoved(it) },
                            onChipsLeft = { browse.clearChipFocus() },
                            onPickFolder = { path -> scope.launch { browse.pickFolder(path) } },
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
            visible = state.railOpen && selected == null,
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
    onOpen: (SeriesDto) -> Unit,
    onPlay: (String) -> Unit,
    onFocusMoved: (Int) -> Unit,
    onOpenRail: () -> Unit,
    onExtendItems: () -> Unit,
    onChipFocused: (Int) -> Unit,
    onChipsLeft: () -> Unit,
    onPickFolder: (String?) -> Unit,
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
            Text(library.displayName, fontSize = 28.sp)
        }
        val accent = typeAccent(library?.moduleId ?: "")
        when (library?.moduleId) {
            "serial" -> when {
                state.error != null -> Text(state.error, modifier = Modifier.padding(top = 16.dp))
                state.loading -> Text("Загрузка…", modifier = Modifier.padding(top = 16.dp))
                else -> CardGrid(
                    state = state,
                    // D13: 4 posters across the column (the fixed 2:3 tile).
                    columns = SERIES_GRID_COLUMNS,
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
            "tv" -> when {
                state.error != null -> Text(state.error, modifier = Modifier.padding(top = 16.dp))
                state.loading -> Text("Загрузка…", modifier = Modifier.padding(top = 16.dp))
                state.items.isEmpty() -> EmptyCollection()
                else -> CardGrid(
                    state = state,
                    // D13: 3 stills across the column (the fixed 16:9 tile).
                    columns = TV_FILE_GRID_COLUMNS,
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
                    modifier = Modifier.padding(top = 8.dp),
                )
                when {
                    state.error != null -> Text(state.error, modifier = Modifier.padding(top = 16.dp))
                    state.loading -> Text("Загрузка…", modifier = Modifier.padding(top = 16.dp))
                    state.items.isEmpty() -> EmptyCollection()
                    else -> CardGrid(
                        state = state,
                        // The photo masonry keeps its track count (D13 leaves
                        // the image body's geometry untouched).
                        columns = PHOTO_GRID_COLUMNS,
                        count = state.items.size,
                        keyOf = { index -> state.items[index].id },
                        cardOf = { index -> state.items[index].toPhotoCard() },
                        accent = accent,
                        onClick = {},
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
            else -> Column(modifier = Modifier.padding(top = 16.dp)) {
                if (library != null) {
                    Text(moduleLabel(library.moduleId), fontSize = 18.sp)
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
        modifier = Modifier.padding(top = 16.dp),
        color = Color.White.copy(alpha = 0.6f),
    )
}

/**
 * The card grid walker (the law's one landing for every body): the module's
 * width-driven tracks (D13 — serial 4 / tv 3 / photo 4 across the centered
 * column), the cursor-in-state law, the left-edge rail-open trigger, and the
 * paged stream's append trigger — the cursor landing on the LAST loaded card
 * asks the flow for the next page (D6's paged stream; a chip pick restarts
 * it at offset 0).
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun CardGrid(
    state: BrowseState,
    columns: Int,
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
        modifier = Modifier.fillMaxSize().padding(top = 16.dp),
        verticalArrangement = Arrangement.spacedBy(PARITY_GUTTER),
        horizontalArrangement = Arrangement.spacedBy(PARITY_GUTTER),
    ) {
        items(count = count, key = keyOf) { index ->
            val requester = remember { FocusRequester() }
            val intoView = remember { BringIntoViewRequester() }
            // The cursor state is the focus source of truth: on entry
            // (cursor 0), on every law move, and again after the chips row's
            // Back (the gridFocusNonce bump — D12's chips Back → grid).
            // While the rail is open the grid holds no focus. The rail-close
            // restore is a separate effect: it stands down when the rail was
            // opened from a home row (railRestoreHome — the opener's own
            // cursor restores, task 3.2), so the two surfaces never race
            // for the focus on a close.
            LaunchedEffect(state.gridFocus) {
                if (state.gridFocus == index && !state.railOpen) {
                    requester.requestFocusSafely()
                }
            }
            LaunchedEffect(state.gridFocusNonce) {
                if (state.gridFocusNonce > 0 && state.gridFocus == index && !state.railOpen) {
                    requester.requestFocusSafely()
                }
            }
            LaunchedEffect(state.railOpen) {
                if (!state.railOpen && !state.railRestoreHome && state.gridFocus == index) {
                    requester.requestFocusSafely()
                }
            }
            CardView(
                card = cardOf(index),
                accent = accent,
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
 * moveInRow law; Up/Down stay UNCONSUMED so the cursor crosses to settings
 * above and into the grid below natively (D12's chips row, the L2 law).
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
                    if (next != index) {
                        onFocused(next)
                        true // consumed inside the chips row
                    } else {
                        false // Up/Down and the edge clamps cross natively
                    }
                },
                modifier = Modifier.focusRequester(requester).tvFocusStyle(),
            )
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
            .clip(RoundedCornerShape(10.dp))
            .background(chipColor)
            .onFocusChanged { if (it.isFocused) onFocused() }
            .onKeyEvent { event -> routeDirectionEvent(event, onDirection) }
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            label,
            fontSize = 14.sp,
            color = if (active) accentColor else Color.White,
        )
        if (count != null) {
            Text(
                count.toString(),
                fontSize = 12.sp,
                color = accentColor,
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
            .width(railWidth)
            .background(railColor),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(8.dp),
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
                LaunchedEffect(state.railOpen, state.railFocus) {
                    if (state.railOpen && state.railFocus == index) {
                        requester.focusUntilAttached()
                    }
                }
                RailRow(
                    name = library.displayName,
                    module = moduleLabel(library.moduleId),
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
    }
}

/**
 * The transition-composed focus actuator (the walk-found 4.2 fix): a focus
 * request aimed at a node still entering the slide-in transition throws
 * until the node's focus target attaches to the window — the one-shot
 * actuator's swallowed request left the rail rendered but never focused,
 * with the content card holding focus underneath (the dead rail-walk the
 * on-device walk falsified). The request re-arms once per frame until it
 * lands, the caller's effect is cancelled (another row walked or the rail
 * closed again), or [FOCUS_RETRY_FRAMES] elapse.
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

@Composable
private fun RailRow(
    name: String,
    module: String,
    count: Long?,
    selected: Boolean,
    onClick: () -> Unit,
    onFocused: () -> Unit,
    onDirection: (DpadKey) -> Boolean,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .onFocusChanged { if (it.isFocused) onFocused() }
            .onKeyEvent { event -> routeDirectionEvent(event, onDirection) }
            .clickable(onClick = onClick),
    ) {
        // FIELD-DRIVEN: a blank name renders nothing; the module label is
        // always readable (moduleLabel's law); the count renders ONLY when
        // a summary answered — no count yet, no count block.
        if (name.isNotBlank()) {
            Text(
                name,
                fontSize = 18.sp,
                color = if (selected) accentColor else Color.White,
            )
        }
        Row(modifier = Modifier.padding(top = 4.dp)) {
            Text(module, fontSize = 12.sp, color = Color.White)
            if (count != null) {
                Text(
                    count.toString(),
                    fontSize = 12.sp,
                    color = accentColor,
                    modifier = Modifier.padding(start = 12.dp),
                )
            }
        }
    }
}

@Composable
private fun SeriesPage(
    series: SeriesDto,
    episodes: List<ItemDto>,
    positions: Map<String, Long>,
    loading: Boolean,
    focusIndex: Int,
    accent: Color,
    serverBase: String?,
    token: String?,
    onFocusMoved: (Int) -> Unit,
    onPlay: (ItemDto) -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize().padding(32.dp)) {
        // The hero zone (design D5, wireframe 3.3): poster, title (28sp) and
        // the served about panel — facts line + Synopsis + genre chips. The
        // hero carries NO focus modifiers: the episode list below is the
        // walker's home and keeps the initial focus.
        SeriesHeroView(series, serverBase, token)
        when {
            loading && episodes.isEmpty() -> Text("Загрузка…", modifier = Modifier.padding(top = 16.dp))
            episodes.isEmpty() -> Text("Эпизоды не найдены", modifier = Modifier.padding(top = 16.dp))
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize().padding(top = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(
                    count = episodes.size,
                    key = { index -> episodes[index].id },
                ) { index ->
                    val episode = episodes[index]
                    val requester = remember { FocusRequester() }
                    LaunchedEffect(focusIndex) {
                        if (focusIndex == index) requester.requestFocusSafely()
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
        modifier = Modifier.padding(bottom = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // FIELD-DRIVEN: absent artwork → no poster block, nothing fabricated
        // (the same artwork law as the cards — 5.13).
        val artwork = resolveArtworkUrl(serverBase, hero.posterUrl)
        if (artwork != null) {
            ArtworkImage(
                artwork = artwork,
                token = token,
                modifier = Modifier.width(120.dp).height(180.dp),
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            if (hero.title != null) {
                Text(hero.title, fontSize = 28.sp)
            }
            val about = hero.about
            if (about != null) {
                if (about.facts != null) {
                    Text(
                        about.facts,
                        fontSize = 12.sp,
                        color = Color.White.copy(alpha = 0.6f),
                        modifier = Modifier.padding(top = 6.dp),
                    )
                }
                Text(
                    about.description,
                    fontSize = 14.sp,
                    color = Color.White.copy(alpha = 0.6f),
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 8.dp),
                )
                if (about.genres.isNotEmpty()) {
                    FlowRow(
                        modifier = Modifier.padding(top = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        about.genres.forEach { genre ->
                            Text(
                                genre,
                                fontSize = 12.sp,
                                color = Color.White.copy(alpha = 0.6f),
                                modifier = Modifier
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(chipColor)
                                    .padding(horizontal = 8.dp, vertical = 2.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * The grid card (design D2 — the SPA card law, TV-rendered): artwork, the
 * in-progress bar UNDER the art, the title (dimmed when watched), the ONE
 * meta line, and the ✓ glyph — ONE glyph, type-agnostic (the SPA
 * .watched-mark pastel, D3) at meta scale, never a word chip. The tri-state
 * is a rendering null-check on the
 * DisplayCard carriers: watched → glyph + dim + NO bar; in-progress → the
 * bar only; new → clean.
 */
@Composable
private fun CardView(
    card: DisplayCard,
    accent: Color,
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
        // FIELD-DRIVEN: absent artwork → no artwork block, nothing fabricated
        // (a relative path with no stored base resolves to absent too). The
        // aspect rides the card's mapping (D13): serial fixed 2:3, tv fixed
        // 16:9, photo the served ratio; null keeps the fixed-height block.
        val artwork = resolveArtworkUrl(serverBase, card.artworkUrl)
        if (artwork != null) {
            val artModifier = card.aspect?.takeIf { it > 0 }
                ?.let { ratio -> Modifier.fillMaxWidth().aspectRatio(ratio) }
                ?: Modifier.fillMaxWidth().height(160.dp)
            ArtworkImage(
                artwork = artwork,
                token = token,
                modifier = artModifier,
            )
        }
        // In-progress ONLY — a watched card never renders a bar (D2).
        if (card.watched != true && card.progress != null) {
            InProgressBar(
                percent = card.progress,
                accent = accent,
                modifier = Modifier.padding(top = 6.dp),
            )
        }
        if (card.title != null) {
            Text(
                card.title,
                fontSize = 16.sp,
                modifier = Modifier
                    .padding(top = 8.dp)
                    .alpha(if (card.watched == true) WATCHED_DIM else 1f),
            )
        }
        if (card.meta != null) {
            Text(
                card.meta,
                fontSize = 12.sp,
                color = Color.White.copy(alpha = 0.6f),
                modifier = Modifier.padding(top = 4.dp),
            )
        }
        // The photo tile's capture-date footer (D6): the served date ONLY —
        // an absent fact carries no footer block (L1).
        if (card.footer != null) {
            Text(
                card.footer,
                fontSize = 12.sp,
                color = Color.White.copy(alpha = 0.6f),
                modifier = Modifier.padding(top = 4.dp),
            )
        }
        if (card.watched == true) {
            Text(
                "✓",
                fontSize = 12.sp,
                color = DEFAULT_TYPE_ACCENT, // the SPA .watched-mark law: the mark is type-agnostic
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}

/**
 * The episode row (design D2, anatomy 3.4): the composed served name at the
 * 18sp title floor, the ONE field-driven meta line, and the same tri-state
 * as the grid card — the in-progress bar rides the still's bottom edge (the
 * 72dp row has no room under the art), the watched title dims, the ✓ glyph
 * renders type-agnostic (the SPA .watched-mark pastel, D3) at meta scale, NO
 * bar. Word chips are RETIRED.
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
            .height(72.dp)
            .onFocusChanged { if (it.isFocused) onFocused() }
            .onKeyEvent { event -> routeDirectionEvent(event, onDirection) }
            .clickable(onClick = onClick),
    ) {
        val artwork = resolveArtworkUrl(serverBase, card.artworkUrl)
        if (artwork != null) {
            Box(modifier = Modifier.width(120.dp).height(72.dp)) {
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
            }
        }
        Column(modifier = Modifier.padding(start = 12.dp)) {
            if (card.title != null) {
                Text(
                    card.title,
                    fontSize = 18.sp,
                    modifier = Modifier.alpha(if (card.watched == true) WATCHED_DIM else 1f),
                )
            }
            if (card.meta != null) {
                Text(
                    card.meta,
                    fontSize = 12.sp,
                    color = Color.White.copy(alpha = 0.6f),
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
            if (card.watched == true) {
                Text(
                    "✓",
                    fontSize = 12.sp,
                    color = DEFAULT_TYPE_ACCENT, // the SPA .watched-mark law: the mark is type-agnostic
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
    }
}

/**
 * The one Coil image request (5.13): the resolved URL, and the bearer token
 * ONLY on our server's artwork (relative wire path) — a CDN fetch never
 * carries the device credential.
 */
@Composable
internal fun ArtworkImage(
    artwork: ArtworkRequest,
    token: String?,
    modifier: Modifier = Modifier,
) {
    AsyncImage(
        model = ImageRequest.Builder(LocalContext.current)
            .data(artwork.url)
            .apply {
                if (artwork.authorized && !token.isNullOrBlank()) {
                    setHeader("Authorization", "Bearer $token")
                }
            }
            .build(),
        contentDescription = null,
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
            .height(6.dp)
            .clip(RoundedCornerShape(3.dp))
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
