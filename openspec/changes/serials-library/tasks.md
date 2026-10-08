# Tasks: serials-library

Probe CWD is the repo root. All probes are node-free (`go test`/`go build` + greps). The
frame-grab probes degrade truthfully: `TestFrameGrabWritesThumb` SKIPS (exit 0) when
`ffmpeg` is absent from PATH, and `TestMissingFfmpegSoftFails` simulates absence via a
configured-but-nonexistent binary path. Cross-group contracts (serial-record marker,
`structure` knob, `ser_` id scheme, QueryItemsBySeries semantics, thumb path scheme, module
seed shape) are defined in design.md §Interfaces — build against it, never against a
sibling group's in-flight code.

Dependency edges (DAG): 1→3, 1→4, 1→5, 2→5, 3→5, 4→5. Group 2 is independent (plugin +
existing proto only). Max concurrency 2 (1+2, then 3+4, then 5).

## 1. Core substrate — series store, serial module seed, scan series-mode

- [x] 1.1 Seed the `serial` module config in `internal/module/registry.go` (config entity, not code): mirror the `tv` seed shape (`tvConfigJSON`, registry.go:44) — scanner binding `serial-scanner` with options `{"structure": "series-directories"}`, metadata chain `serial-parser` (priority 1) + `frame-grabber` (priority 2), `media_type: "serial"`; `INSERT OR IGNORE` seed row alongside `tv`/`image`; leave both existing seeds byte-identical [probe:80c1e9af9d178dcf]
- [x] 1.2 Add the `series` table to `internal/store`: idempotent `CREATE TABLE IF NOT EXISTS series` + `CREATE INDEX IF NOT EXISTS` in the `schemaSQL` list (open.go precedent) — `id`, `library_id`, `module_id`, `relative_path`, `document` (dynamic §3.1 JSON), `schema_version`, `status`, `created_at`, `updated_at`, `UNIQUE(library_id, relative_path)`; type `Series` + methods `PutSeries` (upsert by `(library_id, relative_path)`, preserve `id`/`created_at` on conflict), `GetSeries`, `QuerySeries` (optional status), `ListSeriesIDs`, `QueryItemsBySeries` (file-backed: exact `relative_path` equality; directory-backed: `substr(relative_path,1,?) = ?` + Go-side depth-1 filter); id `ser_<libraryID>_<sha16hex16(relative_path)>`; NO generated columns; store never parses series documents [probe:0668427b55d5e053]
- [x] 1.3 Series-mode drain routing in `internal/scan/run.go`: when a scanned item's facts carry the serial-record marker (`serial_record: true`), assemble a serial-level base doc (design Interfaces §4 — `parsed` marker facts, `ffprobe` `{}` for directory-backed) and persist via `PutSeries` in the same drain loop as `PutItem`; episode items gain `series_relative_path` + `sidecars` stamping from their facts; rescan of an unchanged library updates series rows in place [probe:68554a93d9896e50]
- [x] 1.4 Series status preservation on unchanged re-scan: reuse the `baseChanged`/canonical-JSON compare (run.go:233) over the serial facts — unchanged keeps the prior status (a `ready` series is not regressed), changed facts advance to `stale`, first sight lands `pending` (mirror scanStatusPending/scanStatusStale, run.go:203-204) [probe:7b91b8ca7b9a5ecb]
- [x] 1.5 Post-drain series sweep: after a CLEAN drain, series rows of the library not re-observed this pass advance to `deleted`; a renamed directory yields a NEW `ser_` identity with the old row `deleted` and no metadata copied across identities [probe:98e1dd00be30a3aa]
- [x] 1.6 Cancel-safety for the sweep: a scan whose stream did not drain cleanly (cancelled context / stream error) performs NO sweep — no series row reaches `deleted` from a partial pass [probe:eb2ddd730ebd00ae]

## 2. serial-scanner plugin — directory-structured discovery

> Independent (depends on nothing; the marker contract is design.md §Interfaces)

- [x] 2.1 Create `plugins/serial-scanner` (scanner capability, same proto/SDK patterns as base-scanner; Apache-2.0 headers): walk the root one level deep; a depth-1 subdirectory holding ≥1 directly-contained video file emits a serial record (`DiscoveredFile`, FfprobeJson empty) BEFORE its episode files; episode = direct video file probed exactly like the base-scanner video walk (same `mediaMime` extension set semantics, walk.go:25); Identify stamps the marker facts (`serial_record`, `dir_name_raw`, `backing: "directory"`, `series_relative_path`, `series_sidecars`) per design Interfaces §1; two same-show directories (cours) produce two distinct serial records, never merged [probe:deb03f5f7a07b865]
- [x] 2.2 Deep-video exclusion: video files deeper than a serial dir's direct children are NOT discovered; one per-serial scan warning naming the serial and the unexpected file [probe:d16c371b67739c27]
- [x] 2.3 Cours-separation guard: explicit test that neither cours directory's episodes attach to the other serial's record (identity strictly `(library_id, relative_path)`) [probe:87d0bb0b4f91f1f1]
- [x] 2.4 Extension gate + junk exclusion: sidecar extension set (`srt ass ssa sub mka m4a mp3 flac aac ogg opus wav`) joins the video map in the serial walk; files matching neither map (extensionless `smbdelete…`) are excluded with no warning and no record [probe:729f1fe78b8f1286]
- [x] 2.5 Episode-linked sidecars, SxxExx-first: sidecars at any depth under a serial dir are classified, never probed, never items; SxxExx token in the sidecar filename (reuse the `seasonEpisodeRe` grammar semantics, tvparse.go:22) links to the matching episode; language from the containing folder name (case-insensitive `Eng`/`Rus`/…) or a filename tag, else empty; match basis `sxxexx` stamped into the episode's `sidecars` facts [probe:38d51abe09bfbf7d]
- [x] 2.6 Bare-number fallback: a sidecar filename with no SxxExx token but a bare episode number (e.g. `Show - 01 (1080p) [C48E56C8].ass`) associates via match basis `bare_number` [probe:2195ddd74fa953fd]
- [x] 2.7 Serial-level sidecars: a sidecar matching NO episode (e.g. `OST/` audio nested 3-4 deep) attaches to the series record's `series_sidecars` facts — never dropped silently, never an item, never episode-linked [probe:e805b89e8eea4ac1]
- [x] 2.8 File-backed serials: a video file directly in the library root emits a file-backed serial record (`backing: "file"`, `series_relative_path` = the file's own relative path) plus that file as its single probed episode item [probe:cd6f6bbe663b2d1e]

## 3. Enrichment — series tasks, serial-parser, frame-grabber, wiring

> Depends on: Group 1

- [ ] 3.1 Two-level queue derivation + dual-load worker in `internal/enrich`: derive `(row_id, plugin)` tasks over items AND series under the identical predicates (queueable queue.go:352, namespace-absent queue.go:357, ledger cooldown queue.go:314); the worker loads the item document and on `sql.ErrNoRows` loads the series document (no id-prefix sniffing); leases keyed by row id; terminal failures ledgered, success clears a prior row, restart re-derives pending and skips cooling pairs [probe:b631150036bc2555]
- [ ] 3.2 Create `plugins/serial-parser` (metadata_source): Match self-selects the SERIES document (applies=false otherwise) and parses the raw directory facts — cleaned display title (non-ASCII preserved) + season extracted when a season token is present; writes ONLY `sources.serial-parser`; local parser, no auth_mode → queueable [probe:3e7ae9ebb5b9394b]
- [ ] 3.3 serial-parser episode Match: applies to an episode document iff its filename carries an SxxExx token; writes season/episode into the EPISODE document's `sources.serial-parser`; series-level namespaces untouched; non-match = skipped stage, not an error [probe:5661e7491a9d1caa]
- [ ] 3.4 Series settle rule: a series settles `ready` when all its queueable sources reach terminal outcomes — independently of its episodes; existing item settle untouched (enrich.go settle path) [probe:1689a5e8b66761f3]
- [ ] 3.5 Create `plugins/frame-grabber` (metadata_source): applies only to episode documents carrying a video absolute path; ffmpeg via `os/exec` arg-slice (never shell) under a bounded timeout, seek `min(60s, 10% probe duration)` → single JPEG at `<MELLIFERA_DATA_DIR>/thumbs/<sha16(series_relative_path)>/<sha16(episode_relative_path)>.jpg`; writes ONLY `sources.frame-grabber` with the thumbnail path — no BLOBs; test SKIPS truthfully when ffmpeg is absent [probe:cb46677fed481743]
- [ ] 3.6 frame-grabber soft-fail: missing binary (simulated via a configured nonexistent path), non-zero exit, timeout, and unwritable output are per-source warnings + empty namespace → the `no_data` ledger cooldown; only a cancelled context is a hard failure; scan and the rest of the chain unaffected [probe:65fd06c7d306cf09]
- [ ] 3.7 View precedence test in `internal/enrich`: a later source writing an image view entry outranks the frame-grab default in `_view` while both namespaces remain stored losslessly (frame-grabber priority 2 writes before later sources; last-writer view until B3 arbitration) [probe:19c935b30547bf65]
- [ ] 3.8 Composition wiring in `cmd/mellifera/main.go`: extend the `pluginIDs` set (main.go:86) with `serial-scanner`, `serial-parser`, `frame-grabber` — Load/Start (before serving)/Stop + env-overridable binary paths `MELLIFERA_SERIAL_SCANNER`/`MELLIFERA_SERIAL_PARSER`/`MELLIFERA_FRAME_GRABBER` (defaults `bin/serial-scanner`/`bin/serial-parser`/`bin/frame-grabber`); no media-type literals anywhere in `internal/scan`/`internal/enrich` [probe:9ca607a7253bdfe1]

## 4. API — series surface (read-only)

> Depends on: Group 1

- [x] 4.1 Series routes in the browse group (`internal/api`, unexported handlers + unexported DTOs — the api package is at its exported-symbol warn threshold): `GET /api/v1/series?library={id}` (integer required → `400 bad_request`), `GET /api/v1/series/{id}` (full serial-level document, opaque; unknown → `404 not_found` with the canonical error body); handlers are pure delegation; mounted inside `mountV1Routes` browse group (router.go:89); regenerate the committed `internal/web/api/openapi.{json,yaml}` with the three new GETs; scan endpoints and the admin group untouched; no write endpoints [probe:e2feb234c74967df]
- [x] 4.2 `GET /api/v1/series/{id}/episodes` returning the series' episode items in the item wire shape (mirrors itemDTO delegation); 404 edge for an unknown series id on both `{id}` routes [probe:18b31cb62db7ceff]

## 5. QA + delivery — joint contracts, regression, close-out

> Depends on: Groups 1, 2, 3, 4

- [ ] 5.1 Joint serial-library e2e (Tier 1, real plugin subprocesses over fixture libraries mirroring both ground truths — noisy cours dirs + `Eng`/`Rus`/`SUB` sidecars + deep `OST/` + stray top-level video + `smbdelete` junk, and the Cyrillic `Необычный адвокат У Ён У Extraordinary Attorney Woo.2022.S01` dir): scan → series + episode rows + sidecar facts persisted → queue drains parser (and grabber when ffmpeg present) → series and episode documents settled → the API serves series/episodes with non-ASCII names verbatim [probe:cbaf65a0065ee7b4]
- [ ] 5.2 Shipped-behavior regression gate: golden `tv`/`image` scans + tv-parser + image-enricher all pass unchanged; full node-free gate `make build && make check && make test` green (check.sh budgets included) [probe:0796c4f409ad3023]
- [ ] 5.3 Close-out inspection: re-run every probe in this change from the repo root; confirm the additive posture by inspection (proto/`pkg/sdk` diff empty, base-scanner/tv-parser/image-enricher diff empty, SPA untouched); note the optional `ffmpeg` runtime dependency in `docs/operator-runbook.md` alongside ffprobe/exiftool [unprobeable]
