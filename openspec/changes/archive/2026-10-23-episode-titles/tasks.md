# tasks - episode-titles

<!-- planner-authored index: wf edits this file only through the authoring verbs; the ledger holds claim state -->

## g1 - Plugin + contract: additive ConvertResult episode titles; shikimori anchored episodes fetch + ru-first contributions

- [ ] 1.1 Additive proto: ConvertResult episode_titles + EpisodeTitle, regenerated
- [ ] 1.2 shikimori BuildRequest: the anchored plan attaches the episodes fetch after roles
- [ ] 1.3 shikimori Convert: the episodes payload maps into ru-first per-episode contributions

## g2 - Core routing: series-run episode-title routing onto episode docs, strip cascade, guard re-pin

- [ ] 2.1 enrich routing: a series run writes its episode-title entries onto matching episode documents
- [ ] 2.2 enrich reenrichScope: explicit series-row strips cascade to their episode items
- [ ] 2.3 Guard re-pin to this change proto commit

- [ ] 2.4 Reconcile TestShikimoriJoint anchored-leg pin to the two-extra plan
- [ ] 2.5 Reconcile TestIdentifyMatchJoint request pin to the episodes extra
- [ ] 2.6 Reconcile TestQAMediaDataJoint request pin to the episodes extra
## g3 - QA joint: plugin to core refresh to episode documents over the real graph

- [ ] 3.1 QA joint: TestQAEpisodeTitlesJoint — series run routes titles onto episode docs over the real graph
