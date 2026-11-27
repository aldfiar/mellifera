package tv.mellifera.nav

import tv.mellifera.browse.BrowseState
import tv.mellifera.net.ItemDto
import tv.mellifera.pairing.PairingState
import tv.mellifera.state.PlaybackState

/**
 * The initial-focus law's targets (5.9): a screen without initial focus is
 * a bug, so every rendered surface resolves exactly one element that takes
 * focus on entry — resolved here, purely, over the real state types, and
 * pinned by FocusLawTest::every_screen_resolves_initial_focus. The
 * composables read these same functions to place the tvInitialFocus
 * modifier, so the law and the wiring cannot drift apart.
 */
sealed interface FocusTarget {
    /** The pairing address field (first-run entry). */
    data object AddressField : FocusTarget

    /** The screen's single primary action button. */
    data object PrimaryAction : FocusTarget

    /** The series grid card at [index] (the browse cursor). */
    data class GridCard(val index: Int) : FocusTarget

    /** The open series' episode GRID card at [index] (the 36dp row
     * list was retired from the series page; the target renamed with it). */
    data class EpisodeGrid(val index: Int) : FocusTarget

    /** The player overlay itself (it owns every key while visible). */
    data object PlayerSurface : FocusTarget

    /** A passive surface with nothing interactive — the shell takes focus
     * so D-pad input has a home (pairing progress/code displays). */
    data object Surface : FocusTarget
}

/** Pairing resolves by state: entry/reject → the address field; ready and
 * terminal-with-action → the primary button; passive waits → the shell. */
fun pairingFocusTarget(state: PairingState): FocusTarget = when (state) {
    PairingState.EnterAddress, is PairingState.AddressRejected -> FocusTarget.AddressField
    PairingState.Ready, is PairingState.Rejected -> FocusTarget.PrimaryAction
    PairingState.Connecting, is PairingState.AwaitingApproval, PairingState.Paired ->
        FocusTarget.Surface
}

/**
 * The episode grid's first-unwatched law: the FIRST row that is not
 * watched, when the served rows carry watched states; with no served states
 * (or an all-watched page) the law floors to index 0 — the arithmetic is
 * one law, not two: "no states" and "first row unwatched" resolve the same
 * index. [BrowseFlow.openSeries] seeds the episode cursor with this answer
 * (the law's compute leg); [browseFocusTarget] serves the cursor the walk
 * keeps (the keep leg) — both legs live in this file so the law has one
 * home.
 */
fun firstUnwatchedEpisode(episodes: List<ItemDto>): Int =
    episodes.indexOfFirst { it.watched != true }.coerceAtLeast(0)

/**
 * Browse resolves by what is on screen: the open series' episode grid (the
 * cursor = the grid focus, seeded first-unwatched on entry by
 * [firstUnwatchedEpisode] and kept by every law walk — a shrunken episode
 * list never aims past the end), else the grid (cursor = the grid focus,
 * clamped to the live rows — a series list that shrank under a refresh
 * never aims past the end), else the shell (loading/error).
 */
fun browseFocusTarget(state: BrowseState): FocusTarget {
    val selected = state.selectedSeries
    if (selected != null) return FocusTarget.EpisodeGrid(state.episodeFocus)
    if (state.series.isNotEmpty()) {
        return FocusTarget.GridCard(state.gridFocus.coerceAtMost(state.series.size - 1))
    }
    return FocusTarget.Surface
}

/**
 * The player overlay resolves wherever it renders — Idle renders nothing
 * (no overlay, no target; null is honest, not a missing focus).
 */
fun playerFocusTarget(state: PlaybackState): FocusTarget? = when (state) {
    PlaybackState.Idle -> null
    else -> FocusTarget.PlayerSurface
}
