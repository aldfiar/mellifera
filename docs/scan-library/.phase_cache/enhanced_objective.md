# Enhanced Objective — scan-library

source: /build (explicit) → recommended pipeline: feature (mismatch: no)

## Intent — the real goal in 1-2 sentences
Ship the foundational vertical slice of Mellifera that proves the modular + plugin-based architecture end-to-end: a user creates a TV library, triggers a scan, the base-scanner go-plugin subprocess walks the tree + runs ffprobe + parses TV filenames, and the core persists items as dynamic-JSON documents that can be listed via the API. This slice is the backbone every later feature (enrichment, streaming, transcoding) plugs into.

## Requirements — explicit, bulleted
**Functional (in scope — build these):**
1. Proto extraction → `proto/mellifera/{common,scanner,metadata,plugin}/v1/*.proto` verbatim from architecture.md §2; Go bindings via buf/protoc. All four packages generated for contract completeness; only scanner (+common) is exercised this feature.
2. `go.mod` at `mellifera/go.mod`, module `github.com/mellifera/mellifera`, Go 1.22+.
3. `pkg/sdk` — thin SDK (D15/Q2): `Serve(...)` entrypoint + scanner base type satisfying go-plugin's `GRPCPlugin`.
4. `internal/store` — SQLite (prefer pure-Go `modernc.org/sqlite` to avoid CGO + fit single-binary), schema per §9.1 (`libraries`, `modules`, `items` with dynamic-JSON document column; `playback_progress` reserved). API: `Open`, `GetItem`, `PutItem`, `QueryItems` (≤8 symbols). Parameterized queries only.
5. `internal/plugin` — go-plugin manager: load base-scanner binary from a configured filesystem path (dev mode); launch subprocess; gRPC client; `Call(Scan/Identify)`; minimal health/restart per §7.3.
6. `internal/module` — registry: load TV module config (§2.4 example); `Get`/`List`.
7. `plugins/base-scanner` — separate binary using `pkg/sdk`: walk library root, ffprobe via `exec.Command` arg slice (NEVER shell), parse TV filenames (`SxxExx` + show title; strip resolution/group tags), emit `DiscoveredFile`/`IdentifiedItem`. Path-traversal guard on every discovered path.
8. `internal/api` — chi router; admin-token middleware (Principal=admin, per Q15/D18 grounding); pure-delegation handlers: `POST /api/v1/libraries`, `POST /api/v1/libraries/{id}/scan`, `GET /api/v1/items?library={id}`. Zero logic in handlers.
9. `cmd/mellifera` — flat `main.go` constructor wiring (no DI framework, no reflect — `.golangci.yml` denies both).
10. Tests — table-driven test per exported symbol; + one integration test scanning a small fixture directory into a temp SQLite DB and asserting items persisted.

**Non-functional (hard rules from skill + architecture):**
- Each package ≤ 8 exported symbols (12 hard fail); contract-first `doc.go` per package.
- Pure core, thin shell — logic is pure functions; I/O only at store/plugin/stream/api edges.
- `api/` is pure delegation — parse → one domain call → write. No branching/logic.
- No DI framework, no `reflect`. Flat `main.go`.
- Data-type boundaries (structs), not interfaces; interfaces only at plugin seam with ≥2 impls.
- Every exported symbol has a table-driven test.
- `mellifera/.claude/skills/mellifera-build/scripts/check.sh` MUST pass; `golangci-lint` clean; `gofmt` clean; `go build ./...` + `go test ./...` green.
- Apache-2.0 license headers (D12).

**Security (apply `golang-security` skill in coder):**
- SQL injection → parameterized queries only.
- Command injection → ffprobe via arg slice, never `sh -c`.
- Path traversal → scanner resolves + verifies every path within configured library root.
- Input validation at API edge.

**Deferred (do NOT build):** enrichment/Mode A&B/metadata plugins (TMDB, Kinopoisk), streaming/playback, transcoding, janitor cron, plugin-repo UI, multi-user auth beyond admin token, image proxy/cache.

## Acceptance criteria — what "done" looks like
- `cd mellifera && go build ./...` exits 0.
- `cd mellifera && go test ./...` exits 0 — every exported symbol has a table-driven test, plus one integration test that scans a small fixture directory into a temp SQLite DB and asserts items persisted.
- `cd mellifera && golangci-lint run ./...` exits 0.
- `cd mellifera && gofmt -l .` outputs nothing.
- `bash mellifera/.claude/skills/mellifera-build/scripts/check.sh` exits 0.
- All four proto packages compile; scanner (+common) is wired through the full path: API → module → plugin manager → base-scanner subprocess → store → list.
- Zero `reflect` usage, zero DI framework imports.
- Each package has `doc.go` and ≤ 8 exported symbols.
- Apache-2.0 headers on every `.go` file.

## Scope — in-scope / out-of-scope / assumed
**In-scope:** the 10 numbered deliverables above.
**Out-of-scope (deferred):** enrichment, Mode A & B, metadata plugins, streaming, playback, transcoding, janitor cron, plugin-repo UI, multi-user auth, image proxy/cache. The `go:embed` first-run extraction of D11/Q20 is a release-packaging concern — defer; load base-scanner from a filesystem path (dev mode).
**Assumed:** ffmpeg/ffprobe available on PATH at runtime (only external runtime dep). Single Go binary. SQLite + JSON columns. Russian-language first-class (no English-only assumptions baked in). Precision: exact values, no over-rounding. Prefer deprecation over deletion.

## Open questions — ambiguities for the user (max 5)
- Q1 (nice-to-have): If the full slice above is too large for one clean pipeline pass, may the planner split into a thinner first vertical (e.g., protos + store + module + base-scanner exercised in-process via SDK without the full subprocess manager + API in the immediate next pass)? The prompt explicitly authorizes this — flag in plan if used.
- Q2 (nice-to-have): SQLite driver choice — `modernc.org/sqlite` (pure-Go, no CGO, fits single-binary) is recommended; planner confirms. The prompt says "pick one in the plan."
- Q3 (nice-to-have): Module path `github.com/mellifera/mellifera` — confirm or flag if changed. The prompt says "confirm or adjust in the plan; flag if you change it."
- Q4 (blocking at completion only): Repo `.gitignore` excludes `.claude/` globally, so `mellifera/.claude/skills/mellifera-build/` is gitignored. Should the completion commit include the skill files (force-add) or leave them untracked? Will surface at commit time.
- Q5 (blocking at completion only): `mellifera/docs/` design docs (architecture.md etc., 2328 lines total, currently untracked) — commit them with the feature, or leave for the user to commit separately? Will surface at commit time.

## Approach hint — 2-4 bullets (sketch, NOT the plan)
- Likely modules: proto (vendor-owned contracts), pkg/sdk (thin shim), internal/store (SQLite + JSON), internal/plugin (subprocess manager), internal/module (registry), plugins/base-scanner (separate binary), internal/api (chi), cmd/mellifera (flat wiring).
- Risk areas: go-plugin gRPC handshake correctness, proto extraction fidelity (verbatim from §2), path-traversal guard in scanner, dynamic-JSON column schema + query semantics, ffprobe subprocess error handling (timeout, missing binary).
- Sequencing: protos first (contract foundation) → store + module (pure, easy to test) → sdk + base-scanner binary → plugin manager → API → integration test.
- Watch complexity budget: 8 symbols/package, funlen 60, gocognit 15 — favors many small packages over few large ones.
