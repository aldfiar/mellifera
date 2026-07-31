- [x] DOCS-2 (docs): scan-library API reference + operator runbook
  target: mellifera/docs/scan-library/api_reference.md (CREATE) | action: CREATE
  source_files: [mellifera/internal/api/router.go, mellifera/internal/api/handlers.go, mellifera/cmd/mellifera/main.go, mellifera/plugins/base-scanner/main.go]
  related_tasks: [Task 09, Task 10, Task 08]
  audience: developer + operator
  rationale: The scan-library feature ships 3 HTTP endpoints + admin-token auth + a required base-scanner binary + a runtime ffprobe dependency. None of this is documented for users/operators yet. Establish the API reference + operator runbook now so the foundational slice is navigable (the mellifera-build skill's AI-navigability goal extends to docs).
  content:
    - section: API reference (developer/user)
      points:
        - "`POST /api/v1/libraries` — create a library. Request: `{"module_id","root_path","display_name"}`. Header: `Authorization: Bearer <admin_token>`. Response: the library (id, module_id, root_path, display_name)."
        - "`POST /api/v1/libraries/{id}/scan` — trigger a scan. Header: Bearer. Response: `{"library_id","discovered","persisted","warnings",...}` (scan.Result). Blocks until the scan completes (MVP)."
        - "`GET /api/v1/items?library={id}&limit=&offset=` — list items. Header: Bearer. Response: items each carrying the dynamic-JSON `document` (parsed title/season/episode + ffprobe blob)."
        - "Error body shape: `{\"error\":{\"code\",\"message\",\"retryable\"}}` (arch §11.6). MVP: simple 4xx/5xx mapping; Mode B richness deferred."
        - "Auth: single admin token (Bearer). 401 on missing/wrong. Principal abstraction (arch §11.5) grounds the Phase 2 session resolver."
    - section: Operator runbook (operator)
      points:
        - "Build: `make build` (server) + `make build-plugin` (base-scanner binary). Both from one Go module (`go build ./...`)."
        - "Runtime deps: `ffprobe` MUST be on PATH (only external runtime dep). If absent, scans soft-fail (items still identified, ffprobe blob empty + warning)."
        - "Config (env, MVP): `MELLIFERA_ADMIN_TOKEN` (required — server will not start with an empty token), data dir (default ./data), base-scanner binary path (dev mode — filesystem path), listen address (default 127.0.0.1:8080)."
        - "Storage: SQLite (WAL mode) in the data dir; all §9.1 tables created on first run (incl. reserved `playback_progress`/`drafts`/`enrichment_failures`/`scan_jobs`). Re-scan is idempotent (upsert by file_id)."
        - "Security: admin token gates all endpoints; the base-scanner path-guard rejects any path escaping the configured library root (symlinks, `..`). Point Mellifera only at directories you trust."
        - "Subprocess model: base-scanner runs as a SEPARATE binary launched via go-plugin (magic-cookie handshake). A plugin crash does NOT take down the server (minimal restart: 1s→2x→60s cap, 3 fails → failed)."
    - section: First scan walkthrough
      points:
        - "1. `make build && make build-plugin`. 2. `MELLIFERA_ADMIN_TOKEN=T ./mellifera`. 3. `curl -H 'Authorization: Bearer T' -d '{\"module_id\":\"tv\",\"root_path\":\"<dir>\",\"display_name\":\"TV\"}' .../libraries`. 4. POST .../libraries/{id}/scan. 5. GET .../items?library={id}."
  verify:
    - doc exists at mellifera/docs/scan-library/api_reference.md
    - endpoint paths + request/response shapes match mellifera/internal/api/handlers.go exactly
    - config env names match mellifera/cmd/mellifera/main.go
    - no broken internal links; code examples use the realized binary/endpoint names
