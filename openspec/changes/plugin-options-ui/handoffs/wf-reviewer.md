# Surveyor handoff → wf-reviewer (plugin-options-ui)

Written at audit time, branch cf32a20, map CURRENT. The evidence home is
`openspec/changes/plugin-options-ui/integration.md` (beside the plan
artifacts) — this record is belief; verify against the post-change map at
GATE 2, never against this text.

## Audit summary

Planned integration graph: nodes=8 (api.ts: PluginAdminBinding+required_secrets,
ENDPOINTS.adminModuleSourceOptions, putAdminModuleSourceOptions; NEW
web/src/components/admin/BindingOptionsEditor.tsx (+ .test.tsx); Plugins.tsx
Binding+INV header; Plugins.test.tsx; api.test.ts), edges=14. All nodes
grounded: live symbols by file:line reads (PluginAdminBinding api.ts:597;
wire field plugin_admin.go:48; route router.go:622 + handler
source_admin.go:281; apiRequestVoid api.ts:1530; ApiError api.ts:995;
putLibrarySource idiom api.ts:1898-1909; DialogShell props
DialogShell.tsx:59-68 realize the editor interface verbatim; query key
["admin-plugins"] Plugins.tsx:65; GateToggle law Sources.tsx:241-265 —
D2 correctly adapts the invalidate key to ["admin-plugins"]); planned-new
symbols confirmed ABSENT from disk and from web/src greps.

Verdicts at audit time:
- Wiring coverage PASS — no orphan nodes; every planned edge lands in the
  live system and a named task implements it (E1–E14 in integration.md).
- qa seam coverage PASS — 2.2 @qa with the 3 named vitest nodes covers the
  editor-internal joints (write-only secrets/redaction, composed body,
  canonical refusal); the group1→group2 seam is covered two-sided
  (2.2 composed-body at the mock boundary + 1.1 wire-contract in
  api.test.ts) through the single choke point; 2.3's click-through covers the
  surface seam incl. invalidate+re-read. No dedicated @wf-qa task — accepted
  for an SPA-only change; real-client tier stays the landing probe.
- Complexity/blast radius CONTAINED — PluginAdminBinding has exactly two
  consumers (api.ts, Plugins.tsx); the INV-no-writes amendment's only other
  asserter is Plugins.test.tsx (amended by 2.3); no edge lands in a file no
  task touches.

## Open questions at write time (surface at GATE 1)

- Q1: `poster_dir` words-vocabulary entry has NO live producer — the image
  scanner binding's real options are exclude_patterns/follow_symlinks
  (registry.go:187-192); poster_dir exists only in a Go test fixture
  (plugin_admin_secrets_test.go:23). Recommended: drop it, ship vocabulary =
  {language} (registry.go:146 + tmdb/source.go:178).
- Q2: words-layer kind scope ambiguous — D4 prose excludes scanner rows,
  tasks.md 2.1 / spec delta carry no kind scope. Recommended: scope to
  metadata bindings explicitly in both.
- Q3 (LOW): api.ts:1064-1065 ENDPOINTS comment still says the Plugins surface
  is READ-ONLY. Recommended: amend in task 1.1's pass.
- Carried: design OQ-1 (empty-secret-input = key absent / value cleared,
  ruled in D3; flip needs a spec-delta edit before register).

Waiver list: empty at write time — no waivers recorded; resolutions land in
integration.md §Resolutions at GATE 1.

## Gate obligations (belief, re-ground at GATE 2)

1. Re-run `wf index query callers` on putAdminModuleSourceOptions and
   BindingOptionsEditor against the post-change map; flag any caller outside
   the change diff.
2. Orphan check: the editor must have exactly its planned mount (Plugins.tsx
   per-metadata-binding); the amended write-spy law must show no write
   outside the editor flow.
3. Re-check Q1's shipped vocabulary against what actually landed (if the
   plan is amended, the vocabulary may have shrunk).
4. Honor whatever resolutions/waivers integration.md §Resolutions records.
