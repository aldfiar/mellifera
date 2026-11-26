package tv.mellifera.pairing

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import tv.mellifera.ui.UiScaleMode

/**
 * The session persistence pins (5.4): the token persists across fresh
 * SessionStore instances over the same backing (the process-restart shape)
 * and wipes clean; the server address follows the default-scheme/default-port
 * law and persists the same way.
 */
class SessionStoreTest {
    @Test
    fun token_persisted_and_wiped() {
        val backing = InMemorySessionBacking()
        val store = SessionStore(backing)
        assertNull(store.readToken())
        assertNull(store.readServerAddress())

        store.writeToken("dev-tok-1")
        // Persisted: a FRESH store over the same backing reads it back —
        // exactly what the process restart does on the device.
        assertEquals("dev-tok-1", SessionStore(backing).readToken())

        store.clearToken()
        assertNull(store.readToken())
        assertNull(SessionStore(backing).readToken())

        // The address law: default scheme http://, default port 8080,
        // explicit https honored (443 implied).
        assertEquals("http://192.168.1.5:8080", normalizeServerAddress("192.168.1.5"))
        assertEquals("http://192.168.1.5:8080", normalizeServerAddress("192.168.1.5:8080/"))
        assertEquals("http://192.168.1.5:9000", normalizeServerAddress("http://192.168.1.5:9000"))
        assertEquals("http://mell.local:8080", normalizeServerAddress("http://mell.local"))
        assertEquals("https://mell.local", normalizeServerAddress("https://mell.local"))
        assertEquals("https://mell.local:8443", normalizeServerAddress("https://mell.local:8443"))
        assertNull(normalizeServerAddress(""))
        assertNull(normalizeServerAddress("ftp://mell.local"))

        store.writeServerAddress(normalizeServerAddress("192.168.1.5")!!)
        assertEquals("http://192.168.1.5:8080", SessionStore(backing).readServerAddress())
    }

    @Test
    fun prefs_encodings_round_trip() {
        val backing = InMemorySessionBacking()
        val store = SessionStore(backing)

        // Absence-to-default: a fresh install reads typed nulls — first run
        // needs no setup.
        assertNull(store.readUiScale())
        assertNull(store.readGridColumns())
        assertNull(store.readEpisodeColumns())

        // The scale encodings are the settings strings themselves; the key
        // names and value spellings are the persisted contract.
        for (mode in UiScaleMode.entries) {
            store.writeUiScale(mode)
            assertEquals(mode.name.lowercase(), backing.get("ui_scale"))
            assertEquals(mode, SessionStore(backing).readUiScale())
        }

        // Grid columns: null stores «auto», a number its decimal spelling;
        // every ruled value round-trips through a fresh store.
        store.writeGridColumns(null)
        assertEquals("auto", backing.get("grid_columns"))
        assertNull(SessionStore(backing).readGridColumns())
        for (columns in 4..7) {
            store.writeGridColumns(columns)
            assertEquals(columns.toString(), backing.get("grid_columns"))
            assertEquals(columns, SessionStore(backing).readGridColumns())
        }

        // Episode columns: same law over 2..4.
        store.writeEpisodeColumns(null)
        assertEquals("auto", backing.get("episode_columns"))
        assertNull(SessionStore(backing).readEpisodeColumns())
        for (columns in 2..4) {
            store.writeEpisodeColumns(columns)
            assertEquals(columns.toString(), backing.get("episode_columns"))
            assertEquals(columns, SessionStore(backing).readEpisodeColumns())
        }

        // An unreadable stored value is absence-equivalent: degrade to the
        // default, never crash the shell.
        backing.put("ui_scale", "gigantic")
        backing.put("grid_columns", "not-a-number")
        assertNull(store.readUiScale())
        assertNull(store.readGridColumns())
    }
}
