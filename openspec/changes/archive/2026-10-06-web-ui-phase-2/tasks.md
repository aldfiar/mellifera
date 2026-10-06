# Tasks: web-ui Phase 2b+2c

Probe CWD is the repo root. All probes are node-free (structural greps + `go build`); the only node-touching work is box 4.2 (dev-time `make web-build`), which no probe invokes. New files follow the standing 2a conventions (`docs/web-ui-phase-2/conventions.md`): Apache-2.0 headers, verbatim Go JSON field names in TS mirrors, `use<Thing>` hooks, PascalCase components / kebab-case lib files.

Dependency edges (DAG): 1→2, 1→3, 2→3, 3→4.

## 1. Browse slice — document model, items client, routes, browse panel

- [x] 1.1 Create `web/src/lib/document.ts` — pure (no React imports) §3.1 document model per design Interfaces: types `ItemDocument`, `SourceNamespace`, `ViewEntry`, `ProvenanceEntry`, `StageEntry` (incl. `advanced_to` + optional `error`, mirroring `internal/enrich/enrich.go:137-149`) and read-only accessors `sourcesOf`, `viewEntries`, `provenanceEntries`, `stageEntries`; no collapsing, no rounding; Vitest unit test co-located [probe:b6badf161ec80d19]
- [x] 1.2 Extend `web/src/lib/api.ts` (types `ItemDTO`/`ItemsResponse`/`ItemResponse` with field names verbatim per `internal/api/handlers.go:129-139`; `ENDPOINTS.items`/`ENDPOINTS.item`; `listItems({library, status?, limit?, offset?})` — `library` required integer — and `getItem(id)`) + `web/src/lib/queries.ts` (`useItems` keyed `["items", params]`); extend the Vitest api/queries tests [probe:b60a9bba64675000]
- [x] 1.3 Add `web/src/components/AppNav.tsx` (NavLink to `/browse` + `/admin`); wire `App.tsx`: add `/browse` + `/items/:id` under `<RequireAuth>`, flip the `/` and `*` `<Navigate>` targets from `/admin` to `/browse`; render `AppNav` in the Admin shell header [probe:c2f94b26c5460662]
- [x] 1.4 Create `web/src/pages/browse/Browse.tsx` — library selector (default first library via `useLibraries`), status filter (all + new/pending/parsed/enriched/failed/ready/stale), offset pagination (page size 50), item table (title from `_view` via `viewEntries`, plus relative_path/media_type/status); minimal inline loading/error handling (shared states land in group 3) [probe:2ae516b0a9b2e959]

## 2. Detail slice — item detail + metadata rendering

> Depends on: Group 1

- [x] 2.1 Create the metadata component tree `web/src/components/metadata/{SourceCard,JsonValue,ProvenanceBadge,ViewFields,StagesProgress}.tsx` (props per design Interfaces; `<JsonValue>` recursive + lossless; text/structured children only) + `useItem(id)` hook in `queries.ts` (key `["item", id]`) + `web/src/pages/browse/ItemDetail.tsx` happy path: identifiers, one `SourceCard` per `sources.<plugin>` namespace, `ViewFields` for `_view`, `ProvenanceBadge` per `_provenance` entry, `StagesProgress` for `_stages`; Vitest tests for the components + document accessors [probe:b79d00b806de225d]
- [x] 2.2 ItemDetail error edges: 404 `not_found` → clear not-found state (not a crash); other failures → canonical error surfaced inline; Vitest case for the 404 branch [probe:d0dcdd62531c5b69]
- [x] 2.3 Fidelity guard over the finished detail slice: confirm no rounding/locale reformatting and no `dangerouslySetInnerHTML` anywhere in the rendering layer; fold any violation back into the components [probe:b973f85a13db4470]

## 3. Polish — states, responsive, theming, a11y

> Depends on: Groups 1, 2

- [x] 3.1 Create `web/src/components/states.tsx` (`LoadingState`, `EmptyState message`, `ErrorState error: ApiError` rendering `error.code` + `error.message`, retry affordance when `retryable`) and apply to Browse + ItemDetail in place of the inline handling [probe:6d844211492488f4]
- [x] 3.2 Responsive layout pass: browse + detail pages (and the admin pages where needed) reflow at mobile widths via Tailwind breakpoints; no horizontal overflow [probe:9f35857314b49244]
- [x] 3.3 Dark mode: `darkMode: "class"` confirmed in `web/tailwind.config.ts`; create `web/src/components/ThemeToggle.tsx` (persist `"light"|"dark"` under localStorage `mellifera.theme`; apply the `dark` class on `document.documentElement` on toggle and on boot) and mount it in `AppNav` [probe:d3b16f91acb5cda2]
- [x] 3.4 Keyboard accessibility pass over admin + browse surfaces: logical focus order, visible focus states, aria labels on icon-only controls [unprobeable]

## 4. QA + delivery — joint contracts, gate, embedded build

> Depends on: Group 3

- [x] 4.1 Joint SPA↔API contract regression: confirm/extend the Go integration coverage for the items contract the SPA consumes (list with `library` required + `status`/`limit`/`offset` params; detail full-document + 404) — additive test files only, zero production Go changes — then run the node-free gate `make build && make check && make test` green [probe:288ac5d45de8c35e]
- [x] 4.2 Regenerate the embedded build (`make web-build`) and commit `internal/web/dist/` so the served SPA carries the browse/detail routes (Go embed directive untouched) [probe:9dd1b65255bacdf4]
- [x] 4.3 Close-out inspection: re-run every probe in this change node-free from the repo root and confirm the UNPROBEABLE keyboard-a11y scenario by inspection [unprobeable]
