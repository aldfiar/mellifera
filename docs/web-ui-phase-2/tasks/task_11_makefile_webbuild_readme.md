# Task 11 — Makefile `web-build` cwd fix (R1) + `web/README.md` Phase-2a status

- **Type:** coder
- **Outline Step:** 11 (Build wiring)
- **Seams:** S6 (Makefile `web-build` — MODIFY), S7 (`web/README.md` — MODIFY)
- **AC trace:** AC-5, AC-6
- **Project scope:** `mellifera` (repo root: `Makefile`; `web/README.md`)
- **Deps:** T01 (so `web/package.json` + `vite.config.ts` exist — the Makefile cwd + outDir must match them)
- **Estimated LOC:** ~40 (Makefile edit + README sections)
- **Risk:** **R1 (P1) — load-bearing.** The Makefile `web-build` cwd must be corrected `cd internal/web` → `cd web`, or `make web-build` writes nowhere useful and AC-5/AC-6 fail (architecture_review R1).

## Context

- **why:** The Phase-1 Makefile left the npm step COMMENTED with the WRONG cwd (`cd internal/web`), but `web/README.md:66-81` puts the npm project at `web/`. This task corrects the Makefile to `cd web && npm ci && npm run build` (Vite outDir → `internal/web/dist/`, set in T01) and updates `web/README.md` to record Phase-2a landed + the resolved outDir + the corrected cwd. Without this, the delivery story (a regeneratable committed dist) is broken.
- **data_flow:** enters from: operator/CI `make web-build` → transforms: `cd web && npm ci && npm run build` (Vite emits to `../internal/web/dist/`) → emits to: `internal/web/dist/*` (committed; the `//go:embed` input T12 embeds).
- **rationale:** `web-build` is the ONLY node-touching target and is NOT a prerequisite of `build`/`check`/`lint`/`test` (INV-node-free-gate; conventions §1/§6). It mirrors `proto` (buf) and `build-plugin` — dev/CI regen, not a Go-gate dep. The corrected cwd + outDir resolution is the R1 fix (architecture_review R1).

## behaviors

- B1: the Makefile `web-build` target UNCOMMMENTS + CORRECTS the npm step to `cd web && npm ci && npm run build` (was `cd internal/web`, commented). | ac: AC-5 | kind: normal
- B2: `web-build` retains the `swag init -g internal/api/doc.go -o internal/web/api -ot json,yaml` step (regenerates the OpenAPI spec — unchanged from Phase 1). | ac: AC-6 | kind: normal
- B3: `web-build` is listed in `.PHONY` and is NOT a prerequisite of `build`, `check`, `lint`, or `test` — those four stay node-free. | ac: AC-6 | kind: normal
- B4: the Makefile comment block documents the resolved outDir (`internal/web/dist/` — embed target) + the corrected cwd (`web/` — npm project root) + the node-dev-only story. | ac: AC-6 | kind: normal
- B5: `web/README.md` Phase-1 status block (lines 8-12) is updated to "Phase 2a landed: real React build in `internal/web/dist/`" (no longer "only the placeholder exists"). | ac: AC-5 | kind: normal
- B6: `web/README.md` Building section (lines 48-62) records the corrected `make web-build` step (`cd web && npm ci && npm run build`) + the resolved outDir (`internal/web/dist/`, NOT `/web/dist/`). | ac: AC-5 | kind: normal

## invariants

- **INV-node-free-gate (AC-6):** `make build`/`check`/`lint`/`test` NEVER invoke `node`/`npm`/`swag`. `web-build` is the ONLY node-touching target and is NOT transitive to any gate target.
- **INV-web-build-cwd:** `web-build`'s npm step runs `cd web && npm ci && npm run build`. NEVER `cd internal/web` (the npm project root is `web/` — `web/README.md:66-81`; architecture_review R1).
- **INV-dist-committed:** `web-build` OUTPUTS to `internal/web/dist/` which is COMMITTED (NOT gitignored; `.gitignore:26-27` ignores `node_modules/` + `/web/dist/` — NOT `internal/web/dist/`). The committed output is what the Go gate embeds.

## precondition

The Makefile has a `web-build` target (`Makefile:56-61`) running `swag init` with the npm step COMMENTED as `# cd internal/web && npm ci && npm run build` (WRONG cwd). `web/README.md` exists with the Phase-1 status block (`:8-12`), Building section (`:48-62`), and Layout (`:66-81`). T01 created `web/package.json` + `web/vite.config.ts` (outDir → `../internal/web/dist`).
- evidence: `Makefile:56-61` (verified read — the commented `cd internal/web` line is `:61`); `web/README.md:8-12,48-62,66-81` (verified read); `.gitignore:26-27`; `internal/web/web.go:20` (embed target).

## postcondition

(AC-5/AC-6) `make web-build` runs `swag init` + `cd web && npm ci && npm run build` → emits `internal/web/dist/{index.html,assets/*}`. `make build && make check && make test` stay node-free (exit 0 without node). `web/README.md` documents Phase-2a landed + the corrected cwd/outDir.

## test_seed

```
# arrange: Makefile:56-61 has the commented wrong-cwd npm step; web/README.md has Phase-1 status.
# act:     (apply the Makefile + README edits)
# assert:  grep -nE 'cd web && npm ci && npm run build' Makefile → 1 hit (uncommented).
#          grep -n 'cd internal/web && npm' Makefile → 0 hits (wrong cwd removed).
#          make -n web-build → prints 'cd web && npm ci && npm run build'.
#          grep -nE 'web-build' Makefile | grep -E '^(build|check|lint|test):' → 0 (not a prereq).
# (node-free gate — run in T12 on a node-less host): make build && make check && make test → exit 0.
```

## spec

```
Signatures (MODIFY):
  Makefile           # web-build target (:56-61): uncomment + correct the npm step cwd
  web/README.md      # status (:8-12) + Building (:48-62) sections

Steps:
  1. EDIT Makefile web-build target (lines ~56-61):
     web-build:
         swag init -g internal/api/doc.go -o internal/web/api -ot json,yaml
         cd web && npm ci && npm run build
     (Replace the commented `# cd internal/web && npm ci && npm run build` line with the corrected, UNCOMMENTED `cd web && npm ci && npm run build`.)
  2. EDIT/EXTEND the Makefile comment block above web-build to record: npm project root = web/; Vite outDir = internal/web/dist/ (the //go:embed target); node/npm dev-only (like protoc); web-build NOT a prereq of build/check/lint/test.
  3. Confirm `.PHONY` already lists web-build (Makefile:5 — it does: `proto build test lint check build-plugin web-build`). If not, add it.
  4. EDIT web/README.md:
     - status block (:8-12): change "Phase 1 status: only the placeholder … exists today" → "Phase 2a status: the real React build lives in internal/web/dist/ (built via make web-build); the Phase-1 placeholder is replaced."
     - Building section (:48-62): record `make web-build` = `cd web && npm ci && npm run build` (corrected cwd), outDir = internal/web/dist/ (NOT /web/dist/), internal/web/dist/ COMMITTED, /web/dist/ + node_modules/ gitignored.
  5. Do NOT touch build/check/lint/test targets (INV-node-free-gate).
```

## error_handling

- **`make web-build` fails (npm install/build error):** HALT — the coder does NOT proceed to T12 (dist replace). Report the npm error. (The Go gate stays node-free; a web-build failure is a dev/CI concern, not a Go-gate failure.)
- **`make build && make check` non-green after the edit:** the Makefile edit accidentally made web-build a prereq — HALT, undo, re-verify INV-node-free-gate.

## allowed_imports

- (no Go imports — Makefile + Markdown only)

## allowed_categories

- (none — no Go/TS code)

## callers_to_update

- `Makefile` | symbol: `web-build` target | change: uncomment + correct the npm step cwd (`cd internal/web` → `cd web`).
- `web/README.md` | symbol: (status block + Building section) | change: Phase-2a landed + corrected cwd/outDir.
- (no source file imports the Makefile; CI config, if any, is out of scope.)

## negative_examples

- "DO NOT keep `cd internal/web` — the npm project root is `web/` (INV-web-build-cwd; R1)."
- "DO NOT add `web-build` as a prerequisite of `build`/`check`/`lint`/`test` (INV-node-free-gate — AC-6)."
- "DO NOT gitignore `internal/web/dist/` (INV-dist-committed — it's the embed INPUT; `.gitignore:26-27` already ignores `/web/dist/` + `node_modules/`)."
- "DO NOT change `build`/`check`/`lint`/`test` bodies — they stay node-free."
- "DO NOT edit Go source — only Makefile + web/README.md (conventions §1 ADDITIVE)."

## existing_code_snapshot

```makefile
# Makefile:5 (already lists web-build in .PHONY — Phase 1 added it)
.PHONY: proto build test lint check build-plugin web-build

# Makefile:56-61 (the target to EDIT — npm step COMMENTED + WRONG cwd)
web-build:
	swag init -g internal/api/doc.go -o internal/web/api -ot json,yaml
	# Phase 2: build the Vite SPA into internal/web/dist/ (committed; the Go
	# gate embeds it). Uncomment when the React app lands. node/npm are dev-only
	# here, like protoc — never required by `make build`/`make check`.
	# cd internal/web && npm ci && npm run build
```
```markdown
<!-- web/README.md:8-12 (status block to UPDATE) -->
> **Phase 1 status:** only the placeholder `internal/web/dist/` exists today
> (a hand-written `index.html` + `assets/app.js` shell). The real React app,
> `web/src/`, `package.json`, and `vite.config.ts` land in **Phase 2**. This
> README records the dev-workflow contract now so Phase 2 wires against a fixed
> target.

<!-- web/README.md:48-62 (Building section to UPDATE — record corrected cwd + outDir) -->
## Building the SPA (`make web-build`)
... (Phase 2 wires the npm run build step; today it documents the contract) ...
```

## source_anchor

MODIFY `Makefile:56-61` (verified read — `web-build` target; the commented `# cd internal/web && npm ci && npm run build` is at `:61`). MODIFY `web/README.md:8-12,48-62` (verified read). `.PHONY` at `Makefile:5` already includes `web-build`. `.gitignore:26-27` (`node_modules/`, `/web/dist/`).

## contract_test_scope

- **joint (S6):** `Makefile web-build -> cd web && npm ci && npm run build (outDir internal/web/dist/); build/check node-free` | assert: `make -n web-build` prints the corrected cwd; `build`/`check`/`lint`/`test` bodies do NOT reference `node`/`npm`/`swag`/`web-build`. (Coder `make -n` + grep; QA2 runs the AC-6 node-free probe.)
- **joint (S7):** `web/README.md -> records Phase-2a landed + corrected cwd/outDir` | assert: docs review (the README states the real build lives in `internal/web/dist/`; `/web/dist/` is unused). (DOCS2 docs review.)

## test_exclusions

- (no code — Makefile target + Markdown docs; verified by `make -n` + grep + docs review.)

## scope_boundary

"MODIFY only: `Makefile` (web-build target + comment block), `web/README.md` (status + Building sections). No other files."

## out_of_scope

- `internal/web/dist/*` (T12 regenerates via `make web-build`)
- `internal/web/web.go`, `internal/api/*` (Go — UNCHANGED; AC-6 byte-identical)
- `web/package.json`, `web/vite.config.ts` (T01)
- CI configuration (separate concern; the comment block documents the separate-node-job story)

## line_budget

40 (flex 1.3 — comment/docs verbosity)

## acceptance_criteria

- scenario: AC-5 | given: `make web-build` corrected | when: run | then: emits a real React build into `internal/web/dist/` (this task owns the cwd fix that makes it land there).
- scenario: AC-6 | given: the corrected Makefile | when: `make build && make check && make test` on a node-less host | then: exit 0 (web-build is NOT a prereq).

## refactoring_checklist

- `grep -nE 'cd web && npm ci && npm run build' Makefile` → 1 hit (uncommented).
- `grep -n 'cd internal/web && npm' Makefile` → 0 hits (wrong cwd removed — R1 closed).
- `make -n web-build` → prints `cd web && npm ci && npm run build`.
- `grep -nE '^(build|check|lint|test):' Makefile` → bodies do NOT contain `node`/`npm`/`swag`/`web-build`.
- `grep -n 'web-build' Makefile | grep -E '^(build|check|lint|test):'` → empty (not a prereq; INV-node-free-gate).
- `grep -n 'Phase 2a' web/README.md` → status updated.
- (T12) `make build && make check && make test` on a node-less host → exit 0.

## skill_hint

`grounding`, `mellifera-build`
