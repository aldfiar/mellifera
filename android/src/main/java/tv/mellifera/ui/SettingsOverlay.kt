package tv.mellifera.ui

import android.content.Context
import android.content.Intent
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.KeyEvent
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.tv.material3.Text
import tv.mellifera.AppViewModel
import tv.mellifera.dpad.DpadKey
import tv.mellifera.dpad.toDpadKey

/**
 * The settings overlay: a focused dialog over the browse shell per
 * the standard overlay law — BACK closes (the [BackHandler] below; the
 * rail-focus restore is wired at its composition site), focus lives
 * inside (every row is focusable, the cursor is overlay-local, the modal
 * router consumes what it cannot satisfy — nothing beneath native-searches),
 * and the rows carry the [tvFocusStyle] ring.
 *
 * The rows over a pure row model ([SettingsRow]):
 * - «Масштаб интерфейса» — LEFT/RIGHT/OK cycle the scale and apply LIVE:
 *   the setters persist-through and emit, App.kt's root provider re-collects
 *   into [LocalUiScale], and every surface — this overlay's own type and
 *   row heights included — re-reads per emission (grids re-tile while the
 *   overlay is open).
 * - «Постеров в ряду» / «Эпизодов в ряду» — the same cycle law over their
 *   column rings; absence = «Авто» ([columnOptionLabel]).
 * - «Поделиться диагностикой» — the share affordance moved here from the
 *   retired browse-top corner section; still telemetry-gated (the row
 *   renders only while the gate is on).
 * - «Сервер» — the configured address, read-only.
 * - «Отвязать устройство» — clears the token and returns to pairing via
 *   the 401 law's seam ([AppViewModel.onUnauthorized]): the address is
 *   kept and POST /pair never auto-fires — the user starts re-pairing.
 *
 * The pure cycle/selection law ([cycleOption], [settingsKeyLaw],
 * [settingsEffect], [moveRowCursor]) is JVM-pinned by SettingsOverlayTest;
 * the composition below is only the routing and rendering wrapper (the
 * routeDirectionEvent/viewerKeyLaw idiom).
 */

/** The scale ring in cycle order — the settings strings are the labels. */
val SCALE_OPTIONS: List<UiScaleMode> = UiScaleMode.entries.toList()

/** The poster-columns ring — «Авто» (null) first, then the ruled lanes. */
val POSTER_COLUMN_OPTIONS: List<Int?> = listOf(null, 4, 5, 6, 7)

/** The episode-columns ring — «Авто» (null) first, then the ruled lanes. */
val EPISODE_COLUMN_OPTIONS: List<Int?> = listOf(null, 2, 3, 4)

/**
 * One step around a non-empty options ring: forward past the last option
 * wraps to the first, backward past the first wraps to the last. A current
 * outside the ring (a hand-edited store value outside its family) re-enters
 * it — forward lands on the first option, backward on the last — so the
 * next step always yields a family member.
 */
fun <T> cycleOption(options: List<T>, current: T, forward: Boolean): T {
    val index = options.indexOf(current)
    if (index < 0) return if (forward) options.first() else options.last()
    val step = if (forward) index + 1 else index - 1
    return options[((step % options.size) + options.size) % options.size]
}

/** The value line for a column pref: null = «Авто», otherwise the digits. */
fun columnOptionLabel(columns: Int?): String = columns?.toString() ?: "Авто"

/** The overlay's row identities in render order. */
internal enum class SettingsRow(val label: String) {
    Scale("Масштаб интерфейса"),
    PosterColumns("Постеров в ряду"),
    EpisodeColumns("Эпизодов в ряду"),
    ShareDiagnostics("Поделиться диагностикой"),
    Server("Сервер"),
    Unlink("Отвязать устройство"),
}

/** The rendered rows: the share row exists only while the telemetry gate
 *  is on — hidden, never a disabled row. */
internal fun settingsRows(telemetryOpen: Boolean): List<SettingsRow> =
    SettingsRow.entries.filter { telemetryOpen || it != SettingsRow.ShareDiagnostics }

/** One row-cursor move (UP/DOWN), clamped inside the row list — the modal
 *  containment law: the cursor never leaves the overlay, so focus never
 *  native-searches beneath it. */
internal fun moveRowCursor(cursor: Int, count: Int, step: Int): Int =
    (cursor + step).coerceIn(0, (count - 1).coerceAtLeast(0))

/** One overlay routing decision — the overlay executes it. */
internal sealed interface SettingsAct {
    /** The row cursor moves; the sign is the direction. */
    data class Move(val step: Int) : SettingsAct

    /** The selected row's cycle act; the sign is the direction. */
    data class Cycle(val forward: Boolean) : SettingsAct

    /** OK on the selected row. */
    data object Activate : SettingsAct

    /** Consumed with no act — the modal law (nothing to cross to). */
    data object Swallow : SettingsAct
}

/**
 * The overlay key law, PURE (DpadKey → act — the chipsRowConsumesUp/
 * viewerKeyLaw idiom): UP/DOWN walk the rows, LEFT/RIGHT cycle the selected
 * row, OK activates it. Any other key is null = unconsumed (the system
 * keeps it); BACK never arrives here — it rides the BackHandler above.
 * JVM-pinned by SettingsOverlayTest.
 */
internal fun settingsKeyLaw(key: DpadKey): SettingsAct? = when (key) {
    DpadKey.Up -> SettingsAct.Move(-1)
    DpadKey.Down -> SettingsAct.Move(1)
    DpadKey.Left -> SettingsAct.Cycle(false)
    DpadKey.Right -> SettingsAct.Cycle(true)
    DpadKey.Ok -> SettingsAct.Activate
    else -> null
}

/** One resolved overlay effect — the model of what a row act means. */
internal sealed interface SettingsEffect {
    data class SetScale(val mode: UiScaleMode) : SettingsEffect
    data class SetPosterColumns(val columns: Int?) : SettingsEffect
    data class SetEpisodeColumns(val columns: Int?) : SettingsEffect

    /** The Android share sheet over the session's collected diagnostics. */
    data object ShareDiagnostics : SettingsEffect

    /** Clear the token, return to pairing (never auto-re-pairing). */
    data object UnlinkDevice : SettingsEffect

    /** Consumed, no act — a read-only row or an action row's dead direction. */
    data object None : SettingsEffect
}

/**
 * The row law, PURE: what a Cycle/Activate act means on [row] given the
 * live pref values. The cycle rows cycle their ring ([cycleOption]) — OK is
 * a forward step; the action rows fire on OK and swallow the directions;
 * the read-only Server row swallows everything. JVM-pinned by
 * SettingsOverlayTest.
 */
internal fun settingsEffect(
    row: SettingsRow,
    act: SettingsAct,
    scale: UiScaleMode,
    poster: Int?,
    episode: Int?,
): SettingsEffect = when (act) {
    SettingsAct.Swallow -> SettingsEffect.None
    is SettingsAct.Move -> SettingsEffect.None // cursor-level, never dispatched to a row
    is SettingsAct.Cycle -> when (row) {
        SettingsRow.Scale -> SettingsEffect.SetScale(cycleOption(SCALE_OPTIONS, scale, act.forward))
        SettingsRow.PosterColumns ->
            SettingsEffect.SetPosterColumns(cycleOption(POSTER_COLUMN_OPTIONS, poster, act.forward))
        SettingsRow.EpisodeColumns ->
            SettingsEffect.SetEpisodeColumns(cycleOption(EPISODE_COLUMN_OPTIONS, episode, act.forward))
        SettingsRow.ShareDiagnostics, SettingsRow.Server, SettingsRow.Unlink -> SettingsEffect.None
    }
    SettingsAct.Activate -> when (row) {
        SettingsRow.Scale -> SettingsEffect.SetScale(cycleOption(SCALE_OPTIONS, scale, forward = true))
        SettingsRow.PosterColumns ->
            SettingsEffect.SetPosterColumns(cycleOption(POSTER_COLUMN_OPTIONS, poster, forward = true))
        SettingsRow.EpisodeColumns ->
            SettingsEffect.SetEpisodeColumns(cycleOption(EPISODE_COLUMN_OPTIONS, episode, forward = true))
        SettingsRow.ShareDiagnostics -> SettingsEffect.ShareDiagnostics
        SettingsRow.Server -> SettingsEffect.None
        SettingsRow.Unlink -> SettingsEffect.UnlinkDevice
    }
}

@Composable
fun SettingsOverlay(prefs: UiPrefs, viewModel: AppViewModel, onDismiss: () -> Unit) {
    // BACK before any browse law: this handler composes above the browse
    // chain while the overlay is open, so a closed OVERLAY is Back's whole
    // act — the body's own BackHandler never sees the key.
    BackHandler(enabled = true) { onDismiss() }
    val telemetryOpen by viewModel.telemetry.isOpen.collectAsState()
    val rows = remember(telemetryOpen) { settingsRows(telemetryOpen) }
    var cursor by remember { mutableStateOf(0) }
    val scale by prefs.uiScale.collectAsState()
    val poster by prefs.gridColumns.collectAsState()
    val episode by prefs.episodeColumns.collectAsState()
    val context = LocalContext.current
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.6f)),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier
                .width(420.dp)
                .background(chipColor, RoundedCornerShape(12.dp))
                .padding(horizontal = 24.dp, vertical = 16.dp),
        ) {
            Text(
                "Настройки",
                fontSize = typeHeading(),
                modifier = Modifier.padding(bottom = 8.dp),
            )
            rows.forEachIndexed { index, row ->
                val requester = remember { FocusRequester() }
                // The cursor state is the focus source of truth (the
                // chips-row idiom): every cursor landing re-requests the
                // row's focus — best-effort, a mid-frame detach is simply
                // dropped by the next landing.
                LaunchedEffect(cursor) {
                    if (cursor.coerceIn(0, rows.size - 1) == index) requester.requestFocusSafely()
                }
                SettingsOverlayRow(
                    row = row,
                    value = when (row) {
                        SettingsRow.Scale -> scale.label
                        SettingsRow.PosterColumns -> columnOptionLabel(poster)
                        SettingsRow.EpisodeColumns -> columnOptionLabel(episode)
                        SettingsRow.Server -> viewModel.serverAddress ?: "—"
                        SettingsRow.ShareDiagnostics, SettingsRow.Unlink -> null
                    },
                    actuation = { act ->
                        applyOverlayEffect(
                            settingsEffect(row, act, scale, poster, episode),
                            prefs,
                            viewModel,
                            context,
                        )
                    },
                    navigation = { step -> cursor = moveRowCursor(cursor, rows.size, step) },
                    requester = requester,
                )
            }
        }
    }
}

/** One settings row: the label left, the live value line right (absent on
 *  action rows). Focus carries the [tvFocusStyle] ring; the row's own key
 *  router executes the pure law — exactly one row holds focus, so exactly
 *  one router sees each key. */
@Composable
private fun SettingsOverlayRow(
    row: SettingsRow,
    value: String?,
    actuation: (SettingsAct) -> Unit,
    navigation: (Int) -> Unit,
    requester: FocusRequester,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(railRowHeight(LocalUiScale.current))
            .focusRequester(requester)
            .focusable()
            .tvFocusStyle()
            .onKeyEvent { event ->
                if (event.type != KeyEventType.KeyDown) return@onKeyEvent false
                val act = event.nativeKeyEvent.toDpadKey()?.let(::settingsKeyLaw)
                    ?: return@onKeyEvent false
                when (act) {
                    is SettingsAct.Move -> {
                        navigation(act.step)
                        true
                    }
                    is SettingsAct.Cycle, SettingsAct.Activate -> {
                        actuation(act)
                        true
                    }
                    SettingsAct.Swallow -> true
                }
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(row.label, fontSize = typeBody())
        Spacer(Modifier.weight(1f))
        if (value != null) {
            Text(value, fontSize = typeSmall(), color = tvMuted)
        }
    }
}

/** The effect executor — the thin wrapper between the pure row law and the
 *  app's real seams (the persist-through setters, the share sheet, the
 *  401-law unlink). */
private fun applyOverlayEffect(
    effect: SettingsEffect,
    prefs: UiPrefs,
    viewModel: AppViewModel,
    context: Context,
) {
    when (effect) {
        is SettingsEffect.SetScale -> prefs.setUiScale(effect.mode)
        is SettingsEffect.SetPosterColumns -> prefs.setGridColumns(effect.columns)
        is SettingsEffect.SetEpisodeColumns -> prefs.setEpisodeColumns(effect.columns)
        SettingsEffect.ShareDiagnostics -> shareDiagnostics(context, viewModel)
        SettingsEffect.UnlinkDevice -> viewModel.onUnauthorized()
        SettingsEffect.None -> {}
    }
}

/**
 * The diagnostics share (5.11, moved from the retired browse-top corner
 * section): the session's collected trace events + snapshot, full detail,
 * handed to the Android share sheet. The formatting lives in
 * diag/formatDiagnostics (pure); this is only the intent plumbing. The
 * row carrying it is telemetry-gated at render.
 */
private fun shareDiagnostics(context: Context, viewModel: AppViewModel) {
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, viewModel.telemetry.shareText())
    }
    context.startActivity(Intent.createChooser(intent, null))
}
