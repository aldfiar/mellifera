package tv.mellifera.net

/**
 * Transport seam toward the server API: bearer-token auth, plain-http LAN
 * posture (cleartext is the app-wide manifest law). STUB — the full client
 * (pairing transport, descriptor/play, progress, debug-events) lands in
 * task 5.3; pairing and browse consume it there.
 */
class Api(
    val baseUrl: String,
    var token: String? = null,
)
