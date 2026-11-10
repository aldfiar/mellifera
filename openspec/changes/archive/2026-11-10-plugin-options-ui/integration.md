# Integration audit — plugin-options-ui (surveyor record)

Audited at branch HEAD cf32a20; source map `CURRENCY: CURRENT` at that commit
(fingerprint 1c1a6ff2…). Trigger T1 (design.md exists). All groundings below
are live-source `file:line` reads on this branch or disk-absence checks for
planned-new files; the map is regex-floor for TS/Go here, so every symbol was
grounded by reading live source per G6, never inferred.

## Graph

### Nodes (planned new + touched)

| # | Node | Kind | Grounding |
|---|------|------|-----------|
| N1 | `PluginAdminBinding` + additive `required_secrets?` | touched | web/src/lib/api.ts:597-605 (live iface); wire counterpart `RequiredSecrets map[string]bool json:"required_secrets,omitempty"` internal/api/plugin_admin.go:48; field absent from web/src today (grep, planned-additive confirmed) |
| N2 | `ENDPOINTS.adminModuleSourceOptions` | new | absent from web/src (grep); route counterpart live: `r.Put("/admin/modules/{module_id}/sources/{plugin_id}/options", …)` internal/api/router.go:622 |
| N3 | `putAdminModuleSourceOptions` | new | absent from web/src (grep); idiom precedent `putLibrarySource` api.ts:1898-1909; transport `apiRequestVoid` api.ts:1530-1551; canonical errors `ApiError` api.ts:995-1013 |
| N4 | `BindingOptionsEditor` | new module | web/src/components/admin/BindingOptionsEditor.tsx ABSENT from disk (G2: genuine CREATE, no relocation); DialogShell live props (DialogShell.tsx:59-68: `open, label, width?, focusKey?, returnFocusRef?, onClose, onEscape?`) realize the design's editor interface verbatim |
| N5 | Plugins page `Binding` + INV header | touched | web/src/pages/admin/Plugins.tsx — INV-no-writes comment :60-62; aggregate query `["admin-plugins"]` retry:0 :64-68; `Binding` :332-394 (options raw-JSON disclosure :382-391) |
| N6 | Plugins.test.tsx write-spy law | touched | :17 ("The surface is READ-ONLY, so the write fetchers are spied…"), :101-152 (spies `patchAdminSource`/`putLibrarySource`/`deleteLibrarySource`) |
| N7 | BindingOptionsEditor.test.tsx | new | ABSENT from disk; carries the 3 named @qa nodes (tasks.md:13) |
| N8 | api.test.ts | touched | exists (web/src/lib/api.test.ts); gains the N3 wire-contract test |

Live consumed, untouched (grounding-only): `DialogShell`
(web/src/components/DialogShell.tsx:59); `apiRequestVoid` (api.ts:1530);
`ApiError` (api.ts:995); `ui/input.tsx` (exists — the password-type secret
inputs); the PUT handler `adminModuleBindingOptions`
(internal/api/source_admin.go:281); `redactBindingOptions`
(internal/api/plugin_admin.go:363); `pluginBindings` (plugin_admin.go:327-352
— scanner-kind rows append raw options and `continue` at :330-335, so scanner
rows never carry `required_secrets`); the only secret declaration in the
plugin set: tmdb `RequiredSecrets: []string{"api_key"}`
(plugins/tmdb/pluginsvc.go:70).

### Edges

| # | Edge | Task |
|---|------|------|
| E1 | BindingOptionsEditor → `putAdminModuleSourceOptions` (mutation call) | 2.2 |
| E2 | BindingOptionsEditor → DialogShell (mount; `open`/`onClose`/`returnFocusRef`) | 2.2, 2.3 |
| E3 | BindingOptionsEditor → `required_secrets` verdict rows (read model via `binding` prop) | 2.2 |
| E4 | editor success → invalidate `["admin-plugins"]` → aggregate re-read (data-flow; key matches the live query key, Plugins.tsx:65) | 2.2, 2.3 |
| E5 | `Binding` → `required_secrets` badge read (served by plugin_admin.go:48; scanner rows structurally field-less, plugin_admin.go:330-335) | 2.1 |
| E6 | `Binding` → words vocabulary over served options — live producer for `language`: registry.go:146 (`"options": {"language": "en-US", "include_image_types": […]}`) + plugins/tmdb/source.go:178 (`languageVar = "language"`) | 2.1 |
| E7 | Plugins.tsx → BindingOptionsEditor (per-METADATA-binding Edit affordance, Edit button as returnFocusRef) | 2.3 |
| E8 | `putAdminModuleSourceOptions` → `ENDPOINTS.adminModuleSourceOptions` (module_id before plugin_id — matches router.go:622) | 1.1 |
| E9 | `putAdminModuleSourceOptions` → `apiRequestVoid` (PUT, pre-stringified `{"options": …}` body, explicit Content-Type — the putLibrarySource bridge, api.ts:1898-1909) | 1.1 |
| E10 | PUT route → `adminModuleBindingOptions` (204 / 404 unknown module / 400 unbound-or-malformed / 503 nil closure — router.go:613-621 comment + source_admin.go:281) | live counterpart of E8 |
| E11 | Plugins.test.tsx → `putAdminModuleSourceOptions` spy (write-spy law becomes "no write outside the editor flow") | 2.3 |
| E12 | BindingOptionsEditor.test → editor (3 named qa nodes) | 2.2 |
| E13 | api.test → `putAdminModuleSourceOptions` (path+body verbatim, void on 204, canonical ApiError) | 1.1 |
| E14 | editor → `ui/input` (write-only password inputs) | 2.2 |

nodes=8, edges=14.

## Check verdicts

### Wiring coverage — PASS (no orphan nodes)

Every planned node carries an edge into the live system that a named task
implements: the client targets a route that is registered and handled live
(E8→E10); the invalidate key targets the live aggregate query (E4 ↔
Plugins.tsx:65); the DialogShell contract realizes the editor interface
field-for-field (N4 grounding); the type field is served by the live wire
shape (N1 ↔ plugin_admin.go:48). The editor's only mount point is task 2.3 —
no new module is left unregistered. No orphan nodes.

### qa seam coverage — PASS (both seams covered)

- Editor-internal joints (write-only secrets, composed body, canonical
  refusal inline): task 2.2 is `@qa` with the 3 named vitest nodes
  (tasks.md:13) — the redaction interplay is covered by
  `secrets-render-empty…never-pre-fill` (the served options omit secret
  VALUES per redactBindingOptions, plugin_admin.go:363, so "never pre-fill"
  is the only renderable truth), the write path by
  `composed-body-preserves-untouched-keys-and-drops-empty-secrets` (D3's
  whole-replacement + empty-absent rule), the error path by
  `canonical-refusal-renders-inline…`.
- Group1→group2 seam (client ↔ editor): covered two-sided — 2.2 proves the
  composed body at the mocked-client boundary; 1.1's api.test.ts proves the
  client sends exactly that path+body. The joint is therefore proven
  transitively through the single choke point (N3). No dedicated @wf-qa task
  exists; for an SPA-only change this two-sided unit coverage meets the seam
  floor. Noted: no vitest node runs a real unmocked client+editor joint —
  that tier is the landing probe (dist regen + live probe, proposal.md:72-75),
  consistent with the project idiom.
- Surface seam (affordance → dialog → save → close → re-read): task 2.3's
  click-through names it explicitly (tasks.md:15) and its duty runs the whole
  Plugins.test.tsx.

### Complexity / blast radius — CONTAINED (one stale-comment nit → Q3)

- `PluginAdminBinding` consumers: api.ts (def :597 + `PluginAdminPlugin.config`
  :629) and Plugins.tsx (:9, :333) ONLY (repo grep). The additive optional
  field cannot break any other consumer; Sources' wire model
  (`SourceAdminSource`) never touches the type.
- The INV-no-writes amendment has exactly one other asserter beyond the page
  header: Plugins.test.tsx (:17, :101-152) — amended by task 2.3.
  PluginFailures.tsx:44 carries a different page's INV-no-writes — unaffected.
- No edge lands in a file no task touches; every import the editor needs
  exists (DialogShell, ui/input, ui/badge, ui/alert).
- retry:0 mutation posture precedent grounded (Sources.tsx:66 INV +
  GateToggle :241-265, retry:0 at :261, invalidate at :263 — note GateToggle
  invalidates `["admin-sources"]`; D2 correctly adapts the KEY to
  `["admin-plugins"]` for this page).

## Numbered questions

**Q1 — the `poster_dir` vocabulary entry has no live producer.**
design D4 (design.md:70-74), proposal.md:24-25, tasks.md:10, and the spec
delta (specs/web-ui/spec.md:20-22) all include `poster_dir` → «Каталог
постеров», cited as "the image-scanner binding options shape". Live code: the
image module's scanner binding declares `exclude_patterns` + `follow_symlinks`
(internal/module/registry.go:187-192, imageConfigJSON); image-enricher's
metadata binding declares `options: {}` (registry.go:197); the tmdb bindings
declare `language` + `include_image_types` (registry.go:146, :279). The string
`poster_dir` exists NOWHERE in production code — its only occurrence in the
repo is a Go test fixture (internal/api/plugin_admin_secrets_test.go:23, :173,
:200). Recommended answer: drop `poster_dir` from the vocabulary in all four
artifacts; ship the words layer with `{language}` — the one key with a live
producer — and grow the vocabulary when a plugin actually declares a key (the
design's own rot note, design.md:134-135, already prices vocabulary decay as
presentation-only).

**Q2 — the words layer's binding-kind scope is ambiguous between artifacts.**
design D4's own prose scopes scanner rows OUT ("scanner-row options stay
exactly where they are today — the raw JSON disclosure", design.md:75-78),
while tasks.md:10 and the spec delta (specs/web-ui/spec.md:19-23) carry no
kind scope ("The binding's options SHALL render as words…"). If the layer is
metadata-only, `poster_dir` could never render even in principle (its only
conceivable producer is a scanner row) — reinforcing Q1; if it is all-rows,
D4's prose contradicts tasks/spec. Recommended answer: scope the words layer
to metadata bindings (matching D4's prose and D5's scanner exclusion,
design.md:80-84) and add that scope explicitly — one clause, "on metadata
bindings" — to tasks.md 2.1 and the spec delta sentence.

**Q3 — LOW: the api.ts ENDPOINTS comment asserts the old law.**
web/src/lib/api.ts:1064-1065 — "…config bindings — READ-ONLY (the Sources
surface owns the gate writes)" — describes the Plugins surface as read-only;
after landing it carries exactly one sanctioned write. The file is touched by
task 1.1 anyway. Recommended answer: fold a one-line comment amendment into
task 1.1 ("READ-ONLY" → "read-only except the binding options editor
(plugin-options-ui)") so the wire-file comment matches the amended INV — 2.3
cannot carry it (it does not touch api.ts).

Carried from the design (not a surveyor finding): design OQ-1 (design.md:140-148)
— empty-secret-input semantics ruled "the key is absent from the write; the
stored value is cleared" (D3); the accident-guard alternative is one GATE 1
ruling away and would require a spec-delta edit before register. The specs
consistently state the ruled semantics today. Already routed to GATE 1 by the
design itself.

## Resolutions (recorded at GATE 1)

GATE 1 APPROVED 2026-11-10 — operator ruling: "Approve + fold Q1–Q3";
OQ-1 ruled AS DESIGNED ("Absence clears" — no spec-delta flip needed).
All three findings folded as recommended (amended, none waived); the
amendments are pre-register (no receipts exist, no drift gate).

- Q1: accepted as recommended. `poster_dir` dropped from the words
  vocabulary in proposal.md, design.md D4, and tasks.md 2.1 (the spec delta
  never carried a key literal); shipped vocabulary = {language} — the one
  key with a live producer (registry.go:146) — growing only when a plugin
  actually declares a key. design.md D4 also notes the live
  `include_image_types` key stays behind the disclosure (array-valued, so
  the string-valued-entries rule excludes it).
- Q2: accepted as recommended. The words layer is scoped to METADATA
  bindings explicitly in tasks.md 2.1 and the spec delta sentence (matching
  D4's prose and D5's scanner exclusion); a scanner-rows-stay-disclosure-only
  assertion joined the 2.1 test clause.
- Q3: accepted as recommended. The one-line api.ts ENDPOINTS comment
  amendment (READ-ONLY → read-only except the binding options editor,
  plugin-options-ui) folded into task 1.1's prose.
- OQ-1 (design, carried): accepted AS RULED — "Absence clears": an empty
  secret input composes the key ABSENT; the stored value clears under
  whole-replacement. The specs stand as authored; no delta edit.

## Handoff

Addressed to wf-reviewer via `wf handoff put plugin-options-ui wf-reviewer`.
Belief for the gate: re-ground every planned edge against the post-change map
(`wf index query callers` on `putAdminModuleSourceOptions` and
`BindingOptionsEditor`; orphan check on the editor and the amended write-spy
law); honor the recorded waivers; re-check Q1's shipped vocabulary against
whatever lands.
