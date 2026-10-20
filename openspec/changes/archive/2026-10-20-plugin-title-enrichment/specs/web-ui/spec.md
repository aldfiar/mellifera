# Spec Delta

## MODIFIED Requirements

### Requirement: SPA consumes only pre-existing endpoints

The SPA SHALL be a pure HTTP client over the versioned API — calling only
`GET /api/v1/libraries`, `POST /api/v1/libraries`, `PATCH
/api/v1/libraries/{id}`, `GET /api/v1/libraries/{id}/summary`,
`GET /api/v1/libraries/{id}/folders`, `POST /api/v1/libraries/{id}/scan`,
`POST /api/v1/libraries/{id}/refresh`, `GET
/api/v1/libraries/{id}/enrich/preview`, `GET /api/v1/items`, `GET
/api/v1/items/{id}`, `PUT /api/v1/items/{id}/parsers`, `DELETE
/api/v1/items/{id}/parsers`, `GET /api/v1/items/{id}/media`, `GET
/api/v1/series`, `GET /api/v1/series/{id}`, `GET /api/v1/series/{id}/episodes`,
`GET /api/v1/progress`, `PUT /api/v1/progress/{item_id}`, `GET
/api/v1/admin/status`, `GET /api/v1/items/{id}/playback`, `POST
/api/v1/items/{id}/play`, `PUT /api/v1/series/{id}/title`, `DELETE
/api/v1/series/{id}/title`, `PUT /api/v1/items/{id}/title`, `DELETE
/api/v1/items/{id}/title`, `GET /api/v1/admin/sources`, `PATCH
/api/v1/admin/sources/{plugin_id}`, `POST /api/v1/admin/sources/preview`, `PUT
/api/v1/libraries/{id}/sources/{plugin_id}`, and `DELETE
/api/v1/libraries/{id}/sources/{plugin_id}` — with wire shapes mirrored
verbatim. Media loads (originals, thumbs, and `?variant=sidecar` subtitle
bytes) SHALL go through the authenticated fetch wrapper into object URLs (an
`<img>`/`<track>` channel cannot carry the bearer header), keeping the media
endpoint's bearer gate intact. Every new SPA consumer SHALL keep the
byte-identical Go contract posture: no client-side shaping that the server
does not send.

#### Scenario: No off-contract calls

- **WHEN** the SPA's network calls are audited and the Go tree is built
- **THEN** every app call targets one of the allowlisted `/api/v1` routes and `go build ./...` succeeds

<!-- wf:probe id=6c03f9c2829e0509 -->
```bash
set -e
go build ./...
violations=$(grep -rnE "fetch\(|['\"]/api/" web/src --include="*.ts" --include="*.tsx" \
  | grep -v "\.test\." \
  | grep -vE "/(items|libraries|series|progress|admin/(status|sources))" \
  | grep -vE "fetch\(path") || true
test -z "$violations"
cd web && npx vitest run && npx tsc --noEmit
```
<!-- /wf:probe -->

#### Scenario: Items client mirrors the wire contract
- **WHEN** the SPA's API client is inspected for the items endpoints
- **THEN** listItems and getItem target the pre-existing `/api/v1/items` routes and the ItemDTO fields match the Go JSON tags verbatim

<!-- wf:probe id=b60a9bba64675000 -->
```bash
set -e
grep -q "listItems" web/src/lib/api.ts
grep -q "getItem" web/src/lib/api.ts
grep -q "schema_version" web/src/lib/api.ts
grep -q "relative_path" web/src/lib/api.ts
grep -q "media_type" web/src/lib/api.ts
```
<!-- /wf:probe -->

### Requirement: Serial title fallback chains

The serial collection surface SHALL render the server-composed `display_name`
on every series card and episode row — the fallback chain (the stored manual
override first, else the best plugin-provided title carried by the document,
else the raw directory name / the document floor) SHALL be resolved by the api
alone; the client MUST NOT re-implement it and SHALL NOT carry per-surface
copies of the chain. The client MAY floor only as specified: on the
menu-bearing item cards (episode rows, movie cards) a served `display_name`
that is empty or equals the item's relative_path final segment renders the
extension-less filename stem in the normal title style plus a muted
"Not identified" line (superseding the earlier "floor-empty renders empty,
never a client-side fallback" contract); a file-backed series whose
`display_name` is its own filename renders the stem WITHOUT the marker (no
menu is offered on series identity); a directory-backed series card renders
its `display_name` verbatim — a directory name is never stemmed. An operator
override that happens to equal the filename wears the marker (accepted,
self-inflicted, not special-cased). Rename affordances SHALL be offered from
the series card's menu and from each episode row's menu: submitting a name
PUTs the title route, clearing the custom name DELETEs it and the display
returns to the served chain value, and canonical errors surface inline
without auto-retry. The ONE sanctioned exception is the Sources admin
preview mirror: a client `naming.ts` walk fed by server-served inputs and
pinned to the shared golden fixture MAY resolve the plugin-title walk for
preview rendering only — a mirror of the composer, not a second chain, and
it MUST stay fixture-pinned.

#### Scenario: Series title falls back through the chain

- **WHEN** the series grid renders a series carrying a manual override, a series whose document carries only the parser title, and a series whose document carries neither
- **THEN** the three cards display the served `display_name` values — the override, the parser title, and the raw directory name — without the client resolving any chain itself

<!-- wf:probe id=b4b7bfc14f02a737 -->
```bash
set -e
go test ./internal/api -run TestSeriesDisplayName -count=1
cd web && npx vitest run src/pages/collections/Collection.test.tsx
```
<!-- /wf:probe -->

#### Scenario: Rename sets and clears an override

- **WHEN** the operator renames a series from its card and then clears the custom name, and separately submits an invalid name
- **THEN** the card PUTs the series title route and the displayed title follows it, clearing DELETEs the override and the display returns to the chain value, and the invalid submission surfaces the canonical error inline without auto-retry

<!-- wf:probe id=4f52eb9b1c948be9 -->
```bash
set -e
grep -q "setSeriesTitle\|setItemTitle" web/src/lib/api.ts
grep -q "deleteSeriesTitle\|deleteItemTitle" web/src/lib/api.ts
cd web && npx vitest run src/pages/collections/Collection.test.tsx
```
<!-- /wf:probe -->

#### Scenario: Episode rows title through the same chain

- **WHEN** the episode flow renders one overridden episode, one episode whose facts and series compose a name, and one episode carrying neither facts nor a title
- **THEN** the rows display the served `display_name` — the override and the composed name verbatim as served, and the empty floor as the extension-less stem plus the muted "Not identified" marker — per the floor rule, never a client-resolved chain

<!-- wf:probe id=a03a93181a216e6a -->
```bash
set -e
cd web && npx vitest run src/pages/collections/Collection.test.tsx
```
<!-- /wf:probe -->

#### Scenario: File-backed series floor to the stem without a marker

- **WHEN** the series grid renders a file-backed series whose served `display_name` is its own filename beside a directory-backed series whose `display_name` is the raw directory name
- **THEN** the file-backed card renders the extension-less stem with no marker and the directory-backed card renders its `display_name` verbatim — never a stemmed directory name

<!-- wf:probe id=96de26cc2dc61a10 -->
```bash
set -e
cd web && npx vitest run src/pages/collections/Collection.test.tsx
```
<!-- /wf:probe -->

## ADDED Requirements

### Requirement: Sources admin surface

The SPA SHALL offer a Sources admin surface beside the Collections panel:
one row per loaded plugin showing its display name, health chip, serial-chain
position, and per-module effective-enabled state, each togglable — a module
toggle PATCHes `/admin/sources/{plugin_id}` and a Collection-scope toggle
PUTs/DELETEs the library gate route. A toggle response's queued count SHALL
render inline ("re-enriching N items") and canonical errors SHALL surface
inline without auto-retry. The surface SHALL offer a composition preview that
POSTs the hypothetical gate vector and renders the before/after name pairs
symmetrically, marking `no_data` rows. The surface SHALL consume the served
`title_sources` presentation pairs for chain display — it MUST NOT resolve
gates client-side.

#### Scenario: Toggling a source surfaces the queued count and errors

- **WHEN** the operator disables a source module-wide, re-enables it, and separately a toggle is refused by the server
- **THEN** the disable renders its queued count of 0 without a wake notice, the enable renders its queued count inline, and the refused toggle surfaces the canonical error inline without auto-retry

<!-- wf:probe id=28499782454703ae -->
```bash
set -e
cd web && npx vitest run src/pages/admin/Sources.test.tsx && npx tsc --noEmit
```
<!-- /wf:probe -->

#### Scenario: Preview renders before and after symmetrically

- **WHEN** the operator requests a preview for a hypothetical disable from the Sources surface
- **THEN** the response renders each row's before and after names side by side with `no_data` rows marked, and the surface sends no gate write in doing so

<!-- wf:probe id=68706750c7ddedd3 -->
```bash
set -e
cd web && npx vitest run src/pages/admin/Sources.test.tsx && npx tsc --noEmit
```
<!-- /wf:probe -->

### Requirement: The Go gate runs node-free

The Go gate SHALL stay green node-free: committed artifacts embedded, no
node/npm/swag step in the gate; `make web-build` SHALL stay dev-time (OpenAPI
and web dist regenerate at LANDING, never in a probe).

#### Scenario: The change's full Go gate stays green

- **WHEN** the change's Go gate runs from the repo root — `make build check test lint`
- **THEN** it exits 0 node-free

<!-- wf:probe id=ebd254ceacffd32c -->
```bash
make build check test lint
```
<!-- /wf:probe -->
