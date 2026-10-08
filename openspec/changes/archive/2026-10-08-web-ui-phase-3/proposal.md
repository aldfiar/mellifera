# Proposal: web-ui-phase-3 — collections-first web UI

## Why

The shipped SPA is an operator console (flat item tables + a status panel), while
the product is a personal media library: the user thinks in collections (serials,
movies, photos, audiobooks — several of each), wants a home that says "continue
where you left off", and manages libraries rarely but explicitly. The wire today
cannot even render a collection card: `GET /libraries` carries no description, no
item count, no updated_at; nothing remembers playback positions; and the admin
panel shows plugin plumbing the user has explicitly dropped from the UI.

## What Changes

- **Sidebar shell (hidden by default):** the SPA moves to a frame with a
  slide-in left panel — brand, Home/Admin nav, a fast-navigation list of ALL
  collections (pastel type dots + item counts, from `GET /libraries` +
  `GET /libraries/{id}/summary`), and a pinned profile block (role probed via
  `GET /admin/status`). A floating hamburger opens it; chevron/Escape close it;
  state persists. The top navigation header and the redundant "Home" page title
  are removed.
- **Home = collections:** the root route renders one card per collection — name,
  human type badge, description, item count, updated date — with per-type pastel
  accents and client-side type filter chips. Root paths and enrich-lifecycle
  status pills are dropped from user surfaces by design (paths live in Admin
  only). Below the grid: **Continue** (in-progress items from the new progress
  API) and **Next up** (derived next episodes), with Play deep-linking to the
  item detail until real playback lands.
- **Collection pages:** `/collections/{id}` replaces `/browse` — a header from
  the summary (name, type, description, counts, updated) and a type-keyed body:
  `tv` → file cards, `image` → masonry with subfolder chips (new folders
  endpoint), `serial` → series grid (consumes the serials-library series API).
- **Admin: collections management.** The panel becomes a collections table
  (20+ rows: name + description, type, root folder, items, updated, Scan/Edit,
  inline scan results) with a sticky header, an add-collection form with
  description, and an **edit overlay** (PATCH name/description; root folder is
  immutable and rendered read-only with an identity warning). The plugin/enrich
  Status section is removed from the SPA (`GET /admin/status` itself stays).
- **API deltas (additive except one DTO field):** libraries gain `description`
  (create + PATCH), `GET /libraries/{id}/summary` (items + updated_at) and
  `GET /libraries/{id}/folders` (depth-1 subfolder counts); a minimal
  **playback-progress** capability (SQLite store + `PUT/GET
  /api/v1/progress[/{item_id}]`) so Continue/Next up have real data before any
  streaming exists.
- **Deferred (explicit non-goals):** range-request file serving and in-browser
  playback (backlog `internal/stream`), root-folder moves (identity =
  `(library_id, relative_path)`; PATCH rejects `root_path`), collection delete
  (needs the janitor design), real playback controls. Play deep-links until the
  playback capability lands.

No breaking changes: all new endpoints are additive; the only contract change is
the library DTO/read model gaining an optional `description` field; the SPA
drops the Status section without touching the `GET /admin/status` contract.

## Capabilities

### New Capabilities

- **`playback-progress`** — a minimal playback-position store and read/write
  API (`PUT /api/v1/progress/{item_id}`, `GET /api/v1/progress[/{item_id}]`)
  feeding the Continue/Next up surfaces. Streaming and playback controls stay
  out of scope.

### Modified Capabilities

- **`web-ui`** — sidebar shell replaces the top nav; Home replaces `/browse` as
  the landing surface; `/collections/{id}` collection pages; Continue/Next up;
  admin panel becomes collections management (status section removed); the SPA
  endpoint allowlist and the embedded-build route literals are updated.
- **`scan-library`** — libraries gain `description` (create + list + PATCH via
  the new update endpoint) and two read-only browse-group endpoints:
  `GET /libraries/{id}/summary` and `GET /libraries/{id}/folders`.

## Impact

- **Affected code:** `internal/store` (libraries `description` column via a new
  idempotent migration entry; `playback_progress` table; summary/folders/progress
  queries), `internal/api` (PATCH + summary + folders + progress handlers and
  routes, DTO field), `cmd/mellifera` (wiring only), regenerated
  `internal/web/api/openapi.{json,yaml}`, and the SPA `web/src` (shell, home,
  collection pages, admin) with the regenerated committed `internal/web/dist/`.
- **Not affected:** proto/`pkg/sdk`, all plugins, scan/enrich pipelines, the
  `GET /admin/status` contract, item/series document shapes.
- **Dependencies:** none new at build time (pure Go, CGO off, node-free gate).
- **Depends on:** `serials-library` for the serial collection page (series
  grid consumes `GET /api/v1/series*`); films/photos/admin/home are independent
  of it.
- **Systems:** SQLite gains one column (idempotent `ALTER TABLE` migration
  entry) and one table (`CREATE TABLE IF NOT EXISTS`); no data migration.
