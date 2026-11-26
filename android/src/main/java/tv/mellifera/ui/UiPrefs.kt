package tv.mellifera.ui

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import tv.mellifera.pairing.SessionStore

/**
 * The persisted display settings (G18) as live state: the three
 * SessionStore keys decoded once at construction — absence decodes to the
 * defaults (REGULAR / Авто), so first run needs no setup — and exposed as
 * StateFlows for the composition locals and the settings overlay. The
 * setters persist to the store BEFORE the flow emits, so a collector can
 * never observe an unpersisted value. Null columns = «Авто» (the planner
 * decides).
 */
class UiPrefs(private val store: SessionStore, scope: CoroutineScope) {

    private val _uiScale = MutableStateFlow(store.readUiScale() ?: UiScaleMode.REGULAR)
    val uiScale: StateFlow<UiScaleMode> = _uiScale.asStateFlow()

    private val _gridColumns = MutableStateFlow(store.readGridColumns())
    val gridColumns: StateFlow<Int?> = _gridColumns.asStateFlow()

    private val _episodeColumns = MutableStateFlow(store.readEpisodeColumns())
    val episodeColumns: StateFlow<Int?> = _episodeColumns.asStateFlow()

    fun setUiScale(mode: UiScaleMode) {
        store.writeUiScale(mode)
        _uiScale.value = mode
    }

    fun setGridColumns(columns: Int?) {
        store.writeGridColumns(columns)
        _gridColumns.value = columns
    }

    fun setEpisodeColumns(columns: Int?) {
        store.writeEpisodeColumns(columns)
        _episodeColumns.value = columns
    }
}
