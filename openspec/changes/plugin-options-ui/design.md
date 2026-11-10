# Design

## Context

SPA-only change on the Plugins admin surface. The wire surface already
serves everything on this branch (cf32a20): the aggregate carries per-binding
`required_secrets` verdicts (`internal/api/plugin_admin.go:48`,
`map[string]bool`, omitted when the plugin declares no secrets) with secret
VALUES deleted from the served options (`redactBindingOptions`,
internal/api/plugin_admin.go:363 — the key is removed, presence lives only
in the verdicts), and the options write endpoint is registered
(internal/api/router.go:622, `PUT /admin/modules/{module_id}/sources/{plugin_id}/options`,
204 / 404 / 400 / 503 per the plugin-admin living spec). The SPA today:
`PluginAdminBinding` (web/src/lib/api.ts:597) lacks the field; the Plugins
page (web/src/pages/admin/Plugins.tsx) renders bindings read-only under an
INV-no-writes header comment; Sources (web/src/pages/admin/Sources.tsx) owns
the gate toggles and carries NO options in its wire model
(`SourceAdminSource` — chains, gates, title counts only). See proposal.md
for motivation.

## Goals / Non-Goals

**Goals:**

- Operator-visible "needs config" state from the served verdicts (badge).
- Options in words for the keys that matter, values verbatim.
- A working write path: enter a missing secret, tweak known options, see
  the verdict re-read from the server.

**Non-Goals:**

- No backend/proto edits; no new endpoints; no server-side merge semantics.
- No generic JSON editor: the editor never adds arbitrary option keys or
  edits non-string values (they pass through untouched).
- No scanner-binding editing (the endpoint refuses those bindings).
- No client-side gate/config resolution — the surface keeps rendering the
  served data verbatim.

## Decisions

**D1 — Editor lives on the Plugins page, per binding, as a DialogShell
dialog.** The binding rows with served options and verdicts already live on
Plugins (the aggregate is the editor's read model); Sources' wire model
carries no options, so hosting the editor there would need a duplicate read
or render. A plain route/page was rejected: the edit is one binding's act,
not a surface. DialogShell (web/src/components/DialogShell.tsx — portal,
scrim, Esc matrix, focus trap/return, overlay-history contract) is the ONE
overlay unit; the manage overlays (IdentifySeries, PosterOverlay) are the
consumer pattern. INV-no-writes in the page header is amended deliberately:
the page still resolves nothing client-side and now carries exactly ONE
sanctioned write — the editor; everything else stays read-only.

**D2 — Write posture mirrors the Sources GateToggle law**
(web/src/pages/admin/Sources.tsx:241-265): `useMutation` retry:0, canonical
`ApiError` surfaced inline, success invalidates `["admin-plugins"]` so
verdicts/badges re-read from the server — never from the write's body.

**D3 — Secret fields are write-only; an empty input composes the key
ABSENT.** The redaction law makes "keep the existing value" impossible
client-side (the value never serves) and the endpoint replaces the WHOLE
options JSON (no merge; SPA-only scope forbids a server change). So the
composed body carries: every served non-secret key (edited entries as
entered, untouched keys byte-identical) + only the non-empty secret inputs.
Consequence: saving with an empty secret input clears the stored value —
stated in plain words beside the field, and the post-save re-read flips the
verdict visibly. The alternative (refuse save while a provided secret sits
empty) is softer for accidents but blocks the legitimate "edit language
only" flow behind a mandatory re-paste; ruled against, flagged as OQ-1.

**D4 — Words layer = a small fixed vocabulary, values verbatim, safe
fallback; METADATA bindings only.** Recognized keys render labeled with the
served value verbatim, string-valued entries only, and the layer runs on
metadata bindings (scanner rows keep today's disclosure-only render). The
shipped vocabulary is `language` → «Язык» — the one key with a live producer
(internal/module/registry.go:146 seeds the tmdb bindings' options with
`language`; the tmdb templates substitute `{language}` from the binding
options, plugins/tmdb/source.go:178) — growing only when a plugin actually
declares a key. The surveyor's Q1 finding is folded: `poster_dir` has no
live producer (its only repo occurrence is a Go test fixture) and is
dropped; the live `include_image_types` key is array-valued, so the
string-valued-entries rule keeps it behind the disclosure. Non-string
values, unknown keys, and scanner-row options stay exactly where they are
today (the raw JSON disclosure, pretty-printed verbatim) — the
INV-verbatim-payload law holds: presentation vocabulary over served bytes,
no config semantics interpreted client-side.

**D5 — Editor on metadata bindings only.** The endpoint answers 400 for "a
plugin that module does not bind as a metadata source" (plugin-admin living
spec, Binding options write endpoint), and scanner rows never carry
verdicts (pluginBindings, internal/api/plugin_admin.go:311-318) — so
scanner bindings keep no edit affordance at all.

## Interfaces (cross-group: group 1 → group 2)

Group 2 consumes group 1's exports verbatim — these signatures are the
contract:

```ts
// web/src/lib/api.ts (group 1 produces; group 2 consumes)
interface PluginAdminBinding {
  // ...existing fields...
  required_secrets?: Record<string, boolean>; // additive, omitted when no declarations
}
const ENDPOINTS = {
  // ...existing entries...
  adminModuleSourceOptions: (moduleId: string, pluginId: string): string =>
    `/api/v1/admin/modules/${moduleId}/sources/${pluginId}/options`,
};
function putAdminModuleSourceOptions(
  moduleId: string,
  pluginId: string,
  options: Record<string, unknown>, // composed body: {"options": options}
): Promise<void>; // 204; ApiError 404/400/503 otherwise
```

```ts
// web/src/components/admin/BindingOptionsEditor.tsx (group 2, NEW module)
function BindingOptionsEditor(props: {
  moduleId: string;
  pluginId: string;
  binding: PluginAdminBinding; // read model: served options + verdicts
  open: boolean;
  onClose: () => void; // shell close paths AND post-save success
  returnFocusRef?: RefObject<HTMLElement>; // the Edit button
}): ReactElement | null; // DialogShell consumer; owns the mutation +
// ["admin-plugins"] invalidation internally
```

## Diagram Decision

exclude: the one cross-group flow (editor → putAdminModuleSourceOptions →
PUT → invalidate `["admin-plugins"]` → aggregate re-read) is fully carried by
the Interfaces signatures plus D2's prose; a diagram would restate it.

## Risks / Trade-offs

- [Operator edits a known option, leaves a provided secret's input empty,
  saves — the secret is wiped] → plain-words consequence copy beside the
  field + the verdict flip visible after the re-read; OQ-1 keeps the
  blocking rule one GATE 1 ruling away.
- [The words vocabulary rots as plugins grow] → unknown keys fall back to
  the raw disclosure — presentation-only decay, never data loss.
- [Two bindings of one plugin edited in sequence] → per-binding dialogs;
  each save invalidates the aggregate, so the second dialog re-reads fresh
  verdicts when (re)opened.

## Open Questions

- OQ-1: empty-secret-input semantics — ruled here as "the key is absent
  from the write; the stored value is cleared" (D3, the only semantics the
  redaction law + whole-replacement endpoint admit). If GATE 1 prefers the
  accident-guard, the alternative is a client-side refusal to save while a
  provided-true secret's input sits empty, with an inline message. Specs
  already state the ruled semantics ("composes the write WITHOUT that key"),
  so flipping requires a delta edit before register.
