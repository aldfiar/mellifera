# Spec Delta

## ADDED Requirements

### Requirement: Per-viewer chain mutes

A user's group memberships SHALL mute metadata sources FOR THAT VIEWER at
read time: the mute document rides the group's schema-versioned JSON (the
metadata_source_prefs vocabulary shape), resolves MUTE-WINS across the
user's overlapping groups (any group's mute silences the source for that
viewer), and applies as a post-`ResolveGates` AND-down on COPIES of the
gate-resolved chain at the ONE client-facing presentation site — NEVER as
synthetic operator pref rows (a library-row override must never defeat a
group mute). A muted source SHALL be dormant FOR THAT VIEWER, symmetric to
an operator gate: excluded from that viewer's composition (display titles
floor to the next source) and served with `enabled=false` in `source_chain`,
while the stored namespace, provenance and view entries stay byte-identical.
Derivation, the enrichment queue, settle, and every write-time
`ResolveGates` site SHALL stay group-blind and operator-gated — switching a
user's groups wakes nothing and destroys nothing; the queue enriches the
union of sources. Admin and System callers SHALL observe the operator gate
resolution, never a viewer's mutes.

#### Scenario: Two viewers observe different chains for the same collection

- **WHEN** a series enriched by sources A and B is served to viewer V1 (no mutes) and viewer V2 (a group mutes source A)
- **THEN** V1's served display name and `source_chain` resolve A and B as today, while V2's composition floors past A to B and V2's `source_chain` carries A with `enabled: false` — both viewers read the same stored namespaces, byte-identical

#### Scenario: Mute-wins across overlapping groups

- **WHEN** viewer V belongs to group A (mutes source X) and group B (no X mute), and an operator library-scope pref enables X for V's library
- **THEN** X is still muted for V — one group's mute silences the source, and the operator library-row override never lifts a group mute

#### Scenario: Group-blind derivation

- **WHEN** an admin edits a user's groups (adding or removing mutes) while the enrichment queue holds work for the affected libraries
- **THEN** derivation, the queue, and settle run unchanged (operator-gated, the union of sources) — nothing wakes, nothing is purged, and the next read serves the new mute state
