package tv.mellifera.browse

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.KeyEvent
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import tv.mellifera.ui.requestFocusSafely
import androidx.compose.ui.layout.ContentScale
import tv.mellifera.dpad.DpadKey
import tv.mellifera.dpad.toDpadKey

/**
 * The photo viewer (task 8.13 — the operator-reported gap: OK on a photo
 * tile opened nothing). A MODAL full-screen black surface over the browse
 * tree: the photograph shown FIT (a photograph is shown, never cropped away
 * — the one ContentScale exception to the tiles' 8.10 Crop law), opened on
 * the focused tile's row by [BrowseFlow.openPhoto].
 *
 * The dpad law while open — the viewer eats ALL of it (nothing beneath is
 * reachable, so nothing may native-search under the overlay):
 * - LEFT/RIGHT: prev/next within the LOADED rows ([BrowseFlow.movePhoto]'s
 *   bounds law — at either end the picture stays, the key stays consumed);
 * - BACK: closes ([BrowseFlow.closePhoto]'s law — the viewer clears, the
 *   parked tile re-lands through the grid's nonce actuator, the filter and
 *   cursor untouched);
 * - OK/UP/DOWN: consumed, no act (the SPA's lightbox has no OK act either).
 *
 * The overlay takes the focus on entry with a one-shot request: it composes
 * in a STABLE tree (the grid stays mounted beneath), so the request targets
 * an attached node — the 8.11 drop class needs a mid-swap mount, and this
 * entry has none.
 */
@Composable
fun PhotoViewer(
    artwork: ArtworkRequest?,
    token: String?,
    onDismiss: () -> Unit,
    onMove: (Int) -> Unit,
) {
    // BACK before any body law: this handler composes above the browse
    // chain while the viewer is open, so a closed VIEWER is Back's whole
    // act — the body's own BackHandler never sees the key.
    BackHandler(enabled = true) { onDismiss() }
    val requester = remember { FocusRequester() }
    LaunchedEffect(Unit) { requester.requestFocusSafely() }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .focusRequester(requester)
            .focusable()
            .onKeyEvent { event -> routeViewerKey(event, onMove) },
    ) {
        if (artwork != null) {
            ArtworkImage(
                artwork = artwork,
                token = token,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Fit,
            )
        }
    }
}

/**
 * One key event → the viewer's modal law: LEFT/RIGHT move, everything else
 * the dpad maps to is consumed with no act (a key the viewer does not
 * recognize stays unconsumed — the system keeps it).
 */
private fun routeViewerKey(event: KeyEvent, onMove: (Int) -> Unit): Boolean {
    if (event.type != KeyEventType.KeyDown) return false
    return when (event.nativeKeyEvent.toDpadKey()) {
        DpadKey.Left -> { onMove(-1); true }
        DpadKey.Right -> { onMove(1); true }
        DpadKey.Up, DpadKey.Down, DpadKey.Ok -> true
        else -> false
    }
}
