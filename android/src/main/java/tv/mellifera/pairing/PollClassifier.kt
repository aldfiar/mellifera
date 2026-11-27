package tv.mellifera.pairing

/**
 * One wait/poll outcome as the transport hands it over: a 200 answer (the
 * five wait statuses plus the tokenless-approved leg), a non-2xx HTTP code,
 * or a transport-level failure. The pairing id is the capability, so the
 * wait route is unauthenticated and never 401s.
 */
sealed class PollSignal {
    data class Answer(val status: String, val token: String?) : PollSignal()
    data class HttpError(val code: Int) : PollSignal()
    data object NetworkError : PollSignal()
}

/**
 * The classifier's verdict (5.4 truth table):
 * - [KeepPolling] — transient: pending answers, 5xx, transport errors. The
 *   caller keeps its own ~2s cadence until a terminal verdict or its TTL
 *   edge (the server wait is an immediate status read — no long poll).
 * - [PickUp] — approved WITH the device token: the single pickup (pairing
 *   INV2). The token rides exactly once.
 * - ApprovedNoToken — approved but tokenless (server restarted between
 *   approve and pickup): the re-pair path, surfaced honestly.
 * - Denied / Expired / Consumed / Conflict / Dead — terminal, each surfaced.
 *   Conflict is the double-approve 409; Dead is a 404 for an unknown
 *   pairing id (other 4xx land there too — nothing to keep polling for).
 */
sealed class PollVerdict {
    data object KeepPolling : PollVerdict()
    data class PickUp(val token: String) : PollVerdict()
    data object ApprovedNoToken : PollVerdict()
    data object Denied : PollVerdict()
    data object Expired : PollVerdict()
    data object Consumed : PollVerdict()
    data object Conflict : PollVerdict()
    data object Dead : PollVerdict()
}

/** Pure classification of a poll outcome — no transport, no time. */
object PollClassifier {
    fun classify(signal: PollSignal): PollVerdict = when (signal) {
        is PollSignal.Answer -> when (signal.status) {
            "pending" -> PollVerdict.KeepPolling
            "approved" ->
                if (signal.token.isNullOrBlank()) {
                    PollVerdict.ApprovedNoToken
                } else {
                    PollVerdict.PickUp(signal.token)
                }
            "denied" -> PollVerdict.Denied
            "expired" -> PollVerdict.Expired
            "consumed" -> PollVerdict.Consumed
            // The server's status vocabulary is additive by law — an unknown
            // status is tolerated as transient until the TTL edge rules.
            else -> PollVerdict.KeepPolling
        }
        is PollSignal.HttpError -> when (signal.code) {
            in 500..599 -> PollVerdict.KeepPolling
            409 -> PollVerdict.Conflict
            else -> PollVerdict.Dead
        }
        is PollSignal.NetworkError -> PollVerdict.KeepPolling
    }
}
