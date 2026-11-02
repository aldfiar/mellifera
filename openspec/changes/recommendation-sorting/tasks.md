# tasks - recommendation-sorting

## model - internal/recs pure score model

- [ ] 1.1 internal/recs: score function, tag normalization, ordering helper, tier constants (table-driven tests: tier dominance, cap, stacking, alphabetical tiebreak, zero-interest floor) @qa
  verify: test -f internal/recs/recs_test.go && go test ./internal/recs/ || exit 1
  qa: tests/internal/recs/recs_test.go::TestScoreTierDominance, tests/internal/recs/recs_test.go::TestScoreTagCap, tests/internal/recs/recs_test.go::TestScoreBonusStacking, tests/internal/recs/recs_test.go::TestOrderingAlphabeticalTiebreak, tests/internal/recs/recs_test.go::TestZeroInterestFloor
- [ ] 1.2 internal/store: watched_items + tag_weights DDL (schemaSQL additive) + primitive-signature methods (InsertWatched idempotent, ListUnappliedWatched, ApplyTagWeights tx, ListTagWeights) @qa
  verify: test -f internal/store/recs_test.go && go test ./internal/store/ -run '^(TestInsertWatchedIdempotent|TestListUnappliedWatched|TestApplyTagWeightsTransaction|TestListTagWeights)$' || exit 1
  qa: tests/internal/store/recs_test.go::TestInsertWatchedIdempotent, tests/internal/store/recs_test.go::TestListUnappliedWatched, tests/internal/store/recs_test.go::TestApplyTagWeightsTransaction, tests/internal/store/recs_test.go::TestListTagWeights

## learn - completion detection + recs janitor task

- [ ] 2.1 cmd/mellifera: OnProgress fan-out (thumb re-grab + watch detector: duration from ffprobe blob, ≥ 90% rule, log-and-skip, wake poke)
  verify: test -f cmd/mellifera/watch_detect_test.go && go test ./cmd/mellifera/ -run 'TestWatchDetect|TestOnProgressFanOut' || exit 1
- [ ] 2.2 cmd/mellifera: janitor task `recs` (boot-run + 60 s tick + wake channel; unapplied sweep → resolve tags via the enrich resolver (genres-of-winning-document beside ResolveGates), episode→series join → weight += 1 tx → stamp applied)
  verify: test -f cmd/mellifera/recs_janitor_test.go && go test ./cmd/mellifera/ -run 'TestRecsJanitor' || exit 1
- [ ] 2.3 Restart/idempotency probes: unstamped resume, stamped skip, rewatch no-op, no-duration never-completes
  verify: test -f cmd/mellifera/recs_probes_test.go && go test ./cmd/mellifera/ -run 'TestRecsUnstampedResume|TestRecsStampedSkip|TestRecsRewatchNoop|TestRecsNoDurationNeverCompletes' || exit 1

## serve - scored ordering in api

- [ ] 3.1 internal/api: recs composition over batched reads; series listing + item listing score-desc default, sort=path opt-out; item listing scores the full filtered set then windows in the handler (offset/limit in Go — no SQL-window order under the score default); rec_score omitempty on seriesDTO/itemDTO
  verify: test -f internal/api/recs_ordering_test.go && go test ./internal/api/ -run 'TestListSeriesScored|TestListItemsScored|TestListItemsSortPath' || exit 1
- [ ] 3.2 internal/api: progress list rec_score + score-desc/recency order, sort=recent opt-out; single-item route carries rec_score
  verify: test -f internal/api/progress_recs_test.go && go test ./internal/api/ -run 'TestListProgressRecScore|TestListProgressSortRecent|TestGetProgressRecScore' || exit 1
- [ ] 3.3 Golden/ordering tests: started-serial-with-new-episode tops grid; completed item skips resume bonus; photo library keeps path order (server branches on the library row's ModuleID — internal/store/libraries.go:21 — forcing path order for photo-scanner modules) + episode table order untouched
  verify: test -f internal/api/recs_golden_test.go && go test ./internal/api/ -run 'TestGolden' || exit 1

## web - SPA consumes served order

- [ ] 4.1 Continue row renders served order (drop client re-sort if any); Next up orders by served rec_score (Home.tsx + Home.test.tsx) — interim: browse-scale GET /home supersedes the home rail (design D8 amendment)
  verify: grep -q 'rec_score' web/src/lib/nextup.test.ts && grep -q 'rec_score' web/src/pages/home/Home.test.tsx && (cd web && npx vitest run src/lib/nextup.test.ts src/pages/home/Home.test.tsx) || exit 1

## qa-closeout - joint itest, regen, glossary

- [ ] 5.1 Joint itest: enrich→watch→janitor apply→scored serve (weighted genres outrank equal-count unweighted; completion ledger idempotent)
  verify: test -f internal/itest/qa_recs_roundtrip_test.go && go test ./internal/itest/ -run 'TestRecsRoundtrip' || exit 1
- [ ] 5.2 Swagger regen (committed OpenAPI: rec_score fields + sort params) + rebuild committed SPA dist (PATH="$HOME/go/bin:$PATH" make web-build)
  verify: PATH="$HOME/go/bin:$PATH" make web-build && grep -q 'rec_score' internal/web/api/openapi.json || exit 1
- [ ] 5.3 GLOSSARY: Recommendation score, Watched (completed) entries
  verify: grep -q 'Recommendation score' GLOSSARY.md && grep -q 'Watched (completed)' GLOSSARY.md || exit 1
- [ ] 5.4 Gates: make build/check/test/lint; web vitest + tsc
  verify: make build && make check && make lint && (cd web && npx vitest run && npx tsc --noEmit) || exit 1
