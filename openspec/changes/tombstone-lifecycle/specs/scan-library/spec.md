# Spec Delta

## ADDED Requirements

### Requirement: Item tombstone sweep and self-heal

After a scanner stream ends in a confirmed clean completion, the pass SHALL sweep the library's ITEM rows in the same post-drain branch that sweeps series: every item whose status is not `deleted` SHALL have its resolved original path — the document's stamped absolute path, the same single file-location channel the direct floor serves through — checked on disk, and an item whose file is absent SHALL advance to `deleted`: the same soft-delete literal the series sweep writes, the document byte-untouched, every dependent row (progress, ledger, title overrides) preserved. The sweep SHALL judge disk truth — the stat, not the pass's observation set: a file present at its stamped path never tombstones, a file absent tombstones regardless of which pass last observed it. An item whose stamp is absent or unreadable SHALL be skipped with a warning — a missing stamp is an assembly anomaly, never evidence of a vanished file. The sweep SHALL be per-row soft-fail (a failed row check is a warning; the sweep continues; a cancelled context aborts it) and SHALL skip already-deleted rows without touching their update stamps. The item sweep SHALL run ONLY behind the same gate as the series sweep — a stream that ends before completing SHALL sweep neither series nor items. A tombstoned item whose file returns SHALL heal through the re-scan upsert exactly as a re-observed deleted series heals: a re-scan whose parsed identity is unchanged SHALL advance the row from `deleted` to `ready` with its derived namespaces carried forward, and one whose parsed identity changed SHALL advance it to `stale` — a wrongful tombstone (an offline root) and a restored file both heal on the next healthy rescan. A tombstoned item SHALL be absent from every surface that lists or joins items: the default item listing (an explicit `?status=deleted` lifecycle passthrough keeps working), series episode lists and the next-episode pick, the progress reads and the home rail (the non-deleted join), the browse/search/facet index (its walk exclusion and epoch count leg), and the item detail route (404 `not_found`) — and the enrichment derivation SHALL never dispatch a deleted row: the queue's derivation and re-enrichment sweeps read live rows only, because a dead row has nothing to enrich (stripping a tombstoned row's namespaces would damage the self-heal's namespace carry-forward); a self-healed row re-enters derivation the moment the re-scan upsert advances its status. While tombstoned, the row's playback-progress and watched-ledger rows remain stored untouched, retained for identity adoption and audit: progress feeds no served read and no scoring input, and adoption re-keys the state onto a live identity match within one rescan. The artwork garbage-collection union SHALL keep reading ALL item rows explicitly — a tombstoned item's artwork files SHALL NOT be garbage-collected while it sits tombstoned, so a self-heal or a later re-enrichment finds its posters intact.

#### Scenario: A vanished file tombstones its item on the next clean rescan

- **WHEN** a library holding an active item is re-scanned to a clean drain after the item's file was deleted from disk
- **THEN** the item's row reads status `deleted` with its document byte-unchanged and its progress and ledger rows preserved — while a clean rescan over a library whose files all exist tombstones nothing

#### Scenario: A truncated stream never sweeps items

- **WHEN** a scan's stream ends before completing over a library holding items
- **THEN** no item row advances to `deleted` — the item sweep runs only behind the same clean-drain gate as the series sweep

#### Scenario: An absent stamp skips with a warning

- **WHEN** the sweep checks an active item whose document carries no readable absolute-path stamp
- **THEN** the row keeps its prior status, the scan result carries a warning naming the item, and the sweep continues with the remaining rows

#### Scenario: A re-observed deleted item self-heals

- **WHEN** a clean rescan re-observes a tombstoned item's file at its stamped path (re-upserted by file_id)
- **THEN** the row leaves `deleted`: to `ready` with its derived namespaces carried forward when the parsed identity is unchanged, to `stale` when the identity changed

#### Scenario: Surfaces drop the tombstone while its rows survive

- **WHEN** an item tombstones
- **THEN** the default item listing omits it (an explicit `?status=deleted` still serves it), the series' episode list and next-episode pick omit it, the progress reads and the rail omit it while its progress row remains stored, and its item detail route answers 404 `not_found`

#### Scenario: A tombstoned row is never derived or re-enriched

- **WHEN** the queue derivation or a whole-library re-enrichment sweep runs over a library holding a tombstoned row whose sources still carry pending work
- **THEN** no task is derived, dispatched, or stripped for the dead row — and when a later rescan self-heals the row, it re-enters derivation on the following pass

#### Scenario: A healed item's artwork survives the tombstone

- **WHEN** an offline root returns, a clean rescan self-heals the library's tombstoned items, and the artwork settle runs over its union
- **THEN** the healed items' poster/artwork files are intact and serve again — the GC union read all rows explicitly while they sat tombstoned, so nothing was garbage-collected
