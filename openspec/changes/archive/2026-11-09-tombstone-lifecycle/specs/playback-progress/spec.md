# Spec Delta

## MODIFIED Requirements

### Requirement: Progress read endpoints

The API SHALL expose `GET /api/v1/progress` (browse role group) returning
`{items:[{item_id, position_seconds, updated_at, rec_score?}]}` — THE
CALLER'S rows with `position_seconds > 0` joined to existing, VISIBLE,
NON-DELETED items, ordered by `rec_score` descending then `updated_at`
descending by default, with `sort=recent` restoring pure `updated_at`
descending order, limited by `limit` (default 20, max 100, non-integer → 400)
— and `GET /api/v1/progress/{item_id}` returning the caller's single record
or 404 `not_found` when absent (or the item is gone, tombstoned, or
invisible). Every read SHALL be viewer-scoped (the caller's own slot) AND
visibility-conjunct in SQL BEFORE the limit window (no short pages).
`rec_score` SHALL be the entity's recommendation score (recommendation-sorting
capability) carried additively, omitted when scoring is not computable. Reads
SHALL NOT require or imply playback capability. A tombstoned item's rows SHALL
drop from the served reads while REMAINING stored — retained for identity
adoption and audit, never deleted; while tombstoned, the progress feeds no
served read and no scoring input (the shipped non-deleted joins), and adoption
re-keys the state onto a live identity match within one rescan.

#### Scenario: Recent progress list

- **WHEN** three items hold positive positions and `GET /api/v1/progress` is called
- **THEN** the response lists exactly those items scored-first with recency
  as the tiebreak, `sort=recent` lists them newest-first, an item without a
  record is absent from the list and yields 404 on its single-item route,
  and `limit=abc` is 400

#### Scenario: Continue rows follow the viewer

- **WHEN** user A holds an in-progress row on item X and user B has never touched X, and B calls `GET /api/v1/progress`
- **THEN** B's listing omits X entirely — A's position never surfaces in B's Continue rows, and B's own in-progress items still list

#### Scenario: Visibility filters before the limit window

- **WHEN** a scoped user holds many progress rows, several inside libraries their groups do not carry, and requests `GET /api/v1/progress?limit=5`
- **THEN** the served page holds 5 VISIBLE rows — the invisible rows are filtered in SQL before the limit is applied, never as a post-page shave

#### Scenario: A tombstoned item's progress stops serving but survives

- **WHEN** an item's row advances to `deleted` while its positive progress row remains stored, and the caller fetches the listing and the single-item route
- **THEN** the row is absent from the served listing while the stored row remains untouched in storage — retained for identity adoption and audit; while tombstoned it feeds no served read and no scoring input, and adoption re-keys it onto a live identity match within one rescan — and the single-item route answers 404 `not_found`

## ADDED Requirements

### Requirement: Identity adoption of stranded watch state

When a live item's parsed identity matches a tombstoned item that carries playback progress or watched-ledger rows, the system SHALL migrate that state onto the live item and leave no copies on the dead row. The identity key SHALL be the served identity every surface composes — the library, the item's identity floors, and its season/episode facts read through the parser namespaces' fixed order. Episodes SHALL discriminate SERIES through a series-identity bridge: the live item's series row and the candidate's series row (each resolved from its document's parsed series anchor; the dead series row and document survive the tombstone byte-intact) SHALL carry EQUAL and NON-EMPTY parser-composed series titles — the single serial-parser parser-composed series title, the same leg the series display name resolves through the parser namespaces' fixed order — before the (season, episode) legs decide; a legs collision across DIFFERENT series identities SHALL never carry. Films (absent legs on both sides) SHALL match on the item's display title floor alone — equal and NON-EMPTY on both sides. An empty identity floor on EITHER side SHALL never match: no identity facts, no adoption — a plugin-unenriched stranded class keeps its state keyed to the dead id rather than risking an empty-keyed carry across unrelated rows. Migration SHALL be a per-viewer MOVE, not a duplication: a progress row moves into a target slot ONLY when the live item holds no row for that viewer — the live item's own rows ALWAYS win, an explicit zero-position (unwatched reset) slot included, so a viewer's reset is never resurrected; watched-ledger rows move with `completed_at` and `applied_at` preserved verbatim (an already-applied completion never re-learns; an unapplied one learns exactly once, from the new item) and the row's series anchor re-points to the live item's series when one resolves. The dead item SHALL retain no migrated rows afterwards — no ghost stock for the boot backfill or ledger janitor to re-consume. The migration SHALL fire when the live item's served identity becomes known — at the enrichment pass that writes it — so ONE rescan lands the stranded state, and it SHALL fire ONLY for a live row's settle: a tombstoned row neither adopts nor is re-derived (the enrichment derivation never dispatches a deleted row — its self-heal re-includes it the moment the re-scan upsert advances its status), and a move whose source equals its target SHALL be a no-op that moves nothing and deletes nothing. The migration SHALL be idempotent (a re-fire moves nothing) and log-and-skip beside the row's enrichment: a migration failure never fails the row. When no dead candidate matches, the migration SHALL be a no-op and the stranded state stays keyed to the tombstoned id — join-dropped from every surface, harmless.

#### Scenario: A renamed directory's progress lands on the live item

- **WHEN** a serial directory is renamed between scans, the library is re-scanned to a clean drain, the enrichment queue settles the fresh items, and the old episode item tombstoned carrying 88% progress
- **THEN** the two sides' series rows carry the same parser-composed series title (the rename left the series identity intact), the (season, episode) legs agree, and that position reads on the NEW item's slot for the same viewer, the dead row holds no progress rows, and the rail resumes the new item honestly

#### Scenario: Equal episode legs across different series never carry

- **WHEN** a library holds two series with different parser-composed titles and a tombstoned episode of one series shares its (season, episode) legs with a live episode of the other, the dead row carrying stranded progress
- **THEN** nothing moves — the series-identity bridge refuses the match, the dead row keeps its retained state, and the live item gains nothing

#### Scenario: An empty identity floor never matches

- **WHEN** a settled live item and a tombstoned candidate carry no identity facts on their shared floor (both titles empty on the film shape, or both series parser titles absent on the episode shape)
- **THEN** nothing moves — adoption requires a non-empty floor on both sides, and the stranded state stays keyed to the dead id

#### Scenario: A live row always wins the slot

- **WHEN** the dead item's progress migrates onto a live item that already holds its own row in the same viewer slot — a positive row, or an explicit zero-position unwatched reset
- **THEN** the live row is unchanged — the reset is never resurrected — and the dead copy is deleted

#### Scenario: Ledger moves with its learning state

- **WHEN** a dead item's watched-ledger rows migrate — one already applied, one not
- **THEN** the applied row keeps its `applied_at` verbatim (the janitor re-learns nothing), the unapplied row learns exactly once from the new item, both carry their `completed_at` verbatim, and their series anchors re-point to the live item's series

#### Scenario: A tombstoned row neither adopts nor re-enriches

- **WHEN** the queue derivation runs over a library holding a tombstoned row whose sources still derive pending work, and any settled dead row reaches the adoption hook
- **THEN** no task is derived or dispatched for the dead row, the hook does not fire for it, and no move names it as both source and target — its retained stock is untouched

#### Scenario: No match is a no-op

- **WHEN** a settled live item's identity matches no tombstoned candidate
- **THEN** nothing moves, nothing fails, and the enrichment run's outcome is unaffected
