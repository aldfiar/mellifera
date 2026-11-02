# Spec Delta

## REMOVED Requirements

### Requirement: TV display mode scales by the reported CSS viewport

**Reason**: The reported-CSS-viewport law has no dpr input, so on high-dpr panels whose CSS viewport is a fraction of the physical panel every px floor of the vw/vh clamps catches at desktop-scale CSS sizes. Measured on the operator's box — an Android-14 4K TV (YaBrowser TV lite WebView) reporting a 960×511 CSS viewport — where the root-type clamp floors 10.08→16px, the card-trigger clamp floors 24→40px, and the poster clamp legs floor at 120px: tv mode renders ≈ desktop scale, defeating the 10-foot layout. Detection, overscan, and persistent chrome all work on that device; only the density law fails.

**Migration**: Replaced by "TV display mode scales by the physical viewport" (ADDED below). The vw/vh clamp law carries forward verbatim — pure viewport fractions are physically dpr-invariant and stay unscaled, which keeps the overscan and two-rows laws intact on every dpr; only the px-floor-bearing clamps gain the devicePixelRatio factor, delivered through a `--tv-dpr` custom property set on the root exactly while the tv class applies. All three scenarios carry forward rewritten under the physical law, and the dpr-1 4K trap scenario becomes the dpr-1 byte-identity guarantee.

#### Scenario: Short viewport keeps two rows on screen

- **WHEN** a tv-mode SPA renders a serial collection at a reported 960×540 viewport
- **THEN** two full poster rows plus the collection header fit inside 100vh — no row is clipped at the fold, and the poster cards keep their 2:3 ratio with titles at or above the 14px type floor

#### Scenario: The dpr-1 4K trap stays readable

- **WHEN** a tv-mode SPA renders at a reported 3840×2160 viewport (4K at dpr 1)
- **THEN** the card-title type resolves through the same vw-clamp as at 1920×1080 — the on-screen physical glyph height matches, and no tv-mode rule emits a bare fixed px size for type, rows, or padding

#### Scenario: Overscan padding keeps the edges visible

- **WHEN** a tv-mode SPA renders on a panel that cuts ~2.5% at every edge
- **THEN** the shell's content starts inside a 2.5%-of-viewport padding zone, so no focusable card or the focus ring itself sits in the cut region

## ADDED Requirements

### Requirement: TV display mode scales by the physical viewport

When the SPA boots in tv mode, the document root SHALL carry the `tv` class and SHALL additionally carry a `--tv-dpr` custom property on the root's inline style, set to the reported `devicePixelRatio` (floored to 1 when it is absent, non-finite, or not positive) exactly while tv mode applies. The property SHALL be removed whenever the ruling is desktop — the boot desktop ruling and the live «Режим ТВ» toggle-off alike — and the async model-probe upgrade path SHALL set it together with the class. The px-floor-bearing size clamps of the `.tv` block SHALL resolve through `calc(<clamp> * var(--tv-dpr, 1))` — the root type, the content cap's px term, the focus-ring width, and the persistent card-action trigger hit target — so their rendered size derives from the physical viewport (the CSS viewport × devicePixelRatio). Every pure viewport-fraction rule SHALL stay unscaled: the 2.5% overscan padding, the poster chrome reserve, the status-line reserve and the stage cap arithmetic built on it, the poster-grid track budget (whose governing leg is a 100vh fraction with its raw floor leg), and the focus outline-offset. A device reporting dpr 1 SHALL render every tv-mode size identical to the shipped `.tv` block (the var default 1). A SPA load without tv mode SHALL never carry the property, and desktop rendering stays byte-identical. The two-rows-fit-100vh law, the overscan law, and the never-a-bare-px law are unchanged.

#### Scenario: The operator's box scales past the floor

- **WHEN** a tv-mode SPA renders at a reported 960×511 CSS viewport with devicePixelRatio 2
- **THEN** the root type resolves to 32 CSS px (the 16px floored clamp result doubled) and the card-action trigger hit target to 80 CSS px — the ×2 physical scale, NOT the desktop-scale floors — while the poster grid keeps its 100vh-fraction track budget and both poster rows still fit the viewport

#### Scenario: A dpr-1 device renders the shipped block unchanged

- **WHEN** a tv-mode SPA renders at any reported CSS viewport with devicePixelRatio 1
- **THEN** every wrapped rule evaluates ×1 — each tv-mode size identical to the shipped `.tv` block, and the dpr-1 4K panel keeps its vw-derived density exactly as before this change

#### Scenario: Desktop and tv-off never carry the var

- **WHEN** the SPA boots to a desktop ruling — an unknown box, a stored Выкл, or an unmarked desktop
- **THEN** the document root carries no `tv` class and no `--tv-dpr` property, and desktop rendering is byte-identical to shipped

#### Scenario: The live toggle-off clears the var

- **WHEN** the operator switches «Режим ТВ» from Вкл to Выкл while the SPA is running at devicePixelRatio 2
- **THEN** the `tv` class drops and the `--tv-dpr` property is removed in the same apply — desktop renders immediately with no residual var

#### Scenario: The probe upgrade carries the var

- **WHEN** the synchronous ladder rules desktop but the async model-hint probe upgrades the ruling to tv on a device reporting devicePixelRatio 2
- **THEN** the `tv` class is added together with `--tv-dpr` 2 — an upgraded box never renders the class at the ×1 fallback density

#### Scenario: Fraction rules stay unscaled

- **WHEN** a tv-mode SPA renders at devicePixelRatio 2
- **THEN** the overscan padding resolves from 2.5vh/2.5vw, the poster chrome reserve from 12vh, the status-line reserve from its 7vh clamp, and the focus outline-offset from its shipped clamp — none multiplied by `--tv-dpr` — and the poster grid's track budget still derives from the unchanged 100vh fraction with its raw floor leg, keeping two rows inside the viewport
