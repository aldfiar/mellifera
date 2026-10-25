# Tasks

## 1 - watch defaults: the served countdown shape (Go)

- [ ] 1.1 Serve GET /api/v1/watch-defaults from internal/api: a WatchDefaults Deps field (the countdown seconds int), the route mounted in the authenticated browse group (internal/api/router.go), a new internal/api/watch_defaults.go handler answering {"auto_next_countdown_seconds": <int>} with the wired value served verbatim — pure delegation, zero new imports — swag annotations for the new route, and a table-driven handler test (wired value verbatim, route role-gated with the browse group).
  verify: go test ./internal/api -run TestWatchDefaults -count=1 && grep -q '"/watch-defaults"' internal/api/router.go || exit 1
- [ ] 1.2 Wire the MELLIFERA_AUTO_NEXT_COUNTDOWN_SECONDS environment knob at the cmd/mellifera composition root (the envInt pattern, default 10, floored at 1 — a non-positive knob must never make auto-next an instant jump) into api.Deps.WatchDefaults, with a table-driven env test covering unset → 10, set → verbatim, malformed → 10 with a logged warning, zero/negative → 1.
  verify: go test ./cmd/mellifera -run TestAutoNextCountdownEnv -count=1 && grep -q 'MELLIFERA_AUTO_NEXT_COUNTDOWN_SECONDS' cmd/mellifera/main.go || exit 1

## 2 - nextup core: the pure derivation moves to lib/nextup.ts

- [ ] 2.1 Move the Home next-up core verbatim to the new web/src/lib/nextup.ts — EpisodeFacts, episodeFacts, StartedSeries, startedSeries, NextUpEntry, nextUpEntries and the private helpers the move carry, names and shapes unchanged — and re-export the moved symbols from web/src/pages/home/Home.tsx so web/src/pages/home/Home.test.tsx stays green untouched; author web/src/lib/nextup.test.ts with table-driven parity vectors over the moved pure functions. @qa
  verify: cd web && npx vitest run src/lib/nextup.test.ts src/pages/home/Home.test.tsx && grep -q 'export function nextUpEntries' src/lib/nextup.ts && test -z "$(grep -E 'export (async )?(function|const|interface|type) (EpisodeFacts|episodeFacts|StartedSeries|startedSeries|NextUpEntry|nextUpEntries)' src/pages/home/Home.tsx)" || exit 1
  file: contracts/2.1-nextup-move.md
  qa: tests/web/src/lib/nextup.test.ts::moved_core_parity, tests/web/src/pages/home/Home.test.tsx::next_up_derives_from_series_records
- [ ] 2.2 Add the pure sibling pick nextEpisodeAfter(current, items) to web/src/lib/nextup.ts — the lowest parsed episode facts strictly after the current item's, null when none — table-driven tested in web/src/lib/nextup.test.ts (adjacent pick, skip-across ordering, last episode → null, item without episode facts → null). @qa
  verify: cd web && npx vitest run src/lib/nextup.test.ts && grep -q 'export function nextEpisodeAfter' src/lib/nextup.ts || exit 1
  qa: tests/web/src/lib/nextup.test.ts::next_episode_after_picks_lowest_strictly_after

## 3 - player overlays: skip chip, info column, auto-next, keyboard

- [ ] 3.1 Skip intro/credits chip: new web/src/lib/skipSections.ts — classify a served descriptor section only when kind is chapter with both start and end present and the served lowercase title matches the small intro/credits lexicon (intro/опенинг/opening; credits/титры/ending/outro/ed), anything else classifies to nothing — and new web/src/components/playback/SkipChip.tsx («Пропустить вступление» / «Пропустить титры», soft chip over the video's bottom-right, rendered only inside a classified range, fading after 4 s inside it, returning when a seek lands inside again, activation seeking past the section's end through the Player's existing standard seekTo), wired into web/src/components/playback/Player.tsx. @qa
  verify: cd web && npx vitest run src/lib/skipSections.test.ts src/components/playback/SkipChip.test.tsx && grep -q 'SkipChip' src/components/playback/Player.tsx || exit 1
  file: contracts/3.1-skip-chip.md
  qa: tests/web/src/lib/skipSections.test.ts::classifies_intro_and_credits_chapters, tests/web/src/components/playback/SkipChip.test.tsx::chip_renders_only_inside_classified_range, tests/web/src/components/playback/SkipChip.test.tsx::activation_seeks_past_section_end
- [ ] 3.2 Watch-view info column: new web/src/components/watch/InfoColumn.tsx mounted right of the player in web/src/pages/browse/ItemDetail.tsx's video lane — episode heading (SxxEyy eyebrow + served episode block title), «Серия» block (served episode block description), «В ролях» row (served cast[] name/role?/photo_url? verbatim), and the shipped Synopsis About panel as standing context (the episode's series row's served about block, else the item's own) — every block field-driven off the served ElementMetadata projection; a field absent → block absent; no fabrication, no source literals. @qa
  verify: cd web && npx vitest run src/components/watch/InfoColumn.test.tsx src/pages/browse/ItemDetail.test.tsx || exit 1
  file: contracts/3.2-info-column.md
  qa: tests/web/src/components/watch/InfoColumn.test.tsx::blocks_render_from_served_projection, tests/web/src/components/watch/InfoColumn.test.tsx::absent_fields_leave_absent_blocks, tests/web/src/pages/browse/ItemDetail.test.tsx::watch_view_composes_player_and_info_column
- [ ] 3.3 Auto-next card: new web/src/components/playback/AutoNext.tsx on the ended edge of an episode — «Следующая серия» naming the next episode via nextEpisodeAfter (lib/nextup.ts), [Смотреть]/[Отмена], countdown from the served watch defaults via a new fetchWatchDefaults client (web/src/lib/api.ts) and useWatchDefaults query (web/src/lib/queries.ts); the served shape unavailable → card without countdown, never autoplay; [Отмена] suppresses the card for the browsing session via the sessionStorage key mellifera.autoNextCancelled; films never render the card. @qa
  verify: cd web && npx vitest run src/components/playback/AutoNext.test.tsx src/lib/queries.test.tsx && grep -q 'watch-defaults' src/lib/api.ts || exit 1
  file: contracts/3.3-auto-next.md
  qa: tests/web/src/components/playback/AutoNext.test.tsx::countdown_runs_on_served_value_and_navigates_at_zero, tests/web/src/components/playback/AutoNext.test.tsx::cancel_suppresses_card_for_session, tests/web/src/components/playback/AutoNext.test.tsx::unavailable_shape_means_no_autoplay, tests/web/src/lib/queries.test.tsx::use_watch_defaults_reads_served_shape
- [ ] 3.4 Player keyboard control: new web/src/lib/playerShortcuts.ts — a pure applyShortcut table: Space play/pause, ←/→ ∓/±10 s, ↑/↓ volume, F fullscreen, N/P next/prev episode item through the series' episode list (useSeriesEpisodes), 0-9 seek to the matching tenth, keystrokes ignored while a form field or contenteditable element owns focus — wired by one keydown listener at the watch view in web/src/pages/browse/ItemDetail.tsx, plus new web/src/components/playback/PlayerLegend.tsx legend row under the player rendered on fine-pointer (desktop) surfaces only, hidden on touch. @qa
  verify: cd web && npx vitest run src/lib/playerShortcuts.test.ts src/components/playback/PlayerLegend.test.tsx src/pages/browse/ItemDetail.test.tsx || exit 1
  file: contracts/3.4-keyboard.md
  qa: tests/web/src/lib/playerShortcuts.test.ts::maps_every_transport_key, tests/web/src/lib/playerShortcuts.test.ts::ignores_keystrokes_into_form_fields, tests/web/src/components/playback/PlayerLegend.test.tsx::legend_renders_on_fine_pointers_only

## 4 - qa closeout: golden joints and committed artifact regen

- [ ] 4.1 Cross-module golden joints for the two served contracts (authored for @wf-qa): commit internal/api/testdata/golden/watch_defaults.json pinning the watch-defaults wire body — asserted by a Go producer test TestWatchDefaultsGolden (internal/api/watchdefaults_golden_test.go) and a vitest consumer block in web/src/lib/queries.test.tsx reading the SAME fixture — and internal/stream/testdata/golden/sections_chapters.json pinning the chapters projection → chip classification — asserted by TestSectionsGolden (internal/stream/sections_golden_test.go) and a golden consumer block in web/src/lib/skipSections.test.ts; one fixture file per joint, both suites, one-sided drift fails by construction. @qa
  verify: go test ./internal/api -run TestWatchDefaultsGolden -count=1 && go test ./internal/stream -run TestSectionsGolden -count=1 && cd web && npx vitest run src/lib/skipSections.test.ts src/lib/queries.test.tsx || exit 1
  file: contracts/4.1-golden-joints.md
  qa: tests/internal/api/watchdefaults_golden_test.go::TestWatchDefaultsGolden, tests/web/src/lib/queries.test.tsx::watch_defaults_wire_contract_golden, tests/internal/stream/sections_golden_test.go::TestSectionsGolden, tests/web/src/lib/skipSections.test.ts::sections_projection_golden
- [ ] 4.2 Regenerate and commit the embedded artifacts through the make web-build path — the swag annotations of /api/v1/watch-defaults into internal/web/api and the vite build of this change's SPA into internal/web/dist — reproducibly: a fresh rebuild over the committed sources leaves both trees clean and go build ./... succeeds with the embedded result.
  verify: PATH="$PATH:$(go env GOPATH)/bin" make web-build && test -z "$(git status --porcelain internal/web/dist internal/web/api)" && go build ./... || exit 1
