## MODIFIED Requirements

### Requirement: Continue and Next up surfaces

The home surface SHALL render a **Continue** row from
`GET /api/v1/progress`: one card per item with `position_seconds > 0`, ordered
by recency, showing a progress bar, remaining-time or percent label, source
collection, and a Play affordance — plus the item's frame-grabber thumb preview
(loaded through the authenticated media fetch, the same pattern as the
collection card's preview) and a real name: a serial-library episode SHALL
resolve its series record (`GET /series?library={id}`, matched by the episode's
`parsed.series_relative_path`, sharing the collection page's series cache) and
render `<series title> · SxxEyy`; a tv-module item SHALL keep `viewTitle`. An
item whose document carries no thumb fact SHALL keep the honest badge-only card
— never a broken-image state. The **Next up** row SHALL key on SERIES RECORDS
instead of episode-carried titles: each progress item maps through its library
and `parsed.series_relative_path` to its series row, the series' episodes load
once per started series (`GET /series/{id}/episodes`, cached), and the offered
episode is the lowest `(season, episode)` strictly after the highest-started
one — the skip-aware reading of "no progress record": with sequential viewing
the two readings coincide, and the derivation never suggests an episode the
viewer has already moved past. Next-up cards SHALL render the series title, an
`SxxEyy` chip, and the episode's thumb; tv-module films never enter Next up
(it is an episode concept — films surface via Continue). Each card carries a
Play affordance; until the playback capability ships, Play SHALL deep-link to
the item's detail page — the surfaces MUST NOT attempt inline streaming. Both
rows SHALL render shared empty states when the progress list is empty.

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

- **WHEN** the home surface renders an in-progress serial episode whose series record resolves and whose document carries the thumb fact, alongside an episode with no thumb fact and a tv-module film
- **THEN** the serial episode card shows the thumb preview and `<series title> · SxxEyy`, the no-thumb item keeps the honest badge-only card, and the film keeps its `viewTitle`

<!-- wf:probe id=b64772ba8f0655ba -->
```bash
set -e
cd web && npx vitest run && npx tsc --noEmit
```
<!-- /wf:probe -->

#### Scenario: Next up derives from series records and their episode lists

- **WHEN** Continue touches episodes of a series whose episode list holds later-numbered episodes
- **THEN** Next up offers the lowest `(season, episode)` strictly after the highest-started one, rendered with the series title, the `SxxEyy` chip, and the episode thumb — a film item never enters Next up, and the empty state renders when nothing follows

<!-- wf:probe id=e5b85e17341465f0 -->
```bash
set -e
cd web && npx vitest run && npx tsc --noEmit
```
<!-- /wf:probe -->

### Requirement: Node-free Go build gate

The Go build gate (`make build`/`check`/`lint`/`test`) SHALL stay green on a host without node by embedding committed artifacts only. `make web-build` (the swag + npm regen) SHALL be a dev-time target and SHALL NOT be a prerequisite of the gate. Changes SHALL be additive: no proto/sdk/scan/enrich contract changes.

#### Scenario: Gate green without node
- **WHEN** `make build && make check` runs on a node-less host
- **THEN** it exits 0 with no node/npm/swag invoked

<!-- wf:probe id=b0341cf7e1b1f06e -->
```bash
set -e
make build check
```
<!-- /wf:probe -->

#### Scenario: The change's full Go gate stays green

- **WHEN** the change's Go gate runs from the repo root — `make build check test lint`
- **THEN** it exits 0 node-free

<!-- wf:probe id=ebd254ceacffd32c -->
```bash
set -e
make build check test lint
```
<!-- /wf:probe -->
