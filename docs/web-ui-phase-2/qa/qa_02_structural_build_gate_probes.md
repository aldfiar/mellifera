# QA 02 — Structural + build-gate probes (delivery, node-free, additive)

- **Type:** QA (structural / regression)
- **test_file:** `docs/web-ui-phase-2/tests/structural_probes.sh` (the AC-5/AC-6/AC-7 verify probes, runnable) + the `mellifera-build` gate
- **test_type:** regression / structural (verify-probe re-derivation)
- **validates_tasks:** [Task 01, Task 11, Task 12] (the delivery/build-wiring tasks) — and, transitively, AC-7 (no off-contract calls across all SPA tasks)
- **deps:** none (runs after T12 commits the dist)
- **joints_targeted:**
  - `internal/web/dist/* (real Vite build) -> //go:embed all:dist -> web.Handler serves /` (S1)
  - `make web-build (cd web && npm ci && npm run build, outDir ../internal/web/dist) -> internal/web/dist/` (S2, S6)
  - Go build gate (`make build && make check && make lint && make test`) node-free (AC-6)
- **boundaries_targeted:**
  - node-free build path (the gate must not invoke node/npm/swag)
  - the served HTML / asset cache headers / SPA fallback (R-2 public surface unchanged)

## mock_boundaries

- mock: [] (no mocks — these are REAL probes against the built binary + the committed source)
- real: [the Go binary, the committed `internal/web/dist/*`, the committed `web/` source, the Makefile, the git tree]

## coverage_target

The delivery + gate seams (S1, S2, S6): the embedded React build is served correctly, the Go gate is node-free, and the SPA makes no off-contract API calls. Delta: AC-5/AC-6/AC-7 verify probes all green.

## scenarios

### AC-5 — the built React SPA is served from the Go binary (real build, not placeholder)
- **name:** `/` serves the React index (hashed assets), not the placeholder
  - arrange: `make web-build` ran; `MELLIFERA_ADMIN_TOKEN=t go run ./cmd/mellifera` on :8080.
  - act: `curl -sI localhost:8080/` ; `curl -s localhost:8080/`.
  - assert: status 200; `Cache-Control: no-cache`; `Content-Type: text/html; charset=utf-8`; body references `assets/<hash>.{js,css}` (grep ≥1), NOT `/assets/app.js`.
- **name:** `/assets/*` immutable; `/admin` SPA fallback
  - act: `curl -sI localhost:8080/assets/<hash>.js` ; `curl -s -o /dev/null -w '%{http_code}' localhost:8080/admin`.
  - assert: asset `Cache-Control: public, max-age=31536000, immutable`; `/admin` → 200 (NotFound SPA fallback, `internal/web/web.go:54-63`).
- **name:** broken hashed asset 404s fail-fast
  - act: `curl -s -o /dev/null -w '%{http_code}' localhost:8080/assets/does-not-exist.js`.
  - assert: 404 (R4 — stale-hash visibility; the fallback does NOT paper over broken assets).

### AC-6 — the Go build gate stays green WITHOUT node; additive holds
- **name:** gate node-free on a node-less host
  - arrange: a host without `node`/`npm` (or `PATH` scrubbed of node).
  - act: `make build && make check && make lint && make test`.
  - assert: all exit 0; none reference `node`/`npm`/`swag` in their output.
- **name:** api stays at 7 exported symbols; internal/web at 2
  - act: `grep -cE '^[[:space:]]*(func|type|var|const) [A-Z]' internal/api/*.go` (the AC-6 probe).
  - assert: api package exported decls = 7 (INV5); internal/web = 2.
- **name:** Go source byte-identical except dist bytes
  - act: `git diff 47f276e HEAD -- internal/api internal/web/web.go internal/web/swagger.go cmd/mellifera proto/ pkg/sdk internal/scan internal/enrich --stat`.
  - assert: empty (only `internal/web/dist/*` + `web/` + `Makefile` + `web/README.md` changed).
- **name:** web-build is the only node target, not a prereq
  - act: `grep -nE '^(build|check|lint|test):' Makefile` ; `make -n build` does NOT mention node/npm.
  - assert: gate target bodies contain no `node`/`npm`/`swag`/`web-build`; `web-build` is standalone (INV-node-free-gate).

### AC-7 — no new API endpoints; pure-delegation + INV2 preserved
- **name:** SPA calls only the 4 pre-existing endpoints
  - act: `grep -rnE "fetch|api\.v1|useQuery|useMutation" web/src | grep -vE '/(items|libraries|admin/status)'`.
  - assert: empty (no off-contract calls; the items endpoints are Phase-2b, unused in 2a).
- **name:** api imports no plugin/enrich/module/web (INV2)
  - act: `grep -nE '"internal/(plugin|enrich|module|web)"' internal/api/*.go`.
  - assert: empty (INV2 holds).

## behavior_coverage

- B1-B5 (T12, AC-5, dist replace + served build): covered by the three AC-5 scenarios.
- B3-B6 (T11/T12, AC-6, node-free gate + additive): covered by the four AC-6 scenarios.
- B6-B7 (T04/T12, AC-7, only-existing-endpoints + INV2): covered by the two AC-7 scenarios.
- uncovered_behaviors: [] (every structural B-id is a verify probe here).

## acceptance_scenarios

- AC-5: the three AC-5 scenarios (served index + cache headers + SPA fallback + broken-asset 404).
- AC-6: the four AC-6 scenarios (node-free gate + 7-symbol count + byte-identical diff + web-build-not-prereq).
- AC-7: the two AC-7 scenarios (off-contract grep empty + INV2 grep empty).

## input_domain_targeted

- (structural probes — no input domain; the verify probes are deterministic greps/curl checks.)

## verify

```
cmd: bash docs/web-ui-phase-2/tests/structural_probes.sh   # runs the AC-5/AC-6/AC-7 probes
expected: every probe exits 0; the node-free gate (`make build && make check && make lint && make test`) exits 0 on a node-less host; the served HTML references hashed assets (not /assets/app.js); the git diff shows only dist + web/ + Makefile + web/README.md changed.
```
