# Acceptance Criteria — scan-library

## Source

User request (enhanced_objective.md §Intent): *"Ship the foundational vertical
slice of Mellifera that proves the modular + plugin-based architecture
end-to-end: a user creates a TV library, triggers a scan, the base-scanner
go-plugin subprocess walks the tree + runs ffprobe + parses TV filenames, and
the core persists items as dynamic-JSON documents that can be listed via the
API. This slice is the backbone every later feature (enrichment, streaming,
transcoding) plugs into."*

Done definition (kickoff_brief.md §Mission): *"`go build ./...`, `go test ./...`,
`golangci-lint run`, `gofmt -l .`, and `check.sh` all green; the four proto
packages compile; scanner(+common) is wired through API → module → plugin
manager → base-scanner subprocess → store → list; ≤8 exported symbols per
package; no reflect, no DI framework."*

## Scenarios

### AC-1: End-to-end library scan (THE main flow)
- **Given**: `ffprobe` on PATH; a fresh temp data dir + SQLite DB; a small fixture directory of TV-named files (e.g. `Breaking Bad/Season 1/Breaking Bad S01E01.mkv`).
- **When**: the operator creates a TV library pointing at the fixture (`POST /api/v1/libraries` with the right admin Bearer token), then triggers a scan (`POST /api/v1/libraries/{id}/scan`).
- **Then**: `GET /api/v1/items?library={id}` returns the discovered items; each item's persisted document carries parsed `title="Breaking Bad"`, `season=1`, `episode=1`, plus a non-empty `ffprobe` JSON blob; the scan response reports the count.
- **User intent**: "I can point Mellifera at my TV library and it discovers and lists my files through the full plugin-subprocess pipeline." This is the foundational proof.
- **Covers tasks**: T03 (sdk), T04 (store), T05 (module), T06 (plugin), T07 (scan), T08 (base-scanner), T09 (api), T10 (cmd wiring), T11 (integration golden); independent re-derivation in QA-1

### AC-2: All five verification gates green (developer shippability)
- **Given**: the feature branch at completion.
- **When**: the developer runs the five verification commands — `cd mellifera && go build ./...`, `go test ./...`, `golangci-lint run ./...`, `gofmt -l .`, and `bash .claude/skills/mellifera-build/scripts/check.sh`.
- **Then**: all five exit 0 (gofmt produces no output); every package has a `doc.go`, ≤8 exported symbols (WARN up to 12 acceptable where documented), Apache-2.0 headers on every `.go` file, zero `reflect` usage, zero DI-framework imports, and a table-driven test per exported symbol.
- **User intent**: "The slice is shippable and conforms to the project's AI-navigability rules — a small/medium model can navigate it next."
- **Covers tasks**: every coder task (T01-T11) + T12 (gates) + T13 (R2 check.sh exclusion); resilience/security regressions in QA-2. BLOCKER: golangci-lint must be installed for T12 to verify (state.json phase_log)

### AC-3: Proto contracts extracted verbatim from architecture.md §2
- **Given**: the four `.proto` files under `mellifera/proto/mellifera/{common,scanner,metadata,plugin}/v1/`.
- **When**: the developer diffs each `.proto` against the corresponding block in `mellifera/docs/architecture.md §2` (`§2.1.1` common, `§2.1.2` scanner, `§2.1.3`/`§2.1.4` metadata, `§2.2.2` plugin) and runs `buf lint` + `go build` on the generated bindings.
- **Then**: the proto content matches §2 verbatim (whitespace within protoc tolerance; no renamed fields, no reinvented types); `buf lint` is clean; all four generated `.pb.go` packages compile.
- **User intent**: "The foundational contracts are extracted faithfully, not reinvented — every later plugin (TMDB, Kinopoisk) builds on these exact contracts."
- **Covers tasks**: T02 (protos verbatim + generate); spot-check in QA-1

### AC-4: Path-traversal guard rejects escapes (security)
- **Given**: a library root containing (a) a symlink whose target resolves outside the root, and/or (b) a file reachable via a `..` path segment.
- **When**: a scan runs against that library.
- **Then**: an escaping path yields **no item**; NO file outside the configured library root is `ffprobe`d, read, or persisted. Symlink escapes are **silently skipped** — `filepath.WalkDir` does not follow symlinks, so an escaping symlink is dropped upstream of the guard (no warning surfaces for it). `withinRoot` is the defense-in-depth check applied to **every emitted candidate** path (pre- and post-symlink-resolve), and is what stops a `..`-style or absolute-other-tree escape from ever being probed. (The load-bearing security invariant holds; the earlier "recorded as a warning" wording was inaccurate — warnings come from ffprobe soft-fails per AC-6, not from path escapes.)
- **User intent**: "Scanning a directory I configure can't be turned into arbitrary filesystem access — even via symlinks or traversal."
- **Covers tasks**: T08 (base-scanner withinRoot + WalkDir), T11 (integration escape fixture); independent in QA-1

### AC-5: Admin-token middleware gates the API (security)
- **Given**: the server running with admin token `T` (from config or env, per §11.5/Q15).
- **When**: a caller hits `POST /api/v1/libraries` with no `Authorization` header, or with a wrong token, or with a well-formed `Authorization: Bearer <wrong>`.
- **Then**: the server responds `401 Unauthorized` and creates no library.
- **When (correct)**: the caller sends `Authorization: Bearer T` with a valid body.
- **Then**: the server responds `2xx` and the library is created.
- **User intent**: "The API is gated so that exposing it beyond localhost isn't immediately catastrophic, and Phase 2 multi-user auth lands additively (Principal resolver, not a handler rewrite)."
- **Covers tasks**: T09 (admin-token middleware); full matrix in QA-2

### AC-6: Scanner resilience to ffprobe failure (soft-error path)
- **Given**: a library containing one valid media file AND one file `ffprobe` cannot probe (e.g. a zero-byte file or an unrecognized container).
- **When**: a scan runs.
- **Then**: BOTH items are persisted; the unprobeable item carries an empty `ffprobe` field plus a warning entry; the valid item carries the full `ffprobe` JSON blob; the scan completes (does not abort on the soft failure).
- **User intent**: "One bad file doesn't break the whole scan — I get best-effort identification across the whole library." (Q6 ffprobe failure-mode contract.)
- **Covers tasks**: T07 (scan soft-fail aggregation), T08 (base-scanner probe soft-fail), T11 (unprobeable fixture); independent in QA-1

## Coverage Matrix

| Scenario | Tasks | Verified By |
|---|---|---|
| AC-1 (e2e scan) | T03, T04, T05, T06, T07, T08, T09, T10, T11; QA-1 | (reviewer at Acceptance Gate — re-derives expected parsed title/season/episode from Given/When/Then, does not trust coder's assertions) |
| AC-2 (five gates green) | T01-T11, T12, T13; QA-2 | (reviewer) — BLOCKER: golangci-lint must be installed (state.json phase_log) |
| AC-3 (proto verbatim) | T02; QA-1 (spot-check) | (reviewer) |
| AC-4 (path guard) | T08, T11; QA-1 | (reviewer) |
| AC-5 (admin token) | T09; QA-2 (full matrix) | (reviewer) |
| AC-6 (ffprobe resilience) | T07, T08, T11; QA-1 | (reviewer) |

## Reviewer independence (golden-test rule)

At the Acceptance Gate, the reviewer MUST re-derive the expected outcome of
each scenario from its Given/When/Then and confirm the coder's tests assert
THAT outcome — not trust the coder's test assertions. The coder writes the
test code; the reviewer independently verifies the test satisfies the scenario.
For AC-1 specifically, the reviewer re-derives: "given these fixture
filenames, the parsed title/season/episode MUST be X/Y/Z" and checks the test
asserts exactly that (not just "some item was persisted").
