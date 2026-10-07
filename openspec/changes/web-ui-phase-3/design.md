# Design — web-ui-phase-3

## Context

The visual source of truth is the user-approved mockup
`design-mockup.html` in this change folder (working copy during design:
`.tmp/webui-mockup.html`, v8): soft pastel neutral (lavender-grey light
`#f4f4fa`, lifted ink dark `#10121d`), per-type pastel accents (serials =
lavender, movies = peach, photos = mint, audiobooks = sky) where selection
follows color, a hidden-by-default left sidebar, a collections-first Home, and
an admin panel that is a collections table + edit overlay. The shipped SPA
(Phase 2a/2b) keeps its token discipline — this phase proposes the retoned base
alongside the shipped slate tokens, decided at implementation review.

The repo is mid-flight on `serials-library` (module + series store + `/series`
API). This change consumes that surface for serial collection pages and is
otherwise independent of it; films/photos/admin/home can land first.

## Goals

- One card per collection, at 20+ collections, without the wire round-trips the
  old IA forced (per-library dropdowns, flat item tables).
- Fast navigation: every collection is one sidebar click away; the profile is
  always visible.
- Admin manages collections (create, scan, rename, describe) with the identity
  hazard surfaced, not hidden.
- Continue/Next up with real stored positions — no fake data, no streaming yet.

## Non-goals (explicit deferrals)

- Range-request media serving and in-browser playback (backlog
  `internal/stream` + player work). Play deep-links to `/items/{id}`.
- Root-folder moves/collection delete. `PATCH` rejects `root_path`; delete
  waits for the janitor design (backlog).
- Batched summary endpoint (N+1 per-library summary calls are accepted at
  realistic collection counts; a `/libraries?with=summary` batch is a follow-up
  if profiles show it matters).
- Next up "followed series" state — derivation is purely from Continue data +
  episode facts; no subscription model.

## Interfaces

### API (all under `/api/v1`, canonical error body, OpenAPI regenerated)

| Endpoint | Group | Contract |
|---|---|---|
| `POST /libraries` | admin | body gains optional `description` (default `""`); DTO carries it |
| `GET /libraries` | browse | DTO carries `description` |
| `PATCH /libraries/{id}` | admin | `{display_name?, description?}` → 200 DTO; 400 on `root_path`/`module_id` presence; 404 unknown |
| `GET /libraries/{id}/summary` | browse | `{library_id, items, updated_at}`; constant-time aggregate; 404 |
| `GET /libraries/{id}/folders` | browse | `{folders:[{path, items}]}` depth-1 prefixes, path-sorted; 404 |
| `PUT /progress/{item_id}` | browse | `{position_seconds ≥ 0}` → 200 record; 400 invalid; 404 unknown item |
| `GET /progress[?limit]` | browse | recent positive positions, newest-first, limit default 20 max 100 |
| `GET /progress/{item_id}` | browse | single record; 404 when absent |

### SPA routes

`/` → Home; `/collections/{id}` → collection page (layout keyed by
`module_id`); `/items/{id}` unchanged; `/admin` unchanged in path (content =
collections table + add form + edit overlay; Status section removed); `/login`
unchanged.

### Sidebar data flow

`GET /libraries` renders the list immediately (names + type dots); summary
counts arrive per-library asynchronously and MUST NOT block the panel opening.

## Decisions

- **D1 — sidebar data:** libraries + lazy per-library summaries; no batch
  endpoint in this change.
- **D2 — PATCH is identity-safe:** only `display_name`/`description` are
  mutable; `root_path`/`module_id` in the body → 400. The overlay renders the
  root folder read-only with the re-identification warning.
- **D3 — progress now, playback later:** a plain integer-seconds store and two
  endpoints; Continue/Next up render from it; Play deep-links. Streaming is a
  separate capability (backlog `internal/stream`).
- **D4 — Status section removed from the SPA only:** the
  `GET /api/v1/admin/status` contract, role gating, and Swagger docs are
  untouched; operators keep runbook access.
- **D5 — paths and lifecycle pills are admin-only:** user surfaces (home,
  collection pages, Continue/Next up) never render `root_path` or
  ready/pending/stale/failed; admin keeps them where they aid operations.
- **D6 — collection layout is keyed by `module_id`:** `tv` → file cards,
  `image` → masonry + folder chips, `serial` → series grid. New types extend by
  adding a layout branch, not a new shell.
- **D7 — role label is probed, not asserted:** `GET /admin/status` success →
  `admin`, otherwise `client`; no client-side role parsing.
- **D8 — migration posture:** libraries `description` lands as a new idempotent
  migration entry (`ALTER TABLE libraries ADD COLUMN description TEXT NOT NULL
  DEFAULT ''`) — allowed by the runner's once-per-entry semantics (unlike
  generated columns, which stay blocked); `playback_progress` is plain
  `CREATE TABLE IF NOT EXISTS`.

## Compatibility

- DTO change is additive (`description` optional in requests, always present in
  responses); existing clients ignore it.
- The SPA drops `/browse`; the route is not redirected (home replaces it as the
  landing surface) — deep links to `/browse` were never shipped externally.
- The node-free Go gate stays: `make web-build` remains dev-time; committed
  `internal/web/dist/` carries the new routes.
