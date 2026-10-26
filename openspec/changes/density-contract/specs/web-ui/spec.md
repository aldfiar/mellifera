# Spec Delta

## ADDED Requirements

### Requirement: Height-aware poster rows
The serial collection poster grid SHALL size its grid TRACKS from the viewport HEIGHT (a CSS calc over 100vh) so the active tier's rows plus the page header fit within 100vh, while the 2:3 poster ratio is preserved and every card fills its track (no per-card clamp inside a wider track).

#### Scenario: Tall viewport keeps two rows visible
- **WHEN** the collection page renders at a viewport height of at least 662 CSS px (where the two-row budget meets the 120px card floor)
- **THEN** track width follows the two-row budget — two full rows plus the header fit within 100vh

#### Scenario: Short viewport keeps one full row visible
- **WHEN** the viewport is shorter than 662 CSS px but at least 422 CSS px (e.g. the 633px-tall laptop window where the floor-bound clamp was reported)
- **THEN** the grid drops to the one-row tier: track width follows the one-row budget, so one full row plus the header fits and cards keep real width (≈261px at 633px) instead of collapsing to the 120px floor

#### Scenario: Degenerate viewport floors the track
- **WHEN** the viewport is shorter than 422 CSS px, so even the one-row budget falls under the floor
- **THEN** tracks floor at 120px — the documented degradation; the grid never collapses to zero

#### Scenario: Cards fill their tracks
- **WHEN** the height-aware track sizing applies at any tier
- **THEN** each card's width equals its track width (no dead space beside a clamped card), posters keep the 2:3 aspect ratio, and narrow containers (phones) still lay out two columns via the half-container track cap

#### Scenario: Tall viewport leaves the grid unconstrained
- **WHEN** the viewport is tall enough that the height bound exceeds the natural column width
- **THEN** the grid renders at its natural column widths (the budget never widens a card)

### Requirement: Single browse content cap
The Home and collection pages SHALL share one browse content cap (max-w-6xl); the item detail page SHALL keep its own reading cap (max-w-5xl) as the declared exception.

#### Scenario: Home and collection share the browse cap
- **WHEN** the Home page and a collection page render at a wide viewport
- **THEN** both constrain their content to the same 6xl (1152px) browse cap

#### Scenario: Detail keeps the reading cap
- **WHEN** an item detail page renders
- **THEN** its content cap stays max-w-5xl (the declared exception, not part of the browse-cap unification)

### Requirement: Card type floor
Card titles and photo tile footers SHALL render at 14px or larger everywhere.

#### Scenario: Series card titles meet the floor
- **WHEN** a series card renders its display title
- **THEN** the title renders at 14px (previously 12.5px)

#### Scenario: Photo tile footers meet the floor
- **WHEN** a photo tile renders its capture-date footer
- **THEN** the footer renders at 14px (previously 11px)

#### Scenario: Other micro-copy keeps its scale
- **WHEN** chips, sidebar links, or profile lines render
- **THEN** their existing font sizes are unchanged (the floor is scoped to card titles and photo tile footers)

### Requirement: Photo preview viewport cap
The item detail photo stage SHALL cap the preview image by the real chrome above it (calc(100vh - chrome)) so the image and the identity block below it never clip the viewport on desktop.

#### Scenario: Image and identity fit the viewport
- **WHEN** a photo page renders on the desktop viewport where the clip was measured (633 CSS px tall)
- **THEN** the image's bottom edge and the identity block below it stay within the viewport (the fixed 80vh overflow clip is gone)

#### Scenario: Degenerate chrome floors the stage
- **WHEN** the configured chrome approaches or exceeds the viewport height
- **THEN** the stage caps at a usable minimum height (320px) instead of collapsing toward zero

#### Scenario: Video lane untouched
- **WHEN** a video item renders its watch lane
- **THEN** the player surface is unchanged (the cap applies to the photo stage only)
