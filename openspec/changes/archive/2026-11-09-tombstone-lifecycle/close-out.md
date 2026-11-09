# close-out - tombstone-lifecycle (archived 2026-11-09)

## What shipped

Full stale-item lifecycle for files removed from disk (the alatoic complaint: `itm_2_ac35ac708fe003cf` Black Clover + `itm_2_551f45dbc0302443` JoJo E03 answered the codec lie on vanished files):

- **Scan sweep** (2.2): `sweepItems` beside `sweepSeries` in the clean-drain branch — os.Stat over `parsed.absolute_path`, fs.ErrNotExist → soft tombstone (document byte-untouched); `nextScanState` self-heal (re-observed deleted → ready with namespaces carried; ffprobe-only drift drops streams; parsed change → stale).
- **Identity adoption** (2.1/2.3/2.5): store `MoveItemProgress`/`MoveItemWatched` (per-viewer NOT EXISTS slot guards, moved-row counts, idempotent); `AdoptStranded` fired at settle via nil-safe `Deps.Adopt`; **series-bridge identity** — episode pairs match only when BOTH sides' series rows (GetSeriesByPath, status-unfiltered) carry EQUAL + NON-EMPTY parser-composed series titles before the (season, episode) legs; films need equal + non-empty title floors; empty floor never matches.
- **Adoption safety** (2.6): live-only fire guard; allItems/allSeries walk exclusion (dead rows never derive or re-enrich; self-healed rows re-enter); store self-move → (0,0) before any tx.
- **Descriptor honesty** (3.1): direct answers stat the resolved original — stat-miss → `state=missing`, `state_reason=file_missing`, play URL emptied; hls never stats; missing beats cooldown in the decision reason.
- **Serve law** (3.2): the exclusion lives INSIDE the shared `allFilteredItems` walk (scored + sort=path + libraryEpisodes inherit; explicit `?status=` keeps the audit window); `QueryItemsBySeries` both legs drop dead rows; item-detail GET 404s tombstoned ids (write routes stay functional — the adoption joint re-seeds through them); art GC union pinned ALL-rows (tombstoned artwork survives self-heal).
- **SPA** (4.1): `file_missing` union member; `FileMissingBanner` (role=alert, no video, no retry, no beacon) on `state==="missing"`.
- **Ride-along** (1.1): enrich worker priority select — urgent try-receive first; `TestUrgentLanePreferred` deterministic at count=10 (the bare-select coin-flip bug, baseline-surfaced).

## Receipt summary (final)

13/13 green (33 receipts total). Author + reviewer both re-ran every duty. Full suite 27 packages ok; vitest 702/702; golangci-lint rc 0 (after the GATE 2 lint-fix round b4fbd07 — 9 findings in the change's own new test files, the PR #21 precedent class).

## The amendment story (the change's defining event)

Task 2.4's joint itest ran RED and falsified design D4: episode `_view.title` floors are "" on EVERY fresh scan (single-fetch search; `routeEpisodeTitles` never fires), so the identity key degenerated to legs-only → cross-SERIES mis-carry within a library was STRUCTURAL (production library 3 has many series). Worse: dead rows re-derived forever and adoption's unconditional DELETE self-destroyed their stock mid-carry. Amendment (design.md dated note): the series-bridge identity + the three safety seams + tasks 2.5/2.6/2.7 + spec delta rewording. Surveyor round 4 verified all surfaces (Q11 attribution + Q12 stale-delta trio folded). The red receipt stands as the defect's evidence; 2.4 re-verified green after the amendment.

## Follow-up seeds

- `codecs_src=none`: stale docs carry no codec facts so the descriptor can't consider the pack path (D6-seeded; the stat gate composes with it).
- PUT /items/{id}/state write-route test pin (3.2 names it; only PUT /progress/{id} has a direct test) — one-liner.
- P3 notes (reviewer): adoptSeriesTitleFloor re-reads the live side's series row per candidate (N+1-shaped, bounded by tombstone count); `parsed.absolute_path` stamp read exists as two unexported helpers (scan/cmd — cross-package, unexportable without widening an API); the descriptor stat gate treats any stat error as missing (contract's literal wording; /media backstop keeps it honest).
- Pre-existing (not this change): `npx tsc -b` vitest-config typing gripe at web/vite.config.ts:38; internal/scan lll/gocognit lint notes in OTHER files; docs-debt items in [[docs-debt-known-state]].

## Operator acceptance (post-deploy)

Deploy alatoic → ONE rescan of library 3 ("Ongoings") per D8: JoJo E03's 88% lands on the live HEVC item `itm_3_0ae96378e0faeb8a`; Black Clover + the 4 old JoJo items retire from home/browse; playing a between-scans-vanished file shows the honest file-missing banner.
