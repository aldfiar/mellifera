package tv.mellifera.dpad

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import tv.mellifera.browse.BrowseState
import tv.mellifera.nav.FocusTarget
import tv.mellifera.nav.browseFocusTarget
import tv.mellifera.nav.firstUnwatchedEpisode
import tv.mellifera.nav.pairingFocusTarget
import tv.mellifera.nav.playerFocusTarget
import tv.mellifera.net.ItemDto
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
        // GRID card at the cursor (G19 — the target renamed with the 36dp
        // row list's retirement); loading/error → the shell.
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
        assertEquals(FocusTarget.EpisodeGrid(0), browseFocusTarget(seriesPage))
        assertEquals(FocusTarget.Surface, browseFocusTarget(BrowseState(isLoading = true)))
        assertEquals(FocusTarget.Surface, browseFocusTarget(BrowseState(error = "сбой")))

        // The episode grid's first-unwatched law (G19, nav/InitialFocus.kt):
        // the seed picks the FIRST row that is not watched when the served
        // rows carry watched states...
        val watched = listOf(
            ItemDto(id = "e-1", displayName = "Серия 1", watched = true),
            ItemDto(id = "e-2", displayName = "Серия 2", watched = true),
            ItemDto(id = "e-3", displayName = "Серия 3"),
        )
        assertEquals(2, firstUnwatchedEpisode(watched))
        // ...an all-watched page floors to index 0...
        assertEquals(0, firstUnwatchedEpisode(watched.take(2)))
        // ...no served states resolve the same law's floor — the first row.
        assertEquals(0, firstUnwatchedEpisode(listOf(ItemDto(id = "e-1"))))
        assertEquals(0, firstUnwatchedEpisode(emptyList()))
        // The target serves the seeded cursor: openSeries seeds the law's
        // answer (EpisodesTest pins the wire side); browseFocusTarget keeps
        // it — the grid card at the first-unwatched index holds the entry.
        val seeded = grid.copy(
            selectedSeries = grid.series[3],
            episodes = watched,
            episodeFocus = firstUnwatchedEpisode(watched),
        )
        assertEquals(FocusTarget.EpisodeGrid(2), browseFocusTarget(seeded))

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

    @Test
    fun chips_row_up_clamps_when_nothing_focusable_above_the_body() {
        // Task 8.6 (the walk-found stranding): no focusable target above the
        // body (the settings gate off) — UP is CONSUMED, the chip keeps
        // focus, and no runaway native search carries it across the body
        // boundary into the home rows.
        assertTrue(chipsRowConsumesUp(DpadKey.Up, aboveFocusable = false))
        // The settings affordance IS focusable — the arrow stays unconsumed
        // and crosses natively (D12's chips row); a settings target is
        // reached explicitly, never by native search over the home surface.
        assertFalse(chipsRowConsumesUp(DpadKey.Up, aboveFocusable = true))
        // DOWN (→ grid) and the walk keys never clamp — they stay in the
        // moveInRow law's hands.
        assertFalse(chipsRowConsumesUp(DpadKey.Down, aboveFocusable = false))
        assertFalse(chipsRowConsumesUp(DpadKey.Left, aboveFocusable = false))
        assertFalse(chipsRowConsumesUp(DpadKey.Right, aboveFocusable = false))
        assertFalse(chipsRowConsumesUp(DpadKey.Ok, aboveFocusable = false))
    }
}
