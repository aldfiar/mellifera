package tv.mellifera.browse

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.tv.material3.Text
import tv.mellifera.dpad.DpadKey
import tv.mellifera.ui.tvFocusStyle
import tv.mellifera.ui.tvMuted
import tv.mellifera.ui.typeMeta
import tv.mellifera.ui.typeSmall

/**
 * The episode card (the series page's grid card — the episode anatomy
 * row): the 16:9 still → the served-title title clamped to
 * two lines at SMALL → the duration line at META. The tri-state rides ON
 * the still (the 36dp row had no room; the still is the card's one stage):
 * watched → the ✓ corner and NO bar; in-progress → the bar and NO ✓; a new
 * episode → neither. Field-driven law untouched — absent artwork renders
 * the deterministic fallback in the fixed-aspect art box; an absent title
 * or duration renders absence, never a placeholder. No logic beyond
 * composition: every carrier was resolved by the mapping (SeriesGrid.kt).
 * OK plays through clickable — the play verb's launch leg resumes from the
 * stored position (the 2026-11-12 dead-OK defect stays fixed).
 */
@Composable
fun EpisodeCard(
    card: DisplayCard,
    accent: Color,
    modifier: Modifier = Modifier,
    serverBase: String? = null,
    token: String? = null,
    onClick: () -> Unit = {},
    onFocused: () -> Unit = {},
    onDirection: (DpadKey) -> Boolean = { false },
) {
    // The grid card's tile radius (the CardView law — SPA .scard's
    // var(--radius) 8px ÷ 2): the still clips to it.
    val stillShape = RoundedCornerShape(4.dp)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .onFocusChanged { if (it.isFocused) onFocused() }
            .onKeyEvent { event -> routeDirectionEvent(event, onDirection) }
            .clickable(onClick = onClick),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        // The fixed-aspect still — unconditional (the uniform-row law):
        // artwork Crop-fills it, its absence leaves the fallback surface,
        // and the ✓/bar ride its corners, so card heights never depend on
        // watched state.
        Box(modifier = Modifier.fillMaxWidth().aspectRatio(STILL_ASPECT).clip(stillShape)) {
            val artwork = resolveArtworkUrl(serverBase, card.artworkUrl)
            if (artwork != null) {
                ArtworkImage(
                    artwork = artwork,
                    token = token,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                FallbackArtwork(name = card.title, modifier = Modifier.fillMaxSize())
            }
            // In-progress ONLY — a watched card never renders a bar (D2).
            if (card.watched != true && card.progress != null) {
                InProgressBar(
                    percent = card.progress,
                    accent = accent,
                    modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth(),
                )
            }
            // The watched ✓ rides the still's top-end corner;
            // unwatched renders absence (no mark, no space — L1).
            WatchedCornerMark(
                watched = card.watched == true,
                modifier = Modifier.align(Alignment.TopEnd),
            )
        }
        if (card.title != null) {
            Text(
                card.title,
                fontSize = typeSmall(),
                fontWeight = FontWeight.Medium, // the SPA episode-card title font-medium
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.alpha(if (card.watched == true) WATCHED_DIM else 1f),
            )
        }
        if (card.duration != null) {
            Text(
                card.duration,
                fontSize = typeMeta(),
                color = tvMuted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
