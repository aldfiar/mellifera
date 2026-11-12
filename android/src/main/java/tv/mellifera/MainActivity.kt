package tv.mellifera

import android.content.pm.ApplicationInfo
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.lifecycleScope
import tv.mellifera.diag.PlaybackTracer
import tv.mellifera.diag.collectDeviceFacts
import tv.mellifera.pairing.SessionStore
import tv.mellifera.pairing.SharedPreferencesSessionBacking
import tv.mellifera.player.Media3Controller
import tv.mellifera.ui.App

class MainActivity : ComponentActivity() {
    private lateinit var viewModel: AppViewModel
    private val tracer = PlaybackTracer()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        viewModel = AppViewModel(
            store = SessionStore(SharedPreferencesSessionBacking(applicationContext)),
            appScope = lifecycleScope,
            playbackControllerFactory = {
                Media3Controller(
                    applicationContext,
                    analyticsAttach = tracer::attach,
                )
            },
            // BuildConfig.DEBUG's runtime equivalent: the debuggable build
            // flag (true on debug builds, false on release — 5.11's build
            // tier; JVM tests inject the bool without loading BuildConfig).
            debugBuild = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0,
            deviceFacts = { collectDeviceFacts(applicationContext) },
        )
        tracer.sink = { viewModel.telemetry.emit(it) }
        setContent {
            App(viewModel)
        }
    }

    override fun onResume() {
        super.onResume()
        // The gate closes and /profile is refetched — an admin debug flip
        // lands within one app-switch (5.11).
        viewModel.onForegroundResume()
    }
}
