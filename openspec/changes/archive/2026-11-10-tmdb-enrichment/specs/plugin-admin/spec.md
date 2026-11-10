# Spec Delta

## ADDED Requirements

### Requirement: Binding options write endpoint

`PUT /api/v1/admin/modules/{module_id}/sources/{plugin_id}/options` with body
`{"options": {...}}` SHALL replace exactly that module binding's options JSON in
the store-backed module config (the registry row and its in-memory cache
together), leaving every other module, binding, and config key untouched — the
store-backed home the SERVER-mode auth resolution reads binding secrets from. The
endpoint SHALL be admin-gated like the other admin routes, SHALL be a
Deps-closure endpoint (nil-safe, cmd-wired — the api package stays free of
module/enrich imports), SHALL answer `204` on write, and SHALL answer `404` for
an unknown module, `400` for a plugin that module does not bind as a metadata
source or a malformed body, and `503` for a nil closure. The write changes
dormancy only on the next derivation read — it wakes nothing.

#### Scenario: The write lands and reads back

- **WHEN** the options route writes `{"options": {"api_key": "k", "language": "ru-RU"}}` for a bound metadata plugin
- **THEN** the answer is 204, the module config's binding for that plugin reads back exactly the written options JSON, and every other binding in every module is byte-identical

#### Scenario: Unknown module or binding is refused with nothing written

- **WHEN** the route names an unknown module id, or a plugin the module does not bind as a metadata source, or carries a malformed body
- **THEN** the answers are `404`, `400`, and `400` respectively and no stored config changes

### Requirement: Required-secrets configuration visibility

Each METADATA binding row of the plugins aggregate (`GET /api/v1/admin/plugins`,
keyed by module id — the row whose config the SERVER-mode dormancy is judged
from) SHALL carry an additive `required_secrets` presentation: the secret names
the binding's plugin declares in its handshake capability declaration and, for
each name, whether a value resolves from THAT binding's config — the
operator-visible "needs config" state. A plugin bound by several modules SHALL
render each binding's own verdicts (per-binding options make per-binding
verdicts; a plugin row itself carries NO single provided verdict). The binding
options the aggregate serves SHALL omit the VALUES of secret-named keys
entirely (presence lives in the verdicts, never in the served bytes); all other
options keys serve verbatim as today. The endpoint SHALL stay read-only — the
presentation writes nothing.

#### Scenario: Bindings of one plugin render their own verdicts

- **WHEN** the aggregate serves a SERVER plugin declaring `required_secrets: ["api_key"]` that is bound by two modules whose binding configs disagree — one module's binding provides the value, the other's lacks it
- **THEN** the two binding rows carry the secret name with provided true and provided false respectively — the visible per-binding "needs config" state — and no single plugin-level verdict exists

#### Scenario: Secret values never serve

- **WHEN** a metadata binding's configured options JSON carries a key named in the plugin's `required_secrets` alongside ordinary keys
- **THEN** the served options omit the secret-named key entirely while the ordinary keys render verbatim
