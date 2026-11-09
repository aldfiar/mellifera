# Proposal

## Why

Database rows outlive their files. When a library directory vanishes or is renamed, the scan tombstones the series row (the post-drain sweep, `internal/scan/run.go`) but never the item rows: stale items keep serving on the home rail, in browse grids and item listings, and crash at play with a lying error — the descriptor answers `direct`, the original 404s, and the SPA surfaces "container not decodable" for a file that is simply gone (live-verified on alatoic 2026-11-09; `.tmp/tombstone-lifecycle-diagnosis.md` is the evidence base: Black Clover S2 vanished entirely; JoJo was renamed, its old items went dead while a fresh item set enriched under the new name, stranding E03's 88% progress on a dead id while the live HEVC item had none).

The serve side is mostly ready and already shipped: progress reads join `status <> 'deleted'`, the browse RAM walk and its epoch count leg skip deleted rows and converge within 60 s, library summary/folders exclude them, home series resolution skips deleted series. What is missing is the lifecycle itself: nothing ever tombstones an item, no surface can answer "the file is gone", and stranded watch state has no migration path.

## What Changes

1. **Item tombstone sweep** (scan-library): after a confirmed-clean drain, the scan sweeps every active item of the library — an item whose stamped absolute path no longer stats on disk advances to `deleted` (the same soft-delete literal the series sweep writes; documents byte-untouched; progress/ledger/override rows preserved). Disk truth, not observation history, is the basis; an absent/unreadable stamp skips with a warning; a truncated stream never sweeps. A re-observed deleted item self-heals exactly like series do (unchanged identity → `ready`, changed → `stale`), so a wrongful tombstone (an offline root) or a restored file heals on the next healthy rescan.
2. **Identity adoption** (playback-progress): when an enrichment pass settles a live item whose parsed identity (library + served display title + season/episode, absent-legs-match-absent-legs) matches a tombstoned item carrying progress or ledger rows, that state MOVES onto the live item per viewer slot — the live item's own rows always win (a zero-position unwatched reset never resurrects), `completed_at`/`applied_at` ride verbatim, and no ghost stock remains on the dead row. The hook fires at the enrich row settle (a nil-safe `Deps.Adopt` closure), so ONE rescan lands the JoJo progress — not two.
3. **Honest file-missing playback** (packaged-playback + web-ui): the descriptor gains an additive read-side state `missing` (`state_reason: file_missing`) answered when a direct floor's resolved original does not stat at descriptor time — never a codec claim, never a play URL pointing at a 404. Packaged answers that verify playable never stat. The SPA maps the state to an honest file-missing banner (no video mount, no retry affordance, no beacon). `codecs_src=none` is deliberately NOT fixed here — seeded follow-up.
4. **Serve law completed** (scan-library): tombstoned items leave the item listing's default view (an explicit `?status=deleted` lifecycle passthrough keeps working), series episode lists and the next-episode pick, and the item detail route (404 `not_found`) — joining the progress join, rail, browse/search/facet drops that already ship. The store's documented read invariant is preserved — empty status still reads ALL rows — and the default exclusion lives at the api listing boundary; the artwork garbage-collection union pins its explicit ALL-rows read so a tombstoned item's artwork is never GC'd while dead (a self-heal or a re-enrichment finds it intact). Progress and ledger rows survive in storage untouched — while an item is tombstoned its progress feeds no served read and no scoring input (the shipped non-deleted joins), and identity adoption re-keys that state onto the live item within one rescan; no rows are ever deleted.
5. **Ride-along (baseline-surfaced)**: the enrich worker loop becomes a priority select — `TestUrgentLanePreferred` flaps ~50% on the base commit because Go picks randomly among ready cases of the bare two-case select (`internal/enrich/queue.go`), so the urgent-before-shared law the code itself documents (`internal/enrich/streams.go`) holds coin-flip. One small task; not new scope — a product bug the baseline suite surfaced.
6. **Operator step (not code)**: after deploy, ONE rescan of each affected library tombstones its stale rows and lands adopted progress. This is an operator instruction, not shipped code — no migration job, no boot-time sweep.

## Capabilities

### Modified Capabilities

- `scan-library`: item tombstone sweep + self-heal + the completed serve law
- `playback-progress`: non-deleted read join pinned; identity adoption of stranded watch state
- `packaged-playback`: descriptor file-missing state (additive, read-side)
- `web-ui`: honest file-missing playback surface

### New Capabilities

- none

## Impact

- `internal/scan` — item sweep + self-heal + adoption (new `adopt.go`)
- `internal/store` — two move transactions (new `adopt.go`, returning moved-row counts), QueryItemsBySeries exclusion (the `QueryItems` empty=no-filter invariant is preserved)
- `internal/stream` + `cmd/mellifera` — descriptor state consts + the stat gate in the composition root
- `internal/enrich` — worker priority select + the `Adopt` Deps hook (the `allItems` invariant comment updated to state the store/api layering)
- `internal/api` — listing default-exclusion at the serve boundary + item detail 404 for tombstoned rows
- `internal/art` — the GC union's ALL-rows read pinned explicit
- `web/src` — descriptor type union + ItemDetail banner (+ the api.ts play_url doc-comment fix)
- `internal/web` — openapi/embedded regen via `make web-build`

No schema migration (the `status` column exists; progress/ledger table shapes untouched); no proto changes. Design rulings and alternatives: `design.md` (D1–D8).

Note (close-out seed): the admin/preview walks (`internal/api/source_admin.go` source preview and per-source title counts, the cmd enrich preview) stay all-rows readers under the preserved store invariant — their counts do not change with this work; any surface later rerouted through the default-excluded api listing read would serve active-only counts by design, accepted behavior with the audit window at `GET /items?status=deleted`. Record in the close-out notes.
