package tv.mellifera.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import tv.mellifera.dpad.DpadKey

/**
 * The settings overlay's pure law pinned on the JVM: the
 * option rings ride the settings order, the cycle law wraps and reads
 * absence as «Авто», the key law routes the modal keys, the cursor law
 * keeps the selection inside the overlay, and every row × act resolves to
 * its exact effect — the LIVE-apply legs (Set* → the persist-through
 * setters → the flows) ride AppSmokeTest's live-apply pins; the composition is
 * only the routing wrapper. If one of these moves, what the operator's
 * OK/LEFT/RIGHT does on the panel moves with it.
 */
class SettingsOverlayTest {

    // ── The rings ──

    @Test
    fun scale_ring_rides_the_settings_order() {
        assertEquals(
            listOf(
                UiScaleMode.COMPACT to "Компактный",
                UiScaleMode.REGULAR to "Обычный",
                UiScaleMode.LARGE to "Крупный",
            ),
            SCALE_OPTIONS.map { it to it.label },
        )
    }

    @Test
    fun column_rings_ride_the_settings_order() {
        assertEquals(listOf<Int?>(null, 4, 5, 6, 7), POSTER_COLUMN_OPTIONS)
        assertEquals(listOf<Int?>(null, 2, 3, 4), EPISODE_COLUMN_OPTIONS)
    }

    @Test
    fun row_model_rides_the_settings_order() {
        assertEquals(
            listOf(
                "Масштаб интерфейса",
                "Постеров в ряду",
                "Эпизодов в ряду",
                "Поделиться диагностикой",
                "Сервер",
                "Отвязать устройство",
            ),
            SettingsRow.entries.map { it.label },
        )
    }

    // ── The cycle law (wraps, absence = Авто) ──

    @Test
    fun cycle_forward_wraps_past_the_end() {
        assertEquals(UiScaleMode.COMPACT, cycleOption(SCALE_OPTIONS, UiScaleMode.LARGE, forward = true))
        assertNull(cycleOption(POSTER_COLUMN_OPTIONS, 7, forward = true))
        assertNull(cycleOption(EPISODE_COLUMN_OPTIONS, 4, forward = true))
    }

    @Test
    fun cycle_backward_wraps_past_the_start() {
        assertEquals(UiScaleMode.LARGE, cycleOption(SCALE_OPTIONS, UiScaleMode.COMPACT, forward = false))
        assertEquals(7, cycleOption(POSTER_COLUMN_OPTIONS, null, forward = false))
        assertEquals(4, cycleOption(EPISODE_COLUMN_OPTIONS, null, forward = false))
    }

    @Test
    fun cycle_walks_every_ring_position_both_ways() {
        // The rings are small — walk them exhaustively: from every position,
        // one forward step lands on the next ring member (wrap included).
        for (options in listOf(SCALE_OPTIONS, POSTER_COLUMN_OPTIONS, EPISODE_COLUMN_OPTIONS)) {
            for (i in options.indices) {
                val next = options[(i + 1) % options.size]
                assertEquals(
                    "forward @ index $i of $options",
                    next,
                    cycleOption(options, options[i], forward = true),
                )
                val prev = options[(i - 1 + options.size) % options.size]
                assertEquals(
                    "backward @ index $i of $options",
                    prev,
                    cycleOption(options, options[i], forward = false),
                )
            }
        }
    }

    @Test
    fun cycle_reenters_the_ring_from_an_out_of_family_value() {
        // A hand-edited store value outside its family (SessionStore decodes
        // any int) must not strand the walk: forward re-enters at «Авто»
        // (the ring's first member), backward at the last lane.
        assertNull(cycleOption(POSTER_COLUMN_OPTIONS, 3, forward = true))
        assertEquals(7, cycleOption(POSTER_COLUMN_OPTIONS, 3, forward = false))
        assertNull(cycleOption(EPISODE_COLUMN_OPTIONS, 9, forward = true))
        assertEquals(4, cycleOption(EPISODE_COLUMN_OPTIONS, 9, forward = false))
    }

    @Test
    fun column_option_label_reads_absence_as_auto() {
        assertEquals("Авто", columnOptionLabel(null))
        assertEquals("5", columnOptionLabel(5))
    }

    // ── The key law ──

    @Test
    fun key_law_routes_the_modal_keys() {
        assertEquals(SettingsAct.Move(-1), settingsKeyLaw(DpadKey.Up))
        assertEquals(SettingsAct.Move(1), settingsKeyLaw(DpadKey.Down))
        assertEquals(SettingsAct.Cycle(false), settingsKeyLaw(DpadKey.Left))
        assertEquals(SettingsAct.Cycle(true), settingsKeyLaw(DpadKey.Right))
        assertEquals(SettingsAct.Activate, settingsKeyLaw(DpadKey.Ok))
    }

    @Test
    fun key_law_leaves_unrouted_keys_unconsumed() {
        assertNull(settingsKeyLaw(DpadKey.Back)) // BACK rides the BackHandler
        assertNull(settingsKeyLaw(DpadKey.PlayPause))
        assertNull(settingsKeyLaw(DpadKey.AudioTrack))
    }

    // ── The cursor law (focus lives inside) ──

    @Test
    fun row_cursor_clamps_at_both_ends() {
        assertEquals(0, moveRowCursor(0, 6, -1))
        assertEquals(5, moveRowCursor(5, 6, 1))
        assertEquals(1, moveRowCursor(2, 6, -1))
        assertEquals(3, moveRowCursor(2, 6, 1))
    }

    @Test
    fun row_cursor_is_total_at_an_empty_row_list() {
        assertEquals(0, moveRowCursor(4, 0, 1))
    }

    @Test
    fun telemetry_gate_hides_the_share_row() {
        assertEquals(SettingsRow.entries.toList(), settingsRows(telemetryOpen = true))
        assertEquals(
            SettingsRow.entries.filter { it != SettingsRow.ShareDiagnostics },
            settingsRows(telemetryOpen = false),
        )
    }

    // ── The row × act law ──

    @Test
    fun scale_row_cycles_live_on_direction_and_ok() {
        assertEquals(
            SettingsEffect.SetScale(UiScaleMode.LARGE),
            settingsEffect(SettingsRow.Scale, SettingsAct.Cycle(true), UiScaleMode.REGULAR, 4, 2),
        )
        assertEquals(
            SettingsEffect.SetScale(UiScaleMode.COMPACT),
            settingsEffect(SettingsRow.Scale, SettingsAct.Cycle(false), UiScaleMode.REGULAR, 4, 2),
        )
        // OK on a cycle row is a forward step (the «cycles on OK or
        // LEFT/RIGHT» law).
        assertEquals(
            SettingsEffect.SetScale(UiScaleMode.LARGE),
            settingsEffect(SettingsRow.Scale, SettingsAct.Activate, UiScaleMode.REGULAR, 4, 2),
        )
    }

    @Test
    fun poster_row_cycles_with_absence_as_auto() {
        assertEquals(
            SettingsEffect.SetPosterColumns(4),
            settingsEffect(SettingsRow.PosterColumns, SettingsAct.Cycle(true), UiScaleMode.REGULAR, null, 2),
        )
        assertEquals(
            SettingsEffect.SetPosterColumns(7),
            settingsEffect(SettingsRow.PosterColumns, SettingsAct.Cycle(false), UiScaleMode.REGULAR, null, 2),
        )
        assertEquals(
            SettingsEffect.SetPosterColumns(null),
            settingsEffect(SettingsRow.PosterColumns, SettingsAct.Activate, UiScaleMode.REGULAR, 7, 2),
        )
    }

    @Test
    fun episode_row_cycles_with_absence_as_auto() {
        assertEquals(
            SettingsEffect.SetEpisodeColumns(2),
            settingsEffect(SettingsRow.EpisodeColumns, SettingsAct.Cycle(true), UiScaleMode.REGULAR, 4, null),
        )
        assertEquals(
            SettingsEffect.SetEpisodeColumns(null),
            settingsEffect(SettingsRow.EpisodeColumns, SettingsAct.Activate, UiScaleMode.REGULAR, 4, 4),
        )
    }

    @Test
    fun action_rows_fire_on_ok_and_swallow_the_directions() {
        assertEquals(
            SettingsEffect.ShareDiagnostics,
            settingsEffect(SettingsRow.ShareDiagnostics, SettingsAct.Activate, UiScaleMode.REGULAR, null, null),
        )
        assertEquals(
            SettingsEffect.UnlinkDevice,
            settingsEffect(SettingsRow.Unlink, SettingsAct.Activate, UiScaleMode.REGULAR, null, null),
        )
        assertTrue(
            listOf(SettingsAct.Cycle(true), SettingsAct.Cycle(false)).all {
                settingsEffect(SettingsRow.ShareDiagnostics, it, UiScaleMode.REGULAR, null, null) ==
                    SettingsEffect.None &&
                    settingsEffect(SettingsRow.Unlink, it, UiScaleMode.REGULAR, null, null) ==
                    SettingsEffect.None
            },
        )
    }

    @Test
    fun server_row_is_read_only() {
        for (act in listOf(SettingsAct.Cycle(true), SettingsAct.Cycle(false), SettingsAct.Activate)) {
            assertEquals(
                SettingsEffect.None,
                settingsEffect(SettingsRow.Server, act, UiScaleMode.REGULAR, null, null),
            )
        }
    }
}
