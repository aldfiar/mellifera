## ADDED Requirements

### Requirement: Serial title fallback chains

The serial collection surface SHALL resolve every displayed serial title
through one fallback chain — the stored manual override first, else the best
plugin-provided title carried by the document (the ordered source
namespaces, then `_view`), else the floor: the serial directory name for a
series and the file name for an episode. Rename affordances SHALL be
offered on the series card and on each episode row: submitting a name PUTs
the title route, clearing the custom name DELETEs it and returns the
display to the chain value, and canonical errors surface inline without
auto-retry. The episode flow SHALL apply the same chain, so an episode
displays beyond its raw file name only when a plugin or the user provides a
title.

#### Scenario: Series title falls back through the chain

- **WHEN** the series grid renders a series carrying a manual override, a series whose document carries only the parser title, and a series whose document carries neither
- **THEN** the three cards display the override, the parser title, and the raw directory name respectively

<!-- wf:probe id=853f22793159ea93 -->
```bash
set -e
grep -q "title_override" web/src/lib/api.ts
grep -q "titleOverride" web/src/pages/collections/Collection.tsx
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

- **WHEN** the episode flow renders one overridden episode, one episode whose document carries a parsed title, and one episode carrying neither
- **THEN** the rows display the override, the parsed title, and the file name respectively

<!-- wf:probe id=4b6c3664de7b031b -->
```bash
set -e
grep -q "episodeTitle\|titleOverride" web/src/pages/collections/Collection.tsx
cd web && npx vitest run src/pages/collections/Collection.test.tsx
```
<!-- /wf:probe -->

### Requirement: Episode watch-page track controls

The episode element page SHALL carry, beside the play affordance, a
voiceover-selection button and a subtitle-selection button. The voiceover
control SHALL list the descriptor's `voiceovers` alongside the embedded
audio; on a packaged (`hls`) build selecting a voiceover SHALL switch the
player's audio rendition without restarting the video; on a direct item the
control SHALL render disabled with a visible state naming that voiceover
switching requires the packaged build. The subtitle control SHALL list the
episode document's subtitle sidecars — labeled by the language fact, else
the containing folder name, else the file name — plus an off entry;
selecting one SHALL fetch its bytes through the authenticated media channel
(`variant=sidecar`) and render them as timed text over the playing video:
`.vtt`/`.srt` verbatim-convertible, `.ass`/`.ssa` as dialogue with timing
(styling MAY degrade), and a sidecar format the SPA cannot render (`.sub`)
listed with an explicit not-renderable state. Track selections are
per-visit state and SHALL NOT survive navigation.

#### Scenario: Subtitle sidecar renders as timed text

- **WHEN** the operator selects an `.srt` subtitle sidecar while an episode plays, lets playback pass a cue time, and then selects the off entry
- **THEN** the page fetched the sidecar through the authenticated channel, the converted timed cues render over the video at their times, and the off entry removes the rendered text

<!-- wf:probe id=67c6610f8728cd27 -->
```bash
set -e
grep -q "variant=sidecar\|variantSidecar\|sidecar" web/src/lib/api.ts
cd web && npx vitest run src/lib/subtitles.test.ts
```
<!-- /wf:probe -->

#### Scenario: Unrenderable subtitle states explicitly

- **WHEN** the operator opens the subtitle control on an episode whose sidecar facts include a `.sub` file
- **THEN** the `.sub` entry renders with an explicit not-renderable state instead of being selectable into silence

<!-- wf:probe id=b1d397901df1cf19 -->
```bash
set -e
cd web && npx vitest run src/lib/subtitles.test.ts
grep -qE "not.?renderable|unsupported" src/lib/subtitles.ts
```
<!-- /wf:probe -->

#### Scenario: Voiceover switches the audio rendition on a packaged build

- **WHEN** the operator picks the second listed voiceover on an episode playing an `hls` build, and separately opens a direct item whose document carries voiceover facts
- **THEN** the player switches to that audio rendition without restarting the video, and on the direct item the control renders disabled with a visible state naming the packaged-build requirement

<!-- wf:probe id=034765eab6e162aa -->
```bash
set -e
grep -rq "audioTrack" web/src/components/playback/
grep -q "voiceover" web/src/pages/browse/ItemDetail.tsx
cd web && npx vitest run src/pages/browse/ItemDetail.test.tsx
```
<!-- /wf:probe -->

### Requirement: Embedded build carries the serial watch surface

The committed embedded build (`internal/web/dist/`) SHALL be regenerated
from this change's `web/src` via the dev-time `make web-build` path and
committed, and the committed OpenAPI contract
(`internal/web/api/openapi.{json,yaml}`) SHALL list the four title routes —
the Go embed directive and the node-free Go build gate stay untouched.

#### Scenario: Committed dist and OpenAPI carry the watch surface

- **WHEN** the committed `internal/web/dist` bundle and the OpenAPI contract are inspected
- **THEN** `dist/index.html` and hashed `assets/*.js` exist, the bundle carries the voiceover/subtitle control and title-route literals from this build, and both OpenAPI files list `/series/{id}/title` and `/items/{id}/title`

<!-- wf:probe id=89a70056cfbff67c -->
```bash
set -e
test -f internal/web/dist/index.html
ls internal/web/dist/assets/*.js >/dev/null
grep -qrsi "voiceover" internal/web/dist/assets
grep -qrsi "subtitle" internal/web/dist/assets
for f in internal/web/api/openapi.json internal/web/api/openapi.yaml; do
  grep -qF '/series/{id}/title' "$f"
  grep -qF '/items/{id}/title' "$f"
done
```
<!-- /wf:probe -->

## MODIFIED Requirements

### Requirement: SPA consumes only pre-existing endpoints

The SPA SHALL be a pure HTTP client over the versioned API — calling only
`GET /api/v1/libraries`, `POST /api/v1/libraries`, `PATCH
/api/v1/libraries/{id}`, `GET /api/v1/libraries/{id}/summary`,
`GET /api/v1/libraries/{id}/folders`, `POST /api/v1/libraries/{id}/scan`,
`GET /api/v1/items`, `GET /api/v1/items/{id}`, `PUT
/api/v1/items/{id}/parsers`, `DELETE /api/v1/items/{id}/parsers`,
`GET /api/v1/items/{id}/media`, `GET /api/v1/series`,
`GET /api/v1/series/{id}`, `GET /api/v1/series/{id}/episodes`, `GET
/api/v1/progress`, `PUT /api/v1/progress/{item_id}`, `GET
/api/v1/admin/status`, `GET /api/v1/items/{id}/playback`, `POST
/api/v1/items/{id}/play`, `PUT /api/v1/series/{id}/title`, `DELETE
/api/v1/series/{id}/title`, `PUT /api/v1/items/{id}/title`, and `DELETE
/api/v1/items/{id}/title` — with wire shapes mirrored verbatim. Media loads
(originals, thumbs, and `?variant=sidecar` subtitle bytes) SHALL go through
the authenticated fetch wrapper into object URLs (an `<img>`/`<track>`
channel cannot carry the bearer header), keeping the media endpoint's
bearer gate intact. Every new SPA consumer SHALL keep the byte-identical Go
contract posture: no client-side shaping that the server does not send.

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
