# Design

## Context

See proposal.md — Why. Ground truth this design builds on (all verified
against the live dev DB and code at HEAD 2026-10-24):

- Series listing is `ORDER BY relative_path` (`internal/store/series.go`
  :125-156) and the SPA renders served order — today's "alphabet" is path
  order server-side. Item listing orders by `id` (`internal/store/items.go`
  :101-106).
- `playback_progress` holds one position per item (`internal/store/progress.go`,
  listed `updated_at DESC`). No watched/completed concept exists anywhere.
- Every video item document carries the verbatim ffprobe blob at top-level
  `ffprobe` with `format.duration` (e.g. 1450.109) — duration is already
  stored, no new probing.
- Episodes map to their series via `parsed.series_relative_path` +
  `library_id` (the SPA's existing join; 989 episode items over 88 series in
  the dev DB).
- Tags already exist as the media-data convention `genres` array
  (`sources.<plugin_id>.genres`, RU-first from shikimori; group-integrity
  merge by gate-resolved chain priority). The dev DB's series currently
  carry empty `genres` (enriched before the field; a Refresh refills) — the
  mechanism is live, the data refills on refresh.
- `Deps.OnProgress` fires after every successful `PutProgress`
  (playback-progress spec; wired to the debounced thumb re-grab at
  `cmd/mellifera/main.go` :364).
- The janitor is a named multi-task registry in `cmd/mellifera/janitor.go`
  (artwork D8): boot-run + per-task interval tick; day-one tasks `streams`
  and `art`.
- Store and api sit AT the 12-export budget (mellifera-build check.sh) —
  additions use the primitive-signature / unexported-handler idioms.

## Goals / Non-Goals

**Goals:**

- One additive change: score model + completion ledger + tag-weight learning
  janitor task + served ordering on collections and continue surfaces.
- Context always dominates affinity: partially-watched > new-episode > any
  tag sum; ties fall to the served display name (alphabet floor preserved).
- Learning is background, idempotent, restart-safe, and derived — no jobs
  table; `watched_items.applied_at IS NULL` IS the queue (enrichment-queue
  precedent: work is never stored, only derived).
- Zero-interest behavior degrades to today's order: with no weights and no
  progress, every score is the tag base sum and the grid is alphabetical.

**Non-Goals:**

- No per-series episode-list reordering (narrative order is a playlist
  contract, not a recommendation surface).
- No photo libraries (no watch semantics, no genres — path order stays).
- No user/profile dimension (roles arrive later; the migration point is
  named: add a profile column to `watched_items` + `tag_weights` and
  re-derive).
- No decay/normalization of weights in v1 — monotonic growth is bounded in
  influence by the tag cap; a decay janitor task is the named follow-up if
  staleness ever matters.
- No new plugin field or capability — tags ARE the convention `genres`;
  every current and future source feeds them with zero core changes.
- No collaborative filtering, embeddings, or LLM ranking — a transparent
  additive score the operator can recompute by hand.

## Decisions

- **D1 — Tags are the convention `genres`, resolved through the gate-resolved
  chain.** An entity's tags = the `genres` array of the first
  effectively-enabled namespace carrying the synopsis group on the winning
  document (the series document for episodes and series; the item document
  for films/tv items). Tag keys normalize by Unicode casefold + trim before
  any weight write or read. Alternative declined: a new `tags` plugin field —
  duplicates the convention for zero new information.
- **D2 — Score is derived at read time, never persisted.**
  `score(e) = 1000·inProgress(e) + 500·newEpisode(e) +
  min(Σ_{t∈tags(e)} weight(t), 400)` with `weight(t) = 1 + interest(t)`,
  `interest` starting at 0. Constants live in `internal/recs`. Partially
  watched = a progress row with position > 0 on the entity (the item itself,
  or any episode of the series) that has NOT completed. Completed = a
  `watched_items` row, or a position ≥ 90% of the stored duration. The cap
  400 < 500 < 1000 pins the user's ordering rule: any tag affinity ranks
  below a new episode, which ranks below a resume point; bonuses stack (a
  mid-episode serial that also has a new episode outranks either alone).
  Ties: served `display_name` asc, then id — the alphabetical floor.
- **D3 — New episode = started series + a fresh unwatched episode.** A series
  is "started" when any of its episodes has a progress or watched row. It
  carries the new-episode bonus when ≥ 1 of its episode items has NO
  progress/watched row AND was discovered (`created_at`) within NEW_WINDOW =
  30 days. Flat bonus inside the window, none outside — the ongoing-anime
  case bubbles for a month, a stalled back-catalog does not. An unstarted
  series never gets the bonus (otherwise every unwatched series in an
  88-series library would tie at the top).
- **D4 — Completion detection is synchronous, tiny, and idempotent.** The
  `OnProgress` closure in `cmd/mellifera` fans out to the existing thumb
  re-grab AND a watch detector: load the item, read `ffprobe.format.duration`,
  insert one `watched_items` row when position ≥ 90% of duration (PK makes
  repeats no-ops), poke the recs wake channel. No duration ⇒ never
  auto-completes (documented honest absence; manual marking is a later
  affordance). Log-and-skip on every failure — a progress write is never
  load-bearing (the D-2/D-3 seam contract unchanged).
- **D5 — The learning loop is a janitor task over derived work.** Task `recs`
  (registry beside `streams`/`art`): boot-run + 60 s tick + wake-channel poke
  on every completion insert. Each pass: SELECT watched rows with
  `applied_at IS NULL` → resolve the entity's tags (D1) → `weight(t) += 1`
  per tag in one tx → stamp `applied_at`. Restart-safe (unstamped rows
  re-derive), idempotent, and rewatch-proof (the watched PK dedupes the
  event itself). A jobs table was considered and declined: `applied_at IS
  NULL` is the queue, exactly the enrichment queue's derived-work posture.
- **D6 — `internal/recs` is a pure leaf (≤ 8 exports).** It imports nothing
  from mellifera (plain input structs: progress facts, watched set, weights,
  tag lists, timestamps) and exports the score function + an ordering helper.
  The api composes: batched per-page store reads (the display.go D-9 pricing
  posture) feed `recs`, which returns scores; handlers sort. This keeps api
  at its export budget and the model unit-testable without a store.
- **D7 — Ordering is served, with explicit opt-outs.** `GET /series?library=N`
  and the item listing default to score-desc (`sort=path` restores today's
  order); `GET /progress` serves `rec_score` per row and orders score-desc
  then `updated_at` desc (`sort=recent` restores pure recency). DTO fields
  `rec_score,omitempty` are additive on seriesDTO/itemDTO/progress rows —
  the SPA and any client can show or ignore them; they exist so ordering is
  observable and testable, not as UI payload.
- **D8 — Continue and Next up consume served scores, never client-side
  scoring.** Continue renders the served progress order. Next up stays a
  client derivation (started series → next unwatched episode) but orders its
  entries by the served `rec_score` of the series' latest progress row, ties
  by recency — the served-names-only rule: the SPA never re-implements the
  model.
  *(Amendment 2026-10-28, recorded while this change is untracked: the
  browse-scale change supersedes D8 for the HOME RAIL ONLY — Home's Next-up
  derivation is replaced by served `GET /home` continue rows (rec_score desc
  + recency tiebreak composed server-side, one round-trip), so task 4.1's
  Next-up work is the interim shape until browse-scale lands. The watch-page
  `nextEpisodeAfter` derivation is untouched; its tuple parity with
  `nextup.ts` stays pinned. browse-scale carries the modified-capability
  deltas (recommendation-sorting, web-ui).)*

## Interfaces

- Store (primitive signatures, zero new exports over budget):
  `InsertWatched(itemID, libraryID, seriesPath string, at time.Time)`,
  `ListUnappliedWatched()`, `ApplyTagWeights(rows []TagWeightDelta, appliedUpTo)`
  — naming settled at build; DDL additive in `schemaSQL`
  (`watched_items`, `tag_weights`).
- `internal/recs`: `Score(EntityState, Weights) float64` (name final at
  build); constants exported read-only via doc comment.
- api handlers: `listSeries`, `listItems`, `listProgress` gain `sort` parsing
  + recs composition; `seriesDTO`/`itemDTO`/progress row gain
  `rec_score,omitempty`.
- cmd: `OnProgress: fanOut(newThumbRegrab(...), newWatchDetect(...))`;
  janitor task `recs` registered after `art`; wake channel closed on process
  exit.

## Open questions (answered at propose time, none blocking GATE 1)

- NEW_WINDOW (30 d) and the completion threshold (90%) as constants vs env
  knobs — leaning constants; the env-knob idiom exists (`MELLIFERA_*`) if
  the deployed library's release cadence demands tuning.
