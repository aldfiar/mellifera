package tv.mellifera

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import tv.mellifera.pairing.InMemorySessionBacking
import tv.mellifera.pairing.SessionStore
import tv.mellifera.ui.UiScaleMode

/** Plain JVM smoke test — AppViewModel/AppState construct without Android. */
class AppSmokeTest {
    @Test
    fun app_state_initializes() {
        val viewModel = AppViewModel()
        val state = viewModel.state.value
        assertEquals(Screen.Pairing, state.screen)
        assertNull(state.token)
    }

    @Test
    fun ui_prefs_default_to_regular_and_auto() {
        val viewModel = AppViewModel()
        assertEquals(UiScaleMode.REGULAR, viewModel.uiPrefs.uiScale.value)
        assertNull(viewModel.uiPrefs.gridColumns.value)
        assertNull(viewModel.uiPrefs.episodeColumns.value)
    }

    @Test
    fun ui_prefs_setter_flips_flow_and_persists_through() {
        val backing = InMemorySessionBacking()
        val viewModel = AppViewModel(store = SessionStore(backing))

        // The setter flips the flow...
        viewModel.uiPrefs.setUiScale(UiScaleMode.LARGE)
        assertEquals(UiScaleMode.LARGE, viewModel.uiPrefs.uiScale.value)
        viewModel.uiPrefs.setGridColumns(5)
        assertEquals(5, viewModel.uiPrefs.gridColumns.value)
        viewModel.uiPrefs.setEpisodeColumns(3)
        assertEquals(3, viewModel.uiPrefs.episodeColumns.value)

        // ...and persists through: a FRESH store over the same backing
        // reads the written values back (the process-restart shape).
        val restarted = SessionStore(backing)
        assertEquals(UiScaleMode.LARGE, restarted.readUiScale())
        assertEquals(5, restarted.readGridColumns())
        assertEquals(3, restarted.readEpisodeColumns())
    }
}
