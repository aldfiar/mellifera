# Task 14 — Makefile: add `web-build` target (dev-only; NOT in `build`/`check`)

- **Type:** coder
- **Step:** 12 (Outline)
- **Seams:** S-makefile
- **AC trace:** AC-7
- **Project scope:** `.` (root; MODIFY `Makefile`)
- **Deps:** none (documentation/target; references the `swag init` invocation Task 10 used + the Phase-2 `npm run build` placeholder)
- **Estimated LOC:** ~15 (comments + target)

## behaviors

- **B1** A new `web-build` target runs `swag init -g cmd/mellifera/main.go -o internal/web/api` (regenerates the OpenAPI spec from the Task-09 annotations) + a commented-out Phase-2 `npm ci && npm run build` placeholder (emitting `internal/web/dist/`). | ac: AC-7 | kind: normal
- **B2** `web-build` is listed in `.PHONY` and is NOT a prerequisite of `build`, `check`, `lint`, or `test` — those four targets remain node-free. | ac: AC-7 | kind: normal
- **B3** A comment block documents the build-gate story: `node`/`npm`/`swag` are dev/CI tools (like `protoc`); the Go gate embeds committed `internal/web/dist/*` + `internal/web/api/openapi.*` + `internal/web/swagger-ui/*`; `web-build` is the regen path for developers / the separate CI-web job. | ac: AC-7 | kind: normal

## invariants

- **INV-node-free-gate:** `make build` / `make check` / `make lint` / `make test` NEVER invoke `node`, `npm`, or `swag`. They embed committed artifacts (AC-7 verify probe). `web-build` is the ONLY target that touches the JS/swag toolchain.
- **INV-web-build-not-transitive:** no other target depends on `web-build`. Adding `web-build` to `build`'s prerequisites would break AC-7 — DO NOT.
- **INV-dist-committed:** `web-build`'s `npm run build` (Phase 2) OUTPUTS to `internal/web/dist/` which is COMMITTED (not gitignored). The regen is a developer pre-commit / separate-CI-job step; the committed output is what the Go gate embeds.

## precondition

`Makefile` exists with `.PHONY: proto build test lint check build-plugin` (`:5`), `build` (`:14`), `check` (`:26`), `build-plugin` (`:38`). No `web-build` target exists (source_baseline §Build gate). Task 10 already ran `swag init` once to produce the committed spec; this target wraps that invocation for regen.
- evidence: `Makefile:5,14,26,38-41`; `docs/web-ui/implementation_plan.md §Build-gate story`; `docs/web-ui/source_baseline.md §Build gate`.

## postcondition

`Makefile` has a `web-build` target (phony) running `swag init` + a commented `npm` placeholder; `build`/`check`/`lint`/`test` unchanged + still node-free. `make build && make check` green on a node-less host (AC-7 verify probe).

## test_seed

No unit test (Makefile target). Verification: (a) `make web-build` exits 0 on a host with `swag` installed (regenerates the spec); (b) `make build && make check` exits 0 on a host WITHOUT `node`/`npm`/`swag` (AC-7 verify probe — Task 15 runs this). This task's own `verify` is `make build && make check` green + `grep web-build Makefile` shows the target AND that it is NOT a prerequisite of `build`/`check`.

## callers_to_update

- (none — the Makefile is self-contained; no source file references it. CI configuration, if any, is out of scope.)

## allowed_imports

- (no Go imports — Makefile only)

## allowed_categories

- (none — no Go code)

## test_exclusions

- (no Go code.)

## negative_examples

- DO NOT add `web-build` as a prerequisite of `build`, `check`, `lint`, or `test` (INV-node-free-gate — AC-7).
- DO NOT make `web-build` invoke `node`/`npm` UNCOMMENTED in Phase 1 (the React build is Phase 2; uncomment then).
- DO NOT gitignore `internal/web/dist/` or `internal/web/api/openapi.*` (INV-dist-committed — they are build inputs the Go gate embeds).
- DO NOT change `build` (`CGO_ENABLED=0 go build ./...`) or `check` (the check.sh invocation).

## existing_code_snapshot

```makefile
# Makefile:5
.PHONY: proto build test lint check build-plugin

# Makefile:13-15 (build — UNCHANGED; node-free)
build:
	CGO_ENABLED=0 go build ./...

# Makefile:25-27 (check — UNCHANGED; node-free)
check:
	bash .claude/skills/mellifera-build/scripts/check.sh

# Makefile:38-41 (build-plugin — sibling dev-tool target; web-build mirrors this pattern)
build-plugin:
	CGO_ENABLED=0 go build -o bin/base-scanner ./plugins/base-scanner
	CGO_ENABLED=0 go build -o bin/tv-parser ./plugins/tv-parser
	CGO_ENABLED=0 go build -o bin/image-enricher ./plugins/image-enricher
```

## contract_test_scope

- **joint (S-makefile):** `Makefile web-build -> swag init (regen) + npm placeholder; build/check node-free` | assert: `web-build` exists; `build`/`check` do NOT reference `web-build`/`node`/`npm`/`swag`. Covered by the AC-7 verify probe in Task 15 (`make build && make check` on a node-less host).

## scope_boundary

- MODIFY `Makefile` (add `web-build` to `.PHONY`; add the `web-build` target + the build-gate comment block).

## out_of_scope

- CI configuration (separate concern; the comment block documents the separate-node-job story).
- The React `npm` build (Phase 2 — the `npm` line is commented).
- The `swag init` invocation itself (Task 10 ran it once; this target wraps it for regen).

## line_budget

15 (flex 1.3 — comment verbosity)

## acceptance_criteria

- AC-7 (Go build gate stays green WITHOUT node; `web-build` documented + dev-only)

## refactoring_checklist

- `grep -n 'web-build:' Makefile` → 1 hit.
- `grep -n 'web-build' Makefile | grep -E 'build:|check:|lint:|test:'` → 0 hits (NOT a prerequisite of the gate targets).
- `grep -nE '^build:|^check:' Makefile` → the bodies do NOT contain `node`/`npm`/`swag`/`web-build`.
- `cd mellifera && make build && make check` green (AC-7 verify probe — no node in path).
- `make -n web-build` prints the `swag init` line (target well-formed).

## source_anchor

MODIFY `Makefile:5` (`.PHONY` + `web-build`) + append the `web-build` target after `build-plugin` (`:41`). Contract: `integration_map.md S-makefile` + `implementation_plan.md §Build-gate story`.

## skill_hint

`mellifera-build`, `grounding`
