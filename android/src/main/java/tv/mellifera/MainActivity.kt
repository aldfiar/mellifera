package tv.mellifera

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.lifecycleScope
import tv.mellifera.pairing.SessionStore
import tv.mellifera.pairing.SharedPreferencesSessionBacking
import tv.mellifera.ui.App

class MainActivity : ComponentActivity() {
    private lateinit var viewModel: AppViewModel

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        viewModel = AppViewModel(
            store = SessionStore(SharedPreferencesSessionBacking(applicationContext)),
            appScope = lifecycleScope,
        )
        setContent {
            App(viewModel)
        }
    }
}
