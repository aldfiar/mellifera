## MODIFIED Requirements

### Requirement: Item detail view

The SPA SHALL offer an `/items/:id` route (wrapped in `<RequireAuth>`) that
fetches the pre-existing `GET /api/v1/items/{id}` and renders the §3.1
document in two visual tiers. The **Details** surface renders directly on
the page: Tier-1 `identifiers`, the core-managed item fields, and
`<ViewFields>` for `_view` entries (value + source + reason) — the
viewer-facing reading view. The **Technical details** section — one
`<SourceCard>` per `sources.<plugin>` namespace, a `<ProvenanceBadge>` per
`_provenance` entry, and `<StagesProgress>` for `_stages` entries (stage,
plugin_id, status, advanced_to, started_at, finished_at, error?) — SHALL be
collapsed (hidden) until the operator expands its disclosure, and SHALL
render those tiers exactly as before once expanded: verbatim values,
per-source namespaces never merged. The Details surface SHALL lead with the
item's own media image when one is resolvable — the frame-grabber thumb fact
(`sources["frame-grabber"].thumbnail_path`), else the original
(`parsed.absolute_path`) for an image-typed item — fetched through the
authenticated media channel at content-column width, aspect preserved; an
item whose media cannot render as an image (a video without the thumb fact,
a document with no media facts) SHALL render no hero image and no
broken-image state. A missing item (404 not_found) SHALL render a clear
not-found state, not a crash. The page SHALL follow the media-first ladder:
the media stage is the dominant surface (for video-typed items a two-column
arrangement — media stage with the play affordance LEFT, identity column
RIGHT; for image-typed items the photo IS the page, full-width) with the
identity block — element name, raw path, and the module's mandatory identity
badges per `identity_fields` — beside/below it, and the parser-ordered
metadata footer (`ParserFooter`, per the parser-display capability) between
the identity block and the Technical details disclosure.

#### Scenario: All document tiers render
- **WHEN** the operator opens `/items/:id` for an enriched item carrying identifiers, sources, _view, _provenance, and _stages and expands the Technical details disclosure
- **THEN** the Details surface renders the core fields, identifiers, and view fields, and the expanded disclosure renders one card per source namespace, one badge per provenance entry, and the stage progress including any per-stage error

<!-- wf:probe id=baed5580f9176115 -->
```bash
set -e
test -f web/src/pages/browse/ItemDetail.tsx
for c in SourceCard JsonValue ProvenanceBadge ViewFields StagesProgress; do
  test -f "web/src/components/metadata/$c.tsx"
done
for c in SourceCard ProvenanceBadge ViewFields StagesProgress; do
  grep -q "$c" web/src/pages/browse/ItemDetail.tsx
done
grep -q "identifiers" web/src/pages/browse/ItemDetail.tsx
```
<!-- /wf:probe -->

#### Scenario: Technical details collapsed by default
- **WHEN** the operator opens `/items/:id` for an enriched item
- **THEN** the core fields, identifiers, and view fields render immediately while sources, provenance, and pipeline stages stay hidden until the Technical details disclosure is expanded

<!-- wf:probe id=280103bdebbb44df -->
```bash
set -e
grep -qiE '<details|technical' web/src/pages/browse/ItemDetail.tsx
```
<!-- /wf:probe -->

#### Scenario: Hero image leads the details surface
- **WHEN** the operator opens `/items/:id` for an item whose document carries the frame-grabber thumb fact or, for an image-typed item, the original-path fact
- **THEN** the Details surface leads with that image fetched through the authenticated media channel (thumb variant only for the thumb fact, original only for an image-typed item) at content-column width with its aspect preserved, while an item whose media cannot render as an image renders no hero image and fires no media request

<!-- wf:probe id=d209cc37dda978ea -->
```bash
set -e
grep -q "useItemMedia" web/src/pages/browse/ItemDetail.tsx
grep -q "ENDPOINTS.itemMedia" web/src/pages/browse/ItemDetail.tsx
grep -q "hasFrameGrabberThumb" web/src/pages/browse/ItemDetail.tsx
grep -q "hasOriginalFile" web/src/pages/browse/ItemDetail.tsx
grep -q 'media_type === "image"' web/src/pages/browse/ItemDetail.tsx
grep -qi "hero" web/src/pages/browse/ItemDetail.test.tsx
```
<!-- /wf:probe -->

#### Scenario: Missing item renders not-found
- **WHEN** the operator opens `/items/:id` for an id that does not exist and the API answers 404 not_found
- **THEN** the page renders a not-found state instead of the detail view

<!-- wf:probe id=d0dcdd62531c5b69 -->
```bash
set -e
grep -q "404" web/src/pages/browse/ItemDetail.tsx
grep -qiE "not.?found" web/src/pages/browse/ItemDetail.tsx
```
<!-- /wf:probe -->

#### Scenario: Media-first arrangement on a video item

- **WHEN** the operator opens a film or episode whose document carries the thumb fact
- **THEN** the page leads with the media stage carrying the play affordance, with the identity column (element name, raw path, mandatory identity badges, resume/progress row) beside it and the parser-ordered footer between the identity block and the Technical details disclosure

<!-- wf:probe id=0fbfc7bc48168bfb -->
```bash
set -e
grep -q "ParserFooter" web/src/pages/browse/ItemDetail.tsx
grep -qiE "play|resume" web/src/pages/browse/ItemDetail.tsx
grep -q "media-first\|mediaFirst\|element-stage" web/src/pages/browse/ItemDetail.tsx
```
<!-- /wf:probe -->

#### Scenario: Photo page is the photo

- **WHEN** the operator opens an image-typed item
- **THEN** the photo renders as the dominant full-width surface with the identity line and parser-ordered footer beneath it

<!-- wf:probe id=c831cad5cd9dbc55 -->
```bash
set -e
grep -q 'media_type === "image"' web/src/pages/browse/ItemDetail.tsx
grep -q "ParserFooter" web/src/pages/browse/ItemDetail.tsx
```
<!-- /wf:probe -->

### Requirement: SPA consumes only pre-existing endpoints

The SPA SHALL be a pure HTTP client over the versioned API — calling only
`GET /api/v1/libraries`, `POST /api/v1/libraries`, `PATCH
/api/v1/libraries/{id}`, `GET /api/v1/libraries/{id}/summary`,
`GET /api/v1/libraries/{id}/folders`, `POST /api/v1/libraries/{id}/scan`,
`GET /api/v1/items`, `GET /api/v1/items/{id}`, `PUT
/api/v1/items/{id}/parsers`, `DELETE /api/v1/items/{id}/parsers`,
`GET /api/v1/items/{id}/media`, `GET /api/v1/series`,
`GET /api/v1/series/{id}`, `GET /api/v1/series/{id}/episodes`, `GET
/api/v1/progress`, `PUT /api/v1/progress/{item_id}`, and `GET
/api/v1/admin/status` — with wire shapes mirrored verbatim. Media loads
SHALL go through the authenticated fetch wrapper into object URLs (an
`<img>` channel cannot carry the bearer header), keeping the media
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
  | grep -vE "/(items|libraries|series|progress|admin/status)" \
  | grep -vE "fetch\(path") || true
test -z "$violations"
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

## ADDED Requirements

### Requirement: Element browsing

The element page SHALL offer previous/next browsing within the ordered
collection view the operator navigated from: `←/→` keys and on-screen
chevrons move to the previous/next element with wrap-around at the edges, a
position counter (n / N) shows the place in the view, and the keyboard hint
is rendered on the page. Every photo tile, film card, and episode row SHALL
navigate to its own item (not only the first), and the detail page SHALL
open at that item's position in the view. Browsing SHALL NOT refetch the
item beyond the ordinary single-item fetch; navigation is a view operation.
Series-level pages stay hierarchical — browsing lives in the episode list.

#### Scenario: Arrows browse with wrap-around

- **WHEN** the operator presses `→` on the last photo of the loaded view and then `→` again from the counter's wrap edge
- **THEN** the page advances to each next photo in view order, wraps from the last to the first, and the counter reflects every move

<!-- wf:probe id=f7828854518d4efe -->
```bash
set -e
grep -q "ArrowRight" web/src/pages/browse/ItemDetail.tsx
grep -q "ArrowLeft" web/src/pages/browse/ItemDetail.tsx
grep -qiE "wrap" web/src/pages/browse/ItemDetail.tsx
grep -qi "browse" web/src/pages/browse/ItemDetail.test.tsx
```
<!-- /wf:probe -->

#### Scenario: Every tile opens its own item at its position

- **WHEN** the operator opens the third photo tile of a photo collection, then a film card, then an episode row
- **THEN** each opens that exact item as the detail page with the counter showing its position in the navigated view

<!-- wf:probe id=4fbcf412bcbaa05e -->
```bash
set -e
grep -qE "data-p|position|index" web/src/components/PhotoTile.tsx web/src/pages/collections/*.tsx 2>/dev/null || grep -qrnE "state.*position|navigate.*items/" web/src/pages web/src/components
grep -qiE "counter|position" web/src/pages/browse/ItemDetail.tsx
```
<!-- /wf:probe -->

### Requirement: Photo slideshow

The photo detail page SHALL offer a slideshow affordance (button and the
`S` key) that auto-advances through the loaded view on a fixed interval
(~2.5s), toggling to a pause affordance while running. Manual previous/next
navigation SHALL reset the interval. `Esc` SHALL stop a running slideshow
first and only navigate back when it is not running; leaving the photo page
SHALL always stop it. Slideshow state SHALL NOT survive navigation —
returning to the page starts paused.

#### Scenario: Slideshow advances and pauses

- **WHEN** the operator starts the slideshow on a photo page and waits through more than one interval, then presses `S` again
- **THEN** the page advanced to the next photo (or wrapped) at roughly the interval, the affordance showed the running state, and the second `S` paused it with the current photo kept

<!-- wf:probe id=9bec8b9a5052df21 -->
```bash
set -e
grep -qiE "slideshow" web/src/pages/browse/ItemDetail.tsx
grep -qiE "slideshow" web/src/pages/browse/ItemDetail.test.tsx
```
<!-- /wf:probe -->

#### Scenario: Manual navigation resets the interval; Esc stops first

- **WHEN** the operator navigates manually while the slideshow runs, and then presses `Esc` twice
- **THEN** the first `←/→` moved to the neighbor photo without losing the running state and reset the timer, the first `Esc` stopped the slideshow on the same photo, and the second `Esc` navigated back to the collection

<!-- wf:probe id=6dbafb440f895ee6 -->
```bash
set -e
grep -q "Escape" web/src/pages/browse/ItemDetail.tsx
grep -qiE "reset" web/src/pages/browse/ItemDetail.tsx
```
<!-- /wf:probe -->
