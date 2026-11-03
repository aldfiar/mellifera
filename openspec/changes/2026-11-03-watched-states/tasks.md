# Tasks — watched states

## 1 - Backend: served state + rail withdrawal + completion flag

- [ ] 1.1 `internal/api`: stamp `watched,omitempty` on the item DTO — scored listing, single-item GET (gains a `recsFactsFor` composition: it reads no facts today), `sort=path` listing branches (ledger set only — no score composition, `rec_score` stays absent, path order untouched), and `GET /series/{id}/episodes` episode rows (gains the composition; narrative order kept, `rec_score` absent there) — and on the progress row DTO from the batched ledger map (`recsFacts`)
  verify: go test ./internal/api -run 'TestWatchedItemStamp' || exit 1
- [ ] 1.2 `internal/api`: series DTO `watched,omitempty` = all backing episodes ledgered, derived in the scoreSeries walk — stamped on the list, the single-series GET (same facts, wire parity with the list), and the `sort=path` series branch (ledger set only)
  verify: go test ./internal/api -run 'TestWatchedSeriesStamp' || exit 1
- [ ] 1.3 `internal/api`: `GET /progress` withdraws ledger rows by default; `?include=watched` restores them (400 on unknown values, the parseSort precedent) — in BOTH branches: the scored default AND `sort=recent` (the recent branch gains the batched ledger read + `watched` stamp; the opt-out must not resurrect withdrawn rows)
  verify: go test ./internal/api -run 'TestProgressWatchedWithdrawal' || exit 1
- [ ] 1.4 `internal/api` + `cmd/mellifera`: the progress PUT accepts optional `completed` bool; the OnProgress seam carries it; the watch-detect leg honors it regardless of the 0.9 floor (idempotent insert + janitor wake unchanged)
  verify: go test ./... -run 'TestProgressCompletedFlag' || exit 1
- [ ] 1.5 `internal/recs`: `Entry.Watched` + `Order` partitions watched last (each partition score desc → name → id); wire it in `scoredServe` callers
  verify: go test ./internal/recs -run 'TestOrderWatchedPartition' || exit 1
- [ ] 1.6 `internal/api`: `GET /progress/{item_id}` stamps `watched,omitempty` on the progress row DTO from its already-composed facts — the rec_score route was the ONE serving route missing the stamp (D1's every-serving-route law; no SPA consumer today, the wire is the contract); pin it on the single-item GET in `TestWatchedItemStamp`
  verify: go test ./internal/api -run 'TestWatchedItemStamp' || exit 1

## 2 - SPA: element states + intent writes

- [ ] 2.1 `web/src/lib/api.ts` + `web/src/lib/queries.ts`: `watched?: boolean` on Item/Series/Progress DTOs + `completed` on the progress write; `include=watched` rides the SHARED `useProgressList` query (key `["progress"]`) — ItemDetail's resume row inherits it (row set unchanged), Home keeps one fetch
  verify: sh -c 'cd web && npx tsc --noEmit' || exit 1
- [ ] 2.2 Continue rail renders only unwatched rows; anchors (startedSeries) keep consuming all rows
  verify: sh -c 'cd web && npx vitest run src/lib/watchedRows.test.ts' || exit 1
- [ ] 2.3 Watched element state: ✓ pastel mark + dimmed title + no progress bar on EpisodesView table rows, SeriesCard cards in SeriesGrid (series-poster-grid; all-watched series), ItemGrid cards (the film/tv grid — TV mode is the html.tv CSS layer over the same grids), and the element page heading
  verify: sh -c 'cd web && npx vitest run src/components/WatchedStates.test.tsx' || exit 1
- [ ] 2.4 The ended edge (AutoNext path) and SkipChip credits activation fire the progress write with `completed: true`; the flagged write BYPASSES the player's floor-second `reportedRef` dedupe (the flag forces the write); refresh MarkWatchedRow's stale rail comment in Collection.tsx (its full-duration write now crosses the 0.9 floor and ledgers — D6)
  verify: sh -c 'cd web && npx vitest run src/components/playback/completedWrite.test.tsx' || exit 1

## 3 - Tests + gates

- [ ] 3.1 Extend `qa_recs_roundtrip_test.go`: rail withdrawal + include=watched restore; completed-flag ledgering at ~50 %; grid sink partition; series watched flag; the 400-on-unknown-`include` strict parse — plus the partition's pure-leaf unit case in `internal/recs/recs_test.go`
  verify: go test ./internal/api ./internal/recs -run 'TestQa|TestOrderWatchedLeaf' || exit 1
- [ ] 3.2 Update the in-code expectation sets the change flips: `TestGoldenCompletedSkipsResumeBonus` order `mid, done, plain` → `mid, plain, done` (the partition WORKING — recs_golden_test.go), `recs_ordering_test.go` watched-film page assertions, `progress_recs_test.go` rail rows under the withdrawal, SPA wire pins in `nextup.test.ts`, and retarget `TestWatchedItemStamp`'s now-hollow progress-row stamp case to `?include=watched` (the watched row withdraws from the default listing since 1.3 — the stamp is only observable there) (testdata/golden carries none of these shapes)
  verify: go test ./internal/recs ./internal/api -run 'TestGoldenCompletedSkipsResumeBonus|Order|Progress' || exit 1
- [ ] 3.3 SPA vitest: rail filter, ✓ rendering, completed-write firing at both edges — including the `reportedRef` bypass case (the flagged write fires at an already-reported second); `tsc --noEmit` clean
  verify: sh -c 'cd web && npx tsc --noEmit && npx vitest run src/lib/watchedRows.test.ts src/components/WatchedStates.test.tsx src/components/playback/completedWrite.test.tsx src/lib/nextup.test.ts' || exit 1
- [ ] 3.4 Gates: `make build && make check && make test`; web `npm test`; `PATH="$HOME/go/bin:$PATH" make web-build` (dist + OpenAPI committed)
  verify: sh -c 'PATH="$HOME/go/bin:$PATH" make build && make check && make test && cd web && npm test && cd .. && PATH="$HOME/go/bin:$PATH" make web-build' || exit 1

## 4 - Docs + archive

- [ ] 4.1 README feature bullet (watched states) + operator runbook note if any knob lands (none planned)
  verify: grep -qi 'watched' README.md || exit 1
- [ ] 4.2 Archive the change; spec deltas merge into `recommendation-sorting` and `web-ui`
  verify: npx --yes -p @fission-ai/openspec@1.14.0 openspec validate 2026-11-03-watched-states --strict || exit 1
