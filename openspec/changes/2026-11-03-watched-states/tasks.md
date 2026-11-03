# Tasks — watched states

## 1. Backend: served state + rail withdrawal + completion flag

- [ ] 1.1 `internal/api`: stamp `watched,omitempty` on the item DTO (scored
      listing + single-item GET) and the progress row DTO from the batched
      ledger map (`recsFacts`)
- [ ] 1.2 `internal/api`: series DTO `watched,omitempty` = all backing
      episodes ledgered, derived in the scoreSeries walk
- [ ] 1.3 `internal/api`: `GET /progress` withdraws ledger rows by default;
      `?include=watched` restores them (400 on unknown values, the parseSort
      precedent)
- [ ] 1.4 `internal/api` + `cmd/mellifera`: the progress PUT accepts optional
      `completed` bool; the OnProgress seam carries it; the watch-detect leg
      honors it regardless of the 0.9 floor (idempotent insert + janitor
      wake unchanged)
- [ ] 1.5 `internal/recs`: `Entry.Watched` + `Order` partitions watched last
      (each partition score desc → name → id); wire it in `scoredServe`
      callers

## 2. SPA: element states + intent writes

- [ ] 2.1 `web/src/lib/api.ts`: `watched?: boolean` on Item/Series/Progress
      DTOs + `completed` on the progress write; `include=watched` on Home's
      progress query
- [ ] 2.2 Continue rail renders only unwatched rows; anchors (startedSeries)
      keep consuming all rows
- [ ] 2.3 Watched element state: ✓ pastel mark + dimmed title + no progress
      bar on EpisodesView rows, serial-grid series cards, tv-grid cards, and
      the element page heading
- [ ] 2.4 The ended edge (AutoNext path) and SkipChip credits activation fire
      the progress write with `completed: true`

## 3. Tests + gates

- [ ] 3.1 Extend `qa_recs_roundtrip_test.go`: rail withdrawal +
      include=watched restore; completed-flag ledgering at ~50 %; grid sink
      partition; series watched flag
- [ ] 3.2 Update API goldens (`watched` field, progress envelope)
- [ ] 3.3 SPA vitest: rail filter, ✓ rendering, completed-write firing at
      both edges; `tsc --noEmit` clean
- [ ] 3.4 Gates: `make build && make check && make test`; web `npm test`;
      `PATH="$HOME/go/bin:$PATH" make web-build` (dist + OpenAPI committed)

## 4. Docs + archive

- [ ] 4.1 README feature bullet (watched states) + operator runbook note if
      any knob lands (none planned)
- [ ] 4.2 Archive the change; spec deltas merge into
      `recommendation-sorting` and `web-ui`
