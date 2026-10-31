# Spec Delta

## ADDED Requirements

### Requirement: Pack-on-play wiring

When the playback descriptor of a video item answers mode `direct` with state
`preparing` and `state_reason` `non_native_container`, the item page SHALL
fire the play verb `POST /play` with `{retry:false}` ONCE per preparing
descriptor instance (a mutation keyed on the descriptor — never per poll
tick), and SHALL NOT hand the descriptor's play URL to the player while the
preparing state stands: the preparing state renders an explicit "Preparing…"
surface in the player's place instead of attaching the raw original to the
media element. The page SHALL refetch the descriptor on a short interval
until the state leaves `preparing`: mode `hls` mounts the ordinary packaged
player, state `failed` hands over to the existing retry affordance, and a
bounded poll window without progress SHALL render an honest still-preparing
stall state — the poll stops, the page stays explorable, and the stall is
beaconed. An `unsupported` state SHALL render the honest not-playable banner
carrying the `state_reason`'s meaning — never a player attach, never a
spinner. The play POST's canonical error surfaces inline without auto-retry.

#### Scenario: Preparing descriptor fires pack-on-play once and shows Preparing

- **WHEN** the item page opens on a video item whose descriptor answers mode `direct`, state `preparing`, `state_reason` `non_native_container`
- **THEN** the page POSTs `/play` with `{retry:false}` exactly once for that descriptor instance, renders the "Preparing…" surface instead of attaching the play URL to the media element, and starts polling the descriptor

#### Scenario: Flip to hls mounts the player; flip to failed shows retry

- **WHEN** a polled descriptor refetch answers mode `hls`, and separately a polled refetch answers state `failed` on the same item
- **THEN** the first mounts the ordinary packaged player from the new descriptor, and the second hands over to the existing retry affordance wired to `POST /play {retry:true}`

#### Scenario: Unsupported renders the honest reason banner

- **WHEN** the item page opens on a video item whose descriptor answers state `unsupported` with a `state_reason`
- **THEN** the page renders the not-playable banner naming the reason's meaning — no player attach, no spinner, no polling

#### Scenario: Poll window exhausts into an honest stall

- **WHEN** the descriptor keeps answering `preparing` past the bounded poll window (for example the server deferred the enqueue under queue backpressure)
- **THEN** the polling stops, the page renders the still-preparing stall state naming what to do next, and the stall is reported through the beacon — the page never spins forever and never pretends progress

### Requirement: Playback failure surfacing

The player SHALL surface decode and stream failures as distinct actionable
banners instead of a silent eternal spinner: in the direct lane, the media
element's error event SHALL render a banner naming the media error class
(aborted / network / decode / source-not-supported — source-not-supported is
the undecodable-container case); in the hls lane, a fatal hls.js error SHALL
render a banner carrying the error type, the error details, and the HTTP
status of the failing request when one is present. A banner SHALL clear when
the player re-attaches (a repack or re-mint swaps the play URL) and SHALL
NOT interrupt progress reporting.

#### Scenario: Direct-lane decode failure renders a distinct banner

- **WHEN** the direct floor's original is attached and the media element raises its error event with the source-not-supported class (a container the browser cannot decode)
- **THEN** the player renders the source-not-supported banner instead of spinning silently, and progress reporting keeps working

#### Scenario: Fatal hls error renders type, details, and status

- **WHEN** an hls build's playback raises a fatal hls.js error whose data names the error type and details and, for a network-class error, the failing request's HTTP status
- **THEN** the player renders the fatal banner carrying the type, the details, and the HTTP status when present — distinct from the direct-lane banner's wording

### Requirement: Playback event beacon client

On the playback failure edges it already observes — a fatal hls error, a
direct-lane media-element error, and the preparing-state stall — the SPA
SHALL send one best-effort beacon to `POST /api/v1/playback-events` with
`{item_id, mode, phase, code, detail}` through the authenticated fetch
wrapper (`phase` `fatal` / `video-error` / `stalled` matching the edge; the
payload carries data only — no token or credential material ever). A dropped
or rejected beacon SHALL be swallowed: no retry, no auto-requeue, and no
user-visible error — the beacon is never load-bearing.

#### Scenario: Failure edges send the beacon best-effort

- **WHEN** a fatal hls error fires during packaged playback, a media-element error fires during direct playback, and the preparing poll window exhausts
- **THEN** each edge sends one beacon with the matching `phase` and the observed code/detail, and a failed or rate-limited beacon send is swallowed without surfacing anything to the operator

### Requirement: Embedded build carries the playback unblock surface

The committed embedded build (`internal/web/dist/`) SHALL be regenerated
from this change's `web/src` via the dev-time `make web-build` path and
committed, and the committed OpenAPI contract
(`internal/web/api/openapi.{json,yaml}`) SHALL list `/playback-events`;
the Go embed directive and the node-free Go build gate stay untouched.

#### Scenario: Committed dist and OpenAPI carry the beacon route

- **WHEN** the committed `internal/web/dist` bundle and the OpenAPI contract are inspected
- **THEN** `dist/index.html` and hashed `assets/*.js` exist, the bundle carries the pack-on-play/beacon literals from this build, both OpenAPI files list `/playback-events`, and the committed tree stays clean after a fresh build — the committed dist IS the current build

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
/api/v1/libraries/{id}/sources/{plugin_id}`, `DELETE
/api/v1/libraries/{id}/sources/{plugin_id}`, `GET /api/v1/admin/plugins`,
`GET /api/v1/admin/plugins/{plugin_id}/logs`, and `POST
/api/v1/playback-events` — with wire shapes mirrored verbatim. Media loads
(originals, thumbs, and `?variant=sidecar` subtitle bytes) SHALL go through
the authenticated fetch wrapper into object URLs (an
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
  | grep -vE "/(items|libraries|series|progress|playback-events|admin/(status|sources|plugins))" \
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
