# Design

## Context

The wf-debugger diagnosis (handoffs/wf-debugger.md, live-verified 2026-10-26) is seeded and its citations re-verified against this tree: `Settle` (internal/art/settle.go:60) only skips placeholder URLs (guard at settle.go:69) and its walk (`walkPosterURLs`, settle.go:84) reads documents without ever writing one — internal/art's only store write today is `DeleteArtFetch`. The read-side compose floors placeholders to absence in `usablePosters` (internal/api/art.go:116, placeholderPoster at art.go:70), so `GET …/posters` answers a bare empty envelope for placeholder-only series (`posters` handler, art.go:412). Item DTOs compose in `artworkFor` (art.go:196) via `itemDTOs` (handlers.go:1414) with no series fallback. On the web, `useArtworkObjectUrl`'s catch (web/src/lib/queries.ts:602-606) converts ANY failure — including the ApiError(401) that the shared fetcher's `handle401` (web/src/lib/api.ts:1426) throws after rotating — into `setResolved(null)`, the generated fallback.

Constraints that shape the design: internal/api sits AT the 12-export hard-fail boundary (New, Deps, Role, Principal, ParserBinding, ModulePresentation, PluginHealth, EnrichStats, AdminStatus, Playback, ReenrichResult, EnrichPreview) — zero new exported symbols; every new shape is unexported (INV4 wire shapes are already unexported). The missing-art prefix rule exists in three deliberate copies (plugins/shikimori/convert.go:191-218, internal/art/settle.go:24-43, internal/api/art.go:56-75) pinned by internal/api/testdata/golden/missing_art.json (TestArtWalkSkipGolden, art_test.go:717) — consolidation is NOT in scope; the export cap wins (proposal D9 posture).

## Goals / Non-Goals

**Goals:**
- Stored state becomes honest: settle strips legacy placeholder poster keys (prefix-exact, real URLs untouched).
- The overlay can distinguish "upstream has no art" from "the plugin never ran" via a served field.
- Items inherit their series' poster at compose; the wire shape is unchanged.
- A 401 on the art byte channel behaves like every other channel's 401.

**Non-Goals:**
- No consolidation/refactor of the three predicate copies (export cap wins; the goldens keep them pinned).
- No data migration outside the settle pass, no schema change, no new endpoint, no new exported Go symbol.
- No plugin-side change: the shikimori write-side drop contract is untouched.
- No batched series resolution redesign — the per-request lazy lookup rides the established MVP posture (`storedTitle`'s per-row read precedent, handlers.go:1404).

## Decisions

- **D1 — The repair rides Settle's existing shared walk, pre-GC.** The artwork invariant "share ONE document walk for settle and GC" holds: `walkPosterURLs` is reshaped to yield rows (series AND items — the walk already covers both), the strip runs over each row's document, and the settle-acquire + GC reference set derives from the REPAIRED docs (a stripped placeholder never had a fetch row, so GC economics are unaffected — the ordering is for truthfulness, not rescue). Write-back uses `store.PutSeries` (identity/id/created_at preserved by the store, series.go:63) and `store.PutItem` (file_id upsert, items.go:42); a doc is written only when the strip actually removed a key. Alternative rejected: a second walk or a separate one-shot migration task — violates the shared-walk invariant and adds a lifecycle to babysit; the boot-run-is-the-same-pass posture already covers "runs at boot".
- **D2 — The strip is the existing predicate, applied to storage.** The pure strip function reuses settle.go's own `missingArtURL` (path-prefix on the parsed URL, settle.go:37-43): a real URL whose path merely contains similar substrings outside `/assets/globals/missing` parses to a different path and is kept — the negative is pinned in the table test AND the golden. The strip is a map roundtrip + re-marshal of the document (docs are opaque TEXT, read semantically everywhere; key-order drift is harmless). A corrupt document is left untouched (tolerant floor). No new exported symbol: the strip is an unexported pure function over `json.RawMessage`.
- **D3 — The reason is a field on the unexported envelope.** `posterCandidatesResponse` (art.go:267-271) gains `Reason string \`json:"reason,omitempty"\``; served value `no_upstream_art` exactly when the document carries ≥1 namespace poster key and every such key is a placeholder (present-but-unusable ≠ never-produced). The predicate is an unexported helper beside `usablePosters`; the `posters` handler computes it from the doc it already parsed — pure delegation preserved. The swag annotation picks the field up in the regen task (3.2).
- **D4 — The series fallback lives at the compose seam, lazily.** In `artworkFor`'s item leg, a row that resolves absent (no override, no usable poster) inherits the owning series' first usable chain poster: ONE lazy `QuerySeries(ctx, libID, "")` per `itemDTOs` call, only when at least one item resolved absent (every itemDTOs caller addresses one library — handlers.go:938/1031/1353), then an unexported pure match mirroring the store's own backing derivations (series.go:184-239): exact relative path (file-backed) or the item path under the series directory (directory-backed). The inherited URL re-enters the same pendings→`Staged` flow, so it serves the proxy URL / hands off acquisition identically. A corrupt series doc floors to absence. Zero new exported symbols; `toItemDTO` untouched.
- **D5 — The 401 fix removes the mask, not the rotation.** The rotation is already single-sourced: the shared fetcher calls `handle401` (api.ts:1393-1395), which clears credentials, redirects, and throws `ApiError(401)`. The defect is `useArtworkObjectUrl`'s bare catch writing `setResolved(null)` — the fallback — over an already-rotated session. The catch distinguishes `ApiError` with status 401 and skips the fallback write (previously rendered art stays until navigation lands); every other failure keeps today's fallback. No new export from api.ts, no second redirect, `artInFlight`'s rejected-flight cleanup untouched.
- **D6 — Regeneration is a task, not an afterthought.** The repo commits embedded artifacts; the posters envelope change flows through swag into `internal/web/api` and the SPA through vite into `internal/web/dist` via `make web-build` (task 3.2, the watch-flow-polish 4.2 precedent, GOPATH/bin on PATH for swag).

## Interfaces

Cross-group contracts (groups in dependency order: 1 legacy repair → 2 served honesty → 3 web channel + regen):

- **settle repair seam (internal/art, task 1.1 → consumed by 1.2's golden):** unexported `stripPlaceholderPosters(doc json.RawMessage) (repaired json.RawMessage, changed bool)` over the shared walk; write-back `store.PutSeries`/`store.PutItem` only on `changed`. Pinned by `internal/art/settle_test.go` (the repro duty — red on base a467358) and the committed golden `internal/art/testdata/golden/poster_repair.json` (task 1.2).
- **posters reason shape (internal/api → web, task 2.1):** `GET /api/v1/{series|items}/{id}/posters` 200 envelope gains `"reason":"no_upstream_art"` (omitted otherwise) on `posterCandidatesResponse`. Producer: the `posters` handler (internal/api/art.go:412). Consumer: `PosterCandidatesDTO` (web/src/lib/api.ts:1533) + the PosterOverlay empty state — «У источника нет постера» on the served field, the generic line otherwise.
- **item compose fallback (internal/api, task 2.2):** `artworkFor(kind=item)` resolves absent rows through the owning series' chain poster (lazy per-call `QuerySeries` + pure backing match); the `itemDTO.artwork` wire contract is unchanged — additive resolution only. Reuses `usablePosters` so the placeholder skip and chain gating apply to the inherited poster identically.
- **art 401 path (web/src/lib, task 3.1):** `useArtworkObjectUrl`'s catch (queries.ts:602) branches on `ApiError` status 401 → no `setResolved(null)`; the rotation stays single-sourced in api.ts `handle401`. Pinned by `web/src/lib/queries.test.tsx` (fails on base: base writes the fallback).

## Risks / Trade-offs

- [Settle read-modify-write races a concurrent enrich refresh (lost update)] → the repair writes only when it strips (a one-time 17-doc event), the pass runs at boot before enrichment is warm, and a lost refresh is re-written by the next refresh cycle; the same RMW posture the janitor legs already accept.
- [Re-marshal reorders document keys] → documents are opaque TEXT read semantically everywhere (INV3 — the store never parses); no consumer diffs bytes; the golden roundtrip asserts semantic equality minus stripped keys.
- [Per-call QuerySeries adds a read to item pages] → lazy (only when an item resolves absent — rare post-repair), one query per call on an already store-backed handler, the `storedTitle` MVP-precedent posture.
- [Series resolution ambiguity for path shapes the store does not produce] → the pure match mirrors store/series.go's own two derivations exactly; an unmatched item floors to absence (honest, never a wrong poster).
- [The 401 mask-fix changes LRU/in-flight semantics?] → no: only the catch branch changes; the LRU and `artInFlight` cleanup paths are untouched.
- [npm/swag regen drift] → the reproducibility gate repeats: fresh rebuild leaves `git status` clean on `internal/web/dist` and `internal/web/api`.

## Migration Plan

Fully additive at the edges: settle gains a write-back leg over state it already walks; one response field; one compose fallback leg; one catch branch. Rollback = revert the branch; stripped placeholder keys cannot come back harmfully (the write side drops them on the next refresh anyway). No schema change, no config knob.

## Open Questions

None — the dispatcher's scope pinned all five legs; GATE 1 is the trim point.
