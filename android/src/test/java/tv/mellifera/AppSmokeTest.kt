package tv.mellifera

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Plain JVM smoke test — AppViewModel/AppState construct without Android. */
class AppSmokeTest {
    @Test
    fun app_state_initializes() {
        val viewModel = AppViewModel()
        val state = viewModel.state.value
        assertEquals(Screen.Pairing, state.screen)
        assertNull(state.token)
    }
}
