package tv.mellifera.home

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import retrofit2.HttpException
import tv.mellifera.net.ContinueRow
import tv.mellifera.net.MelliferaApi

/**
 * The home surface's state (design D4): the served /home rows VERBATIM in
 * served order. There is no second derivation and no client re-sort — the
 * resume/anchor branch is a per-row read of the wire's `current` (present →
 * resume card, absent → anchor card over the served `next` offer), made by
 * the UI; the state carries the one list both branches render from. An
 * empty served array IS the no-row surface (L1 — never a placeholder row).
 *
 * The row walkers' cursors live here (the cursor-in-state law, L2):
 * [continueFocus] walks the resume cards, [nextUpFocus] the anchor cards —
 * preserved verbatim across [load]s (coerce-clamped to the live counts) so
 * Back and the rail cycle restore the exact position (L3).
 */
data class HomeState(
    val loading: Boolean = false,
    val error: String? = null,
    val rows: List<ContinueRow> = emptyList(),
    val continueFocus: Int = 0,
    val nextUpFocus: Int = 0,
)

/**
 * The home flow (design D4): the SPA Home's data layer — ONE
 * GET /api/v1/home round-trip, the same server-composed wire the SPA's
 * ContinueRail reads (entity-grain rows, ≤50, score-then-recency served
 * order — ordering is inherited server-side).
 *
 * - [load] fires the single round-trip; the rows land verbatim.
 * - The fetches are suspend so the JVM tests drive them deterministically;
 *   the composables launch them from composition/click scopes.
 */
class HomeFlow(
    private val apiFor: () -> MelliferaApi,
    private val onUnauthorized: () -> Unit = {},
) {
    private val _state = MutableStateFlow(HomeState())
    val state: StateFlow<HomeState> = _state.asStateFlow()

    /**
     * The one round-trip. On success the served rows replace the state whole
     * (served order preserved — no re-sort, no filter). On failure the
     * flow's failure law keeps whatever rows are already on screen and
     * surfaces the honest RU error; a 401 routes through the app shell (the
     * 401-anywhere law).
     */
    suspend fun load() {
        _state.value = _state.value.copy(loading = true, error = null)
        try {
            val rows = apiFor().home().rows
            // The cursors ride through the replace (the no-restart law, same
            // posture as BrowseFlow.refresh), coerce-clamped so a shrunken
            // served set never aims past the end.
            val prior = _state.value
            _state.value = HomeState(
                rows = rows,
                continueFocus = prior.continueFocus.coerceIn(0, resumeCount(rows)),
                nextUpFocus = prior.nextUpFocus.coerceIn(0, anchorCount(rows)),
            )
        } catch (e: Exception) {
            fail(e)
        }
    }

    /** The D-pad moved the resume row's cursor (the moveInRow law's
     * landing, same clamp semantics as BrowseFlow.onGridFocusMoved). */
    fun onContinueFocusMoved(index: Int) {
        _state.value = _state.value.copy(
            continueFocus = index.coerceIn(0, resumeCount(_state.value.rows)),
        )
    }

    /** The D-pad moved the anchor row's cursor (same law). */
    fun onNextUpFocusMoved(index: Int) {
        _state.value = _state.value.copy(
            nextUpFocus = index.coerceIn(0, anchorCount(_state.value.rows)),
        )
    }

    /** The resume branch's size: the rows whose `current` is present. */
    private fun resumeCount(rows: List<ContinueRow>): Int =
        (rows.count { it.current != null } - 1).coerceAtLeast(0)

    /** The anchor branch's size: the rows whose `current` is absent. */
    private fun anchorCount(rows: List<ContinueRow>): Int =
        (rows.count { it.current == null } - 1).coerceAtLeast(0)

    /** The 401-anywhere law routes through the app shell (token wiped →
     * Pairing); every other failure surfaces an honest RU message and keeps
     * whatever rows are already on screen. */
    private fun fail(e: Exception) {
        if (e is HttpException && e.code() == 401) {
            onUnauthorized()
            _state.value = _state.value.copy(loading = false, error = null)
        } else {
            _state.value = _state.value.copy(loading = false, error = MESSAGE_HOME)
        }
    }

    private companion object {
        const val MESSAGE_HOME = "Не удалось загрузить продолжения — проверьте сервер"
    }
}
