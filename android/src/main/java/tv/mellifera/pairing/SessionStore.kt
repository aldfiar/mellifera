package tv.mellifera.pairing

import android.content.Context
import java.net.URI
import java.net.URISyntaxException

/**
 * The session's two persisted facts (5.4): the server base address and the
 * device token. Plain app-private key-value storage — OQ-B3 chose no
 * keystore/encryption for v1 (the token is a device credential on a private
 * TV box, revocable server-side).
 */
class SessionStore(private val backing: SessionBacking) {

    fun readToken(): String? = backing.get(KEY_TOKEN)

    fun writeToken(token: String) = backing.put(KEY_TOKEN, token)

    fun clearToken() = backing.remove(KEY_TOKEN)

    fun readServerAddress(): String? = backing.get(KEY_ADDRESS)

    fun writeServerAddress(address: String) = backing.put(KEY_ADDRESS, address)

    private companion object {
        const val KEY_TOKEN = "device_token"
        const val KEY_ADDRESS = "server_address"
    }
}

/** The one storage seam — device and JVM tests plug their own backing. */
interface SessionBacking {
    fun get(key: String): String?
    fun put(key: String, value: String)
    fun remove(key: String)
}

/** Plain in-process map — the JVM test backing. */
class InMemorySessionBacking : SessionBacking {
    private val map = mutableMapOf<String, String>()
    override fun get(key: String): String? = map[key]
    override fun put(key: String, value: String) {
        map[key] = value
    }
    override fun remove(key: String) {
        map.remove(key)
    }
}

/**
 * The device backing: plain app-private SharedPreferences — never synced,
 * never backed up, wiped with the app.
 */
class SharedPreferencesSessionBacking(context: Context) : SessionBacking {
    private val prefs = context.getSharedPreferences("mellifera.session", Context.MODE_PRIVATE)
    override fun get(key: String): String? = prefs.getString(key, null)
    override fun put(key: String, value: String) {
        prefs.edit().putString(key, value).apply()
    }
    override fun remove(key: String) {
        prefs.edit().remove(key).apply()
    }
}

/**
 * The address-entry law: default scheme http://, default port 8080, an
 * explicit https honored (443 implied when no port). A bare host[:port] or
 * full URL both normalize; null means the input is not a server address and
 * the entry screen rejects it.
 */
fun normalizeServerAddress(raw: String): String? {
    val trimmed = raw.trim()
    if (trimmed.isEmpty()) return null
    val withScheme = if (trimmed.contains("://")) trimmed else "http://$trimmed"
    val uri = try {
        URI(withScheme)
    } catch (_: URISyntaxException) {
        return null
    }
    val scheme = uri.scheme?.lowercase() ?: return null
    if (scheme != "http" && scheme != "https") return null
    val host = uri.host ?: return null
    val port = uri.port // -1 when absent
    val effectivePort = when {
        port != -1 -> port
        scheme == "http" -> 8080
        else -> -1 // https: 443 implied, no explicit port
    }
    val portPart = if (effectivePort != -1) ":$effectivePort" else ""
    val path = uri.rawPath?.trimEnd('/') ?: ""
    val pathPart = if (path.isNotEmpty()) "/$path" else ""
    return "$scheme://$host$portPart$pathPart"
}
