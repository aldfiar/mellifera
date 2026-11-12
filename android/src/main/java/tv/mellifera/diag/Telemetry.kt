package tv.mellifera.diag

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import tv.mellifera.net.DebugEventRequest
import tv.mellifera.net.ProfileResponse
import tv.mellifera.playback.DebugEventPoster

/**
 * The one telemetry facade (5.11, D5): the two-tier [gate] before the
 * bounded [sender]. Every diag emission (tracer timeline, capability
 * snapshot) goes through [emit] — a closed gate drops the event before it
 * reaches the queue. [open] is the share button's visibility law (visible
 * iff the gate is on).
 */
class DiagTelemetry(
    debugBuild: Boolean,
    post: DebugEventPoster,
    scope: CoroutineScope,
) {
    val gate = TelemetryGate(debugBuild)
    val sender = DiagSender(post = post, scope = scope)

    private val _open = MutableStateFlow(false)
    val open: StateFlow<Boolean> = _open.asStateFlow()

    init {
        sender.start()
    }

    /** Emits one debug event iff the gate is open (dropped otherwise). */
    fun emit(event: DebugEventRequest) {
        if (gate.open) sender.send(event)
    }

    /** Lands a fresh /profile answer; the gate re-opens iff the flag set. */
    fun onProfile(profile: ProfileResponse) {
        gate.onProfile(profile)
        _open.value = gate.open
    }

    /** Foreground resume: the profile tier closes until the refetch lands. */
    fun onForegroundResume() {
        gate.onForegroundResume()
        _open.value = gate.open
    }

    /** The share sheet's text: the session's sent events, full detail. */
    fun shareText(): String = formatDiagnostics(sender.recentEvents)
}

/**
 * The pure share-text composer («Поделиться диагностикой», 5.11): snapshot
 * + traces + versions, one line per event, in the order sent.
 */
fun formatDiagnostics(events: List<DebugEventRequest>): String = buildString {
    appendLine("mellifera-tv diagnostics")
    events.forEach { event ->
        appendLine("- kind=${event.kind} phase=${event.phase} code=${event.code}: ${event.detail}")
    }
}
