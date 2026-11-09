# Tasks

## 1 - api-rework: entity-grain home composition and wire

- [ ] 1.1 Add the home entity layer in internal/api/recs_ordering.go (beside the existing scorers): `homeEntities` (ONE GetItem walk over `facts.rows`, EpisodeFacts grouping by (libraryID, seriesPath), per-series started-max over ALL touched rows INCLUDING ledgered, resume-max = highest-started non-ledgered row, serve-law survival computed from the pick, ONE pre-cut QueryItemsBySeries per touched series, ledgered films/tv items dropped, rows without parseable episode facts and unresolvable/tombstoned series floored to the per-item honest entity), `scoreHomeEntities` (serial entities through the EXISTING scoreSeries fed the eps map UNIONED with the entity's touched items; films through the EXISTING scoreItems; namers built once and shared), `orderHomeEntities` (score desc, entity max touched-row updated_at desc, ser_/itm_ id floor) — pinned by new entity-level TestHomeRoute subtests; the served route stays on today's composition in this task @audit
  verify: go test ./internal/api -run 'TestHomeRoute' || exit 1
  file: tasks/1.1.md
  audit: true

- [ ] 1.2 Rework the served home route to entity grain: rewire `home()` to entities → score → order → ≤50-CARD `homeBound` cut → a per-entity `homeRows` composer (current built ONLY from the resume-max row; anchor cards skip the current block; per-library legs unchanged — batched artwork passes, storedTitle, episode-title projection, homeDurationSeconds; the second GetItem walk and the double namerFor die), change the wire to `Current *continueCurrent json:"current,omitempty"` (home.go:71), rewrite the home.go:20-26 header into the constructive resume/next contract, update the Current pointer derefs + rowHasDuration nil-guard in the existing TestHomeRoute subtests and the TestBrowseScaleJoint deref, and add the route-level entity-grain pins (watched-series anchor card with current absent via the omitempty wire probe, skip-ahead resume, caught-up-without-next drops, ledgered-only frontier serves last-known honest state, resume-outranks-anchor in one score space, 1500-vs-1000 resume pin, entity-grain bound cut, entity recency/id tiebreak, drift-union case, resume-row byte-parity, both score-shape forms) @audit
  verify: go test ./internal/api -run 'TestHomeRoute|TestBrowseScaleJoint' || exit 1
  file: tasks/1.2.md
  audit: true

## 2 - web: entity-grain rail rendering

- [ ] 2.1 Make `ContinueRow.current` optional in web/src/lib/api.ts (the hand-mirrored wire type — drift = bug), branch `ContinueCard` on `row.current` (anchor card: `series_display_name` promoted to the title slot, the Next chip as the PRIMARY affordance deep-linking `next.item_id`, library label, artwork via the existing isServedArtPath rule, NO position/percent bar/Play-into-current; resume card renders exactly as today; the client derives nothing), key rows on `series_id || current?.item_id`, and pin both branches in Home.test.tsx (an anchor-card primary-affordance case with current absent; the existing resume regressions unchanged) @qa
  verify: cd web && npx tsc --noEmit && npx vitest run src/pages/home/Home.test.tsx || exit 1
  file: tasks/2.1.md
  qa: tests/internal/api/home_test.go::TestHomeRoute/watched_series_serves_anchor_card, tests/web/src/pages/home/Home.test.tsx::renders-anchor-card-current-absent

## 3 - release: embedded artifact regen (ONE release)

- [ ] 3.1 Regenerate and stage the embedded wire/type artifacts via `make web-build` (swag openapi.json/yaml into internal/web/api from the changed Go shapes, npm run build dist into internal/web/dist — tsc --noEmit gates the build) so the server and SPA ship in ONE release; swag needs GOPATH/bin on PATH (the duty sets it itself); the regenerated artifacts are committed with the change
  verify: PATH="$PATH:$(go env GOPATH)/bin" make web-build || exit 1
