# Design

## Context

See proposal.md — Why. Current state that shapes the approach: no art code exists (no `internal/art`, no art routes, no janitor registry); the api composes display names at read time in `internal/api/display.go` (the `namerFor` composition seam, ~36-76 at HEAD 522c53f) with per-library batched reads (D-9 pricing) — artwork composition rides the same posture; the item-media handlers (`internal/api/handlers.go` ~1050-1144) establish the ETag/Cache-Control/ServeContent idioms this change reuses; the cmd-side sweep ticker (`cmd/mellifera/playback.go` `runSweepTicker`, :87; frontier walk :100+) is the code the janitor registry generalizes; the debounced `thumbRegrabber` bounded-map (`cmd/mellifera/thumb.go` :51-79) is the in-process bounded-state pattern the failure cooldown reuses; `Deps.Pairing` (`internal/api/router.go` :167) is the service-value Deps-field precedent for `Deps.Art`. Export budgets are hard-gated at >12 per package (mellifera-build check.sh): api and store both sit AT 12 today, so both must land their additions with ZERO new exported symbols (the titles.go unexported-handler idiom and primitive-signature store methods). Line numbers in this document were re-grounded against this worktree at 522c53f.

## Goals / Non-Goals

**Goals:**

- One additive change delivering: art store + acquisition, composition stamping, the art object serve route, the poster override family, the janitor art task, the shikimori write-side drop, and the SPA rendering + overlay.
- Honest missing-art treatment end to end: write-side drop (future rows), walk-side skip (the 16 existing placeholder rows), no server SVG, deterministic generated fallback client-side.
- Fetch-once economics: singleflight collapse, ≤2 concurrent upstream, failure cooldown, no TTL, disk-durable across restarts.
- Budget integrity: `internal/art` ≤ 8 exports; store and api gain zero exports; api intra-core deps 3 → 4.

**Non-Goals:**

- No cast-portrait overrides (index re-points at a different person on chain reorder — declined; revisit after Layer 0 stable cast ids).
- No upstream staleness handling for a same-URL content drift (accepted stale-forever; the override is the escape hatch).
- No `?refetch=1` verb (the override flow covers forced re-fetch).
- No negative DB rows or store-side placeholder-hash backstop (in-memory cooldown + golden-pinned predicates cover the economics).
- No server-generated SVG fallback (the SPA component covers all real surfaces; an escape hatch can slot behind the same route later).
- No blocking fetch-on-miss (the detached producer keeps request goroutines free).

## Decisions

- **D1 — `internal/art` is a leaf over the store** (`api → art → store`): art imports store + stdlib + `x/sync` (singleflight, already in go.sum → direct require) + `x/image` (WebP decode-only, genuinely new). Chain and pacing arrive as wired values; art never imports enrich/plugin/module. Exactly two sentinels (`ErrNotImage`, `ErrTooLarge`) inside the ≤8 export ceiling. Alternative considered: an interface seam — declined (not a plugin boundary).
- **D2 — Store adds two value-agnostic tables, zero exports**: DDL rides schemaSQL additively (the `title_overrides` pattern); methods use primitive signatures (the budget-dodging idiom). The store never parses art values or reads document JSON. `art_fetches.sha256` is deliberately NOT part of the GC reference union (that would make every fetched row immortal).
- **D3 — Composition is live, never persisted**: the `display.go` seam stamps `Artwork string json:"artwork,omitempty"` onto the served DTOs; override → first non-placeholder chain poster; two legs server-side, the thumbnail leg stays client-side (ItemDetail's hero-thumb fallback already covers it). Batched per-page lookups — strictly better than today's per-row point-read posture.
- **D4 — Two acquisition producers, never synchronous with a render**: (a) the janitor settle pass (boot-run + tick) walks documents and acquires unmaterialized URLs; (b) fetch-on-miss hands off non-blockingly from live composition (spawn/buffered channel owned by art.Service — never an inline wait in a request goroutine). Shared singleflight per URL; ≤2 concurrent upstream; 15 s timeout; ≤8 MB read cap; all bytes through the same guard as uploads.
- **D5 — Serve is pure path resolution**: oid = `art_` + full sha256 hex → path resolution with zero DB reads; strong ETag from the hex; `private, immutable` (write-once semantics); browse group beside `/items/{id}/media` so paired clients load posters.
- **D6 — Upload guard lives once, in art's Ingest**: magic-byte sniff + size + real decode + center crop-once 2:3 (no upscale), original verbatim + cropped JPEG q85 stored, cropped referenced; replace/reset deletes the pair. `http.MaxBytesReader` at the api layer is transport hygiene; the store re-checks size.
- **D7 — GC on reference loss, one shared walk**: settle + GC share a single document walk covering series AND non-series items; boot-run is the same settle pass; referenced set = override selections ∪ live document kind-field URLs (conservative — gate flips never delete); repair legs for row-without-file and file-without-row.
- **D8 — Janitor registry generalizes `runSweepTicker`** cmd-side (no new package): boot-run + 60 s tick, per-task intervals; day-one tasks `streams` (the existing sweep folded in unchanged) + `art`; an env knob disables the art task only (0 = off).
- **D9 — Missing-art predicate duplicated across the plugin boundary, deliberately** (separate binaries), pinned by the committed golden fixture `internal/api/testdata/golden/missing_art.json` consumed by both the api walk test and `plugins/shikimori/convert_test.go` — either side drifting alone fails its suite.
- **D10 — SPA cache insurance**: a module-scope object-URL LRU (~64 entries) owns revocation so it can never hand out a dead URL — insurance for RFC 9111 §3.5's MAY on caching Authorization-bearing responses (TV webkits); verified by a network-count check across a grid remount (expected exactly 1 request total).

## Interfaces

Cross-group contracts (group `store-art` → `serve` → `web`; `qa-closeout` consumes all):

- **store → art/api**: the two tables and their primitive-signature methods (fetch rows keyed by url_hash → sha256; override rows keyed by entity id/kind → selection). Only art and api call them; the store stays art-value-agnostic.
- **art → api/cmd**: `art.Service` (constructed cmd-side with wired chain/pacing values), `Acquire` (singleflight, cooldown), `Ingest` (upload guard), `ErrNotImage`/`ErrTooLarge`, and path-serve support for the object route. The settle/GC walk lives in art and is invoked by the janitor task.
- **cmd → tasks**: the registry's task shape (name + interval + fn); `streams` keeps today's behavior byte-for-byte; `art` calls the art settle/GC walk and yields to the process ctx.
- **api → web (wire)**: `GET/HEAD /api/v1/art/object/{oid}` (browse); `GET /api/v1/series/{id}/posters`, `PUT|POST|DELETE /api/v1/series/{id}/poster` and the `/items/{id}` mirror (admin); candidate shape `{source: plugin_id|"user"|"thumb", url, current}` with `current` + `candidates` envelope; selection vocabulary `"src:<plugin_id>" | "user:art_<64hex>" | "thumb"`; served DTOs gain `artwork` (`omitempty`). The SPA reads only `artwork` + these routes — never `sources.*.poster`.
- **golden fixture → api/plugin**: `internal/api/testdata/golden/missing_art.json` — rows keyed by sample URL carrying the expected verdicts for both predicates; both suites fail on a one-sided change.
- **regen artifacts**: swag annotations on the new routes → `internal/web/api/openapi.{json,yaml}`; SPA build → `internal/web/dist`. Both regenerated inside the change (qa-closeout group).

## Risks / Trade-offs

- [Same-URL upstream drift serves stale bytes forever] → accepted (no-TTL consequence); the override family is the operator escape hatch; revisit on a real staleness report.
- [A dead URL costs one upstream attempt per cooldown window until its namespace refreshes away] → stated residual; in-memory cooldown bounds the cost without negative-row state.
- [Store and api sit at their 12-export budget ceiling] → both groups land zero-export additions (primitive-signature methods, unexported handlers/wire structs); the check gate re-proves it per box.
- [Placeholder predicate duplication could drift] → the committed golden fixture pins both sides; one-sided drift fails a suite by construction.
- [TV webkit caching of Authorization-bearing art responses] → the LRU owns revocation and the server never relies on shared caches (`private`); remount network-count is the verification protocol.
- [Hotlinked unstaged candidate thumbnails bypass the binary] → contractual, admin-only, lazy + onError-hide inside the overlay only (AC5's named exception).

## Migration Plan

Fully additive: DDL rides schemaSQL (`CREATE TABLE IF NOT EXISTS`), the wire gains routes and one `omitempty` field, the janitor folds `streams` in unchanged. No data migration — the 16 existing placeholder rows become honest through the walk-side skip alone. Rollback = revert the change; the tables and art dirs are inert leftovers.

## Open Questions

None open — the draft's deferred items are recorded as Non-Goals with their recommended defaults (cast-portrait overrides, upstream drift, refetch verb, negative rows, server SVG, blocking fetch-on-miss).
