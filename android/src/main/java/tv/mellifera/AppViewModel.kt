package tv.mellifera

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Top-level navigation: `when (state.screen)` IS the navigation (D1, no nav library). */
enum class Screen {
    /** First-run entry — the device pairs before anything else renders. */
    Pairing,

    /** Signed-in shell; browse and settings live under it (5.6). */
    Browse,
}

/**
 * Immutable app state skeleton (D1). The full shape lands with the screens
 * and the flow machine; the player timeline never enters it (D8 — readout
 * is read at the player leaf only).
 */
data class AppState(
    val screen: Screen = Screen.Pairing,
    val token: String? = null,
)

/**
 * The single app-wide view model (D1 minimal branch). Constructible without
 * the Android framework so the smoke test stays a plain JVM test.
 */
class AppViewModel(initialState: AppState = AppState()) {
    private val _state = MutableStateFlow(initialState)
    val state: StateFlow<AppState> = _state.asStateFlow()
}
