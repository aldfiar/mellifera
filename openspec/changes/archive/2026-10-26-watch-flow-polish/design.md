# Design

## Context

The watch surface today: `ItemDetail`'s video lane is the player (`components/playback/Player.tsx`) left and the identity column right (`grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]`); the playback descriptor carries sections `{kind: "chapter", start, end?, title?}` (`internal/stream` `projectChapters` — unchanged here); the served convention projection (`metadata`: `about` / `cast` / `episode` — `ElementMetadata` in `web/src/lib/api.ts`) and the series About panel (`components/metadata/Synopsis.tsx`) are shipped; the pure next-up derivation (`episodeFacts`, `startedSeries`, `nextUpEntries`) lives in `pages/home/Home.tsx`. Decisions Q5/Q6 (2026-10-23): the countdown default is an environment variable reaching the SPA through a served shape — the layer's ONLY Go touch — and auto-next ships with per-session cancel only (the localStorage variant is rejected; the durable per-user flag rides Layer 6). See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- The four Layer 3 surfaces (info column, skip chip, auto-next, keyboard) as spec'd in the web-ui delta.
- Exactly one new served shape (`GET /api/v1/watch-defaults`) wired from the environment knob.
- The pure next-up core in one shared lib home, consumed by Home and the watch page.
- Committed OpenAPI + dist regenerated and reproducible.

**Non-Goals:**
- No durable auto-next opt-out (Layer 6 accounts/roles), no per-user profile shape.
- No pack-lane or descriptor changes: no new section kinds, no server-side intro detection.
- No TMDB cast provider (arrives with Layer 4 / B3) — the column renders whatever the projection carries today.
- No player chrome redesign, no poster/thumbnail changes, no new plugins, no media-type literals anywhere.

## Decisions

- **D1 — Served countdown shape.** `GET /api/v1/watch-defaults` → `{"auto_next_countdown_seconds": <int>}`; the value is `envInt("MELLIFERA_AUTO_NEXT_COUNTDOWN_SECONDS", 10)` floored at 1 (a zero/negative knob would make auto-next an instant jump), read at the composition root and wired as an `api.Deps` field; the handler serves exactly what it is given (api stays pure delegation, zero new imports). Alternatives: baking the default into the SPA violates Q5 outright; riding an existing endpoint's shape couples an unrelated read to a watch concern. Floor at the composition root, not the handler.
- **D2 — Skip classification stays SPA-side on served data.** `lib/skipSections.ts` classifies a descriptor section only when `kind === "chapter"`, both `start` and `end` are present, and the served lowercase `title` matches a small lexicon (intro: intro/опенинг/opening; credits: credits/титры/ending/outro/ed). Anything else → no chip (honest absence). Alternatives: a new served `kind` field would touch the pack lane — rejected for a pure-SPA layer (the reserved `marker` kind stays reserved, untouched); serving the lexicon is overkill for presentation copy. The chip activation reuses the Player's existing standard `seekTo`.
- **D3 — Next-up core moves, not forks.** `episodeFacts`/`EpisodeFacts`/`startedSeries` (+ input types)/`nextUpEntries`/`NextUpEntry` move verbatim from `Home.tsx` to `lib/nextup.ts` (names and shapes unchanged; `Home.test.tsx` stays green untouched — `Home.tsx` re-exports the moved symbols); the watch page adds the sibling pure pick `nextEpisodeAfter(current, items)` — the lowest parsed episode facts strictly after the current item's, `null` when none. Consumers: `Home.tsx` (re-export only) and `AutoNext`.
- **D4 — Per-session cancel.** One `sessionStorage` key (`mellifera.autoNextCancelled`): its presence suppresses the auto-next card for the rest of the tab session, surviving reloads, dying with the tab. Alternatives: localStorage is rejected by Q6; a module singleton dies on reload and reads as a broken cancel.
- **D5 — Served shape unavailable → no autoplay.** If the watch defaults query has not answered or failed, the card renders without a countdown and never auto-starts. Q5 forbids a client fallback value; the buttons ([Смотреть]) keep the manual path.
- **D6 — Keyboard wiring.** One keydown listener at the watch view calling a pure `applyShortcut` (test-first table-driven); form-field/contenteditable focus is ignored; N/P resolve adjacent items through `useSeriesEpisodes` (the already-cached query Home uses). The legend renders only on `(pointer: fine)` surfaces.
- **D7 — Closeout pins the two cross-module contracts and regenerates artifacts.** Committed golden fixtures read by BOTH suites (Go producer test + vitest consumer block) for (a) the watch-defaults wire body and (b) the sections projection → chip classification (task 4.1); then swag regen + `npm run build` commit the OpenAPI and dist (task 4.2; swag needs `$GOPATH/bin` on PATH — exported in the duty).

## Interfaces

Cross-group contracts (groups in dependency order: 1 watch defaults → 2 nextup core → 3 player overlays → 4 qa closeout):

- **api → web (wire):** `GET /api/v1/watch-defaults` (authenticated browse group) → 200 `{"auto_next_countdown_seconds": <int>}`. Producers: task 1.1 (endpoint + swag) and 1.2 (env knob at the composition root). Consumers: `AutoNext` via `useWatchDefaults` (task 3.3) and the joint golden (task 4.1, fixture `internal/api/testdata/golden/watch_defaults.json`). Swag-annotated; regenerated in task 4.2.
- **descriptor sections → chip (unchanged wire, new consumer):** `PlaybackSection` `{kind: "chapter", start, end?, title?}` (`web/src/lib/api.ts`, served by `internal/api` from `internal/stream` `projectChapters`). Consumer: `lib/skipSections.ts` + `SkipChip` (task 3.1); pinned by the committed sections golden (task 4.1, fixture `internal/stream/testdata/golden/sections_chapters.json`) — one fixture file, both suites, one-sided drift fails by construction.
- **web/src/lib/nextup.ts (moved core):** exports `EpisodeFacts`, `episodeFacts`, `StartedSeries`, `startedSeries`, `nextUpEntries`, `NextUpEntry`, `nextEpisodeAfter` (+ the private helpers the move carries). Producer: tasks 2.1 (verbatim move + Home re-export) and 2.2 (the sibling pick). Consumers: `pages/home/Home.tsx` (re-export only — `Home.test.tsx` stays green untouched) and `AutoNext` (task 3.3).
- **sessionStorage key `mellifera.autoNextCancelled`:** writer and reader both live in the `AutoNext` module (task 3.3) — no other module touches the key.

## Risks / Trade-offs

- [Chapter titles vary by muxer/locale → the lexicon misses] → honest absence: no chip, pinned by scenario; the served-kind field remains the clean escape hatch if intro detection ever lands server-side (Layer 4+).
- [Auto-next surprise] → the card is cancel-first with a visible countdown; [Отмена] holds for the session; the length is operator-owned via the served knob, never client-baked.
- [Countdown fetch race at the ended edge] → the card renders without a countdown rather than guessing (D5); the query is warm long before an episode ends in practice.
- [Info column grows heavy with cast photos] → `photo_url` optional and thumb-sized; absent → no image element; absent cast → no row.
- [npm/swag regen drift] → the artwork reproducibility gate repeats: fresh rebuild leaves `git diff` clean on `internal/web/dist` and `internal/web/api`.

## Migration Plan

Fully additive: one new read-only endpoint, new SPA components, one verbatim code move. No stored-data, existing-endpoint, or descriptor changes. Rollback = revert the branch; the new endpoint is inert unless called.

## Open Questions

None — Q5/Q6 settled 2026-10-23 (served env shape; per-session cancel only, per-user flag deferred to Layer 6).
