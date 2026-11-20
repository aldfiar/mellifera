package tv.mellifera.browse

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.tv.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.KeyEvent
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import tv.mellifera.ui.requestFocusSafely
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.longOrNull
import tv.mellifera.dpad.DpadKey
import tv.mellifera.dpad.toDpadKey
import tv.mellifera.ui.TYPE_SMALL
import tv.mellifera.ui.tvMuted

/**
 * The photo viewer (task 8.13 — the operator-reported gap: OK on a photo
 * tile opened nothing). A MODAL full-screen black surface over the browse
 * tree: the photograph shown FIT (a photograph is shown, never cropped away
 * — the one ContentScale exception to the tiles' 8.10 Crop law), opened on
 * the focused tile's row by [BrowseFlow.openPhoto].
 *
 * The dpad law while open — the viewer eats ALL of it (nothing beneath is
 * reachable, so nothing may native-search under the overlay), routed by the
 * pure [viewerKeyLaw] (12.2):
 * - LEFT/RIGHT: prev/next within the LOADED rows ([BrowseFlow.movePhoto]'s
 *   bounds law — at either end the picture stays, the key stays consumed);
 * - OK: closes ([BrowseFlow.closePhoto]'s law — Back stays the second exit);
 * - UP/DOWN: consumed with no act (the modal law — nothing to cross to);
 * - BACK: closes (the BackHandler below);
 * - any other key the dpad maps to: unconsumed — the system keeps it.
 *
 * The status line (12.2) rides the mockup stage's «i/n · W×H · date» shape,
 * FIELD-DRIVEN: the position always (the viewer only composes over a valid
 * index), the served capture date ([captureDate]) and the served dimensions
 * ([photoDimensions]) only when the document carries them — absent → absent,
 * never padded (L1).
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
    index: Int,
    count: Int,
    document: JsonElement,
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
            .onKeyEvent { event -> routeViewerKey(event, onMove, onDismiss) },
    ) {
        if (artwork != null) {
            ArtworkImage(
                artwork = artwork,
                token = token,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Fit,
            )
        }
        Text(
            photoStatusLine(
                index,
                count,
                captureDate(document)?.let(::formatDatePart),
                photoDimensions(document),
            ),
            fontSize = TYPE_SMALL,
            color = tvMuted,
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(16.dp),
        )
    }
}

/** One viewer routing decision — the overlay executes it. */
internal sealed interface ViewerKeyAct {
    /** Prev/next within the loaded rows; the sign is the direction. */
    data class Move(val step: Int) : ViewerKeyAct

    /** Close the viewer (the grid re-lands beneath). */
    data object Close : ViewerKeyAct

    /** Consumed with no act — the modal law (nothing to cross to). */
    data object Swallow : ViewerKeyAct
}

/**
 * The viewer key law (12.2), PURE: DpadKey → act — the chipsRowConsumesUp
 * idiom (KeyRouting.kt): Ok closes, Left/Right move, Up/Down stay consumed
 * with no act, an unrecognized key is null = unconsumed (the system keeps
 * it). JVM-pinned by PhotoFlowTest.
 */
internal fun viewerKeyLaw(key: DpadKey): ViewerKeyAct? = when (key) {
    DpadKey.Left -> ViewerKeyAct.Move(-1)
    DpadKey.Right -> ViewerKeyAct.Move(1)
    DpadKey.Ok -> ViewerKeyAct.Close
    DpadKey.Up, DpadKey.Down -> ViewerKeyAct.Swallow
    else -> null
}

/**
 * The overlay's thin wrapper: a key event → the pure law's act executed
 * against the flow callbacks. Only KeyDown acts (a repeat's own Down
 * re-enters the law); a key the law does not recognize stays unconsumed.
 */
private fun routeViewerKey(event: KeyEvent, onMove: (Int) -> Unit, onClose: () -> Unit): Boolean {
    if (event.type != KeyEventType.KeyDown) return false
    val act = viewerKeyLaw(event.nativeKeyEvent.toDpadKey() ?: return false)
    return when (act) {
        is ViewerKeyAct.Move -> {
            onMove(act.step)
            true
        }
        ViewerKeyAct.Close -> {
            onClose()
            true
        }
        ViewerKeyAct.Swallow -> true
        null -> false
    }
}

/**
 * photoDimensions — the served W×H across the document's source namespaces
 * (the parsedFacts idiom): the FIRST namespace carrying a positive numeric
 * width AND height wins; absent either → null — the status line omits the
 * dimensions, never guesses them (L1).
 */
internal fun photoDimensions(doc: JsonElement): String? {
    for (namespace in sourceNamespaces(doc)) {
        val width = (namespace["width"] as? JsonPrimitive)?.longOrNull
        val height = (namespace["height"] as? JsonPrimitive)?.longOrNull
        if (width != null && height != null && width > 0 && height > 0) {
            return "$width×$height"
        }
    }
    return null
}

/**
 * photoStatusLine — the status line's pure formatter (12.2, the mockup
 * stage's shape): «i/n», dot-joined with the served capture date and the
 * served dimensions when carried — absent facts leave absent segments,
 * never padded (L1). JVM-pinned by PhotoFlowTest.
 */
internal fun photoStatusLine(index: Int, count: Int, capture: String?, dimensions: String?): String =
    buildList {
        add("${index + 1}/$count")
        capture?.let(::add)
        dimensions?.let(::add)
    }.joinToString(" · ")
