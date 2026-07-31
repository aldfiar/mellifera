# Kickoff Brief — scan-library
pipeline: feature | workspace_root: mellifera/docs/ | project_scope: mellifera | model_tier: large | branch: feature/scan-library

## Mission
Deliver the foundational vertical slice of Mellifera that proves the modular + plugin-based architecture end-to-end: a user creates a TV library, triggers a scan, the **base-scanner** go-plugin subprocess walks the tree, runs `ffprobe`, parses TV filenames, and the core persists items as dynamic-JSON documents listable via the API. **Done** = `go build ./...`, `go test ./...`, `golangci-lint run`, `gofmt -l .`, and `mellifera/.claude/skills/mellifera-build/scripts/check.sh` all green; the four proto packages compile; scanner(+common) is wired through API → module → plugin manager → base-scanner subprocess → store → list; ≤8 exported symbols per package; no reflect, no DI framework.

## Stack snapshot
- Go 1.22+, single static binary, no CGO.
- `modernc.org/sqlite` (pure-Go SQLite) + JSON columns (`json_extract`, generated columns).
- `chi` v5 HTTP router; `google.golang.org/grpc` + `google.golang.org/protobuf`.
- `hashicorp/go-plugin` (gRPC subprocess plugins).
- `ffmpeg`/`ffprobe` via `os/exec` arg slice (never shell).
- Test: `go test`, table-driven per exported symbol. Lint: `golangci-lint v1.53+`.
- **Key conventions:** ≤8 exported symbols/pkg (12 hard fail); `doc.go` per package; pure core / thin shell; `api/` = pure delegation (parse → one domain call → write); no DI framework, no reflect; flat `main.go`; data-type boundaries (structs); Apache-2.0 headers; parameterized SQL only; precision over collapse; deprecate-don't-delete.

## Relevant surface (grounded in `mellifera/docs/project_structure.md` + design docs)
**Files to CREATE (greenfield — none exist yet):**
- `mellifera/go.mod` — module `github.com/mellifera/mellifera`, Go 1.22+.
- `mellifera/proto/mellifera/{common,scanner,metadata,plugin}/v1/*.proto` — verbatim from `docs/architecture.md §2` (common/scanner exercised; metadata/plugin generated for completeness).
- `mellifera/pkg/sdk/` — `Serve(...)` + scanner base type satisfying `plugin.GRPCPlugin` (D15/Q2).
- `mellifera/internal/store/` — SQLite; API ≤8 symbols: `Open`, `GetItem`, `PutItem`, `QueryItems` (+reserve progress per §9.1).
- `mellifera/internal/plugin/` — go-plugin manager: `Load`, `Start`, `Stop`, `Health`, `Call` (arch §7.3 minimal restart).
- `mellifera/internal/module/` — registry: `Get`, `List` (TV module config per §2.4).
- `mellifera/internal/api/` — chi router; admin-token middleware (Principal=admin per Q15/D18); pure-delegation handlers: `POST /api/v1/libraries`, `POST /api/v1/libraries/{id}/scan`, `GET /api/v1/items?library={id}`.
- `mellifera/plugins/base-scanner/main.go` — separate binary via `pkg/sdk`: walk + ffprobe arg-slice + TV filename parse (`SxxExx` + show title; strip resolution/group) + path-traversal guard.
- `mellifera/cmd/mellifera/main.go` — flat constructor wiring.

**Inputs (read-only, never modify):**
- `mellifera/docs/architecture.md` (1696 lines) — AUTHORITATIVE §2 protos.
- `mellifera/docs/ai-architecture.md` (84) — module map §4.
- `mellifera/docs/open-questions.md` (476) — D1-D20 immutable.
- `mellifera/.claude/skills/mellifera-build/SKILL.md` — NON-NEGOTIABLE build rules.
- `mellifera/.golangci.yml` — depguard denies reflect + DI frameworks.

## Scope boundary
- **In-scope:** the 10 deliverables in the Enhanced Objective (`mellifera/docs/scan-library/.phase_cache/enhanced_objective.md`).
- **Out-of-scope (DEFERRED):** enrichment / Mode A & B / metadata plugins (TMDB, Kinopoisk), streaming & playback, transcoding, janitor cron, plugin-repo UI, multi-user auth beyond admin token, image proxy/cache. `go:embed` first-run extraction (D11/Q20) is release-packaging — defer; load base-scanner from filesystem path (dev mode).
- **Assumed:** ffmpeg/ffprobe on PATH at runtime; single Go binary; SQLite+JSON; Russian first-class; precision (exact values, no over-rounding).
- **Right-sizing safety valve:** if the full slice is too large for one clean pass, planner MAY split into a thinner first vertical (explicit authorization) and surface the phasing.

## Constraints
- Hard complexity budget: ≤8 symbols/pkg, funlen 60/40, gocognit 15, lll 120, dupl 100, file warn>300/fail>500 lines, outgoing intra-core deps warn>4/fail>6.
- `api/` handlers do exactly: parse → ONE domain call → write. No branching.
- Interfaces ONLY at plugin seam with ≥2 implementations.
- Path-traversal guard in scanner: resolve + verify every discovered path within configured library root.
- Security: SQL parameterization, exec.Command arg-slice (no shell), API input validation.

## Verification
- `cd mellifera && go build ./...` exit 0.
- `cd mellifera && go test ./...` exit 0 — table-driven test per exported symbol + ≥1 integration test scanning a small fixture into a temp SQLite DB and asserting items persisted.
- `cd mellifera && golangci-lint run ./...` exit 0.
- `cd mellifera && gofmt -l .` outputs nothing.
- `bash mellifera/.claude/skills/mellifera-build/scripts/check.sh` exit 0.
- Plan Review (Phase 1b) is the formal user gate. Subsequent phases auto-advance per pipeline-control until completion, with HALTs only on blockers or rejected review/QA cycles.
