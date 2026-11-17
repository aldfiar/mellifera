package tv.mellifera.ui

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import tv.mellifera.AppViewModel

private val chipColor = Color(0xFF2A2F3A)

/**
 * The minimal settings surface (5.11): the app has no settings screen, so
 * the «Поделиться диагностикой» affordance lives where the contract places
 * it — a section above the browse shell, VISIBLE ONLY WHEN THE GATE IS ON
 * (the telemetry.isOpen state). The button composes the session's collected
 * diagnostics (sent trace events + snapshot, full detail) and hands the
 * text to the Android share sheet; the formatting lives in
 * diag/formatDiagnostics (pure), this is only the intent plumbing.
 */
@Composable
fun SettingsSection(viewModel: AppViewModel) {
    val isOpen by viewModel.telemetry.isOpen.collectAsState()
    if (!isOpen) return
    val context = LocalContext.current
    Column(modifier = Modifier.padding(start = 32.dp, top = 12.dp)) {
        Text("Настройки", fontSize = TYPE_HEADING)
        Text(
            "Поделиться диагностикой",
            fontSize = TYPE_SMALL,
            modifier = Modifier
                .padding(top = 6.dp)
                .background(chipColor, RoundedCornerShape(2.dp))
                .tvFocusStyle()
                .clickable { shareDiagnostics(context, viewModel) }
                .padding(horizontal = 6.dp, vertical = 4.dp),
        )
    }
}

private fun shareDiagnostics(context: Context, viewModel: AppViewModel) {
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, viewModel.telemetry.shareText())
    }
    context.startActivity(Intent.createChooser(intent, null))
}
