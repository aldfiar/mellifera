# Proposal

## Why

The server already serves everything an operator needs to see a plugin's
configuration state: the plugins aggregate (`GET /api/v1/admin/plugins`)
carries per-binding `required_secrets` verdicts (the plugin-admin living
spec's "Required-secrets configuration visibility", shipped with
tmdb-enrichment), and the options write endpoint
(`PUT /api/v1/admin/modules/{module_id}/sources/{plugin_id}/options`) is
registered on this branch (its "Binding options write endpoint" requirement).
The SPA renders none of it: `PluginAdminBinding` (web/src/lib/api.ts) does
not even carry the field, so a binding whose secret is missing looks
identical to one that is configured, the options remain raw JSON behind a
disclosure, and the operator cannot see or fix "needs config" from the UI.

## What Changes

- The Plugins admin surface renders the served per-binding
  `required_secrets` verdicts: a metadata binding with at least one
  unprovided secret wears an operator-visible «Требует настройки» badge
  (served data verbatim — the surface keeps resolving nothing client-side).
- Important options render as WORDS (a known-key presentation vocabulary
  shipping with `language` — the one key with a live producer — values
  verbatim, metadata bindings only); keys outside the vocabulary and every
  scanner binding's options stay behind the existing raw-JSON disclosure.
- A per-binding OPTIONS EDITOR saves via
  `PUT /api/v1/admin/modules/{module_id}/sources/{plugin_id}/options` with
  body `{"options": {...}}` (204; 404 unknown module; 400 unbound/malformed;
  503 nil closure). Where it lives — ruled: on the Plugins page, per
  metadata binding, as a DialogShell dialog. The Plugins page is where the
  binding rows, served options, and verdicts already live (the aggregate is
  the editor's read model); the Sources wire model carries no options at
  all, so hosting the editor there would duplicate a render it cannot read.
  The page's INV-no-writes invariant is amended deliberately to exactly ONE
  sanctioned write (the editor); the table stays read-only otherwise.
- SECRET fields are write-only: the served options omit secret VALUES
  entirely (the redaction law), so the editor shows only the per-binding
  verdict and accepts a NEW value — it never displays or pre-fills a stored
  secret. The dialog states the whole-replacement consequence in plain
  words (an empty secret input composes the write WITHOUT that key — the
  stored value is cleared), and a successful save re-reads the aggregate so
  the verdicts and badges update from the server.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `web-ui`: the "Plugins admin surface" requirement is modified — the
  needs-config badge, the options words layer, and the editor affordance
  join the surface, and its write law becomes "nothing outside the binding
  options editor"; a new "Binding options editor" requirement owns the
  editor's behavior (write-only secrets, replace semantics, canonical
  errors inline, re-read on success).

## Impact

- `web/src/lib/api.ts` — additive `required_secrets` on
  `PluginAdminBinding` (optional; omitted when the plugin declares no
  secrets), `ENDPOINTS.adminModuleSourceOptions`, and
  `putAdminModuleSourceOptions` (the `apiRequestVoid` 204 idiom).
- `web/src/pages/admin/Plugins.tsx` — badge + words in `Binding`, the edit
  affordance + dialog wiring, the INV-no-writes header comment amended.
- NEW `web/src/components/admin/BindingOptionsEditor.tsx` (+ its test) —
  the DialogShell consumer (the manage-overlay pattern).
- Tests: `web/src/pages/admin/Plugins.test.tsx` (badge/words/editor cases;
  the write-spy law becomes "no write outside the editor flow") and
  `web/src/lib/api.test.ts` (the new client function's wire contract).
- SPA-only: no backend/proto edits — the wire surface is served by this
  branch (baseline `go test ./...` GREEN at cf32a20, 28 packages,
  2026-11-10). Web dist regenerates at landing (`make web-build`), never in
  a probe.
