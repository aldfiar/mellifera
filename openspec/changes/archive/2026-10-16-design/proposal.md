# Proposal

## Why

Two gaps on the viewer screens. First, raw system filenames render on user
surfaces — movie/episode cards carry the mono filename row, photo tiles a
filename footer, the generic grid a filename row, and file-backed series floor
to their filename in the title slot; Plex/Jellyfin show the filename only in
the item's media-info panel. Second, there is no management surface where the
media is: the operator capabilities that exist (parser attach/reorder,
metadata refresh, naming options, rescan) are reachable only via `/admin`
round trips, while the per-card rename button is always visible. Management
belongs ON the element and ON the library header.

## What Changes

Three SPA-only passes over `web/src` — zero Go changes, every endpoint already
shipped:

- **Pass 1 — filenames off user surfaces + CardActions shell.** The raw
  filename rows leave every collection surface (movie cards, photo tiles, the
  generic grid); the parsed chip row collapses to ONE muted dot-separated meta
  line (`1080p · 23:50` — the `SxxExx` chip dies, the display name already
  carries it); the series status pill and the "file" chip leave the series
  card. A surface-scoped floor rule replaces the filename where a title is
  empty: menu-bearing cards (MovieCard/EpisodeCard) render the extension-less
  stem plus a muted "Not identified" marker; the generic grid and file-backed
  series render the stem with no marker; photo tiles render no title at all. A
  quiet CardActions menu (⋯ trigger, hover/focus reveal, persistent on coarse
  pointers) opens ONE dialog overlay with a Rename view (reusing the existing
  rename form semantics untouched) and a Mark watched row (gated on a known
  duration; `PUT /progress` with `position=durationSeconds`).
- **Pass 2 — Identify and per-item Refresh views.** The Identify view MUST
  open with `GET /items/{id}` — `extra_parsers` is populated only by the
  detail endpoint, so computing attachable parsers from list rows would make
  the full-replacement `PUT /items/{id}/parsers` silently drop existing
  attachments. Attachable = module declared parsers − `extra_parsers`. The
  Refresh view posts `POST /libraries/{id}/refresh` with one chain parser and
  this row only, rendering the 202 counts (including the deferred copy) and
  the 409 "already running" copy inline.
- **Pass 3 — library Manage overlay.** A quiet gear at the collection header
  opens ONE wide lifted dialog with five sections, each an independent SAVE
  BOUNDARY (rescan / parser chain / naming / refresh metadata / edit library).
  Save success invalidates `["libraries"]` AND `["library", id]` and re-reads
  the module block from `GET /libraries/{id}` — never from the PATCH body
  (the PATCH round-trip never returns the module block). The naming section's
  live preview is a client mirror that must match the Go composer
  byte-for-byte, pinned by golden-vector tests.

Cut and deferred (explicitly out of scope):

- **Merge duplicate series — CUT.** The drafted backend was unsound: there is
  no `items.series_id` column; series membership is path-derived and series
  identity IS `(library_id, relative_path)`, so any merge that does not move
  files is resurrected by the next scan. The real cures (scan/parser-side
  series-identity normalization, or tombstone + grouping key) are future
  changes. Series duplicates remain curable today by a series rename.
- **Enrichment-health section — dropped** pending a small Go change
  (`GET /enrich/failures` has no library filter). Backlog.
- **ItemGrid and photo-tile menus — deferred** (mechanical later: wrapper +
  CardActions). **Admin EditOverlay re-home onto the lifted shell** — optional
  follow-up commit after Pass 3, an independent revert surface.

Accepted defaults carried from the verified design draft (proceeding, not
open): Mark watched stays gated on `durationSeconds` (label "Mark watched");
staleness after an Identify save is copy-only (no delayed re-invalidation); an
operator override that equals the filename wears the "Not identified" marker
(self-inflicted, cosmetic — documented, not special-cased).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `web-ui`: collection card surfaces drop raw filenames and collapse chips
  into a muted meta line with a surface-scoped unidentified-title floor; a
  CardActions element menu adds rename / identify / per-item refresh /
  mark-watched views on item and series cards; a library Manage overlay adds
  five section-scoped save boundaries with an explicit save/invalidation
  contract; the SPA's endpoint allowlist gains the two already-shipped
  enrichment routes (`POST /libraries/{id}/refresh`,
  `GET /libraries/{id}/enrich/preview`); the embedded build carries the
  regenerated management surface.

## Impact

- `web/src/pages/collections/Collection.tsx` — the bulk of the change
  (deletions, CardActions, Identify/Refresh views, Manage overlay).
- `web/src/lib/api.ts` — `UpdateLibraryRequest` gains `parsers` /
  `naming_group_style` / `naming_element_name` (the Go PATCH already accepts
  them); new clients `putItemParsers`, `postLibraryRefresh`,
  `getEnrichPreview` (all pre-existing endpoints).
- `web/src/lib/queries.ts` — `useUpdateLibrary` invalidation set widens to
  `["libraries"]` + `["library", id]`.
- `web/src/lib/naming.ts` (new) — the `composeItemName` client mirror pinned
  to the Go `display.go` composer by golden-vector tests.
- `web/src/pages/admin/Collections.tsx` — the EditOverlay form extracted into
  a shared component (behavior unchanged).
- `web/src/styles/index.css` — reveal CSS, menu/overlay styles (~10 lines
  Pass 1, more in Pass 3).
- `internal/web/dist/` — regenerated at landing via the dev-time
  `make web-build` path and committed (house pattern); OpenAPI contract
  files unchanged (no route or annotation edits); the Go gate stays
  node-free and green.
- No Go source changes. No database changes. No new dependencies.

## Post-gate amendment (2026-10-16)

After the GATE 2 review, the human approved exactly two amendments, re-authored
through propose: (1) the Identify view gains an attach affordance — it offered
reorder/remove only, so an unidentified item could never gain its first parser;
the attachable parsers render as add chips (the Parser chain section's pattern)
and tapping one appends it to the draft (new scenario + task box 2.4). (2) The
"Collection pages" pill sentence is scoped to the cards this change covers —
the menu-bearing cards and the series/episode cards — because the blanket
wording contradicted the generic grid's untouched status chip. No other
artifact changed; this amendment authors no code.
