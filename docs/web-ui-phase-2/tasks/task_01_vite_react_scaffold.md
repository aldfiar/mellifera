# Task 01 — Vite + React 18 + TS scaffold (outDir → internal/web/dist; dev proxy)

- **Type:** coder
- **Outline Step:** 1 (scaffold)
- **Seams:** S2 (vite outDir → `../internal/web/dist`), S3 (dev proxy `/api`,`/openapi.*`,`/docs` → :8080)
- **AC trace:** AC-5, AC-6
- **Project scope:** `mellifera` (npm project root = `mellifera/web/`)
- **Deps:** none (foundational — every later SPA task imports from `web/`)
- **Estimated LOC:** ~130 (configs + entry stubs)

## Context

- **feature_goal:** Build the visible React SPA, served from the Go binary via the Phase-1 `internal/web` `go:embed` slot — Phase 2a delivers scaffold + auth + admin library-management (acceptance.md ## Source).
- **why:** This task creates the npm project root (`web/`) and the Vite/TS plumbing. If `outDir` or the dev proxy is wrong, the embed picks up the stale placeholder (AC-5 fails) or the SPA cannot reach the Go API in dev (every later task blocked).
- **data_flow:** enters from: operator `npm install` / `npm run dev` → transforms: TS+JSX via Vite → emits to: `internal/web/dist/` (the `//go:embed all:dist` target, `internal/web/web.go:20`) consumed by T12 (dist replace) + the Go binary.
- **rationale:** npm project root = `web/` (the authoritative Phase-2 layout, `web/README.md:66-81`), NOT `internal/web`. Vite `build.outDir` redirects to `../internal/web/dist` because `//go:embed` paths cannot escape the `internal/web` package (`internal/web/web.go:20`). This resolves R1's embed-target side (the Makefile cwd side is T11). architecture_review R1/R5.

## behaviors

- B1: `web/package.json` declares runtime deps (react 18, react-dom, react-router-dom, @tanstack/react-query, Radix shadcn primitives, class-variance-authority, tailwind-merge, clsx) + dev deps (vite, @vitejs/plugin-react, typescript, @types/react, @types/react-dom, tailwindcss, postcss, autoprefixer, vitest, @testing-library/react, jsdom, eslint) with `"type": "module"` and scripts `dev`/`build`/`test`/`lint`. | ac: AC-5 | kind: normal
- B2: `web/vite.config.ts` sets `build.outDir: "../internal/web/dist"` and `build.emptyOutDir: true` so the Vite build writes into the committed embed target (`internal/web/web.go:20`), NOT `/web/dist/` (gitignored, `.gitignore:27`). | ac: AC-5 | kind: normal
- B3: `web/vite.config.ts` sets `server.port: 5173` and `server.proxy` forwarding `/api`, `/openapi.yaml`, `/openapi.json`, `/docs` → `http://127.0.0.1:8080` (same-origin SPA↔API; no CORS). | ac: AC-5 | kind: normal
- B4: `web/vite.config.ts` registers `@vitejs/plugin-react` and resolves the `@/*` → `src/*` alias (matches `tsconfig.json` paths). | ac: AC-5 | kind: normal
- B5: `web/index.html` is the Vite entry with `<meta charset="utf-8">` (Cyrillic-safe per arch §11.1), `<div id="root">`, and a module script `src/main.tsx`. | ac: AC-5 | kind: normal
- B6: `web/tsconfig.json` (+ `tsconfig.node.json`) enable strict TS, `jsx: "react-jsx"`, `paths: { "@/*": ["src/*"] }`, `include: ["src"]`. | ac: AC-6 | kind: normal
- B7: `web/postcss.config.js` wires tailwindcss + autoprefixer (the Tailwind plugin is wired in T02). | ac: AC-6 | kind: normal
- B8: every `web/src/*` file carries the `// SPDX-License-Identifier: Apache-2.0` header (conventions §5; the SPA is Apache-2.0). | ac: AC-6 | kind: normal
- B9: `npm ci && npm run build` produces `internal/web/dist/index.html` (Vite's default emit) — a missing `index.html` would panic `mustReadIndex` (`internal/web/web.go:138-144`); Vite emits it by default. | ac: AC-5 | kind: edge

## invariants

- **INV-outDir-embed-target:** Vite `build.outDir` MUST be `../internal/web/dist` (resolved from `web/`). NEVER `web/dist/` or `dist/`. Embed paths cannot escape `internal/web` (`internal/web/web.go:20`); `/web/dist/` is gitignored (`.gitignore:27`) and unused.
- **INV-no-runtime-CDN:** all JS/CSS is bundled into hashed assets at build time. `index.html` references only local `/assets/*` paths — no `https://` script/style fetches.
- **INV-node-dev-only:** nothing in this task enters `go.mod`/`go.sum` or the Go build path. The deps are npm (dev/build-only); the Go binary serves only the built, hashed assets.

## precondition

The `web/` directory holds only `README.md` (the Phase-1 dev-workflow contract). No `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, or `src/` exists yet. node v24 + npm 11 are present (dev-only; `state.json.key_decisions.dev_toolchain`).
- evidence: `web/` contains only `README.md` (G2-verified: `ls web/`); `web/README.md:66-81` documents the planned Phase-2 layout; `internal/web/web.go:20` (`//go:embed all:dist`); `.gitignore:26-27` (`node_modules/`, `/web/dist/`).

## postcondition

(AC-5/AC-6) `web/` is a type-checking, dev-server-capable npm project: `cd web && npm install && npx tsc --noEmit` exits 0; `npm run build` emits `internal/web/dist/{index.html,assets/*}` with Vite-hashed asset names. The embed target contract (`mustReadIndex` requires `dist/index.html`) is satisfied by Vite's default output shape.

## test_seed

```
# arrange: web/ has no package.json (precondition); internal/web/web.go:20 embeds all:dist.
# act:     cd web && npm install && npx tsc --noEmit && npm run build
# assert:  internal/web/dist/index.html EXISTS (mustReadIndex contract, web.go:138-144);
#          grep -cE 'assets/[^"]+\.(js|css)' internal/web/dist/index.html >= 1 (Vite hashed asset ref);
#          ls internal/web/dist/assets/*.js shows a hashed filename (NOT the placeholder app.js).
```

## spec

```
Signatures (files to CREATE):
  web/package.json            # manifest (deps, scripts: dev/build/test/lint, "type":"module")
  web/vite.config.ts          # defineConfig({ plugins:[react()], resolve:{alias:{'@':./src}}, build:{outDir:'../internal/web/dist', emptyOutDir:true}, server:{port:5173, proxy:{...}} })
  web/tsconfig.json           # compilerOptions: strict, jsx:'react-jsx', paths {'@/*':['src/*']}, include ['src']
  web/tsconfig.node.json      # for vite.config.ts (node context)
  web/postcss.config.js       # plugins: tailwindcss, autoprefixer
  web/index.html              # <html lang="en"> <meta charset="utf-8"> <div id="root"> <script type="module" src="/src/main.tsx">
  web/src/main.tsx            # PLACEHOLDER stub (T05 mounts providers) — `export {}` or a bare createRoot placeholder; must type-check
  web/eslint.config.js        # flat ESLint config (TS + react-hooks) — dev-only

vite.config.ts server.proxy entries (verbatim paths from web/README.md:39-43):
  '/api'           → 'http://127.0.0.1:8080'   (internal/web/web.go:49 mounts /api/*)
  '/openapi.yaml'  → :8080                     (internal/web/swagger.go)
  '/openapi.json'  → :8080
  '/docs'          → :8080                     (Swagger UI)

Steps:
  1. CREATE web/package.json with the dep list (runtime + dev) + scripts. Pin react/react-dom to ^18.
  2. CREATE web/vite.config.ts: import {defineConfig} from 'vite'; import react from '@vitejs/plugin-react'; import path from 'node:path'; set build.outDir='../internal/web/dist', emptyOutDir:true, server.port=5173, server.proxy (4 entries above), resolve.alias '@'→path.resolve(__dirname,'./src').
  3. CREATE web/tsconfig.json (strict, jsx react-jsx, paths) + web/tsconfig.node.json.
  4. CREATE web/postcss.config.js (tailwindcss + autoprefixer plugins).
  5. CREATE web/index.html: <meta charset="utf-8">, viewport, <title>Mellifera</title>, <div id="root"></div>, <script type="module" src="/src/main.tsx">.
  6. CREATE web/src/main.tsx as a minimal stub that type-checks (T05 replaces it with the provider tree). Add the Apache-2.0 header.
  7. CREATE web/eslint.config.js (flat config; TS + react-hooks rules).
  8. Run `cd web && npm install` (writes gitignored web/node_modules/).
  9. Run `cd web && npx tsc --noEmit` (must exit 0 — type-check).
  10. Run `cd web && npm run build`; confirm internal/web/dist/index.html exists + references hashed assets (NOT /assets/app.js).
```

## error_handling

- **`npm run build` does not emit `internal/web/dist/index.html`:** Vite emits it by default; if missing, the Go `mustReadIndex` (`internal/web/web.go:138-144`) panics at init. Verify after build (test_seed assert). Do NOT proceed to T12 if absent.

## allowed_imports

- `vite`  # build tool (defineConfig)
- `@vitejs/plugin-react`  # React plugin
- `node:path`  # alias resolution (stdlib-equivalent for the node config)
- `typescript`  # type-check (dev)
- (the runtime deps — react, react-dom, react-router-dom, @tanstack/react-query, Radix, cva, tailwind-merge, clsx — are declared in package.json but NOT imported by this task's config files; they are imported by T02-T10.)

## allowed_categories

- npm-dev (the dev/build deps above)

## callers_to_update

- (none — `web/` is brand-new; no existing file imports it. T11 updates `Makefile`/`web/README.md` to reference this npm project; T12 regenerates `internal/web/dist/*` via it.)

## negative_examples

- "DO NOT set Vite `outDir` to `web/dist/` or `dist/` — the embed target is `internal/web/dist/` (INV-outDir-embed-target; `.gitignore:27` ignores `/web/dist/`)."
- "DO NOT add `node`/`npm`/`vite` to `go.mod` or any Go import — node is dev-only (INV-node-dev-only)."
- "DO NOT reference a runtime CDN in `index.html` — bundle everything (INV-no-runtime-CDN)."
- "DO NOT omit `<meta charset="utf-8">` — Cyrillic titles must render losslessly (arch §11.1; R6)."
- "DO NOT change any Go file — ADDITIVE (conventions §1)."

## existing_code_snapshot

```
(CREATE — web/ holds only README.md)
web/
  README.md   # web/README.md:1-81 (the Phase-1 dev-workflow contract; MODIFY in T11)

internal/web/web.go:20   # //go:embed all:dist  (the embed target — unchanged)
internal/web/dist/       # 338-byte placeholder index.html + assets/app.js (REGENERATED in T12)
.gitignore:26-27          # node_modules/  +  /web/dist/   (internal/web/dist/ is COMMITTED)
```

## source_anchor

CREATE target: `web/` holds only `README.md` (G2: `ls web/`). Consumed embed directive: `internal/web/web.go:20` (`//go:embed all:dist`). Dev-proxy paths: `web/README.md:39-43`. `mustReadIndex` contract: `internal/web/web.go:138-144`. `.gitignore:26-27`.

## contract_test_scope

- **joint (S2):** `web/vite.config.ts build.outDir -> internal/web/dist (//go:embed target)` | assert: `npm run build` produces `internal/web/dist/index.html` + hashed `assets/*`; index references hashed assets, not `/assets/app.js`. (Run in T12; the AC-5 verify probe covers it.)
- **joint (S3):** `web/vite.config.ts server.proxy -> Go :8080 /api,/openapi.*,/docs` | assert: dev proxy config present (4 entries). (Dev-only manual verification — QA1.)

## test_exclusions

- `web/postcss.config.js` — framework config (no logic).
- `web/eslint.config.js` — dev lint config (no logic).
- `web/tsconfig*.json` — compiler config (no logic).

## scope_boundary

"CREATE only: `web/{package.json, vite.config.ts, tsconfig.json, tsconfig.node.json, postcss.config.js, index.html, eslint.config.js, src/main.tsx (stub)}`. No other files."

## out_of_scope

- `internal/web/web.go` (Go — UNCHANGED; conventions §1)
- `internal/web/dist/*` (T12 regenerates via `make web-build`)
- `Makefile`, `web/README.md` (T11)
- `web/tailwind.config.ts` + `web/src/styles/index.css` + `web/src/components/ui/*` (T02)
- the React app source (`App.tsx`, `lib/*`, `pages/*`) — T03 onward

## line_budget

130 (flex 1.2 — config verbosity)

## acceptance_criteria

- scenario: AC-5 | given: `make web-build` produces a real React build in `internal/web/dist/` | when: `GET /` | then: 200 `text/html` referencing hashed assets (not the 338-byte placeholder). This task owns the `outDir` that makes the build land there.
- scenario: AC-6 | given: Phase-2a source committed | when: `make build && make check` on a node-less host | then: exit 0. This task's npm deps are dev-only (never in `go.mod`).

## refactoring_checklist

- `grep -nE "outDir" web/vite.config.ts` → `../internal/web/dist`.
- `grep -nE "/api|/openapi|/docs" web/vite.config.ts` → 4 proxy entries.
- `test -f internal/web/dist/index.html` after `cd web && npm run build` → exists.
- `grep -cE 'assets/[^"]+\.(js|css)' internal/web/dist/index.html` → ≥1 (hashed; not `assets/app.js`).
- `grep -rnE '"internal/web"|//go:embed' internal/` → unchanged (no Go edit).

## skill_hint

`grounding`, `mellifera-build`
