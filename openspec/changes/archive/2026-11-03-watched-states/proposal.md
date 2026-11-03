# Watched states: the ledger leaves the recommendations

## Why

Live evidence (alatoic, deploy 81bc6f0 2026-11-03 11:48, probed 14:0x):

- `recs backfill: reconciled pre-existing completions into the watch ledger rows=8`
  — the completion ledger WORKS: eight full-episode watches (positions
  1275–1490 s against ~1413 s stored durations, i.e. the 93–97 % rows) are
  ledgered. Example: «Старик из деревни становится Святым мечом · S02E05» at
  1369/1413 s = 96.9 %.
- `GET /api/v1/progress` still serves those 8 rows (15 total; the 8 show as
  rec_score-absent = zero-scored watched rows). The continue surface never
  withdraws a completed row — the detector inserts a ledger row but the
  progress row lives forever, so a finished episode stays on the Continue rail
  indefinitely. This is the reported symptom: recommendations still show
  episodes watched to 93–97 %.
- The watched fact is not on the wire anywhere: item and progress DTOs carry
  no watched state, so the SPA cannot mark elements either — `rec_score: 0`
  is not a usable signal (ambiguous with tag-less items, and omitempty hides
  it).
- The credits case is real but not server-derivable for this content: the
  watched items' stored `ffprobe.chapters` is `[]` (anime MKVs carry no
  chapter titles), so a server-side "duration − credits" chapter calculation
  has nothing to read. The SPA's SkipChip already classifies credits ranges
  client-side — intent can ride the progress write instead.

The user's rule: an episode watched to the full duration, to
duration-minus-credits, or to ≥ 90 % is WATCHED; watched elements carry a
visible state in the UI and never appear as to-watch recommendations.

## Changes

1. **Served watched state (additive, read-time).** `watched,omitempty`
   (true-only bool) on the item, series, and progress DTOs — derived at read
   time from the `watched_items` ledger through the existing batched
   `recsFacts` composition, stamped on every serving route: the single-item
   and single-series GETs, the series-episodes listing, the `sort=recent`
   rail branch, and the `sort=path` collection branches gain the
   composition or the ledger set (no new tables, no new store methods; the
   flag stamps unconditionally even where the score stays absent). Series
   watched = every backing episode ledgered.
2. **The continue rail withdraws watched rows.** `GET /progress` excludes
   ledger rows by default in BOTH branches (scored and `sort=recent`);
   `?include=watched` restores them. Home fetches `include=watched` once —
   the param rides the SHARED progress query (queries.ts), so ItemDetail's
   resume row inherits it — and splits client-side: the rail renders only
   unwatched rows, the Next-up anchor derivation keeps using all rows.
3. **Explicit completion on the progress write (the credits leg).** The
   progress PUT accepts an additive optional `completed` flag; when set, the
   detector ledgers the item regardless of the 0.9 floor. The SPA sets it on
   the video `ended` edge (beside auto-next) and on SkipChip credits
   activation — skip-the-credits counts as finished; the flagged write
   bypasses the player's position dedupe so the edge cannot be swallowed.
   The passive 0.9 floor and the boot backfill stay as the backstop.
4. **Scored grids sink watched entries.** `recs.Entry` gains `Watched`;
   `recs.Order` partitions watched entries LAST (each partition keeps score
   desc → display name → id). Watched elements stay visible in collections
   but leave the recommendation zone; photo carve-out unchanged.
5. **UI element states.** Per-element tri-state rendering — watched (✓ mark
   in the library pastel accent, dimmed title, no progress bar),
   in-progress (progress bar as today), new (clean). Sites: episode table
   rows (EpisodesView), series cards (SeriesCard in SeriesGrid,
   series-poster-grid), film/tv cards (ItemGrid; TV mode is the html.tv CSS
   layer over the same grids), element page heading, Continue rail. The SPA
   renders the served flag only — it never derives watched client-side.

## Non-goals

- Building a manual mark-watched affordance — one already exists
  (`MarkWatchedRow`, Collection.tsx) and becomes effective through this
  change: its full-duration write crosses the 0.9 floor and ledgers the
  item (only its stale in-code comment is refreshed; no behavior change).
  The follow-up is the `DELETE /items/{id}/watched` reset (un-watch /
  rewatch); the ledger stays append-only.
- Multi-profile ledgers (single implicit profile, as the spec states — the
  roles change owns that migration).
- Server-side credits-chapter classification (no chapter facts to read; the
  SPA lexicon stays the one vocabulary).
- Hiding watched elements from collections entirely — they sink below
  unwatched, they do not disappear.
- Rewatch flows (a watched row is never withdrawn for a resume; auto-next
  already advances past it).
