<!-- wf: source_fingerprint=ecd0af9264dee47485f0fc926f9eeaba8b5cfdba6e1ee6479f79ba3f9f2ca483 -->
# Tasks: serial-watch-flow

Probe CWD is the project root. Probes are `go build`/`go test` + greps over
`internal/` and `web/src`, plus targeted `vitest run` files (dev-time node
for the SPA floor only — the Go gate stays node-free); the pack-lane probes
require `ffmpeg` (a declared runtime dep of the pack lane). Probe bodies
live in the spec deltas (`specs/*/spec.md`); each box links one. Group
dependencies (DAG): 1 → 2 → 4; 2 → 5 and 3 → 5; 2 → 6 and 3 → 6; 4 → 6 and
5 → 6; 6 → 7. Max concurrency 2: (2 + 3), then (4 + 5), then 6, then 7.

## 1. Store: title overrides

- [x] 1.1 `title_overrides` table (idempotent DDL in `Open`'s schemaSQL: `entity_id TEXT PRIMARY KEY, title TEXT NOT NULL, updated_at`) with set/clear/lookup methods over `internal/store` (parameterized SQL; lookup tolerates absent rows; series and item ids share the table) and table-driven `TestTitleOverrides` asserting persist/clear/no-op-clear and byte-identical documents [probe:f4a3a5492d753301]

## 2. API: title routes + sidecar variant

- [x] 2.1 `PUT/DELETE /api/v1/series/{id}/title` and `PUT/DELETE /api/v1/items/{id}/title` in the admin role group (pure delegation over the store methods; 200 with the stored record on PUT, 204 idempotent on DELETE) plus the additive `title_override` string field (empty when unset) on the series list/detail and items list/detail DTOs [probe:6961d970019daaa4]
- [x] 2.2 Title-route validation tests beside the handlers: whitespace-only and non-string titles answer `400 bad_request`, unknown series/item ids answer `404 not_found`, and nothing is written in any of the four cases [probe:c546021b243faf9b]
- [x] 2.3 Item media sidecar variant: `?variant=sidecar&n=<index>` serves the episode document's indexed sidecar bytes (extension-derived Content-Type, strong ETag, `Cache-Control: private, immutable`, conditional 304, headers-only HEAD); missing/non-integer/negative `n` is 400, out-of-range index / absent sidecar facts / unknown item / missing file is 404, and resolution never accepts a client path [probe:9af98ae2a9d7cc4b]

## 3. Stream: voiceover renditions + descriptor tracks

- [x] 3.1 Pack lane remuxes each resolvable episode-linked audio sidecar into the fMP4-HLS build as an alternate audio rendition — stream copy only, one ffmpeg exec site, build audio order embedded-first then document order; a sidecar missing at build time soft-omits while the rest publishes; the `Deps.PackItem` seam carries the sidecar facts (absolute paths derived from the episode's stored facts) and cmd wiring passes them [probe:99170732b4589948]
- [x] 3.2 Playback descriptor gains the read-only `voiceovers` projection of the episode document's audio sidecars (document order, `{index, label}` with label = language, else containing folder, else file name; empty list when none) with no packaging-state mutation [probe:61ba379799f368ce]

## 4. SPA: serial title chains

- [x] 4.1 Series grid cards resolve the title fallback chain (stored `title_override` first, then the document's ordered source namespaces / `_view`, then the raw directory name) — the existing `serialTitle` precedence gains the override tier ahead of the parser title [probe:853f22793159ea93]
- [x] 4.2 Episode flow rows resolve the same chain (override, then parsed/plugin title, then the file name) from the item reads' `title_override` [probe:4b6c3664de7b031b]
- [x] 4.3 Rename affordances on the series card and each episode row: submit PUTs the title route, clear DELETEs it and returns the display to the chain value, canonical errors surface inline without auto-retry (`setSeriesTitle`/`setItemTitle`/`deleteSeriesTitle`/`deleteItemTitle` helpers in `lib/api.ts`) [probe:4f52eb9b1c948be9]

## 5. SPA: watch-page track controls

- [x] 5.1 Subtitle-selection button on the episode element page: sidecar list labeled language-then-folder-then-file plus an off entry; selection fetches `?variant=sidecar` bytes through the authenticated channel and renders timed text over the playing video via a new `src/lib/subtitles.ts` converter (`.vtt` passthrough, `.srt` → WebVTT, `.ass`/`.ssa` dialogue with timing), unit-tested in `src/lib/subtitles.test.ts` [probe:67c6610f8728cd27]
- [x] 5.2 Unrenderable subtitle state: a `.sub` sidecar renders in the control with an explicit not-renderable state instead of a selectable entry that does nothing [probe:b1d397901df1cf19]
- [x] 5.3 Voiceover-selection button beside the play affordance: lists the descriptor's `voiceovers` plus the embedded audio; on an `hls` build selection switches the player's audio rendition without restarting the video (`audioTrack`), on a direct item the control renders disabled with a visible packaged-build-required state; selections do not survive navigation [probe:034765eab6e162aa]

## 6. Delivery: contract + embedded build

- [x] 6.1 Regenerate the committed OpenAPI contract (`internal/web/api/openapi.{json,yaml}` via the fixed swag path) listing the four title routes, and rebuild + commit `internal/web/dist` carrying the title chains and the voiceover/subtitle controls; SPA endpoint-allowlist audit re-run [probe:89a70056cfbff67c]

## 7. QA: joint E2E

- [x] 7.1 `TestSerialWatchFlowJointE2E` in `internal/itest`: hermetic fixture serial library whose serial directories carry voiceover/subtitle subfolders (one voiceover file absent on disk), scanned through the real plugin subprocesses — episode documents carry the sidecar facts, the sidecar media variant serves the indexed subtitle bytes, the descriptor lists the resolvable voiceovers, and a title override round-trips through the API [probe:e6ec721c5b6b1da0]
