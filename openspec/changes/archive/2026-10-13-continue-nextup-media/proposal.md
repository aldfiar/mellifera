# Proposal: continue-nextup-media — Home cards get names and frame-accurate thumbs

## Why

Live evidence against the running dev server (2026-10-12, libraries 2/3):

1. **Continue cards have no names.** `viewTitle` reads `_view.title`, but a
   serial-module EPISODE document's `_view` carries only
   `episode/season/resolution/thumbnail_path` — the series title lives on the
   SERIES record (`ser_…_view.title`, written by serial-parser), never on the
   episode. Every Continue card renders "—" (GET /progress → GET /items/{id}:
   `_view` has no `title`; `ser_3_f22a497f87638be5._view.title` = "ACCA
   13-ku Kansatsu-ka" is only reachable via /series).
2. **Continue cards have no thumbnails at all** — `ContinueCard` renders no
   media, despite episodes carrying the `frame-grabber` thumb fact since
   serials-library D3.
3. **Next up is permanently empty for serial libraries.** The derivation
   (`episodeFacts` in `Home.tsx`) requires a `title` in an episode's source
   namespace — tv-parser-era shape. serial-parser stamps `title` only on
   series records, so `startedSeries`/`nextUpEntries` derive nothing and the
   row renders "No upcoming episodes found."
4. **The thumb frame is wrong for both card kinds.** The grabber seeks
   `min(60s, 10% duration)`: an in-progress item (~95% seen, per the report)
   shows a frame from the first ~2.5 minutes of a 24-min episode — not the
   frame the viewer stopped on; an unstarted next-up episode shows the
   60-second mark, not the requested ~5-minute preview still.
5. **Films (tv module) never get thumbs** — frame-grabber is bound only to
   the serial module chain, so a film's Continue card can never show media.

## What Changes

- **frame-grabber seek policy (`plugins/frame-grabber/`):** enrich-time
  default seek becomes `min(300s, 50% duration)` (the "about 5 first
  minutes" preview still), and `Convert` honors an explicit
  `seek_seconds` query field (clamped to the probe duration) — the
  stop-position override.
- **Resume re-grab (stop frame):** `PUT /progress` gains a nil-safe
  `Deps.OnProgress` closure (anti-corruption seam, mirrors `Deps.Scan`);
  `cmd/mellifera` wires it to a debounced async re-grab executor that calls
  the loaded frame-grabber plugin's Match+Convert directly (Match builds the
  query from the stored document; the executor injects `seek_seconds` =
  the saved position). The JPEG lands on the SAME deterministic path — no
  document write, no enrich round-trip; `_provenance.grabbed_at` is left
  stale by design (the fact's value is the path, which never changes).
  Debounce: one re-grab per ≥60s of position delta per item (the Player
  PUTs every few seconds during playback — an unguarded executor would
  spawn ffmpeg per timeupdate).
- **Thumb cache honesty (`internal/api/handlers.go`):** `variant=thumb`
  serves `Cache-Control: private, no-cache` (strong ETag still answers
  If-None-Match with 304 when the file is unchanged); original + sidecar
  stay `private, immutable` (write-once files). `immutable` on a
  re-grabbable thumb would pin stale bytes in the browser cache forever.
- **Films get thumbs (module seed v2):** the tv module chain gains
  frame-grabber (priority 4, after the soft-failed kinopoisk/tmdb slots),
  `schema_version` 1→2 with a guarded `UPDATE … WHERE schema_version < 2`
  after the `INSERT OR IGNORE` (the ignore alone never updates an existing
  row). Existing film items re-derive the frame-grabber namespace on the
  next drain (chain-driven derivation); films hash to
  `thumbs/<sha16(relative_path)>/<sha16(relative_path)>.jpg` (file-backed
  identity — the existing empty-series fallback already handles this).
- **Home Continue cards (`web/src/pages/home/Home.tsx`):** each card gains
  the thumb preview (same authenticated-fetch pattern as the collection
  card's `CardPreview`; absent fact → honest badge-only layout) and a real
  name: serial episodes resolve their series record
  (`GET /series?library={id}`, matched by `parsed.series_relative_path`,
  shared `["series", id]` cache with the collection page) and render
  `<series title> · S01E05`; tv-module items keep `viewTitle` (title lands
  via tv-parser / film-name-parsing).
- **Home Next up rework (same file):** the derivation keys on SERIES
  RECORDS instead of episode-carried titles — progress → item → series row
  → `GET /series/{id}/episodes` (one cached fetch per started series),
  pick the lowest (season, episode) strictly after the highest started one.
  Cards render series title, `SxxEyy` chip, and the episode thumb. Pure
  functions stay exported and unit-tested.

Out of scope: per-user thumbs (single-user server), grabbed_at refresh on
re-grab, re-grabbing already-enriched episodes to move 60s→300s stills
(new episodes and any re-grabbed item get the new policy; dev-stage data
keeps its old stills until first play), episode-name facts (B3/NFO).

## Impact

- `plugins/frame-grabber/{ffmpeg,grabber}.go` + tests — seek default,
  fraction, `seek_seconds` override.
- `internal/module/registry.go` — tv config v2 + guarded UPDATE.
- `internal/api/router.go` (Deps.OnProgress), `handlers.go` (hook +
  per-variant Cache-Control) + tests.
- `cmd/mellifera/` — regrab executor + wiring (new unexported file-sized
  unit, no new exported symbols).
- `web/src/pages/home/Home.tsx` + `Home.test.tsx` — Continue/Next-up cards.
- No wire-format breaks; all additions are additive (one Deps field is
  nil-safe; module config versioned via schema_version).

## Verification

- Go: `make build check test lint` (gate stays node-free).
- Web: `cd web && npx vitest run && npx tsc --noEmit`.
- Shadow e2e (no user-session disruption): copy `data/` → run the new
  binary on :8081 → `PUT /progress/{id}` at a position > 60s past the last
  → poll the thumb ETag/bytes on :8081 → assert they change to the
  stop-position frame; `GET /progress` unchanged; original variant still
  `immutable`.
