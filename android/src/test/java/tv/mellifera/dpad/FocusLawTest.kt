package tv.mellifera.dpad

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import tv.mellifera.browse.BrowseState
import tv.mellifera.nav.FocusTarget
import tv.mellifera.nav.browseFocusTarget
import tv.mellifera.nav.pairingFocusTarget
import tv.mellifera.nav.playerFocusTarget
import tv.mellifera.net.SeriesDto
import tv.mellifera.pairing.PairingState
import tv.mellifera.state.Phase
import tv.mellifera.state.PlaySession
import tv.mellifera.state.PlaybackState
import tv.mellifera.state.RenditionPlan

/**
 * The focus law (5.9): EVERY screen resolves an initial-focus target (a
 * screen without initial focus is a bug), resolved over the REAL state
 * types the composables render — the wiring reads these same functions, so
 * the law and the placement cannot drift.
 */
class FocusLawTest {

    @Test
    fun every_screen_resolves_initial_focus() {
        // Pairing: every state kind resolves.
        assertEquals(FocusTarget.AddressField, pairingFocusTarget(PairingState.EnterAddress))
        assertEquals(
            FocusTarget.AddressField,
            pairingFocusTarget(PairingState.AddressRejected("некорректный адрес")),
        )
        assertEquals(FocusTarget.PrimaryAction, pairingFocusTarget(PairingState.Ready))
        assertEquals(FocusTarget.PrimaryAction, pairingFocusTarget(PairingState.Rejected("истёк")))
        // Passive waits resolve the shell — the target exists even when
        // nothing is interactive.
        assertEquals(FocusTarget.Surface, pairingFocusTarget(PairingState.Connecting))
        assertEquals(
            FocusTarget.Surface,
            pairingFocusTarget(PairingState.AwaitingApproval("ABCD-1234")),
        )
        assertEquals(FocusTarget.Surface, pairingFocusTarget(PairingState.Paired))

        // Browse: grid → the card at the cursor; series page → the episode
        // row at the cursor; loading/error → the shell.
        val grid = BrowseState(series = List(5) { SeriesDto(id = "s-$it") }, gridFocus = 3)
        assertEquals(FocusTarget.GridCard(3), browseFocusTarget(grid))
        // A shrunken series list never aims past the end.
        val shrunk = grid.copy(series = grid.series.take(2))
        assertEquals(FocusTarget.GridCard(1), browseFocusTarget(shrunk))
        val seriesPage = grid.copy(
            selectedSeries = grid.series[3],
            episodes = emptyList(),
            episodeFocus = 0,
        )
        assertEquals(FocusTarget.EpisodeRow(0), browseFocusTarget(seriesPage))
        assertEquals(FocusTarget.Surface, browseFocusTarget(BrowseState(loading = true)))
        assertEquals(FocusTarget.Surface, browseFocusTarget(BrowseState(error = "сбой")))

        // Player: wherever the overlay renders it owns focus; Idle renders
        // nothing — null is honest, not a missing focus.
        val active = PlaybackState.Active(
            PlaySession(item = "e-1", url = "/assets/x.m3u8", mode = "hls", plan = RenditionPlan.Rendition),
        )
        assertEquals(FocusTarget.PlayerSurface, playerFocusTarget(active))
        assertEquals(
            FocusTarget.PlayerSurface,
            playerFocusTarget(
                PlaybackState.Starting(item = "e-1", phase = Phase.Describing, attempt = 0, usedMaybePlay = false),
            ),
        )
        assertEquals(FocusTarget.PlayerSurface, playerFocusTarget(PlaybackState.Dead("нет файла")))
        assertNull(playerFocusTarget(PlaybackState.Idle))
    }

    @Test
    fun grid_arrows_move_within_and_across_rows() {
        // 4-wide grid, 9 cards (last row holds one).
        // Within a row: left/right step.
        assertEquals(4, moveInGrid(5, columns = 4, count = 9, key = DpadKey.Left))
        assertEquals(5, moveInGrid(4, columns = 4, count = 9, key = DpadKey.Right))
        // Across rows: up/down jump a full row.
        assertEquals(1, moveInGrid(5, columns = 4, count = 9, key = DpadKey.Up))
        assertEquals(6, moveInGrid(2, columns = 4, count = 9, key = DpadKey.Down))
        // Row edges clamp INSIDE the grid — the wiring treats the clamp as
        // "not consumed", which is what crosses the rail (settings above).
        // Column 0 is the Left edge; column 3 the Right edge.
        assertEquals(0, moveInGrid(0, columns = 4, count = 9, key = DpadKey.Left))
        assertEquals(2, moveInGrid(3, columns = 4, count = 9, key = DpadKey.Left))
        assertEquals(1, moveInGrid(0, columns = 4, count = 9, key = DpadKey.Right))
        assertEquals(3, moveInGrid(3, columns = 4, count = 9, key = DpadKey.Right))
        assertEquals(0, moveInGrid(1, columns = 4, count = 9, key = DpadKey.Up))
        assertEquals(8, moveInGrid(8, columns = 4, count = 9, key = DpadKey.Down))
    }

    @Test
    fun list_arrows_step_and_clamp() {
        assertEquals(2, moveInList(3, count = 6, key = DpadKey.Up))
        assertEquals(4, moveInList(3, count = 6, key = DpadKey.Down))
        assertEquals(0, moveInList(0, count = 6, key = DpadKey.Up))
        assertEquals(5, moveInList(5, count = 6, key = DpadKey.Down))
        // Left/Right are not list keys.
        assertEquals(3, moveInList(3, count = 6, key = DpadKey.Left))
    }
}
