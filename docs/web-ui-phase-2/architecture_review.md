# Architecture Review — web-ui Phase 2a

> Self-review of the Phase-2a plan against the source. Issues found: **6** (0 P0,
> 1 P1, 5 P2). The phase is cleanly sub-phased (2a scoped; 2b/2c outlined) — no
> `feature_too_large` flag. Complexity-budget rationale + the Generation
> Self-Audit are at the end.

## Verdict

**PROCEED to plan-review.** The plan is additive (no Go source change), the delivery story is sound (real React build → `internal/web/dist/` → `go:embed`), the Go gate stays node-free, and zero new API endpoints are needed. R1 (the Makefile/README cwd inconsistency) is a real but low-risk doc/build discrepancy the coder resolves in Step 11; it is NOT a P0 (no architectural impact — the npm project root is unambiguously `web/` per the authoritative README, and the embed path is fixed by the Go directive).

## Issues Found

### R1 — Makefile `web-build` cwd inconsistency (P1, dev/build)
- **What:** `Makefile:58-61` comments the Phase-2 npm step as `cd internal/web && npm ci && npm run build`, but `web/README.md:66-81` (the authoritative Phase-2 layout) puts the npm project at `web/` (not `internal/web`). These disagree on where `package.json`/`vite.config.ts` live.
- **Grounding:** `Makefile:56-61` (read); `web/README.md:66-81` (read — `web/` = "Phase 2 React app + dev config" with `src/`, `package.json`, `vite.config.ts`).
- **Resolution (baked into the plan):** npm project root = `web/` (per README); Vite `build.outDir` redirects to `../internal/web/dist` (the only path `//go:embed all:dist`, `internal/web/web.go:20`, can reach — embed paths cannot escape the package). Step 11 corrects the Makefile to `cd web && npm ci && npm run build` and updates `web/README.md` to record the resolved outDir. **Not P0** — no architectural impact; a one-line build-target fix + a docs note. The coder MUST get this right or `make web-build` writes nowhere useful.
- **Risk if unaddressed:** `make web-build` fails or writes to the wrong place; the embed picks up the stale placeholder (AC-5 fails).

### R2 — token-in-localStorage XSS (P2, security — accepted for MVP)
- **What:** the admin token is readable by any JS in the SPA origin (XSS vector).
- **Grounding:** arch §11.5 (admin-token MVP; 127.0.0.1 bind default); `main.go:251` (`MELLIFERA_LISTEN` default).
- **Resolution (baked in):** accepted for a personal server; documented in `conventions.md §4`. 2b's metadata rendering MUST NOT use `dangerouslySetInnerHTML` (render document values as text/structured children). Revisit at D18 (multi-user → httpOnly cookie + session endpoint). **Not P0** — matches the project's stated MVP auth posture.

### R3 — shadcn/ui copy-in breadth (P2, bundle/complexity — fallback ready)
- **What:** shadcn primitives + Radix add several files to `web/src/components/ui/` and npm deps. Bundle stays small (Radix is tree-shakeable; no runtime CSS-in-JS), but the initial copy-in is more files than plain Tailwind primitives.
- **Grounding:** Q1 decision (this plan); shadcn/ui is copy-in (MIT primitives).
- **Resolution (baked in):** only the primitives 2a uses are copied (`button, input, label, card, select, table, badge, alert`). **Fallback:** if Steps 1-2 run >50% over estimate, drop shadcn for plain Tailwind primitives (the DTOs/hooks/pages are unaffected — only the component styling layer swaps). **Not P0.**

### R4 — SPA client-route fallback interaction with `/assets/*` (P2, verified-safe)
- **What:** adding client routes (`/admin`, `/login`) relies on the Phase-1 NotFound fallback (`internal/web/web.go:54-63`). A regression there would 404 the SPA.
- **Grounding:** `web.go:54-63` (NotFound: `/assets/*` → 404 fail-fast; everything else → `serveIndex`). **Already correct** — Phase 1 built this for exactly the Phase-2 client-route case.
- **Resolution:** no Go change; AC-5 verify probe (`curl /admin` → 200) catches any regression. **Not P0.**

### R5 — dist replacement must preserve the embed contract (P2, verified-safe)
- **What:** `mustReadIndex` (`web.go:138-144`) panics if `dist/index.html` is absent. Vite MUST emit `index.html` at the outDir root + hashed assets under `assets/`.
- **Grounding:** `web.go:138-144`; Vite's default build emits exactly `index.html` + `assets/*`. `emptyOutDir: true` (Step 1) regenerates cleanly.
- **Resolution:** Vite's output shape matches the embed contract by default; Step 12 verifies the Go binary boots + serves the new index. **Not P0.**

### R6 — Cyrillic / precision at the SPA boundary (P2, verified-safe for 2a; load-bearing for 2b)
- **What:** Russian titles/overviews + exact ratings must render losslessly. JS string/number handling could in theory mangle them.
- **Grounding:** arch §3.4, §11.1, §11.2; `itemDTO.Document` is `json.RawMessage` (`handlers.go:136`) — opaque to Go, so the SPA gets verbatim JSON.
- **Resolution:** `index.html` carries `<meta charset="utf-8">` (Step 1); the SPA renders JSON via `JSON.parse` (UTF-16 strings, served UTF-8) with no rounding (conventions §2). 2a doesn't render document values yet (browse is 2b), so this is a 2b concern flagged now. **Not P0 for 2a.**

## Complexity-budget rationale (software-design §Complexity Budget)

Is there a meaningfully simpler design that meets every AC and extends an existing pattern? Considered:

- **Simpler: skip shadcn, use plain Tailwind.** Would reduce Step 2 but cost more hand-rolling in Steps 7-10 (forms, tables, badges). shadcn copy-in is the lower-total-complexity choice and matches the confirmed stack. Kept (R3 fallback if it overruns).
- **Simpler: skip react-router, use a single-page tab state.** Rejected — the SPA needs real routes (`/admin`, `/browse`, `/items/:id`) for deep-linking + the Phase-1 NotFound SPA-fallback contract (`web.go:54-63`) to mean anything. react-router was decided in Phase 1.
- **Simpler: skip TanStack Query, use plain fetch + useEffect.** Rejected — cache invalidation (create/scan → refetch libraries) and background refetch (admin/status) are exactly what TanStack Query is for; hand-rolling is more code + more bugs. Decided in Phase 1.
- **Simpler: do all of Phase 2 in one plan (no sub-phasing).** Rejected — it would blow the 15-step + 8-AC gates, force a hollow Step Outline, and risk the Go-gate-node-free story across too much surface. Sub-phasing (2a scoped, 2b/2c outlined) is the complexity-budget discipline the objective explicitly authorized (`enhanced_objective.md:107-113`).

The chosen design is the simplest that meets every 2a AC, extends the Phase-1 foundation (embed slot, same-origin API, role-gated `/api/v1`), and leaves 2b/2c a clean base. **No simpler adequate alternative was rejected.**

## `feature_too_large` gate

**Not triggered.** Phase 2a Step Outline = 12 (under the 15-step gate); acceptance = 7 scenarios (under the 8-scenario gate). The full Phase 2 WAS too large, which is why it's sub-phased — 2a is a legitimately-scoped single plan, and 2b/2c are outlined (not stubbed) for separate plans. `state.json.key_decisions.feature_too_large = false`.

## Grounding audit (G1/G5 — every claimed caller/export/pattern cited)

- Every MODIFY target verified to exist: `internal/web/dist/{index.html,assets/app.js}` (read), `Makefile:56-61` (read), `web/README.md` (read).
- Every consumed Go symbol cited to `file:line`: `web.Handler` (`web.go:45`), `//go:embed all:dist` (`web.go:20`), `authMiddleware` (`middleware.go:32-45`), `requireRole` (`middleware.go:56-75`), the 4 endpoints (`router.go:92,98-100`), the DTOs (`handlers.go:34-139`), `mustReadIndex` (`web.go:138-144`).
- The embed-path claim (the prompt's "web/dist/" vs the real `internal/web/dist/`) was G2-verified against the actual `//go:embed` directive (`web.go:20`) + `.gitignore` — the prompt/enhanced_objective shorthand was corrected, not propagated.
- No `UNVERIFIED:` tokens in any deliverable. No caller/importer inferred.

## Generation Self-Audit

- [x] **Every MODIFY file → ≥1 seam with non-empty `After` + `Contract` + `evidence`:** `internal/web/dist/*` (S1), `Makefile` (S6), `web/README.md` (S7) — all in `integration_map.md`; each has After + Contract + `evidence:` citations.
- [x] **Every seam → one owner task + one joint test:** Coverage Matrix in `integration_map.md` (owners + AC verify probes / Vitest). Specifier fills the owner-task IDs.
- [x] **Every task → precondition + postcondition + allowed_imports + an AC trace:** the Step Outline traces every step to `(AC-N)`; pre/postconditions + allowed_imports for the SPA seams are in `contracts.md` (apiRequest, RequireAuth, query hooks). The specifier attaches these per task file.
- [x] **Every `## Foundational Setup` item → an emitted task or an explicit precondition fold:** each row in `implementation_plan.md §Foundational Setup` has a `why` (consuming step/AC) + `emits` (a step or an explicit `fold→precondition`).
- [x] **No `UNVERIFIED:` token remains** in the final plan (grounding audit above).
- [x] **Complexity budget:** simplest adequate design chosen; rationale recorded (above).
- [x] **`feature_too_large` gate:** not triggered (12 steps, 7 ACs; sub-phased).
- [x] **Go-gate-node-free story:** explicit (source_baseline, conventions §1/§6, implementation_plan §Stack Patterns, AC-6).
- [x] **AC count + risk count stated:** 7 ACs, 6 risks (0 P0).

## Notes for the specifier / plan-review

- **Step 11 (Makefile cwd fix) is load-bearing** — R1. The coder MUST correct `cd internal/web` → `cd web` and set Vite `outDir` to `../internal/web/dist`, or the whole delivery story (AC-5/AC-6) fails. Flag this in the Makefile task.
- **The Phase-1 `internal/web` Go tests** assert headers/fallback/routing, not placeholder bytes (read at planning). If any test hard-codes the placeholder's `assets/app.js`, it will break when the real build lands — the specifier should add a task to verify (and, if needed, relax) those assertions WITHOUT changing Go source under 2a (a test-only adjustment is in-scope; if a Go source change is required, escalate — it's out of 2a scope).
- **2b handoff:** the document-shape TS types + the metadata-rendering component design are fixed in `contracts.md` so 2b starts from a stable contract (not a re-design).
