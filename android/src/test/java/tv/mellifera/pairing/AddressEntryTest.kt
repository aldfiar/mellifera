package tv.mellifera.pairing

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The 5.12 entry-UX pins (pure JVM): the legend and helper constants carry
 * the form guidance (and the helper's example actually normalizes — the
 * guidance never promises a form the address law rejects), a rejected
 * attempt leaves the draft in the flow so the retry prefills the
 * last-entered text, and a fresh flow — and a re-entry after an accepted
 * address — still starts empty (the first-run law).
 */
class AddressEntryTest {

    private fun flow(): PairingFlow = PairingFlow(
        apiFor = { _ -> error("unreachable: entry UX never fires a request") },
        store = SessionStore(InMemorySessionBacking()),
        scope = CoroutineScope(Job()),
    )

    @Test
    fun legend_and_helper_carry_form_guidance() {
        assertEquals("Адрес сервера", ADDRESS_FIELD_LEGEND)
        // The helper names the accepted forms: bare host[:port], the
        // auto-prepended scheme and port, and the explicit https escape.
        assertTrue(ADDRESS_FIELD_HELPER.contains("192.168.1.5:8080"))
        assertTrue(ADDRESS_FIELD_HELPER.contains("http://"))
        assertTrue(ADDRESS_FIELD_HELPER.contains("8080"))
        assertTrue(ADDRESS_FIELD_HELPER.contains("https"))
        // The helper's example must be truthful: it normalizes under the
        // exact law the helper describes.
        assertEquals("http://192.168.1.5:8080", normalizeServerAddress("192.168.1.5:8080"))
        assertEquals("http://192.168.1.5:8080", normalizeServerAddress("192.168.1.5"))
        assertEquals("https://mell.local", normalizeServerAddress("https://mell.local"))
    }

    @Test
    fun rejected_attempt_prefills_draft() {
        val flow = flow()
        assertEquals(PairingState.EnterAddress, flow.state.value)
        // Inputs the address law actually rejects: free text with spaces
        // (no URI), then a non-http(s) scheme.
        flow.submitAddress("not a server address")
        assertTrue(flow.state.value is PairingState.AddressRejected)
        // The last-entered text survives the AddressRejected round-trip in
        // the flow — the recomposed entry prefills from it.
        assertEquals("not a server address", flow.addressDraft)
        // A second rejected attempt keeps the LATEST entered text.
        flow.submitAddress("ftp://mell.local")
        assertTrue(flow.state.value is PairingState.AddressRejected)
        assertEquals("ftp://mell.local", flow.addressDraft)
    }

    @Test
    fun fresh_entry_starts_empty() {
        // Fresh flow: nothing entered yet, the field starts empty.
        assertEquals("", flow().addressDraft)
        assertEquals(PairingState.EnterAddress, flow().state.value)
        // An accepted submit consumes the draft: a later re-entry (the 401
        // wipe back to EnterAddress) starts empty, not with the stored
        // address the user never needs to retype.
        val flow = flow()
        flow.submitAddress("192.168.1.5:9000")
        assertEquals(PairingState.Ready, flow.state.value)
        assertEquals("", flow.addressDraft)
    }
}
