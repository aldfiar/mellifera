# Design

## Context

SPA-only hardening over shipped endpoints — zero Go changes. The full design
work (grounding, three-way branch comparison, reviewer grill) is recorded in
`.tmp/ui-management-design.md` (VERIFIED, 2026-10-16); this file carries only
the decisions the implementation needs plus the cross-group interfaces.
Current state that shapes the approach: `Collection.tsx` is a file-local
component house (MovieCard/EpisodeCard/PhotoTile/ItemGrid/SeriesCard +
`useTitleOverride`/`RenameTitle` all live in one file); the rename mutation
semantics exist and are correct; the enrichment endpoints
(`PUT /items/{id}/parsers`, `POST /libraries/{id}/refresh`,
`GET /libraries/{id}/enrich/preview`) are shipped, allowlisted server-side,
and unconsumed by the SPA; the Go `PATCH /libraries/{id}` already accepts
`parsers`/`naming_group_style`/`naming_element_name` but the PATCH response
never carries the module block, and `useUpdateLibrary` invalidates only
`["libraries"]`.

## Goals / Non-Goals

**Goals:**

- Raw filenames leave every collection card surface; chips collapse to one
  muted meta line; surface-scoped unidentified-title floor.
- Management reachable where the media is: CardActions menu on item/series
  cards (rename / identify / refresh / mark watched), Manage overlay on the
  library header (five section-scoped saves).
- The overlay mechanics are written once as a lift-ready shell (Pass 1
  file-local, lifted to a shared DialogShell at Pass 3).

**Non-Goals:**

- No merge-series feature (the drafted backend was unsound — series identity
  is `(library_id, relative_path)`; path-distinct duplicates survive rescan).
  See proposal — Why/Cut.
- No Go changes of any kind; no enrichment-health section (needs a Go filter
  param — backlog); no ItemGrid/PhotoTile menus; no context-menu gesture
  summon; no URL state for overlays.

## Decisions

1. **CardActions: one file-local unit + a lift seam** (Branch A of the
   three-way comparison; primitives-first and context-menu branches rejected
   — see draft §Alternatives). Pass 1 writes CardActions as
   (DialogShell-shaped shell call) + (local state machine) so the Pass-3 lift
   is mechanical; extraction waits for the ≥2-consumer moment (Manage
   overlay), avoiding inert scaffolding.
2. **Identify opens with a MANDATORY detail fetch.** `extra_parsers` rides
   only `GET /items/{id}`; computing attachable from list rows and saving a
   full-replacement PUT would silently drop existing attachments
   (data-loss). Alternative (list-row only) rejected for exactly that reason.
3. **Five sections, five save boundaries.** `PATCH /libraries/{id}` writes
   the library row and the parser chain in two non-atomic store calls — one
   section save = one request, never one giant PATCH. Alternative (single
   form, single PATCH) rejected: a mid-write failure would leave
   row/chain divergent.
4. **Save/invalidation contract.** Save success invalidates `["libraries"]`
   AND `["library", id]` and re-reads the chain from `GET /libraries/{id}` —
   never from the PATCH body (the response never carries the module block;
   today's `useUpdateLibrary` invalidates only `["libraries"]`, which is the
   trap).
5. **Naming preview as a pinned client mirror.** `web/src/lib/naming.ts`
   reimplements `composeItemName` byte-for-byte, guarded by golden-vector
   tests ({episode} inside the title, 3-digit episodes, absent token → empty,
   Cyrillic verbatim). Alternative (server-side preview endpoint) rejected:
   new Go surface for a display-only concern; the mirror is test-pinned.
6. **Surface-scoped floor, not a global fallback.** The stem+"Not identified"
   marker only where Identify is reachable (menu-bearing cards); ItemGrid
   stems with no marker; PhotoTile no title; directory-backed series never
   stemmed (scene dirs like "Show.S01" would corrupt). The v1 global rule was
   rejected in review — it flagged every photo and pointed at rows with no
   menu.
7. **Overlay state is ephemeral.** Never URL state: route changes discard it;
   an awaited mid-flight mutation completes with its result simply not shown.
   Esc is ignored while a mutation is pending (never render an error into an
   unmounted view).
8. **Accepted defaults from the draft** (proceeding, not open): Mark watched
   stays gated on a known duration with a Go backlog line ("watched flag /
   Continue-rail filtering"); post-Identify staleness is copy-only (no
   delayed re-invalidation); an override equal to the filename wears the
   marker; ItemGrid menu and admin EditOverlay re-home deferred (the latter
   is an optional follow-up commit after Pass 3).

## Interfaces (cross-group)

- **CardActions shell contract** (group 1 → groups 2, 3): the overlay is a
  `role="dialog"` shell with {scrim click-away, Esc matrix, focus trap,
  focus-return, `aria-modal`, `data-open` trigger persistence} and a local
  view state machine `closed | menu | rename | identify | refresh`. Pass 2
  adds views into the existing machine; Pass 3 extracts the shell mechanics
  unchanged into `web/src/components/DialogShell.tsx` (props: open, onClose,
  labelledBy, width variant, children) and re-homes CardActions onto it —
  1.2's tests must keep passing through the lift.
- **api.ts clients** (group 2 → group 3): `putItemParsers(id, parsers:
  string[])`; `postLibraryRefresh(id, {plugin_id, row_ids})` (row_ids
  omitted/absent = whole library, used by 3.4); `getEnrichPreview(id,
  pluginId)`. Signatures only — wire shapes mirror the Go handlers verbatim.
- **UpdateLibraryRequest** (group 3): gains `parsers?: string[]`,
  `naming_group_style?: string`, `naming_element_name?: string` (optional —
  a section save sends only its own fields).
- **useUpdateLibrary invalidation** (group 3, single consumer file
  queries.ts): success → invalidate `["libraries"]` + `["library", id]`.
- **composeItemName mirror** (group 3, group-internal):
  `web/src/lib/naming.ts composeItemName(tmpl, {title, season, episode})`
  byte-for-byte with `internal/api/display.go` `composeItemName`; golden
  vectors in `web/src/lib/naming.test.ts`.

## Risks / Trade-offs

- [PATCH non-atomicity] → per-section save boundaries (Decision 3).
- [Full-replacement PUT data loss] → mandatory detail fetch (Decision 2) +
  the attachable diff formula pinned by tests.
- [Naming mirror drift vs Go] → golden vectors; a display.go composer change
  without updating vectors fails `naming.test.ts` at tick time.
- [Esc/mid-flight races] → Esc ignored while pending; awaited-collapse close.
- [Coarse-pointer reveal invisible to jsdom] → box 1.4 is `[unprobeable]` —
  the gate runner confirms by inspection; MANUAL note lives in the CSS.
- [Staleness after Identify save] → accepted copy-only default; a row in
  failure-ledger cooldown legitimately waits — the copy says so.
- [Card surface regressions from the filename deletions] → the flip set is
  explicit in box 1.1 (two pinned "floor-empty renders EMPTY" tests flip);
  the evidence loss is nil (`relative_path` stays in Technical details).

## Migration Plan

Three passes in DAG order (1 → 2 → 3), then landing: `make web-build`
regenerates the committed `internal/web/dist/` (OpenAPI files unchanged),
full gates re-run. Rollback = revert the SPA commits and re-regenerate dist;
no data migration, no API change, no feature flags.

## Open Questions

None. All former draft questions are recorded as accepted defaults
(Decision 8); none of them would change the specs, the approach, or the
task breakdown.
