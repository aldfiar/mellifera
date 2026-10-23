# GATE 2 review — identify-match-override

Reviewer: @wf-reviewer (GATE 2). Date: 2026-10-22. Range: `d9a569e..85ee853`
(branch feature/identify-match-override, 6 commits). Worktree-verified; every
duty re-run in the reviewer's own shell from the worktree root.

## Verdict

**PENDING FIXES — not archivable yet.** All 12 per-box duties re-run green and
the diff carries every delta scenario faithfully, but the full-suite gate
anchor is RED: the repo's own exported-symbol budget guard fails
(`internal/api` at 13 exported symbols, cap fail >12) inside
`TestWeb_Integration/ac7_gates`. One finding (F1) blocks the gate; it is small,
precisely located, and fixable without touching the wire behavior.

Gate line: `Pending Fixes`

## Duty re-runs (12/12 boxes, all duty.verify — zero duty.review boxes)

| Box | Duty (as read from plan.yaml, run verbatim from worktree root) | rc |
|-----|----------------------------------------------------------------|----|
| 1.1 | greps (rpc SearchSpecs / rpc SearchResults / message SearchCandidate) + `go build ./proto/... ./pkg/sdk/...` | 0 |
| 1.2 | `go test ./pkg/sdk -run TestUnsupportedSearch -count=1 && go test ./plugins/serial-parser -run TestSearchUnsupported -count=1` | 0 |
| 1.3 | `go test ./plugins/shikimori -run TestSearchSpecs -count=1` | 0 |
| 1.4 | `go test ./plugins/shikimori -run TestSearchResults -count=1` | 0 |
| 2.1 | `go test ./internal/enrich -run TestSearchSource -count=1` | 0 |
| 2.2 | `go test ./internal/enrich -run TestIdentifySeries -count=1` | 0 |
| 2.3 | `go test ./internal/api -run "TestSourceSearch\|TestSeriesIdentify" -count=1` | 0 |
| 2.4 | greps (identify-match-override in both qa regression files) + `go test ./internal/itest -run "TestQA_AdditiveContract_ProtoAndDepsUnchanged\|TestB2_Ac3Additive" -count=1` | 0 |
| 3.1 | IdentifySeries.tsx existence + 6 data-testid greps + negative `.sort(` probe | 0 |
| 3.2 | greps (`/identify` + `searchSource` in api.ts; identify-confirm testid) | 0 |
| 3.3 | grep `identify={seriesIdentifyGate` in Collection.tsx | 0 |
| 4.1 | `go test ./internal/itest -run TestIdentifyMatchJoint -count=1` (7.9s) | 0 |

`wf change status identify-match-override` rc 0 (12 boxes, 12 claims, receipts
present). `openspec validate identify-match-override --strict` (pin 1.14.0) rc 0.

## Full-suite gate anchor

- `go test ./... -count=1` (no -short, ffmpeg present): **FAIL** —
  `internal/itest` 217s, one failing subtest
  `TestWeb_Integration/ac7_gates` (integration_web_test.go:431):
  `make check` exit 2 —
  `FAIL github.com/mellifera/mellifera/internal/api: 13 exported symbols (>12)`.
  Reproduced solo: `go test ./internal/itest -count=1` rc 1, same single
  failing subtest, everything else in the package passes. All other packages
  ok (internal/api, internal/enrich, internal/plugin, pkg/sdk, all plugins, …).
- `cd web && npx vitest run`: **rc 0 — 16 files, 233/233 tests passed.**
- `npx eslint src`: 4 errors + 1 warning, all pre-existing — in
  `web/src/pages/home/Home.tsx` (1 warning, react-hooks/exhaustive-deps) and
  `web/src/pages/admin/Sources.test.tsx` (4 errors, unused `_libraryId` /
  `_pluginId` params). Both files untouched by this change (0 diff entries at
  d9a569e..HEAD) — the pre-existing claim VERIFIES (dispatch's paths were
  approximate; these are the exact files).

## Diff vs deltas (Spec axis)

Every delta scenario's behavior is present, no more and no less:

- **plugin-pipeline** — proto pair additive, proto3 field presence on the
  optionals, `SearchCandidate` exactly the seven declared fields
  (metadata.proto). SearchSpecs reuses the shared bounded pageSize, app UA,
  min_interval 700, kind narrows only when non-empty (shikimori/search.go).
  SearchResults preserves payload order, RU-first title, absent-stays-absent.
  UnsupportedSearch base + ErrSearchUnsupported sentinel; serial-parser,
  tv-parser, frame-grabber, image-enricher and every test fake embed it (the
  compile-required ripple; sanctioned by the proposal's "non-search plugins
  answer through an SDK unsupported-search base"). Guard re-pin 13e441a →
  6f7a612 in exactly the three sanctioned sites, each comment naming this
  change — the sanctioned in-change re-pin, not a breach.
- **metadata-source-admin** — `GET /admin/sources/{plugin_id}/search` in the
  `requireRole(RoleAdmin)` group (router.go), read-only, gate-paced
  (TestSearchSourceGateSpacing pins the slot arithmetic: second send lands
  exactly one min_interval later on the fixed clock), served-order candidates
  as convention-field maps, `[]` never null, whitespace-only query 400,
  unknown plugin 400, `search_unsupported` 400, upstream 502 retry-disabled.
- **async-enrichment** — `PUT /series/{id}/identify` in the admin group,
  lease-held write (`identifyOwner`), anchor overwrite at
  `identifiers.<source_id>_id`, then the existing ReenrichSource strip +
  notify; deferred row byte-identical (byte-compare pinned); error paths write
  nothing; title namespaces and title_overrides untouched. The anchor is
  written NUMERICALLY when the pick parses as an integer — this matches the
  existing tier convention (shikimori claims `shikimori_id` as int64,
  source.go:89; reads it via intField, source.go:83) and is what makes the
  id-anchored fetch actually work; the joint test proves the anchored leg
  fetches `/api/animes/{picked_id}` and never a search. Design's "verbatim"
  is realized as numerically-typed verbatim, documented in-code.
- **web-ui** — the MODIFIED CardActions text matches the shipped reality; the
  series identify overlay carries all three steps, all six data-testids, the
  no-sort probe, picker only when >1 binding, quiet/empty/error states,
  confirm copy, invalidate-on-202 + awaited collapse, Escape suppressed while
  pending, and the seriesIdentifyGate chain+refreshSources gate.
- **qa joint (4.1)** — genuine Tier-1: real store, real queue, shikimori
  subprocess, stub upstream, real PUT route; the anchored-leg assertion
  (2 search + exactly by-id + roles, nothing else) is the by-id proof; display
  name byte-parity across the identify.
- OpenAPI regenerated (openapi.json/yaml in the diff); swag annotations on
  both handlers. `internal/web/dist` rebuilt (the make web-build artifact).
- Scope: no out-of-scope behavior change found. The design's D7 promise
  ("the api package stays at its 12-symbol export cap") is the one spec-axis
  breach — see F1.

## Findings

### F1 — FAIL (gate-blocking): internal/api export cap breached; repo budget guard red

- Evidence: internal/api/identify.go:21 `var ErrSearchUnsupported = errors.New(…)`.
  Merge base d9a569e exports exactly 12 package-level symbols in internal/api
  (AdminStatus, Deps, EnrichPreview, EnrichStats, ModulePresentation, New,
  ParserBinding, Playback, PluginHealth, Principal, ReenrichResult, Role —
  incl. the 3-sentinel var block ErrRefreshInFlight/ErrUnknownPlugin/
  ErrUnknownRows). HEAD = those 12 + ErrSearchUnsupported = 13.
  check.sh fails >12 ("Redesign; do not relax the budget"); it runs inside
  TestWeb_Integration/ac7_gates → the full-suite anchor is red.
- Spec axis: hard violation of the change's own design D7 ("Deps
  … primitive returns … the api package stays at its 12-symbol export cap").
- Standards axis: hard violation of a documented project convention
  (complexity budget enforced by the repo's own gate).
- Fix (caller's job, reviewer read-only): remove the package-level export
  while keeping the wire behavior (400 search_unsupported) and INV2. Viable
  shapes: (a) classify `errors.Is(err, sdk.ErrSearchUnsupported)` directly in
  the handler — note identify.go's comment over-extends INV2 to pkg/sdk; the
  design text bans enrich/plugin imports only, and .golangci.yml depguard does
  not deny sdk — confirm the boundary reading, then drop the api-local
  sentinel; or (b) remove one existing export elsewhere in internal/api to
  make room (riskier). The cmd closure already translates the sentinel, so
  option (a) also deletes the double-translation. Expected: check.sh reports
  internal/api ≤ 12 and TestWeb_Integration green.

### F2 — FLAG: the promised vitest suite for the overlay does not exist

Box 3.1's text: "vitest suite `IdentifySeries.test.tsx` stays green
in-session (the probe below is the node-free floor)". No
`web/src/components/manage/IdentifySeries.test.tsx` exists (the directory
holds only IdentifySeries.tsx and ManageActions.tsx; the diff touches only 3
web files). The authored duty (grep floor) holds and vitest passes 233/233,
but the confirm flow, the three states, and the source picker have no
client-side test coverage. A text-vs-artifact discrepancy for the human to
rule on before archive — the duty floor never required the file, so this is
not a box FAIL.

### F3 — P3 doc nit (pre-existing): stale CONTRACT MISMATCH header

internal/itest/qa_shikimori_joint_test.go (~lines 15-33) still carries the
"CONTRACT MISMATCH (expected red until the implementation fix lands)" header;
current reality is fixed (TestShikimoriJoint passes — green in this review's
package runs). Untouched by this change's diff; flagged for a future docs
pass, not attributable here.

### F4 — P3: malformed structure in the web-ui delta

specs/web-ui/spec.md lines 115-127: one scenario-less UNPROBEABLE block inside
the MODIFIED requirement, then two stray `## ADDED Requirements` headers with
orphan WHEN/THEN bullets and bare UNPROBEABLE markers (no `### Requirement:`
heading). `openspec validate --strict` passes (blocks are inert), but it is
authoring residue; worth cleaning before or at archive so the living spec
never sees it.

### F5 — P3: unclosed quote in the ledger's goal line

openspec/changes/identify-match-override/.openspec.yaml line 3: the `goal:`
double-quoted scalar never closes; strict YAML parsers refuse the file
(python3 yaml: PARSE FAIL) while wf's own reader tolerates it (all verbs
green, receipts render). Latent loop-state data defect. Do NOT hand-edit the
ledger (wf is its sole writer) — the session should know before any
re-serialization.

### F6 — P3 judgement calls (no action required)

- internal/enrich/search.go:75-83 `searchSentinel` detects the unsupported
  sentinel across the gRPC seam by error-TEXT equality — fragile coupling to
  the sentinel message; honestly documented, both ends in-repo.
- plugins/shikimori/search.go:76 drops a served `year ≤ 0` ("verbatim where
  the payload carries them") — defensive against garbage; the delta's intent
  (absent ≠ zero) is preserved.
- web/src/components/manage/IdentifySeries.tsx:68 `onBack` is declared and
  forwarded but never invoked (Back buttons walk the step chain internally) —
  dead prop.
- pkg/sdk exported symbols went 10 → 12 (WARN zone; fails >12) — the next sdk
  export trips the same guard. Awareness note only.

## Standards axis summary

Clean apart from F1: no dead code, no god objects, functions well under the
size limits, handlers are pure delegation, closures follow the
newReenrichClosure precedents (including the process-ctx detachment for the
write that outlives the request), comments carry WHY, test fakes embed the
base one-line, and the joint/queue/api tests assert real stored state (no
tautologies). The numeric-anchor adaptation and the onBack prop are the only
quality notes beyond the findings above.

---

## RE-VERDICT — F1 resolved (2026-10-22, commit 58aaabd)

Range now `d9a569e..58aaabd` (7 commits). F1 was fixed in exactly the
recommended shape: the api-local `ErrSearchUnsupported` export is deleted
(internal/api back to exactly the merge-base 12 exported symbols — recount
verified at 58aaabd), `sourceSearch` classifies
`errors.Is(err, sdk.ErrSearchUnsupported)` directly (pkg/sdk import added;
the INV2 comment corrected to cite the design's enrich/plugin-only ban +
the D7 cap), cmd's `newSearchClosure` returns the queue error verbatim
(the double translation is gone; SearchSource's searchSentinel already
re-wraps the gRPC text seam), and the unsupported test case now wraps the
SDK sentinel. Zero web files touched by 58aaabd — the vitest green stands.

Re-runs by the reviewer after 58aaabd:

- Duty 2.3 (the one invalidated box): `go test ./internal/api -run
  "TestSourceSearch|TestSeriesIdentify" -count=1` → rc 0.
- `wf change status identify-match-override` → rc 0 (floor holds).
- Full-suite anchor: `go test ./... -count=1` (no -short) → **rc 0 — every
  package ok**, including `internal/itest` 182.7s (TestWeb_Integration green;
  ac7_gates/make check green at 12 exports) and TestIdentifyMatchJoint.
- `cd web && npx vitest run`: 233/233 rc 0 (unchanged by the fix commit).

Remaining items: F2 (FLAG — the promised IdentifySeries.test.tsx does not
exist; the overlay has no client-side test coverage) and the F3–F6 nits —
none gate-blocking; they ride into the human's archive-approval decision.

## Updated overall verdict

**PASS — archivable.** All 12 duties re-run green, diff faithful to the
deltas, full Go suite rc 0 end to end, vitest 233/233, status rc 0.

Gate line: `Approved`

## Human archive approval

Approved by aldfiar (2026-10-23): archive identify-match-override as-authored.
F2 rides accepted-as-authored — the overlay's missing client-side vitest suite
is recorded above as the known coverage gap; a follow-up change may add it.
F4's malformed residue blocks were removed from the web-ui delta immediately
before this approval (inert authoring residue; validate re-run green).
