# Spec Delta

## MODIFIED Requirements

### Requirement: Artwork composition precedence

Served series and item documents SHALL carry an additive `artwork` field — the proxy URL of the resolved artwork — and SHALL omit the field entirely when no artwork resolves (honest absence: never an empty URL, never a placeholder URL). Composition SHALL resolve, in order: the entity's stored artwork override, then the first non-placeholder poster URL walking the entity's gate-resolved metadata chain AS THE CALLING VIEWER SEES IT — a source muted for the viewer composes nothing for that viewer (the mute floors the walk to the next source, the per-viewer dormant symmetry) — then — items only — the owning series' first non-placeholder chain poster, the series resolved by the same backing rules the store's series-to-episodes derivation uses (exact relative path for file-backed series, directory prefix for directory-backed series), so an episode without its own artwork inherits its series' poster; a series without resolvable artwork leaves the item's field absent. The frame-grabber thumbnail leg stays client-side (the detail surface's existing hero fallback); composition covers exactly the two server-side legs. Composition SHALL be computed at read time and never persisted into documents, SHALL batch its override and materialization lookups for the page's ids, and SHALL be tolerant: a corrupt document floors to absent artwork, never a failed read. When the resolved poster's bytes are not yet materialized, the read SHALL still serve the resolved URL and acquisition SHALL proceed without blocking the read.

#### Scenario: Composition walks override, chain, then absence
- **WHEN** three series are served — one with a stored override, one whose gate-resolved chain carries a real poster, and one whose only chain poster is a known missing-art placeholder
- **THEN** the first document's `artwork` names the override's proxy URL, the second names the chain poster's proxy URL, and the third omits the `artwork` field entirely while still answering 200

#### Scenario: Composition never errors on a corrupt document
- **WHEN** a series document is corrupt or unparseable
- **THEN** the read still succeeds with the `artwork` field absent — composition floors to absence, never fails the read

#### Scenario: Item inherits the series poster
- **WHEN** an item resolves no override and carries no usable namespace poster, while its owning series' chain carries a real poster
- **THEN** the item's served `artwork` names the series poster's URL (the proxy URL when staged), and items that resolve their own artwork are unaffected

#### Scenario: Series without art leaves the item absent
- **WHEN** an item resolves no own artwork and its owning series also carries no usable poster
- **THEN** the item's served document omits the `artwork` field entirely

#### Scenario: A muted source composes nothing for that viewer

- **WHEN** a series whose only poster rides source A is served to viewer V1 (no mutes) and viewer V2 (a group mutes source A)
- **THEN** V1's document carries A's poster URL while V2's omits the `artwork` field entirely — the same stored namespace, the mute hides composition per viewer without touching storage
