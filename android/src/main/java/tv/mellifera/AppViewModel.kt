package tv.mellifera

import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import tv.mellifera.browse.BrowseFlow
import tv.mellifera.net.Api
import tv.mellifera.net.MelliferaApi
import tv.mellifera.pairing.InMemorySessionBacking
import tv.mellifera.pairing.PairingFlow
import tv.mellifera.pairing.SessionStore

/** Top-level navigation: `when (state.screen)` IS the navigation (D1, no nav library). */
enum class Screen {
    /** First-run entry — the device pairs before anything else renders. */
    Pairing,

    /** Signed-in shell; browse and settings live under it (5.6). */
    Browse,
}

/**
 * Immutable app state skeleton (D1). The player timeline never enters it
 * (D8 — readout is read at the player leaf only).
 */
data class AppState(
    val screen: Screen = Screen.Pairing,
    val token: String? = null,
)

/**
 * The single app-wide view model (D1 minimal branch). Constructible without
 * the Android framework so the smoke test stays a plain JVM test — the
 * defaults are the JVM-safe in-memory session and a lazily-built Api; the
 * device path passes the SharedPreferences-backed store and its own scope.
 */
class AppViewModel(
    private val store: SessionStore = SessionStore(InMemorySessionBacking()),
    appScope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
    private val apiFactory: (address: String, token: String?) -> MelliferaApi = { address, token ->
        Api(address, token).service
    },
) {
    private val _state = MutableStateFlow(AppState(token = store.readToken()))
    val state: StateFlow<AppState> = _state.asStateFlow()

    val pairing: PairingFlow = PairingFlow(
        apiFor = { address -> apiFactory(address, null) },
        store = store,
        scope = appScope,
        onPaired = { token ->
            _state.value = _state.value.copy(screen = Screen.Browse, token = token)
        },
    )

    /** Browse (5.6): fetch-on-navigate + the player-exit refresh law. */
    val browse: BrowseFlow = BrowseFlow(
        apiFor = { browseApi() },
        onUnauthorized = { onUnauthorized() },
    )

    /**
     * One shared client per server address + token — a fresh Retrofit per
     * fetch would build a fresh OkHttp pool on every refresh. A re-pair
     * (new address or token) keys a new entry; the old one is dropped with
     * the view model.
     */
    private val apiMemo = ConcurrentHashMap<String, MelliferaApi>()

    private fun browseApi(): MelliferaApi {
        val address = requireNotNull(store.readServerAddress()) {
            "browse needs a stored server address"
        }
        val token = _state.value.token
        return apiMemo.getOrPut("$address|$token") { apiFactory(address, token) }
    }

    init {
        // A stored address skips the first-run entry; a stored token skips
        // pairing entirely.
        if (_state.value.token != null) {
            _state.value = _state.value.copy(screen = Screen.Browse)
        }
    }

    /**
     * The 401-anywhere law: any authenticated API call answering 401 wipes
     * the token and returns to the pairing screen — never auto-fires
     * POST /pair (the user starts re-pairing). Playback/browse tasks route
     * their transport errors here.
     */
    fun onUnauthorized() {
        pairing.onUnauthorized()
        _state.value = _state.value.copy(screen = Screen.Pairing, token = null)
    }

    /**
     * The player-exit refresh hook (5.6): the player leaves the screen, the
     * visible browse data re-fetches so progress and resume rows are
     * current without a manual reload. 5.7's player-exit path fires this —
     * suspend so the caller's coroutine drives it to completion.
     */
    suspend fun onPlayerExit() {
        browse.refresh()
    }
}
