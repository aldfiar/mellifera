# Proposal

## Why

A six-agent comment-noise audit (2026-11-11, inventory at
`/Users/aldfiar/projects/go/mellifera/.tmp/comment-noise-audit.md` — read-only input)
measured ~7,400–7,900 compressible comment lines across ~189 non-test Go files: the debt
is uniformly LENGTH and DUPLICATION (design/history essays where the go-clean-code law
wants a 1–3-line contract), not missing docs. Four findings are actively MISLEADING (P0):
stale prose contradicting shipped code, a wrong symbol name in a doc, a misplaced doc
mis-attributed by godoc, and an import-invariant claim the package itself violates.
The law (`.claude/skills/go-clean-code/SKILL.md`, main tree — read-only input) exists;
most files predate it.

## What Changes

- Fix the 4 P0 stale/misleading comments (web.go SPA-fallback clause, store/doc.go INV5
  rewrite, viewer.go tutorial block, recs_ordering.go seriesStartedFact doc reattach)
  plus the 3 small stale-doc fixes (manager.go wrong symbol name, pack repro test's
  stale EXPECTED-TO-FAIL provenance, identity/service.go stale later-tasks clause).
- Comment-DRY pinning: one canonical home per duplicated invariant (D7 ledger law,
  D3 suppression, process-ctx detachment, per-plugin invariants, error-floor boilerplate,
  ensure*-mechanics), one-line ID pointers at the replica sites.
- Per-area essay compression trims in the audit's density order: cmd/mellifera,
  internal/api + module, store + stream + identity + pack, enrich + scan + naming,
  doc.go catalog strips (INV registries KEPT), plugins + pkg/sdk + pkg/releasename.
- Delete the two retired whole-file itest stubs and compress the two egregious
  spec-scenario headers.
- Comment-only everywhere: zero behavior change, zero new symbols, `go test ./...`
  green at base 792031a stays green.

Out of scope (deliberate): `web/` (not baselined); the audit's secondary CODE findings
(releasename regex dup, queue dead alias, episode_titles dup — a separate pass); the
23-file itest 19–38-line header idiom (house style, P2); the go-clean-code skill's
stale density anchor (pack.go 30% → 66%) — the skill file is untracked in the main tree
and absent from this worktree, so no task here can touch it (post-merge follow-up).

## Capabilities

Comment-only changes alter no spec-level behavior; per the lite instructions a pure
refactor/docs change opts out of specs. This change declares no capabilities and sets
`skip_specs: true` in `.openspec.yaml`.

### New Capabilities

- none

### Modified Capabilities

- none

## Impact

- ~90 Go files across cmd/mellifera, internal/{api,module,plugin,store,stream,identity,
  pack,enrich,scan,naming,browse,access,web,itest}, plugins/{base-scanner,serial-scanner,
  serial-parser,frame-grabber,tv-parser,shikimori,tmdb,image-enricher}, pkg/{sdk,releasename}.
- No wire, DB, API, or dependency changes; no generated-code or dist changes.
- Verification is structural (gofmt -l, go build/go vet, content greps) — comments are
  not executed; the full suite runs only at the baseline and GATE 2 anchors.
