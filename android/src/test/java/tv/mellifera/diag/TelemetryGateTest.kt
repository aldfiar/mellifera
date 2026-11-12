package tv.mellifera.diag

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import tv.mellifera.net.ProfileResponse

private fun deviceProfile(debug: Boolean?) = ProfileResponse(
    kind = "device",
    name = "tv-1",
    role = "device",
    debug = debug,
)

/**
 * The two-tier gate law (5.11): a release build is silent until the admin
 * flip lands through the profile; a debug build is always-on.
 */
class TelemetryGateTest {

    @Test
    fun release_silent_until_flip() {
        val gate = TelemetryGate(debugBuild = false)

        // No profile yet — closed (events before the first answer drop).
        assertFalse(gate.open)

        // The flag off — still silent.
        gate.onProfile(deviceProfile(debug = false))
        assertFalse(gate.open)

        // The admin flip lands — the gate opens.
        gate.onProfile(deviceProfile(debug = true))
        assertTrue(gate.open)
    }

    @Test
    fun profile_refetch_on_resume() {
        val gate = TelemetryGate(debugBuild = false)
        gate.onProfile(deviceProfile(debug = true))
        assertTrue(gate.open)

        // Resume closes the profile tier immediately — the window between
        // resume and the fresh answer DROPS events.
        gate.onForegroundResume()
        assertFalse(gate.open)

        // The refetch lands the flag still on — open again.
        gate.onProfile(deviceProfile(debug = true))
        assertTrue(gate.open)

        // The flip OFF lands within one app-switch: resume → refetch → closed.
        gate.onForegroundResume()
        gate.onProfile(deviceProfile(debug = false))
        assertFalse(gate.open)

        // A debug build never closes across the window (the build tier is
        // unconditional).
        val debugGate = TelemetryGate(debugBuild = true)
        debugGate.onForegroundResume()
        assertTrue(debugGate.open)
    }
}
