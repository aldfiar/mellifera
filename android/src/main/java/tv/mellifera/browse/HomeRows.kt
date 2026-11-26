package tv.mellifera.browse

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import kotlinx.coroutines.launch
import tv.mellifera.dpad.DpadKey
import tv.mellifera.dpad.moveInRow
import tv.mellifera.home.AnchorCardModel
import tv.mellifera.home.HomeState
import tv.mellifera.home.homeErrorLine
import tv.mellifera.home.ResumeCardModel
import tv.mellifera.home.toAnchorCard
import tv.mellifera.home.toResumeCard
import tv.mellifera.net.LibraryDto
import tv.mellifera.ui.LocalUiScale
import tv.mellifera.ui.typeBody
import tv.mellifera.ui.typeHeading
import tv.mellifera.ui.typeMeta
import tv.mellifera.ui.typeSmall
import tv.mellifera.ui.railBorder
import tv.mellifera.ui.requestFocusSafely
import tv.mellifera.ui.tvFocusStyle
import tv.mellifera.ui.tvMuted

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
 * ([HomeRowWalker.shouldRestoreHome]) so the rail close restores THIS
 * cursor, never the grid's (L3). Entry focus lands the FIRST VISIBLE card
 * of the rows while one exists — the first resume card, else the first
 * Next-up anchor ([entryLandsOnHome], task 8.15's amendment of the
 * wireframe's grid-entry law: the operator-confirmed #18 defect put the
 * entry cursor on the INVISIBLE below-fold grid tile, whose OK actuated a
 * series page while the user was looking at the resume cards) — and the
 * grid keeps the entry only when the home surface cannot claim it. That
 * one launch rides [HomeCardShell]'s `takesEntryFocus`; every other
 * composition-time launch stays suppressed (the walkerArmed law).
 *
 * Copy is RU (L7); the row labels mirror the SPA Home's section headers.
 */
private const val CONTINUE_LABEL = "Продолжить"
private const val NEXT_UP_LABEL = "Следующая серия"

/**
 * The anchor card's next-offer prefix (the SPA's `Next {label}` chip): the
 * served `next.label` is the bare SxxEyy, so the label form composes the RU
 * prefix over the served facts — the facts themselves are never re-derived.
 */
private const val NEXT_OFFER_PREFIX = "Следующая: "

/**
 * The home card's chrome radius (the SPA continue-row card, Home.tsx:407
 * `rounded-md` 6px ÷ 2): the shell's border shape and the clip its artwork
 * boxes share.
 */
private val cardShape = RoundedCornerShape(3.dp)

/**
 * One home row's walker config, shared by its cards: the cursor-in-state
 * source, the rail-open trigger's row-0 exclusivity, and the rail-close
 * restore's ownership.
 */
private data class HomeRowWalker(
    val focus: Int,
    val isTopRow: Boolean,
    val isRailOpen: Boolean,
    val shouldRestoreHome: Boolean,
    val onFocusMoved: (Int) -> Unit,
    val onOpenRail: () -> Unit,
)

@Composable
internal fun HomeRows(
    home: HomeState,
    isRailOpen: Boolean,
    shouldRestoreHome: Boolean,
    libraries: List<LibraryDto>,
    viewportHeight: Dp,
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
    // The error line (parity 11.1): a failed /home fetch with no rows on
    // screen shows the served error one-liner — the browse bodies'
    // error-branch idiom — before the empty-rows early return; rows
    // present → the pure gate keeps it null.
    homeErrorLine(home)?.let { line ->
        Text(line, fontSize = typeBody(), modifier = Modifier.padding(start = PARITY_OVERSCAN_X, top = 8.dp))
    }
    if (resumes.isEmpty() && anchors.isEmpty()) return
    BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
        // The density law sizes the row cards: the HOME reserves at the
        // composition's scale mode and the 16:9 still aspect plan the row —
        // 4 across at Обычный/Авто (≈209×118dp cards, ≈68dp captions, no
        // peek at the reference viewport). The height budget is the content
        // column's viewport ([ContentColumn]'s measurement, passed in — a
        // scrollable column's own max height is unbounded); the home rows
        // carry no override lane, so the plan is AUTO.
        val cardWidth = gridPlan(
            maxWidth,
            viewportHeight,
            chromeReserve(LocalUiScale.current, GridSurface.HOME),
            captionReserve(LocalUiScale.current, GridSurface.HOME),
            STILL_ASPECT,
        ).track
        // The rows block centers vertically when its content is shorter
        // than the viewport. The parent is the scrollable
        // home column — its height axis is unbounded, so `fillMaxHeight`
        // would no-op; the bounded form of the same fill is the min-height
        // over the served viewport measurement ([viewportHeight]). Taller
        // content wraps past the minimum and scrolls exactly as before.
        Column(
            modifier = Modifier
                .heightIn(min = viewportHeight)
                .padding(start = PARITY_OVERSCAN_X, top = 8.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            // Row 0 is the topmost RENDERED row — row-0's LEFT@x=0 is the rail
            // trigger, so the anchor row counts as row 0 only with no resumes
            // above it.
            val continueWalker = HomeRowWalker(
                focus = home.continueFocus,
                isTopRow = true,
                isRailOpen = isRailOpen,
                shouldRestoreHome = shouldRestoreHome,
                onFocusMoved = onContinueFocusMoved,
                onOpenRail = onOpenRail,
            )
            val nextUpWalker = HomeRowWalker(
                focus = home.nextUpFocus,
                isTopRow = resumes.isEmpty(),
                isRailOpen = isRailOpen,
                shouldRestoreHome = shouldRestoreHome,
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
                        // The rows' first row owns the entry (task 8.15): its
                        // first card takes the one-shot entry launch.
                        takesEntryFocus = index == 0,
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
                        // The entry's fallback row: only when no resumes render
                        // above it (task 8.15's resume → anchor → grid chain).
                        takesEntryFocus = resumes.isEmpty() && index == 0,
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
    Column(modifier = Modifier.padding(top = 6.dp)) {
        Text(label, fontSize = typeHeading(), fontWeight = FontWeight.SemiBold) // the SPA Continue h2 text-lg font-semibold
        LazyRow(
            modifier = Modifier.padding(top = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            // The row's end padding mirrors the left margin, so a peeking
            // card clips at the same inset on both sides.
            contentPadding = PaddingValues(end = PARITY_OVERSCAN_X),
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
    // The 8.15 entry carve: the rows' FIRST card takes the entry focus with
    // a one-shot composition-time launch — the ONE sanctioned break of the
    // suppression law. Gated on the cursor still at rest (focus == this
    // card, rail closed) so a late-arriving home never yanks a cursor the
    // walker already moved.
    takesEntryFocus: Boolean = false,
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
    // shouldRestoreHome never grabs focus on a fresh composition.
    var walkerArmed by remember { mutableStateOf(false) }
    var restoreArmed by remember { mutableStateOf(false) }
    LaunchedEffect(walker.focus) {
        if (walkerArmed) {
            if (walker.focus == index && !walker.isRailOpen) requester.requestFocusSafely()
        } else {
            walkerArmed = true
        }
    }
    LaunchedEffect(walker.isRailOpen, walker.shouldRestoreHome) {
        if (restoreArmed) {
            if (!walker.isRailOpen && walker.shouldRestoreHome && walker.focus == index) {
                requester.requestFocusSafely()
            }
        } else {
            restoreArmed = true
        }
    }
    // The entry launch (task 8.15): a fresh composition of the rows' first
    // card while the cursor is still at its entry value lands the focus HERE
    // — the walkerArmed effects above stay suppressed, so this is the only
    // path a home card ever takes focus on. The composition is stable by the
    // time effects run (the same idiom PhotoViewer's proven entry uses).
    LaunchedEffect(Unit) {
        if (takesEntryFocus && walker.focus == index && !walker.isRailOpen) {
            requester.requestFocusSafely()
        }
    }
    Column(
        modifier = Modifier
            .width(cardWidth)
            // The SPA continue-row card chrome (Home.tsx:407 rounded-md
            // border p-3): the bordered rounded shell the card content
            // sits inside.
            .border(1.dp, railBorder, cardShape)
            .padding(6.dp)
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
 * The resume card (the SPA ContinueCard's resume branch): the 16:9 still,
 * then the caption — the served eyebrow, the title clamped to ONE line (a
 * long title grows the card and rags the row), the served episode title,
 * the position line sitting directly OVER the progress bar — and the bar
 * ONLY when the row serves duration_seconds (the pure percent carrier).
 * OK resumes through the play verb — the launch leg carries the stored
 * position (no client seek math).
 */
@Composable
private fun ResumeCard(
    model: ResumeCardModel,
    accent: Color,
    walker: HomeRowWalker,
    index: Int,
    count: Int,
    cardWidth: Dp,
    takesEntryFocus: Boolean = false,
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
        takesEntryFocus = takesEntryFocus,
    ) {
        // The uniform-row law (task 8.10): the 16:9 art block ALWAYS renders —
        // absent artwork leaves a placeholder surface, never a shorter card.
        Box(modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f).clip(cardShape)) {
            val artwork = resolveArtworkUrl(serverBase, model.artworkUrl)
            if (artwork != null) {
                ArtworkImage(
                    artwork = artwork,
                    token = token,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                // Absent artwork renders the deterministic hashed fallback,
                // never a bare rectangle (the SPA Artwork.tsx law).
                FallbackArtwork(name = model.title, modifier = Modifier.fillMaxSize())
            }
        }
        if (model.seriesName != null) {
            Text(
                model.seriesName,
                fontSize = typeMeta(),
                color = tvMuted,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
        if (model.title != null) {
            // ONE line: the row's cards stay equal-height — a long title
            // truncates instead of growing the card and ragging the row.
            Text(
                model.title,
                fontSize = typeSmall(),
                fontWeight = FontWeight.Medium, // the SPA text-sm font-medium
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
        if (model.episodeTitle != null) {
            Text(
                model.episodeTitle,
                fontSize = typeMeta(),
                color = tvMuted,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
        Text(
            model.positionLine,
            fontSize = typeMeta(),
            color = tvMuted,
            modifier = Modifier.padding(top = 2.dp),
        )
        if (model.percent != null) {
            InProgressBar(
                percent = model.percent,
                accent = accent,
                modifier = Modifier.padding(top = 3.dp),
            )
        }
    }
}

/**
 * The anchor card: the 16:9 still, the served series name as the ONE-line
 * title, the next offer in label form («Следующая: » over the served
 * SxxEyy) and the served library meta line. OK plays the served
 * next.item_id; a row with no next offer renders BARE — still and title, no
 * OK affordance, never a fabricated link.
 */
@Composable
private fun AnchorCard(
    model: AnchorCardModel,
    accent: Color,
    walker: HomeRowWalker,
    index: Int,
    count: Int,
    cardWidth: Dp,
    takesEntryFocus: Boolean = false,
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
        takesEntryFocus = takesEntryFocus,
    ) {
        // The uniform-row law (task 8.10): the 16:9 art block ALWAYS renders.
        Box(modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f).clip(cardShape)) {
            val artwork = resolveArtworkUrl(serverBase, model.artworkUrl)
            if (artwork != null) {
                ArtworkImage(
                    artwork = artwork,
                    token = token,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                // Absent artwork renders the deterministic hashed fallback,
                // never a bare rectangle (the SPA Artwork.tsx law).
                FallbackArtwork(name = model.title, modifier = Modifier.fillMaxSize())
            }
        }
        if (model.title != null) {
            // ONE line: the row's cards stay equal-height — a long title
            // truncates instead of growing the card and ragging the row.
            Text(
                model.title,
                fontSize = typeSmall(),
                fontWeight = FontWeight.Medium, // the SPA text-sm font-medium
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
        if (model.nextLabel != null) {
            Text(
                NEXT_OFFER_PREFIX + model.nextLabel,
                fontSize = typeMeta(),
                color = tvMuted,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
        if (model.libraryName != null) {
            Text(
                model.libraryName,
                fontSize = typeMeta(),
                color = tvMuted,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
    }
}

/** The card's type accent (D3): the row's served library's module pastel. */
private fun cardAccent(libraryId: Long, libraries: List<LibraryDto>): Color =
    typeAccent(libraries.firstOrNull { it.id == libraryId }?.moduleId ?: "")
