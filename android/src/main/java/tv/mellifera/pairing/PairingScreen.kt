package tv.mellifera.pairing

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Button
import androidx.tv.material3.Text
import tv.mellifera.ui.tvInitialFocus

/**
 * The pairing screen (5.4): server-address entry on first run, the pairing
 * code display with a live status line, and the honest terminal surfaces.
 * D-pad focus polish is 5.9's — the screen only keeps initial focus on the
 * primary control and does not fight the focus law.
 */
@Composable
fun PairingScreen(flow: PairingFlow) {
    val state by flow.state.collectAsState()
    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        when (val current = state) {
            is PairingState.EnterAddress -> AddressEntry(flow, hint = null)
            is PairingState.AddressRejected -> AddressEntry(flow, hint = current.message)
            is PairingState.Ready -> PrimaryAction(flow, "Начать сопряжение")
            is PairingState.Connecting -> Text("Соединение с сервером…")
            is PairingState.AwaitingApproval -> {
                Text("Введите код на веб-интерфейсе сервера:")
                Text(
                    current.code,
                    fontSize = 48.sp,
                    modifier = Modifier.padding(vertical = 24.dp),
                )
                Text("Ожидание подтверждения…")
            }
            is PairingState.Rejected -> {
                Text(current.message)
                PrimaryAction(flow, "Запустить сопряжение заново")
            }
            is PairingState.Paired -> Text("Подключено")
        }
    }
}

@Composable
private fun AddressEntry(flow: PairingFlow, hint: String?) {
    var address by remember { mutableStateOf("") }
    if (hint != null) {
        Text(hint, modifier = Modifier.padding(bottom = 16.dp))
    }
    BasicTextField(
        value = address,
        onValueChange = { address = it },
        modifier = Modifier.widthIn(max = 480.dp).fillMaxWidth().padding(bottom = 16.dp),
        textStyle = TextStyle(color = Color.White, fontSize = 20.sp),
    )
    PrimaryAction(flow, "Подключить") { flow.submitAddress(address) }
}

@Composable
private fun PrimaryAction(flow: PairingFlow, label: String, onClick: () -> Unit = flow::startPairing) {
    Button(onClick = onClick, modifier = Modifier.tvInitialFocus) {
        Text(label)
    }
}
