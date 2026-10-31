# tasks - recommendation-sorting

<!-- planner-authored index: wf edits this file only through the authoring verbs; the ledger holds claim state -->

## model - internal/recs pure score model

- [ ] 1.1 internal/recs: score function, tag normalization, ordering helper, tier constants (table-driven tests: tier dominance, cap, stacking, alphabetical tiebreak, zero-interest floor)
- [ ] 1.2 internal/store: watched_items + tag_weights DDL (schemaSQL additive) + primitive-signature methods (InsertWatched idempotent, ListUnappliedWatched, ApplyTagWeights tx, ListTagWeights)

## learn - completion detection + recs janitor task

- [ ] 2.1 cmd/mellifera: OnProgress fan-out (thumb re-grab + watch detector: duration from ffprobe blob, ≥ 90% rule, log-and-skip, wake poke)
- [ ] 2.2 cmd/mellifera: janitor task `recs` (boot-run + 60 s tick + wake channel; unapplied sweep → resolve tags via chain genres, episode→series join → weight += 1 tx → stamp applied)
- [ ] 2.3 Restart/idempotency probes: unstamped resume, stamped skip, rewatch no-op, no-duration never-completes

## serve - scored ordering in api

- [ ] 3.1 internal/api: recs composition over batched reads; series listing + item listing score-desc default, sort=path opt-out; rec_score omitempty on seriesDTO/itemDTO
- [ ] 3.2 internal/api: progress list rec_score + score-desc/recency order, sort=recent opt-out; single-item route carries rec_score
- [ ] 3.3 Golden/ordering tests: started-serial-with-new-episode tops grid; completed item skips resume bonus; photo library + episode table order untouched

## web - SPA consumes served order

- [ ] 4.1 Continue row renders served order (drop client re-sort if any); Next up orders by served rec_score (Home.tsx + Home.test.tsx) — interim: browse-scale GET /home supersedes the home rail (design D8 amendment)

## qa-closeout - joint itest, regen, glossary

- [ ] 5.1 Joint itest: enrich→watch→janitor apply→scored serve (weighted genres outrank equal-count unweighted; completion ledger idempotent)
- [ ] 5.2 Swagger regen (committed OpenAPI: rec_score fields + sort params) + rebuild committed SPA dist (PATH="$HOME/go/bin:$PATH" make web-build)
- [ ] 5.3 GLOSSARY: Recommendation score, Watched (completed) entries
- [ ] 5.4 Gates: make build/check/test/lint; web vitest + tsc; scripts/check.sh
