package tv.mellifera.diag

import tv.mellifera.net.ProfileResponse

/**
 * The two-tier telemetry gate (5.11, D5): emit iff the build is a debug
 * build OR the device profile carries debug=true (the admin flip, 3.1's
 * additive debug field on the device-kind profile answer). Pure JVM — the
 * build tier is injected as a constructor bool (on device it is
 * `BuildConfig.DEBUG`, equivalently `applicationInfo.flags and
 * FLAG_DEBUGGABLE`; JVM tests don't load BuildConfig either way).
 *
 * The profile is REFETCHED on every foreground resume ([onForegroundResume]
 * clears the profile tier; the wiring refetches /profile and lands the fresh
 * answer through [onProfile]) so an admin flip takes effect within one
 * app-switch. Until a fresh answer lands the profile tier is closed — events
 * emitted in the window are dropped (accepted: pairing precedes playback in
 * practice). A debug build stays open across the window (the first tier is
 * unconditional).
 */
class TelemetryGate(private val debugBuild: Boolean) {

    /** Null while no profile answer has landed — the tier is closed. */
    private var profileDebug: Boolean? = null

    val open: Boolean
        get() = debugBuild || profileDebug == true

    /** Lands a fresh /profile answer (the device kind's debug flag, 3.1). */
    fun onProfile(profile: ProfileResponse) {
        profileDebug = profile.debug == true
    }

    /** Closes the profile tier until the resume's fresh /profile lands. */
    fun onForegroundResume() {
        profileDebug = null
    }
}
