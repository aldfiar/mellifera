package tv.mellifera.browse

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import kotlinx.coroutines.launch
import tv.mellifera.dpad.DpadKey
import tv.mellifera.dpad.moveInRow
import tv.mellifera.home.AnchorCardModel
import tv.mellifera.home.HomeState
import tv.mellifera.home.ResumeCardModel
import tv.mellifera.home.toAnchorCard
import tv.mellifera.home.toResumeCard
import tv.mellifera.net.LibraryDto
import tv.mellifera.ui.requestFocusSafely
import tv.mellifera.ui.tvFocusStyle

/**
 * The home surface's rows (design D4, wireframe 3.1): the Continue row
 * (resume cards) and the Next-up row (anchor cards) rendered above the
 * collection grid, from the ONE served /home response carried in
 * [HomeState]. The `current` branch is the pure mapping's (home/
 * HomeCards.kt); the UI only null-checks its carriers — an empty served
 * array renders NO row, never a placeholder (L1).
 *
 * The rows are horizontal walkers under the cursor-in-state law (L2):
 * Left/Right route through the pure [moveInRow] and the cursors live in
 * the home flow's state; Up/Down stay UNCONSUMED so Compose's focus search
 * crosses rows, the settings section and the grid natively. LEFT at row-0
 * x=0 opens the collections rail (the 5.15 idiom) — the opener is recorded
 * ([HomeRowWalker.railRestoreHome]) so the rail close restores THIS
 * cursor, never the grid's (L3). Entry focus stays the grid's (the
 * wireframe's focused cell): these cards suppress their own
 * composition-time focus launches.
 *
 * Copy is RU (L7); the row labels mirror the SPA Home's section headers.
 */
private const val CONTINUE_LABEL = "Продолжить"
private const val NEXT_UP_LABEL = "Следующая серия"

/**
 * One home row's walker config, shared by its cards: the cursor-in-state
 * source, the rail-open trigger's row-0 exclusivity, and the rail-close
 * restore's ownership.
 */
private data class HomeRowWalker(
    val focus: Int,
    val isTopRow: Boolean,
    val railOpen: Boolean,
    val railRestoreHome: Boolean,
    val onFocusMoved: (Int) -> Unit,
    val onOpenRail: () -> Unit,
)

@Composable
internal fun HomeRows(
    home: HomeState,
    railOpen: Boolean,
    railRestoreHome: Boolean,
    libraries: List<LibraryDto>,
    serverBase: String?,
    token: String?,
    onContinueFocusMoved: (Int) -> Unit,
    onNextUpFocusMoved: (Int) -> Unit,
    onResume: (String) -> Unit,
    onNext: (String) -> Unit,
    onOpenRail: () -> Unit,
) {
    // The pure branch over the wire's `current`, served order preserved —
    // no client re-sort, no second derivation (L6).
    val resumes = home.rows.mapNotNull { it.toResumeCard() }
    val anchors = home.rows.mapNotNull { it.toAnchorCard() }
    if (resumes.isEmpty() && anchors.isEmpty()) return
    BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
        // The parity card width (D13): 3 fixed 16:9 cards across the content
        // column — the fixed-track math, the (columns − 1) gutters removed.
        val cardWidth = rowCardTrack(maxWidth, HOME_ROW_COLUMNS)
        Column(modifier = Modifier.padding(start = 32.dp, top = 8.dp)) {
            // Row 0 is the topmost RENDERED row — row-0's LEFT@x=0 is the rail
            // trigger, so the anchor row counts as row 0 only with no resumes
            // above it.
            val continueWalker = HomeRowWalker(
                focus = home.continueFocus,
                isTopRow = true,
                railOpen = railOpen,
                railRestoreHome = railRestoreHome,
                onFocusMoved = onContinueFocusMoved,
                onOpenRail = onOpenRail,
            )
            val nextUpWalker = HomeRowWalker(
                focus = home.nextUpFocus,
                isTopRow = resumes.isEmpty(),
                railOpen = railOpen,
                railRestoreHome = railRestoreHome,
                onFocusMoved = onNextUpFocusMoved,
                onOpenRail = onOpenRail,
            )
            if (resumes.isNotEmpty()) {
                HomeRow(label = CONTINUE_LABEL, count = resumes.size, cardWidth = cardWidth) { index ->
                    ResumeCard(
                        model = resumes[index],
                        accent = cardAccent(resumes[index].libraryId, libraries),
                        walker = continueWalker,
                        index = index,
                        count = resumes.size,
                        cardWidth = cardWidth,
                        onResume = onResume,
                        serverBase = serverBase,
                        token = token,
                    )
                }
            }
            if (anchors.isNotEmpty()) {
                HomeRow(label = NEXT_UP_LABEL, count = anchors.size, cardWidth = cardWidth) { index ->
                    AnchorCard(
                        model = anchors[index],
                        accent = cardAccent(anchors[index].libraryId, libraries),
                        walker = nextUpWalker,
                        index = index,
                        count = anchors.size,
                        cardWidth = cardWidth,
                        onNext = onNext,
                        serverBase = serverBase,
                        token = token,
                    )
                }
            }
        }
    }
}

/**
 * One row: the label and the horizontal walker over the pre-mapped cards at
 * the parity card width.
 */
@Composable
private fun HomeRow(
    label: String,
    count: Int,
    cardWidth: Dp,
    card: @Composable (Int) -> Unit,
) {
    Column(modifier = Modifier.padding(top = 12.dp)) {
        Text(label, fontSize = 18.sp)
        LazyRow(
            modifier = Modifier.padding(top = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            items(count) { index -> card(index) }
        }
    }
}

/**
 * The home card's shell: the focus machinery (requester + the cursor
 * state's re-request effects) and the walker routing. [onClick] null IS
 * the bare card — not clickable, never focusable, the focus search skips
 * it (the honest no-affordance render, D4).
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun HomeCardShell(
    index: Int,
    count: Int,
    walker: HomeRowWalker,
    cardWidth: Dp,
    onClick: (() -> Unit)?,
    content: @Composable ColumnScope.() -> Unit,
) {
    val requester = remember { FocusRequester() }
    // The focus→scroll actuator (task 8.3): the card that takes focus asks
    // the scrolling home column to bring it INTO VIEW — crossing rows
    // (settings ↔ home ↔ body) always reveals the cursor, never an invisible
    // land.
    val scope = rememberCoroutineScope()
    val intoView = remember { BringIntoViewRequester() }
    // The cursor state is the focus source of truth (L2): the walker's law
    // moves and the rail-close restore re-request through these two
    // effects. Each suppresses its OWN composition-time launch (armed only
    // after the first run) — entry focus stays the grid's, and a stale
    // railRestoreHome never grabs focus on a fresh composition.
    var walkerArmed by remember { mutableStateOf(false) }
    var restoreArmed by remember { mutableStateOf(false) }
    LaunchedEffect(walker.focus) {
        if (walkerArmed) {
            if (walker.focus == index && !walker.railOpen) requester.requestFocusSafely()
        } else {
            walkerArmed = true
        }
    }
    LaunchedEffect(walker.railOpen, walker.railRestoreHome) {
        if (restoreArmed) {
            if (!walker.railOpen && walker.railRestoreHome && walker.focus == index) {
                requester.requestFocusSafely()
            }
        } else {
            restoreArmed = true
        }
    }
    Column(
        modifier = Modifier
            .width(cardWidth)
            .bringIntoViewRequester(intoView)
            .focusRequester(requester)
            .tvFocusStyle()
            .onFocusChanged {
                if (it.isFocused) {
                    walker.onFocusMoved(index)
                    scope.launch { intoView.bringIntoView() } // the scroll rides the focus (8.3)
                }
            }
            .onKeyEvent { event ->
                routeDirectionEvent(event) { key ->
                    val next = moveInRow(index, count, key)
                    when {
                        next != index -> {
                            walker.onFocusMoved(next)
                            true // consumed inside the row
                        }
                        key == DpadKey.Left && index == 0 && walker.isTopRow -> {
                            walker.onOpenRail() // the rail-open trigger (5.15)
                            true
                        }
                        else -> false // a law-unsatisfiable arrow crosses natively
                    }
                }
            }
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
        content = content,
    )
}

/**
 * The resume card (D4, anatomy 3.4): the 16:9 still, the bar ONLY when the
 * row serves duration_seconds (the pure percent carrier), the served title
 * and the served position line. OK resumes through the play verb — the
 * launch leg carries the stored position (no client seek math).
 */
@Composable
private fun ResumeCard(
    model: ResumeCardModel,
    accent: Color,
    walker: HomeRowWalker,
    index: Int,
    count: Int,
    cardWidth: Dp,
    onResume: (String) -> Unit,
    serverBase: String?,
    token: String?,
) {
    HomeCardShell(
        index = index,
        count = count,
        walker = walker,
        cardWidth = cardWidth,
        onClick = { onResume(model.itemId) },
    ) {
        val artwork = resolveArtworkUrl(serverBase, model.artworkUrl)
        if (artwork != null) {
            ArtworkImage(
                artwork = artwork,
                token = token,
                modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f),
            )
        }
        if (model.percent != null) {
            InProgressBar(
                percent = model.percent,
                accent = accent,
                modifier = Modifier.padding(top = 6.dp),
            )
        }
        if (model.title != null) {
            Text(model.title, fontSize = 18.sp, modifier = Modifier.padding(top = 8.dp))
        }
        Text(
            model.positionLine,
            fontSize = 12.sp,
            color = Color.White.copy(alpha = 0.6f),
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}

/**
 * The anchor card (D4): the 16:9 still, the served series name promoted to
 * the title slot, the served next label verbatim tinted by the row's type
 * accent. OK plays the served next.item_id; a row with no next offer
 * renders BARE — still and title, no OK affordance, never a fabricated
 * link (D4).
 */
@Composable
private fun AnchorCard(
    model: AnchorCardModel,
    accent: Color,
    walker: HomeRowWalker,
    index: Int,
    count: Int,
    cardWidth: Dp,
    onNext: (String) -> Unit,
    serverBase: String?,
    token: String?,
) {
    HomeCardShell(
        index = index,
        count = count,
        walker = walker,
        cardWidth = cardWidth,
        onClick = model.nextItemId?.let { id -> { onNext(id) } },
    ) {
        val artwork = resolveArtworkUrl(serverBase, model.artworkUrl)
        if (artwork != null) {
            ArtworkImage(
                artwork = artwork,
                token = token,
                modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f),
            )
        }
        if (model.title != null) {
            Text(model.title, fontSize = 18.sp, modifier = Modifier.padding(top = 8.dp))
        }
        if (model.nextLabel != null) {
            Text(
                model.nextLabel,
                fontSize = 12.sp,
                color = accent.copy(alpha = 0.9f),
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}

/** The card's type accent (D3): the row's served library's module pastel. */
private fun cardAccent(libraryId: Long, libraries: List<LibraryDto>): Color =
    typeAccent(libraries.firstOrNull { it.id == libraryId }?.moduleId ?: "")
