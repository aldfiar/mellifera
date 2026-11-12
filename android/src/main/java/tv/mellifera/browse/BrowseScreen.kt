package tv.mellifera.browse

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
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
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.KeyEvent
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import kotlinx.coroutines.launch
import tv.mellifera.AppViewModel
import tv.mellifera.dpad.DpadKey
import tv.mellifera.dpad.isDirectional
import tv.mellifera.dpad.moveInGrid
import tv.mellifera.dpad.moveInList
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
 * it across rails (grid top row → settings).
 */
private val accentColor = Color(0xFF4C8DFF)
private val chipColor = Color(0xFF2A2F3A)

/** The series grid renders 4 cards per row (the cursor law's column count). */
private const val GRID_COLUMNS = 4

@Composable
fun BrowseScreen(viewModel: AppViewModel) {
    val browse = viewModel.browse
    val state by browse.state.collectAsState()
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { browse.enter() }
    val selected = state.selectedSeries
    BackHandler(enabled = selected != null) { browse.closeSeries() }
    Column(modifier = Modifier.fillMaxSize()) {
        // The minimal settings surface (5.11): the share affordance, gated.
        SettingsSection(viewModel)
        if (selected != null) {
            SeriesPage(
                series = selected,
                episodes = state.episodes,
                loading = state.loading,
                focusIndex = state.episodeFocus,
                onFocusMoved = { browse.onEpisodeFocusMoved(it) },
            )
        } else {
            SeriesGrid(
                state = state,
                onOpen = { series -> scope.launch { browse.openSeries(series) } },
                onFocusMoved = { browse.onGridFocusMoved(it) },
            )
        }
    }
}

@Composable
private fun SeriesGrid(
    state: BrowseState,
    onOpen: (SeriesDto) -> Unit,
    onFocusMoved: (Int) -> Unit,
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
                    // entry (cursor 0) and on every law move, and again
                    // after Back — this IS the initial-focus law here.
                    LaunchedEffect(state.gridFocus) {
                        if (state.gridFocus == index) requester.requestFocusSafely()
                    }
                    CardView(
                        card = series.toCard(),
                        onClick = { onOpen(series) },
                        onFocused = { onFocusMoved(index) },
                        onDirection = { key ->
                            val next = moveInGrid(index, GRID_COLUMNS, state.series.size, key)
                            if (next != index) {
                                onFocusMoved(next)
                                true // consumed inside the grid
                            } else {
                                false // rail edge — cross the rail natively
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
private fun SeriesPage(
    series: SeriesDto,
    episodes: List<ItemDto>,
    loading: Boolean,
    focusIndex: Int,
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
        // FIELD-DRIVEN: absent artwork → no artwork block, nothing fabricated.
        if (card.artworkUrl != null) {
            AsyncImage(
                model = card.artworkUrl,
                contentDescription = null,
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
        if (card.artworkUrl != null) {
            AsyncImage(
                model = card.artworkUrl,
                contentDescription = null,
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
