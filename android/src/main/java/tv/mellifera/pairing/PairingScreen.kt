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
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.tv.material3.Button
import androidx.tv.material3.Text
import tv.mellifera.browse.PARITY_OVERSCAN_X
import tv.mellifera.browse.PARITY_OVERSCAN_Y
import tv.mellifera.ui.tvFocusStyle
import tv.mellifera.ui.tvForeground
import tv.mellifera.ui.tvInitialFocus
import tv.mellifera.ui.typeBody
import tv.mellifera.ui.typeCode
import tv.mellifera.ui.typeReadout
import tv.mellifera.ui.typeSmall

/**
 * The pairing screen (5.4): server-address entry on first run, the pairing
 * code display with a live status line, and the honest terminal surfaces.
 * Focus law (5.9): entry targets the address field, ready/rejected target
 * the primary button (nav/pairingFocusTarget), and the focused element
 * carries the accent-border + scale visual. Entry UX (5.12): the field is
 * legend-labeled with a helper line naming the accepted form, and a
 * rejected attempt prefills the last-entered text (the draft lives in the
 * flow, not in remember{}).
 */

/** The entry field's legend (5.12) — top-level so the JVM tests pin it. */
const val ADDRESS_FIELD_LEGEND = "Адрес сервера"

/** The helper line naming the accepted form — the normalizeServerAddress
 * law (pairing/SessionStore.kt): bare host[:port] or a full URL, http://
 * prepended and :8080 appended when omitted, explicit https honored. */
const val ADDRESS_FIELD_HELPER =
    "Например 192.168.1.5:8080 или полный URL — http:// и порт 8080 подставятся сами, https:// учитывается"

@Composable
fun PairingScreen(flow: PairingFlow) {
    val state by flow.state.collectAsState()
    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = PARITY_OVERSCAN_X, vertical = PARITY_OVERSCAN_Y),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        when (val current = state) {
            is PairingState.EnterAddress -> AddressEntry(flow, hint = null)
            is PairingState.AddressRejected -> AddressEntry(flow, hint = current.message)
            is PairingState.Ready -> PrimaryAction(flow, "Начать сопряжение")
            is PairingState.Connecting -> Text("Соединение с сервером…", fontSize = typeBody())
            is PairingState.AwaitingApproval -> {
                Text("Введите код на веб-интерфейсе сервера:", fontSize = typeBody())
                // The SPA renders the code font-mono tracking-widest (0.1em).
                Text(
                    current.code,
                    fontSize = typeCode(),
                    fontFamily = FontFamily.Monospace,
                    letterSpacing = 0.1.em,
                    modifier = Modifier.padding(vertical = 12.dp),
                )
                Text("Ожидание подтверждения…", fontSize = typeBody())
            }
            is PairingState.Rejected -> {
                Text(current.message, fontSize = typeBody())
                PrimaryAction(flow, "Запустить сопряжение заново")
            }
            is PairingState.Paired -> Text("Подключено", fontSize = typeBody())
        }
    }
}

@Composable
private fun AddressEntry(flow: PairingFlow, hint: String?) {
    // The draft lives in the flow (5.12): seeding the field from it means a
    // rejected attempt survives the when-branch swap (the recomposed entry
    // prefills), while a fresh flow still starts empty.
    var address by remember { mutableStateOf(flow.addressDraft) }
    if (hint != null) {
        Text(hint, fontSize = typeBody(), modifier = Modifier.padding(bottom = 8.dp))
    }
    Text(ADDRESS_FIELD_LEGEND, fontSize = typeBody(), modifier = Modifier.padding(bottom = 2.dp))
    // Initial-focus law (nav/pairingFocusTarget): the entry state's target
    // is the ADDRESS FIELD, not the submit button.
    BasicTextField(
        value = address,
        onValueChange = { address = it },
        modifier = Modifier
            .widthIn(max = 240.dp)
            .fillMaxWidth()
            .padding(bottom = 2.dp)
            .tvInitialFocus()
            .tvFocusStyle(),
        textStyle = TextStyle(color = tvForeground, fontSize = typeReadout()),
    )
    Text(ADDRESS_FIELD_HELPER, fontSize = typeBody(), modifier = Modifier.padding(bottom = 8.dp))
    PrimaryAction(flow, "Подключить", initial = false) { flow.submitAddress(address) }
}

/** The screen's primary button; [initial] marks the states whose law
 * target it is (Ready / Rejected — nav/pairingFocusTarget). */
@Composable
private fun PrimaryAction(
    flow: PairingFlow,
    label: String,
    initial: Boolean = true,
    onClick: () -> Unit = flow::startPairing,
) {
    Button(
        onClick = onClick,
        modifier = if (initial) Modifier.tvInitialFocus().tvFocusStyle() else Modifier.tvFocusStyle(),
    ) {
        Text(label, fontSize = typeSmall())
    }
}
