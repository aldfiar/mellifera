# Tasks: media-preview

Probe CWD is the repo root. All probes are node-free (`go test`/`go build` +
greps over `web/src` and committed artifacts). Probe bodies live in the spec
deltas (`specs/*/spec.md`); each box links one. Group dependencies (DAG):
1 → 2 → 4; 3 → 4 (group 3 is independent of 1 and 2 and may run beside
group 1). Max concurrency 2: (1 + 3), then 2, then 4.

## 1. Media endpoint (Go)

- [x] 1.1 `itemMedia` handler + route: `GET /items/{id}/media` in the browse requireRole group (`internal/api/router.go`), document-only path resolution from `parsed.absolute_path` / `sources["frame-grabber"].thumbnail_path`, no-token 401 (auth middleware, `internal/api/handlers.go`) [probe:896f7266e42721c6]
- [x] 1.2 Serve semantics: `http.ServeContent` bytes, Content-Type by extension, strong ETag + `Cache-Control: private, immutable`, `If-None-Match` → 304, `Content-Disposition: attachment` for non-image content [probe:0023777e45c1b1b9]
- [x] 1.3 Thumb variant: `?variant=thumb` serves the frame-grabber JPEG when the document carries the fact; `HEAD` answers headers-only [probe:8fa5a1f368863c7f]
- [x] 1.4 Error contract: 404 unknown id / no path fact / file missing on disk, 400 unknown `variant` value, client-supplied path-like parameters never steer resolution; unit tests beside the handler [probe:c304fabeb94884e4]

## 2. SPA media consumption

- [x] 2.1 `web/src/lib/api.ts`: `itemMedia(id, variant)` URL + authenticated blob/objectURL helper (revoked on unmount); endpoint-allowlist audit stays green [probe:6c03f9c2829e0509]
- [x] 2.2 `PhotoTile` (photos masonry): `<img>` via the media fetch — thumb variant when the document carries the frame-grabber fact, else original — over the ratio-correct placeholder fallback, capture-date footer unchanged [probe:5c27ecc8715cde3b]
- [x] 2.3 `MovieCard` (movies grid + serial episode flow): frame-grabber thumb via the media fetch when the document carries one, placeholder fallback [probe:5c27ecc8715cde3b]
- [x] 2.4 `CollectionCard` (Home): preview image from a representative item's media, badge-only fallback when nothing resolves, no preview area on zero-item cards [probe:bd1f5bcea31d67d8]

## 3. ItemDetail restructure

- [x] 3.1 Details surface: core fields, identifiers, and `<ViewFields>` render directly; one "Technical details" disclosure wraps the existing `<SourceCard>`/`<ProvenanceBadge>`/`<StagesProgress>` renders verbatim (components and fidelity untouched) [probe:baed5580f9176115]
- [x] 3.2 Collapsed by default; ItemDetail vitest updated and green (`cd web && npm test`, dev-time) [probe:280103bdebbb44df]
- [x] 3.3 Hero image leads the Details surface (resolved GATE-2-walkthrough open question): thumb variant on the frame-grabber fact, original for image-typed items, no hero + no request when nothing image-resolvable; ItemDetail vitest covers all three [probe:d209cc37dda978ea]

## 4. QA + delivery

- [x] 4.1 itest depth: hermetic black-box media test in `internal/itest` (built server, seeded item document, real file on disk; role + bytes coverage) joining the existing harness [probe:0023777e45c1b1b9]
- [x] 4.2 Regenerate committed `internal/web/api/openapi.{json,yaml}` (swag annotations on the new handler) + rebuild committed `internal/web/dist` carrying the media literal + SPA endpoint-allowlist audit re-run [probe:df34ab4dbc6e3d38]
- [x] 4.3 Close-out: `make build && make check && make test` green node-free; `cd web && npm test` green; manual walkthrough of the served SPA (photo tiles, episode thumbs, card previews, collapsed disclosure) [unprobeable]
