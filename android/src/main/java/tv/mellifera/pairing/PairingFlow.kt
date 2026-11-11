package tv.mellifera.pairing

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import retrofit2.HttpException
import tv.mellifera.net.MelliferaApi
import java.util.concurrent.atomic.AtomicBoolean

/**
 * The pairing session's UI-facing states. The address entry only shows on a
 * fresh install — a stored address skips it (the first-run law).
 */
sealed class PairingState {
    data object EnterAddress : PairingState()
    data class AddressRejected(val message: String) : PairingState()
    data object Ready : PairingState()
    data object Connecting : PairingState()
    data class AwaitingApproval(val code: String) : PairingState()
    data class Rejected(val message: String) : PairingState()
    data object Paired : PairingState()
}

/**
 * The pairing flow (5.4): address entry → POST /pair → code display → poll
 * the wait endpoint at the CLIENT's own ~2s cadence (the server wait is an
 * immediate status read, no limiter, no long poll) until a terminal verdict
 * or the 5-minute TTL edge. The device token is stored exactly once, on the
 * single pickup.
 *
 * POST /pair is USER-triggered only — every entry into [runPairing] comes
 * from a UI action; terminal outcomes and the 401 wipe never auto-fire it.
 *
 * [delayFn] and [nowMs] are seams: the JVM tests pin the poll law and the
 * TTL edge with a no-op delay and a controllable clock.
 */
class PairingFlow(
    private val apiFor: (address: String) -> MelliferaApi,
    private val store: SessionStore,
    private val scope: CoroutineScope,
    private val onPaired: (token: String) -> Unit = {},
    private val pollIntervalMs: Long = 2_000,
    private val pairingTtlMs: Long = 5 * 60 * 1000,
    private val delayFn: suspend (Long) -> Unit = { delay(it) },
    private val nowMs: () -> Long = { System.currentTimeMillis() },
) {
    private val _state = MutableStateFlow<PairingState>(
        if (store.readServerAddress() == null) PairingState.EnterAddress else PairingState.Ready,
    )
    val state: StateFlow<PairingState> = _state.asStateFlow()

    private val running = AtomicBoolean(false)
    private var job: Job? = null

    /** First-run entry: normalize, persist, move to Ready. */
    fun submitAddress(raw: String) {
        val normalized = normalizeServerAddress(raw)
        if (normalized == null) {
            _state.value = PairingState.AddressRejected("Проверьте адрес — например 192.168.1.5:8080")
        } else {
            store.writeServerAddress(normalized)
            _state.value = PairingState.Ready
        }
    }

    /** The UI trigger — one pairing session at a time. */
    fun startPairing() {
        if (running.get()) return
        job = scope.launch { runPairing() }
    }

    /**
     * The 401-anywhere law: the token is wiped and the flow returns to the
     * pairing screen in Ready — the stored address is kept, POST /pair never
     * fires until the user acts.
     */
    fun onUnauthorized() {
        job?.cancel()
        job = null
        running.set(false)
        store.clearToken()
        _state.value =
            if (store.readServerAddress() == null) PairingState.EnterAddress else PairingState.Ready
    }

    /** One full pairing session. Suspending so the JVM tests drive it directly. */
    suspend fun runPairing() {
        if (!running.compareAndSet(false, true)) return
        try {
            val address = store.readServerAddress()
            if (address == null) {
                _state.value = PairingState.EnterAddress
                return
            }
            val service = apiFor(address)
            _state.value = PairingState.Connecting
            val created = try {
                service.pair()
            } catch (_: Exception) {
                _state.value = PairingState.Rejected(SERVER_UNREACHABLE)
                return
            }
            _state.value = PairingState.AwaitingApproval(created.code)
            val deadline = nowMs() + pairingTtlMs
            while (true) {
                delayFn(pollIntervalMs)
                val signal = try {
                    val answer = service.waitPairing(created.pairingId)
                    PollSignal.Answer(answer.status, answer.deviceToken)
                } catch (e: HttpException) {
                    PollSignal.HttpError(e.code())
                } catch (_: Exception) {
                    PollSignal.NetworkError
                }
                when (val verdict = PollClassifier.classify(signal)) {
                    is PollVerdict.KeepPolling -> if (nowMs() >= deadline) {
                        _state.value = PairingState.Rejected(MESSAGE_EXPIRED)
                        return
                    }
                    is PollVerdict.PickUp -> {
                        store.writeToken(verdict.token)
                        _state.value = PairingState.Paired
                        onPaired(verdict.token)
                        return
                    }
                    is PollVerdict.ApprovedNoToken -> {
                        _state.value = PairingState.Rejected(MESSAGE_TOKEN_LOST)
                        return
                    }
                    is PollVerdict.Denied -> {
                        _state.value = PairingState.Rejected(MESSAGE_DENIED)
                        return
                    }
                    is PollVerdict.Expired -> {
                        _state.value = PairingState.Rejected(MESSAGE_EXPIRED)
                        return
                    }
                    is PollVerdict.Consumed -> {
                        _state.value = PairingState.Rejected(MESSAGE_CONSUMED)
                        return
                    }
                    is PollVerdict.Conflict -> {
                        _state.value = PairingState.Rejected(MESSAGE_CONFLICT)
                        return
                    }
                    is PollVerdict.Dead -> {
                        _state.value = PairingState.Rejected(MESSAGE_NOT_FOUND)
                        return
                    }
                }
            }
        } finally {
            running.set(false)
        }
    }

    private companion object {
        const val SERVER_UNREACHABLE = "Не удалось связаться с сервером — проверьте адрес и сеть"
        const val MESSAGE_DENIED = "Оператор отклонил сопряжение — запустите заново"
        const val MESSAGE_EXPIRED = "Код истёк — запустите сопряжение заново"
        const val MESSAGE_CONSUMED = "Код уже использован — запустите сопряжение заново"
        const val MESSAGE_CONFLICT = "Код больше нельзя подтвердить — запустите сопряжение заново"
        const val MESSAGE_TOKEN_LOST = "Сервер потерял токен подтверждения — запустите сопряжение заново"
        const val MESSAGE_NOT_FOUND = "Сервер не нашёл этот запрос — запустите сопряжение заново"
    }
}
