## MODIFIED Requirements

### Requirement: Poster art rendering through the binary

The SPA SHALL render poster artwork from the served document's `artwork` field only — it SHALL never read `sources.*.poster` and SHALL issue zero external image requests on library surfaces. A `PosterFrame` component SHALL show the art through the authenticated art-object byte channel (object-URL `<img>`, the existing media-fetch idiom) when `artwork` resolves, and otherwise SHALL render the deterministic generated fallback: a pure function of the display name hashing to two pastel HSL stops with the first grapheme as the initial (Cyrillic verbatim) — never today's blank span, never a broken-image glyph, never a known missing-art placeholder asset. The three surfaces SHALL adopt it: collection series cards (the `scard-poster` slot), the series-flow header poster beside the About panel (the header never collapsing), and the item page's identity-column lead image (`item.artwork` when served, else the existing frame-grab hero fallback; the player's poster behavior untouched). A module-scope LRU of object URLs (~64 entries) SHALL own revocation (on eviction and URL change) so grid remounts consult the cache instead of re-fetching. The art byte channel SHALL route a 401 through the app's single session-rotation sequence (the shared `handle401` path — the sole 401 authority) and SHALL NOT additionally mask it as the generated fallback: once rotation owns the session, an art surface keeps its current state; every other failure (404 serve miss, network, abort) keeps the generated fallback.

#### Scenario: Real art renders through the binary, absence renders the fallback
- **WHEN** the collection grid renders a series whose document carries `artwork` and a series whose document omits it
- **THEN** the first card shows the poster bytes fetched through the authenticated art-object channel, and the second shows the generated fallback card derived from its display name — same name, same gradient, no broken-image state

#### Scenario: Grid remount does not re-fetch art
- **WHEN** the operator navigates away from the collection grid and remounts it
- **THEN** the art objects come from the module-scope LRU and the network carries no additional art-object requests beyond the first load

#### Scenario: Item page lead image prefers served artwork
- **WHEN** an item page renders for an item whose served document carries `artwork` and for one that omits it but carries the frame-grabber thumb fact
- **THEN** the first renders the served artwork as the identity-column lead image, and the second falls back to the existing hero thumb — the player's poster behavior unchanged in both

#### Scenario: Art 401 rotates instead of masking
- **WHEN** an art-object fetch answers 401 (the stored token no longer authenticates)
- **THEN** the app's 401 rotation fires exactly as every other channel (credentials cleared, credential-aware redirect), and the art hook does not write the generated fallback over the surface — a previously rendered poster stays until the rotation lands; a non-401 failure still renders the generated fallback

### Requirement: Poster management overlay

The SPA SHALL offer a poster management overlay («Постер…») entered from the series card's CardActions menu and the item page's ⋯ menu, in the existing dialog-shell idiom (scrim, focus trap, escape matrix, awaited-mutation collapse, inline canonical errors with the overlay staying open). The overlay SHALL list one candidate card per served candidate (namespace poster, uploaded «user», item «thumb»), the active selection marked «Текущий» and the rest offering «Сделать главным»; staged candidates SHALL render their served proxy URLs while unstaged candidates render the raw remote URL hotlinked only inside this admin-only overlay (lazy load, hidden on error — the contractual exception to the zero-external-requests rule). Selecting a candidate SHALL PUT the selection and re-poll the candidates read until `current` flips, during which browse surfaces keep the previous artwork (no flash); the provenance footer SHALL read the served document's `_provenance.poster`. When the candidates envelope carries `reason: "no_upstream_art"`, the empty state SHALL render «У источника нет постера» — field-driven off the served reason, never inferred from a source literal; any other empty envelope keeps the generic no-posters line. The overlay SHALL offer an upload path (drag-and-drop + file picker with a client-side pre-check mirroring the server guard for fast feedback — the server stays authoritative), an in-flight quiet line, and «Сбросить к источнику» (DELETE, resetting to the chain).

#### Scenario: Single-source series shows current and reset
- **WHEN** the overlay opens on a series whose only candidate is the served chain poster and no override is pinned
- **THEN** that candidate is marked «Текущий», «Сбросить к источнику» is the only action, and activating it answers success without error while composition stays on the chain value

#### Scenario: Rejected upload keeps the overlay open with an inline error
- **WHEN** the operator drops a file that fails the pre-check, or the server rejects an upload with a canonical error
- **THEN** the overlay renders the inline error line without closing, and no candidate or selection state changes

#### Scenario: Select polls until current flips without flashing browse
- **WHEN** the operator activates «Сделать главным» on an unstaged candidate
- **THEN** the selection is PUT, the overlay polls the candidates read until `current` marks the new selection, and the grid card keeps showing the previous artwork until the flip completes

#### Scenario: Upstream-no-art state renders the served reason
- **WHEN** the overlay opens on a series whose candidates envelope carries `reason: "no_upstream_art"`
- **THEN** the empty state reads «У источника нет постера» and the upload path remains available, while an envelope without the reason keeps the generic no-posters line
