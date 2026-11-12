package tv.mellifera.browse

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import kotlinx.coroutines.launch
import tv.mellifera.AppViewModel
import tv.mellifera.net.ItemDto
import tv.mellifera.net.SeriesDto
import tv.mellifera.ui.SettingsSection
import tv.mellifera.ui.tvInitialFocus

/**
 * The browse surface (5.6): the serial+tv series grid and, one level down,
 * the open series' episode rows. Fetch-on-navigate runs on entry; the
 * player-exit refresh arrives through AppViewModel.onPlayerExit (5.7).
 * Every optional field renders through the DisplayCard model — a null
 * block renders NOTHING (the field-driven law, SeriesGrid.kt). D-pad
 * polish (initial-focus law, key routing) is 5.9's; this screen only keeps
 * focus on the first card and does not fight the focus law.
 */
private val accentColor = Color(0xFF4C8DFF)
private val chipColor = Color(0xFF2A2F3A)

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
            SeriesPage(selected, state.episodes, state.loading)
        } else {
            SeriesGrid(state, onOpen = { series -> scope.launch { browse.openSeries(series) } })
        }
    }
}

@Composable
private fun SeriesGrid(state: BrowseState, onOpen: (SeriesDto) -> Unit) {
    Column(modifier = Modifier.fillMaxSize().padding(32.dp)) {
        val library = state.libraries.firstOrNull { it.id == state.libraryId }
        if (library != null) {
            Text(library.displayName, fontSize = 28.sp)
        }
        when {
            state.error != null -> Text(state.error, modifier = Modifier.padding(top = 16.dp))
            state.loading -> Text("Загрузка…", modifier = Modifier.padding(top = 16.dp))
            else -> LazyVerticalGrid(
                columns = GridCells.Fixed(4),
                modifier = Modifier.fillMaxSize().padding(top = 16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                itemsIndexed(state.series, key = { _, series -> series.id }) { index, series ->
                    CardView(
                        card = series.toCard(),
                        onClick = { onOpen(series) },
                        modifier = if (index == 0) Modifier.tvInitialFocus else Modifier,
                    )
                }
            }
        }
    }
}

@Composable
private fun SeriesPage(series: SeriesDto, episodes: List<ItemDto>, loading: Boolean) {
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
                items(episodes, key = { it.id }) { episode ->
                    EpisodeRow(episode.toCard())
                }
            }
        }
    }
}

@Composable
private fun CardView(card: DisplayCard, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .width(220.dp)
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
private fun EpisodeRow(card: DisplayCard) {
    Row(modifier = Modifier.fillMaxWidth().height(72.dp)) {
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
