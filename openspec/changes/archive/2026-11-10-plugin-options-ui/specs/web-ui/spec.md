# Spec Delta

## MODIFIED Requirements

### Requirement: Plugins admin surface

The SPA SHALL offer a Plugins admin surface beside Collections and Sources
(route `/admin/plugins`, reachable from the sidebar and from the admin pages'
tab row): one row per loaded plugin with its display name and description,
capability chips, state chips — the served health state rendered working for
`serving`, errored for `failed`/`not_serving` with the served message inline,
the served word otherwise, plus a disabled chip per module whose served
effective verdict mutes the plugin — and its config bindings rendered
read-only (module, kind, priority, enabled, auth mode, display fields,
options JSON verbatim). Each metadata binding whose served `required_secrets`
verdicts carry at least one secret without a provided value SHALL render an
operator-visible «Требует настройки» badge; bindings whose verdicts all
resolve, and bindings carrying no verdicts (no declarations — scanner rows
never carry the field), SHALL render no badge. Each METADATA binding's
options SHALL render as words through a small known-key presentation
vocabulary (recognized keys labeled, served values verbatim, string-valued
entries only), with every key outside the vocabulary — and every scanner
binding's options — staying behind the existing raw-JSON disclosure — the
surface still interprets no config semantics. Per
metadata binding the surface SHALL offer an options editor per the Binding
options editor requirement — the surface's ONLY write affordance. Per plugin
the surface SHALL offer a last-logs view fetching
`GET /admin/plugins/{plugin_id}/logs` on demand and rendering the bounded
tail oldest-first. The surface consumes the SERVED verdicts and never
resolves gates client-side; it writes nothing outside the binding options
editor; canonical errors surface inline without auto-retry.

#### Scenario: The surface renders state and config per plugin

- **WHEN** the operator opens `/admin/plugins` with the aggregate answering,
  one metadata binding serving `required_secrets` with an unprovided secret
  and ordinary option keys alongside
- **THEN** each loaded plugin renders its name, state chips (the served
  health state; a disabled chip per served module verdict muting it),
  capability chips, that binding renders the «Требует настройки» badge and
  its known options as words with the served values verbatim (unknown keys
  behind the raw disclosure), and the page issues no write outside the
  binding options editor

#### Scenario: The needs-config badge reads the served per-binding verdicts

- **WHEN** one metadata binding of a plugin bound by two modules reads
  `required_secrets` with a provided false while the other module's binding
  reads the same secret provided true
- **THEN** the first binding renders the badge and the second renders none —
  the per-binding verdicts are the visible state, never a plugin-level
  verdict

#### Scenario: Last logs render on demand

- **WHEN** the operator opens a plugin's last-logs view and the endpoint
  answers with the plugin's captured tail
- **THEN** the lines render oldest-first inline and a canonical error
  renders inline without auto-retry

## ADDED Requirements

### Requirement: Binding options editor

The Plugins surface SHALL offer a per-binding options editor on METADATA
bindings (scanner bindings carry none — the write endpoint refuses them):
a dialog that saves via `PUT /api/v1/admin/modules/{module_id}/sources/{plugin_id}/options`
with body `{"options": {...}}`, replacing exactly that binding's options.
For every secret name in the binding's served `required_secrets` verdicts
the editor SHALL render the verdict beside a WRITE-ONLY input that is never
pre-filled and never displays a stored secret value; the served options omit
secret values entirely (the redaction law), so presence is visible only
through the verdict. The editor SHALL present the non-secret options as
editable words seeded only from string-valued entries; keys the editor does
not present pass through the composed write untouched, and an empty secret
input composes the write WITHOUT that key — clearing the stored value under
the endpoint's whole-replacement contract, stated in plain words beside the
input. A successful `204` SHALL close the dialog and re-read the aggregate
so the verdicts and badges update from the server (the surface never
re-derives them); canonical errors — `404` unknown module, `400` unbound
plugin or malformed body, `503` unwired closure — SHALL surface inline in
the dialog without auto-retry, leaving it open. The mutation SHALL NOT
auto-retry.

#### Scenario: A saved secret re-reads from the server

- **WHEN** the operator enters the missing secret value for a binding whose
  verdict reads provided false and saves, and the endpoint answers `204`
- **THEN** the dialog closes, the aggregate re-reads, and the binding's
  verdict and badge update from the served data — the composed body carried
  the non-secret options plus the entered value, and no stored value was
  ever displayed on the way

#### Scenario: Secrets stay write-only

- **WHEN** the editor opens on a binding whose secret verdict reads provided
  true
- **THEN** the secret input renders EMPTY beside the provided verdict — the
  stored value is never displayed or pre-filled, and the plain-words copy
  states that an empty input clears the stored value on save

#### Scenario: Replace semantics preserve unpresented keys

- **WHEN** the operator edits a recognized option and saves while other
  non-secret keys (including non-string and vocabulary-unknown ones) sit in
  the served options
- **THEN** the composed `{"options": {...}}` body carries the served
  non-secret keys — the edited entry as entered, every untouched key
  byte-identical — plus only the non-empty secret inputs

#### Scenario: Canonical refusals surface inline without auto-retry

- **WHEN** the write answers `404` (unknown module), `400` (unbound plugin
  or malformed body), or `503` (unwired closure)
- **THEN** the canonical error surfaces inline in the dialog, the dialog
  stays open for correction, and the mutation does not auto-retry
