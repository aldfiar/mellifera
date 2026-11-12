package tv.mellifera.browse

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.KeyEvent
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
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
import tv.mellifera.dpad.toDpadKey
import tv.mellifera.net.ItemDto
import tv.mellifera.net.LibraryDto
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

/** The collections rail (5.15): the slide-over panel and its scrim. */
private val railColor = Color(0xFF171A21)
private val railWidth = 360.dp

/** The series grid renders 4 cards per row (the cursor law's column count). */
private const val GRID_COLUMNS = 4

@Composable
fun BrowseScreen(viewModel: AppViewModel) {
    val browse = viewModel.browse
    val state by browse.state.collectAsState()
    val appState by viewModel.state.collectAsState()
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { browse.enter() }
    val selected = state.selectedSeries
    BackHandler(enabled = selected != null) { browse.closeSeries() }
    // The chain's first link (5.15): an open rail takes Back BEFORE the
    // series page — this handler is composed after the series one, so it
    // wins when both are enabled. Closing keeps the grid's parked cursor.
    BackHandler(enabled = state.railOpen) { browse.closeRail() }
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
                    loading = state.loading,
                    focusIndex = state.episodeFocus,
                    serverBase = serverBase,
                    token = token,
                    onFocusMoved = { browse.onEpisodeFocusMoved(it) },
                )
            } else {
                SeriesGrid(
                    state = state,
                    onOpen = { series -> scope.launch { browse.openSeries(series) } },
                    onFocusMoved = { browse.onGridFocusMoved(it) },
                    onOpenRail = { scope.launch { browse.openRail() } },
                    serverBase = serverBase,
                    token = token,
                )
            }
        }
        // The collections rail (5.15): slides in over the grid's left edge.
        // It is a rail of the Browse surface — never a third Screen (the
        // when-shell law, ui/App.kt). OK selects; LEFT/Back close it with
        // the grid's prior focus position intact.
        AnimatedVisibility(
            visible = state.railOpen && selected == null,
            enter = slideInHorizontally(initialOffsetX = { -it }),
            exit = slideOutHorizontally(targetOffsetX = { -it }),
        ) {
            CollectionsRail(
                state = state,
                onSelect = { library ->
                    scope.launch {
                        browse.selectLibrary(library.id)
                        browse.closeRail()
                    }
                },
                onClose = { browse.closeRail() },
                onFocusMoved = { browse.onRailFocusMoved(it) },
            )
        }
    }
}

@Composable
private fun SeriesGrid(
    state: BrowseState,
    onOpen: (SeriesDto) -> Unit,
    onFocusMoved: (Int) -> Unit,
    onOpenRail: () -> Unit,
    serverBase: String?,
    token: String?,
) {
    Column(modifier = Modifier.fillMaxSize().padding(32.dp)) {
        val library = state.libraries.firstOrNull { it.id == state.libraryId }
        if (library != null) {
            Text(library.displayName, fontSize = 28.sp)
        }
        when {
            state.error != null -> Text(state.error, modifier = Modifier.padding(top = 16.dp))
            state.loading -> Text("Загрузка…", modifier = Modifier.padding(top = 16.dp))
            else -> LazyVerticalGrid(
                columns = GridCells.Fixed(GRID_COLUMNS),
                modifier = Modifier.fillMaxSize().padding(top = 16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                itemsIndexed(state.series, key = { _, series -> series.id }) { index, series ->
                    val requester = remember { FocusRequester() }
                    // The cursor state is the focus source of truth: on
                    // entry (cursor 0) and on every law move, again after
                    // Back, and again when the rail closes over a parked
                    // cursor — this IS the initial-focus law here. While
                    // the rail is open the grid holds no focus.
                    LaunchedEffect(state.gridFocus, state.railOpen) {
                        if (state.gridFocus == index && !state.railOpen) {
                            requester.requestFocusSafely()
                        }
                    }
                    CardView(
                        card = series.toCard(),
                        onClick = { onOpen(series) },
                        onFocused = { onFocusMoved(index) },
                        serverBase = serverBase,
                        token = token,
                        onDirection = { key ->
                            val next = moveInGrid(index, GRID_COLUMNS, state.series.size, key)
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
                        modifier = Modifier.focusRequester(requester).tvFocusStyle(),
                    )
                }
            }
        }
    }
}

/**
 * The collections rail (5.15 — the SPA sidebar translated to remote-native
 * navigation): one scrollable row per served collection. The rail cursor
 * walks through the moveInList law; LEFT closes the rail (consumed), and a
 * rail-top UP stays unconsumed so it still crosses to settings natively.
 * Rows render field-driven — name, module label (the pure 5.14 law) and the
 * count only when a summary answered; the current collection carries the
 * accent. OK selects through clickable.
 */
@Composable
private fun CollectionsRail(
    state: BrowseState,
    onSelect: (LibraryDto) -> Unit,
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
                // law move it follows the walk.
                LaunchedEffect(state.railFocus) {
                    if (state.railFocus == index) requester.requestFocusSafely()
                }
                RailRow(
                    name = library.displayName,
                    module = moduleLabel(library.moduleId),
                    count = state.summaries[library.id]?.items,
                    selected = library.id == state.libraryId,
                    onClick = { onSelect(library) },
                    onFocused = { onFocusMoved(index) },
                    onDirection = { key ->
                        val next = moveInList(index, state.libraries.size, key)
                        when {
                            next != index -> {
                                onFocusMoved(next)
                                true // consumed inside the rail
                            }
                            key == DpadKey.Left -> {
                                onClose() // LEFT anywhere in the rail closes it
                                true
                            }
                            key == DpadKey.Right -> true // the open rail owns the surface
                            else -> false // rail-top UP still crosses natively
                        }
                    },
                    modifier = Modifier.focusRequester(requester).tvFocusStyle(),
                )
            }
        }
    }
}

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
    loading: Boolean,
    focusIndex: Int,
    serverBase: String?,
    token: String?,
    onFocusMoved: (Int) -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize().padding(32.dp)) {
        if (series.displayName.isNotBlank()) {
            Text(series.displayName, fontSize = 28.sp)
        }
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
                        card = episode.toCard(),
                        onFocused = { onFocusMoved(index) },
                        serverBase = serverBase,
                        token = token,
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

@Composable
private fun CardView(
    card: DisplayCard,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    serverBase: String? = null,
    token: String? = null,
    onFocused: () -> Unit = {},
    onDirection: (DpadKey) -> Boolean = { false },
) {
    Column(
        modifier = modifier
            .width(220.dp)
            .onFocusChanged { if (it.isFocused) onFocused() }
            .onKeyEvent { event -> routeDirectionEvent(event, onDirection) }
            .clickable(onClick = onClick),
    ) {
        // FIELD-DRIVEN: absent artwork → no artwork block, nothing fabricated
        // (a relative path with no stored base resolves to absent too).
        val artwork = resolveArtworkUrl(serverBase, card.artworkUrl)
        if (artwork != null) {
            ArtworkImage(
                artwork = artwork,
                token = token,
                modifier = Modifier.fillMaxWidth().height(160.dp),
            )
        }
        if (card.title != null) {
            Text(card.title, fontSize = 16.sp, modifier = Modifier.padding(top = 8.dp))
        }
        if (card.watched != null) {
            WatchedChip(card.watched, modifier = Modifier.padding(top = 4.dp))
        }
    }
}

@Composable
private fun EpisodeRow(
    card: DisplayCard,
    modifier: Modifier = Modifier,
    serverBase: String? = null,
    token: String? = null,
    onFocused: () -> Unit = {},
    onDirection: (DpadKey) -> Boolean = { false },
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(72.dp)
            .onFocusChanged { if (it.isFocused) onFocused() }
            .onKeyEvent { event -> routeDirectionEvent(event, onDirection) }
            .focusable(),
    ) {
        val artwork = resolveArtworkUrl(serverBase, card.artworkUrl)
        if (artwork != null) {
            ArtworkImage(
                artwork = artwork,
                token = token,
                modifier = Modifier.width(120.dp).height(72.dp),
            )
        }
        Column(modifier = Modifier.padding(start = 12.dp)) {
            if (card.title != null) {
                Text(card.title, fontSize = 16.sp)
            }
            if (card.watched != null) {
                WatchedChip(card.watched, modifier = Modifier.padding(top = 4.dp))
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
private fun ArtworkImage(
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
private fun routeDirectionEvent(
    event: KeyEvent,
    onDirection: (DpadKey) -> Boolean,
): Boolean {
    if (event.type != KeyEventType.KeyDown) return false
    val key = event.nativeKeyEvent.toDpadKey() ?: return false
    if (!key.isDirectional) return false
    return onDirection(key)
}

@Composable
private fun WatchedChip(watched: Boolean, modifier: Modifier = Modifier) {
    val label = if (watched) "Просмотрено" else "Не просмотрено"
    Text(
        label,
        fontSize = 12.sp,
        color = if (watched) accentColor else Color.White,
        modifier = modifier
            .background(chipColor, RoundedCornerShape(4.dp))
            .padding(horizontal = 8.dp, vertical = 2.dp),
    )
}
