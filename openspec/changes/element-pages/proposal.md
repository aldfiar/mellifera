# Proposal: element-pages — media-first element pages, parser-ordered footer, parser attachment, browsing

## Why

The element page is where the user lives, and it does not yet lead with the
thing they came to see. Today `/items/:id` leads with a Details surface whose
arrangement is operator-shaped (core fields → identifiers → `_view`), the
per-parser provenance story has no viewer-facing form — every attached
parser's contribution is buried in the collapsed Technical-details
disclosure — and there is no notion of *which* parser's fields a viewer sees
or in what order, even though each `sources.<plugin>` namespace carries
exactly the ordered, lossless facts the design promises (D3, precision over
collapse). Two more viewer gaps: elements cannot be browsed (no prev/next
from one photo/film/episode to the next — the masonry and grids dead-end on
the first tile opened, and until this change's design pass several tiles did
not navigate at all), and photos have no slideshow, the one consumption mode
a photo library exists for (Jellyfin's lightbox is the proven pattern).
Separately, parser attachment is all-or-nothing per collection: the module
seed's `metadata_sources` chain is fixed config, so a user cannot say "this
collection parses everything with provider X — except this one stubborn item,
which gets its own parser" (the canonical anime case).

## What Changes

- **Media-first element-page layout (SPA):** `/items/:id` and the serial
  episode flow restructure around a priority ladder — **media → mandatory
  identity → parser-ordered metadata footer → Technical details (collapsed,
  unchanged)**. Video-typed items render a two-column arrangement: the media
  stage (16:9, the frame-grabber thumb fact) LEFT with the play affordance,
  the identity column RIGHT (element name, raw path, identity badges,
  resume/progress row). Image-typed items (photos) render the photo itself as
  the dominant full-width surface — the photo IS the page. Series-level
  items keep the same ladder with the poster/frame stage.
- **Parser-ordered metadata footer (SPA + module config):** below the
  identity block, the page renders one group per attached parser **in chain
  priority order**; each group carries the parser pill and renders that
  parser's **declared display-field order** (`display_fields`, new module
  config) — label/value pairs, absent fields silently skipped, namespaces
  never merged, values verbatim from `sources.<plugin_id>` with provenance
  one click away in Technical details. Seeded-but-unloaded providers (tmdb)
  render as empty slot groups in their chain position. Field ORDER lives with
  the parser (module seed), editable per collection; the core never hardcodes
  field names (AC-4 pattern — media-type and provider literals stay in
  config).
- **Mandatory identity per type (module config):** each module declares
  `identity_fields` — the fields that identify the element, rendered
  directly under/next to the media (movie: title + year; serial series:
  display_title + season; serial episode: season/episode + episode name;
  photo: capture date). A mandatory field with no source renders an explicit
  slot state ("episode name — no naming parser attached yet"), never blank
  and never a fabricated value.
- **Parser attachment, three scopes:** (1) the type-default chain from the
  module seed (exists); (2) **collection-common parsers** — the ordered
  parser list becomes editable via `PATCH /api/v1/libraries/{id}` (runs for
  every element; the order here is the footer order and the queue priority);
  (3) **element-only parsers** — `PUT/DELETE /api/v1/items/{id}/parsers`
  (admin role group) attaches parsers to a SINGLE item; attachments live in a
  new `item_parsers` control table, survive re-scans, never leak to sibling
  items, and join the async enrichment queue derivation (the D-Q1 rule
  holds: queueable iff the source's `auth_mode != "CLIENT"`). The anime
  example: a whole collection takes titles from one provider; one stubborn
  series attaches anitomy element-only and gains its own footer group after
  the collection chain.
- **Element browsing (SPA):** `←/→` keyboard and on-screen chevrons move from
  one element to the previous/next within the ordered collection view the
  user navigated from (wrap-around), with a position counter and per-item
  entry — every photo tile, film card, and episode row opens THAT item at its
  position. Series stay hierarchical (browsing lives in the episode list).
- **Photo slideshow (SPA):** a Slideshow affordance on the photo page (and
  the `S` key) auto-advances through the collection view (~2.5s), pauses and
  resumes, is reset by manual navigation, and `Esc` stops it first and leaves
  the page second.
- **Deferred (explicit non-goals):** no server-side neighbors endpoint
  (browsing resolves within the SPA's loaded ordered view; a lazy-paging
  neighbors route goes to backlog), no episode-name source (B3/NFO fills the
  slot later), no client-role gating changes (attachment is admin-only; the
  `RoleClient` resolver stays deferred), no RAW image discovery, no
  cross-fade/preload polish beyond a straight swap (noted for the real
  implementation), no janitor.

No breaking changes: protos, `pkg/sdk`, and the plugin contract are
untouched (D-1 pattern — display/identity declarations are config, not
capability types); all API deltas are additive fields/routes; `go.mod`
gains nothing.

## Capabilities

### New Capabilities

- **`parser-display`** — how parser contributions become viewer-facing
  metadata: per-parser `display_fields` ordering and per-module
  `identity_fields` declaration (module config, seeded), the metadata-footer
  rendering contract (chain order, parser order, skip-absent, slot states),
  collection-common parser chain editing (`PATCH /libraries/{id}`), and
  element-only parser attachment (`PUT/DELETE /items/{id}/parsers`,
  `item_parsers` table, queue derivation, re-scan survival, sibling
  isolation).

### Modified Capabilities

- **`web-ui`** — the Item detail view requirement is amended: media-first
  arrangement (media stage + identity column + footer under it) on top of the
  existing Details/Technical-details tiers, which stay intact. The SPA
  endpoint allowlist gains the parser-attachment routes. Two new
  requirements: element browsing (prev/next) and the photo slideshow.

## Example walk-throughs (the scenarios in spec terms)

- **Anime exception:** the `anime` collection (module serial) chains
  base-scanner → serial-parser; every series' title comes from serial-parser.
  The user attaches `anitomy` (proposed local parser) to the one series whose
  romaji title serial-parser mangles: `PUT /items/{ser_7_…}/parsers
  {"parsers":["anitomy"]}`. Its footer gains an `anitomy` group AFTER the
  chain, marked element-only; siblings are untouched; the next scan keeps the
  attachment (identity `(library_id, relative_path)` is stable); the queue
  drains `(item, anitomy)` like any queued source.
- **Scanned photo (skip-absent):** image-enricher declares
  `display_fields: [date_taken, camera, dimensions, gps]`. A 1989 scanned
  negative carries only width/height/format — the footer shows the group with
  the dimensions pair alone; `taken`, `camera`, `gps` pairs are absent, not
  zeroed, and the identity slot shows the year from the folder name.
- **Episode without a naming source:** the episode's identity block renders
  "One Piece · S02E01" + "Episode 1" and an explicit slot for the episode
  name (no naming parser attached — tmdb episode titles land with B3).
- **Order is the parser's:** tv-parser declares
  `title → year → resolution → parsed_from`; the film footer renders exactly
  that order regardless of the JSON key order in `sources["tv-parser"]`.
