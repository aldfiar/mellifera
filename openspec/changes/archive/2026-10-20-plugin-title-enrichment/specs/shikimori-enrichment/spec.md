# Spec Delta

## ADDED Requirements

### Requirement: Title composition contract (RU-first)

The plugin's namespace title object SHALL remain the stable cross-module
contract that composition consumes: `sources.shikimori.title` carries exactly
the `romaji` and `russian` keys, and the core composer reads `russian` for the
preference code "ru" and `romaji` for "en" (the seeded serial preference is
RU-first). An empty or absent key SHALL floor to the next preference code or
the next title source — never an error, never a placeholder. The plugin SHALL
NOT be gate-aware: operator gating is a core-side concern, and the namespace
bytes are identical whether the source is enabled or dormant.

#### Scenario: The namespace title keys satisfy the preference codes

- **WHEN** the composer walks a shikimori namespace under the seeded RU-first preference and, separately, under an en-only preference
- **THEN** the russian key serves the first and the romaji key the second, and a namespace whose russian key is empty floors to romaji under the seeded preference

<!-- wf:probe id=77e893c0fa607ed6 -->
```bash
set -e
go test ./internal/api -run TestSeriesDisplayName -count=1
```
<!-- /wf:probe -->
