# Design — watched states

## D1 — Watched is a served read-time state, never a client derivation

`watched,omitempty` (true-only bool) on `itemDTO`, `seriesDTO`, and the
progress row DTO. Derived in the api from the `watched_items` ledger:

- Items: the scored listing composition already batch-reads `ListWatched`
  into `recsFacts` — the same map stamps the DTO field. The single-item GET
  composes the same facts it already reads for its score.
- Series: `watched` = every backing episode ledgered, derived inside the
  existing `scoreSeries` episode walk (`eps` is already grouped per series;
  zero extra store reads). A series with zero episodes is not watched.
- Progress rows: the row's own item id against the ledger map the progress
  route already composes.

No new tables, no new store methods, no new store reads. The SPA renders the
served flag and NEVER derives watched client-side (the served-names-only law;
also `rec_score == 0` is not a watched signal — tag-less unwatched items
score zero too).

## D2 — The continue surface withdraws watched rows by default

`GET /api/v1/progress` drops rows whose item is ledgered, unless
`?include=watched`. Rationale: the rail's purpose is resume points; a
completed watch has none — its position is spent. The exclusion is the
backend half of "watched elements are not in recommendations".

The Home page keeps ONE fetch (`include=watched`) and splits client-side:

- Continue rail renders rows with `watched` absent/false — watched rows
  disappear from the rail.
- `startedSeries`/`nextUpEntries` anchors consume ALL rows unchanged — a
  fully-watched series still anchors its next unwatched episode into Next
  up, and a series with nothing later still drops out naturally.

No second round-trip, and the Next-up semantics do not change.

## D3 — Explicit completion rides the progress write (the credits leg)

The progress PUT body gains an additive optional `completed` bool. When true,
the watch-detect leg inserts the ledger row regardless of the 0.9 floor
(idempotent PK insert, janitor wake — all existing seams unchanged).

The SPA sets `completed: true` at exactly two edges:

- the video `ended` edge (the same edge AutoNext occupies — finishing the
  file is finishing the episode, whatever the last saved position was);
- SkipChip credits activation — skipping the credits tail jumps to the end
  and IS the "watched to duration − credits" case the user named.

Server-side chapter math is REJECTED on evidence: the live watched items
carry `ffprobe.chapters: []` — there are no chapter titles to classify
server-side for this content. The SkipChip lexicon stays UI vocabulary; the
intent rides the write. The passive ≥ 90 % floor and the boot backfill stay
as the backstop for every other exit path.

## D4 — Scored grids sink watched entries below unwatched

`recs.Entry` gains `Watched bool`; `recs.Order` sorts unwatched entries
first, watched entries last, each partition by score desc → display name asc
→ id asc. Still a pure leaf, still ≤ 8 exported symbols (a struct field, not
a symbol).

Effect: on collection grids a watched element can no longer outrank an
unwatched one through tag affinity (today a watched item can carry up to 400
tag points above a fresh unstarted entry). Watched elements remain visible in
their collection — sunk below the recommendation zone, not hidden. The photo
carve-out is untouched (photo grids never reach the comparator).

The continue rail does not need the partition (D2 withdraws the rows), and
the per-series episode table keeps narrative order (unchanged).

## D5 — UI element states (tri-state, color-change, no pills)

Per element, from the served flag + existing progress data:

- `watched` — a small ✓ glyph at the row/card corner in the library's pastel
  accent, title at reduced opacity (~0.55), NO progress bar.
- `in progress` — today's progress bar rendering.
- `new` — today's clean rendering.

Sites: EpisodesView table rows, serial-grid series cards (all-watched),
tv-grid episode-file cards, the element page heading (✓ beside the served
display_name), Continue rail rows. The check is a color-change mark per the
locked selection language — no pill/badge chrome, no new status vocabulary on
user screens (the enrich-lifecycle pill ban is untouched; watched is a media
state, not a pipeline state).

## D6 — Follow-ups deliberately out of scope

- `DELETE /items/{id}/watched` (un-watch / rewatch reset) — the manual
  marking affordance; the ledger stays append-only in this change.
- A manual "mark watched" row action in the ⋯ CardActions menu (rides the
  same future route).
- Per-profile ledgers (single implicit profile — the roles change owns it).

## D7 — Verification shape

- Go: extend `qa_recs_roundtrip_test.go` — (a) a ≥ 90 % write ledgered and
  withdrawn from the default rail, restored by `include=watched`; (b) a
  `completed: true` write at ~50 % position ledgered; (c) the grid partition
  order (watched sunk below unwatched whatever the tag scores); (d) the
  series `watched` flag when the last episode completes. API goldens gain the
  `watched` field.
- SPA: vitest — the Continue rail hides served-watched rows; the ✓ + dim
  state renders on episode rows; SkipChip credits activation and the ended
  edge fire the progress write with `completed: true`; anchors still see
  watched rows (Next up unchanged).
- Gates unchanged: `make build && make check && make test`, web `npm test` +
  `tsc --noEmit`, `make web-build` (dist + OpenAPI regen committed together).
