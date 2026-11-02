# Spec Delta

## ADDED Requirements

### Requirement: Spaced Smart-TV variants detect decisively

The strong-marker table SHALL match Smart-TV spellings with any separator — space, underscore, hyphen, or none — case-insensitively (for example "Smart TV", "SMART-TV", "smart_tv", "SmartTV"), with the same decisive precedence as the existing compound markers: a hit in the user agent OR the Chromium high-entropy model hint SHALL rule tv mode outright on first load, with no geometry or touch corroboration consulted and none able to vote the decision away. The widening SHALL NOT alter the weak-token rule: a user agent carrying no Smart-TV variant and no other strong marker SHALL still need wide-short-viewport + zero-touch corroboration for its generic TV token, and corroboration SHALL remain insufficient alone.

#### Scenario: The operator's Android TV WebView detects on first load

- **WHEN** the SPA first loads in a browser whose user agent carries a spaced Smart-TV device string (for example "Smart TV Pro" inside an Android WebView) at a full-HD, zero-touch viewport with no stored ruling
- **THEN** tv mode is applied for that load — the spaced variant is decisive, and no corroboration leg is consulted

#### Scenario: A spaced model hint upgrades a desktop ruling

- **WHEN** the synchronous ladder rules desktop on an unmarked user agent but the Chromium high-entropy probe resolves a model hint carrying the spaced Smart-TV variant
- **THEN** tv mode is added for that load — the probe reads the same widened table, and its upgrade-only contract holds: it never removes a ruling

#### Scenario: A lookalike desktop stays desktop

- **WHEN** the SPA first loads in a desktop browser whose user agent carries no Smart-TV variant (spaced or compound) and no other strong marker, at any viewport — including a full-HD, zero-touch one
- **THEN** the desktop layout renders — the widened table cannot conjure a TV from an unmarked user agent, and corroboration alone stays insufficient
