<!-- wf: source_fingerprint=73e2f2ab462b1915d288cf4797a5019ee9f8aaceb3fd26938e2dfa7f7e5c909b -->
# Tasks: continue-nextup-media

Four groups: plugin seek policy → module seed v2 → api seam + cache →
cmd executor → SPA cards. Groups 1–3 are Go-side prerequisites for the
re-grab path; group 4 wires them; group 5 is the SPA. Probes run from the
repo root; the Go gate stays node-free.

## 1. frame-grabber: 5-minute default + seek_seconds override

- [x] 1.1 `plugins/frame-grabber/ffmpeg.go`: enrich-time default seek 60s→300s and duration clamp fraction 0.1→0.5 (`min(300s, 50% duration)` — design D-5). `plugins/frame-grabber/grabber.go` Convert: honor an explicit integer `seek_seconds` query field (design D-4) — it replaces the default seek, still clamped by probe duration (never past EOF, never negative). Update/extend `grabber_test.go` seek cases (300s default, 50% clamp, seek_seconds override + clamp). Probe: `go test ./plugins/frame-grabber/`. [probe:c140a9be3ddbad7f]

## 2. tv module seed v2: films get frame-grabber

- [x] 2.1 `internal/module/registry.go`: tvConfigJSON gains the frame-grabber binding (priority 4, display_fields thumbnail/grabbed_at), schema_version 1→2; Open runs a guarded `UPDATE modules SET config_json, schema_version=2 WHERE id='tv' AND schema_version < 2` after the INSERT OR IGNORE (D-7). Registry test asserts v2 chain on a fresh open AND on a store pre-seeded with the v1 row. Probe: `go test ./internal/module/`. [probe:9e2727e0ab147725]

## 3. api: OnProgress seam + per-variant thumb cache

- [x] 3.1 `internal/api/router.go`: Deps gains nil-safe `OnProgress func(ctx, itemID string, position int64)` (D-2). `handlers.go` putProgress invokes it after a successful PutProgress — after the response-relevant store call, before writeJSON; a nil closure is a no-op (existing tests unaffected). `itemMedia`: `variant=thumb` responses carry `Cache-Control: private, no-cache`; original + sidecar keep `private, immutable` (D-6). Progress + media tests cover both. Probe: `go test ./internal/api/ -run 'Progress|Media'`. [probe:1608b918d4ca992a]

## 4. cmd: debounced stop-frame re-grab executor

- [x] 4.1 New `cmd/mellifera/thumb.go` (unexported surface): the OnProgress closure — WithoutCancel ctx + timeout, per-item ≥60s position debounce (D-3), store.GetItem → Manager.MetadataSource("frame-grabber", "default") → Match(stored doc) → inject seek_seconds → Convert (D-4); failures log-and-skip (progress is never load-bearing). Wire it in main.go beside the Play closure. Probe: `make build && go vet ./cmd/...`. [probe:21c9e50c6730b077]

## 5. SPA: Continue/Next-up names + thumbs

- [x] 5.1 `web/src/pages/home/Home.tsx`: Continue cards gain the thumb preview (authenticated fetch, honest absent-fact fallback) and real names — serial episodes `<seriesTitle> · SxxEyy` via the series-list match on parsed.series_relative_path (D-8); Next up rekeyed on series records + episode thumbs. Pure derivations exported; `Home.test.tsx` covers series-title resolution, next-up-from-episodes, and the episode-without-series fallback. Probe: `cd web && npx vitest run && npx tsc --noEmit`. [probe:b64772ba8f0655ba]

## 6. Gates + live evidence

- [x] 6.1 `make build check test lint` from the repo root (node-free), then `scripts/check.sh`. Probe: `make build check test lint`. [probe:ebd254ceacffd32c]
- [x] 6.2 Shadow e2e (proposal Verification): copied datadir on :8081, PUT /progress → thumb ETag/bytes change; no user-session disruption. Manual evidence recorded in this change's README, never a probe. [unprobeable]
