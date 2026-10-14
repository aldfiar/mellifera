# web-ui Delta

## MODIFIED Requirements

### Requirement: Continue and Next up surfaces

The home surface SHALL render a **Continue** row from
`GET /api/v1/progress`: one card per item with `position_seconds > 0`, ordered
by recency, showing a progress bar, remaining-time or percent label, source
collection, and a Play affordance — plus the item's frame-grabber thumb preview
(loaded through the authenticated media fetch, the same pattern as the
collection card's preview) and a real name taken from the item's served
`display_name` — the server-composed chain (override → composed
`<series title> · SxxEyy` → `_view.title` floor). The client MUST NOT
re-implement the composition and SHALL carry no per-surface copies of the
chain. An item whose document carries no thumb fact SHALL keep the honest
badge-only card — never a broken-image state. The **Next up** row SHALL key on
SERIES RECORDS instead of episode-carried titles: each progress item maps
through its library and `parsed.series_relative_path` to its series row, the
series' episodes load once per started series (`GET /series/{id}/episodes`,
cached), and the offered episode is the lowest `(season, episode)` strictly
after the highest-started one — the skip-aware reading of "no progress
record": with sequential viewing the two readings coincide, and the derivation
never suggests an episode the viewer has already moved past. Next-up cards
SHALL render the series' served `display_name`, an `SxxEyy` chip rendered from
the episode's raw facts (which stay on the wire in item documents), and the
episode's thumb; tv-module films never enter Next up (it is an episode concept
— films surface via Continue). Each card carries a Play affordance; until the
playback capability ships, Play SHALL deep-link to the item's detail page —
the surfaces MUST NOT attempt inline streaming. Both rows SHALL render shared
empty states when the progress list is empty.

#### Scenario: Continue renders in-progress items with progress

- **WHEN** the progress API returns three records with positive positions
- **THEN** the Continue row renders exactly those items ordered by recency with progress bars and Play affordances that navigate to the items' detail pages

<!-- wf:probe id=b95db436defdd04e -->
```bash
set -e
grep -q 'Continue' web/src/pages/home/Home.tsx
grep -q 'progress' web/src/pages/home/Home.tsx
grep -q 'deep-link\|/items/' web/src/pages/home/Home.tsx
```
<!-- /wf:probe -->

#### Scenario: Next up derives the next unstarted episode

- **WHEN** Continue contains an episode of a series with later-numbered episodes and no progress on them
- **THEN** the Next up row offers the lowest-numbered unstarted episode of that series with a Play affordance, and renders the empty state when no such episode exists

<!-- wf:probe id=d337c75bf42912ac -->
```bash
set -e
grep -q 'Next up' web/src/pages/home/Home.tsx
go test ./internal/api -run TestProgressList
```
<!-- /wf:probe -->

#### Scenario: Continue cards carry the stop-frame thumb and the series-named title

- **WHEN** the home surface renders an in-progress serial episode whose document carries the thumb fact, alongside an episode with no thumb fact and a tv-module film
- **THEN** the serial episode card shows the thumb preview and its served `display_name` (the composed `<series title> · SxxEyy`), the no-thumb item keeps the honest badge-only card, and the film keeps its `_view.title`-floored `display_name`

<!-- wf:probe id=9b462ec5474bd157 -->
```bash
set -e
cd web && npx vitest run && npx tsc --noEmit
```
<!-- /wf:probe -->

#### Scenario: Next up derives from series records and their episode lists

- **WHEN** Continue touches episodes of a series whose episode list holds later-numbered episodes
- **THEN** Next up offers the lowest `(season, episode)` strictly after the highest-started one, rendered with the series' served `display_name`, the `SxxEyy` chip from the raw facts, and the episode thumb — a film item never enters Next up, and the empty state renders when nothing follows

<!-- wf:probe id=d157549511f54714 -->
```bash
set -e
cd web && npx vitest run && npx tsc --noEmit
```
<!-- /wf:probe -->

### Requirement: Serial title fallback chains

The serial collection surface SHALL render the server-composed `display_name`
on every series card and episode row — the fallback chain (the stored manual
override first, else the best plugin-provided title carried by the document,
else the raw directory name / the document floor) SHALL be resolved by the api
alone; the client MUST NOT re-implement it and SHALL NOT carry per-surface
copies of the chain. Rename affordances SHALL be offered on the series card
and on each episode row: submitting a name PUTs the title route, clearing the
custom name DELETEs it and the display returns to the served chain value, and
canonical errors surface inline without auto-retry.

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
- **THEN** the rows display the served `display_name` — the override, the composed name, and the empty floor — each verbatim as served

<!-- wf:probe id=314b81ef6b6ff543 -->
```bash
set -e
cd web && npx vitest run src/pages/collections/Collection.test.tsx
```
<!-- /wf:probe -->
