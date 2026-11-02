# tv-mode Specification

## Purpose
Turns the same embedded SPA into a 10-foot TV surface with zero backend work: a `.tv` display mode whose every size derives from the reported CSS viewport, D-pad focus walking and remote media keys mapped onto the existing player actions through one normalization table, overlays that close on browser Back instead of dropping the operator out of the SPA, persistent chrome without hover, an immersive photo stage, and a best-effort device autodetect that a manual «Режим ТВ» override always beats.

## Requirements

### Requirement: TV display mode scales by the reported CSS viewport

When the SPA boots in tv mode, the document root SHALL carry the `tv` class, and every tv-mode size SHALL derive from the reported CSS viewport through vw/vh-derived clamps — never a fixed px value — so a 1080p panel at dpr 1 (1920×1080), a 1080p panel at dpr 2 (960×540), a 4K panel at dpr 2 (1920×1080) and a 4K panel at dpr 1 (3840×2160) all land the same physical density (the dpr-1 4K trap: fixed px there is physically quarter-size). Tv mode SHALL apply overscan-safe edge padding of 2.5% of the viewport (TV Chrome does not compensate overscan), SHALL keep two full poster rows plus the header inside 100vh at any reported shape (on top of, never replacing, the shipped height-aware density contract), SHALL lift the content width cap toward the panel (≤ ~92vw), and SHALL scale the root type up (≈1.05vw clamped 16→30px) with a visibly thicker focus ring. Surfaces that never mount tv mode keep every desktop rule byte-for-byte.

#### Scenario: Short viewport keeps two rows on screen

- **WHEN** a tv-mode SPA renders a serial collection at a reported 960×540 viewport
- **THEN** two full poster rows plus the collection header fit inside 100vh — no row is clipped at the fold, and the poster cards keep their 2:3 ratio with titles at or above the 14px type floor

#### Scenario: The dpr-1 4K trap stays readable

- **WHEN** a tv-mode SPA renders at a reported 3840×2160 viewport (4K at dpr 1)
- **THEN** the card-title type resolves through the same vw-clamp as at 1920×1080 — the on-screen physical glyph height matches, and no tv-mode rule emits a bare fixed px size for type, rows, or padding

#### Scenario: Overscan padding keeps the edges visible

- **WHEN** a tv-mode SPA renders on a panel that cuts ~2.5% at every edge
- **THEN** the shell's content starts inside a 2.5%-of-viewport padding zone, so no focusable card or the focus ring itself sits in the cut region

### Requirement: D-pad focus walks the page grids

In tv mode the SPA SHALL move focus with the D-pad: ArrowUp/Down/Left/Right move focus through the page's focusable links and buttons in row-major DOM order — ±1 for left/right, ±the current row's column count for up/down, edge-clamped with no wrap-around — with no third-party focus library. OK (the Enter key) SHALL activate the focused element through the browser's native activation, and the walker SHALL NOT re-handle it. The walker SHALL yield deterministically to surfaces that own the arrows themselves: the photo stage, the video watch view, any open overlay, and any text-entry focus — never double-handling an arrow press. Focus SHALL be expressed by the locked color-change idiom and SHALL be always visible in tv mode.

#### Scenario: Arrows walk a row-major grid

- **WHEN** focus sits on the third card of a 4-column poster grid and the operator presses ArrowRight then ArrowDown
- **THEN** focus moves to the fourth card of the first row, then to the fourth card of the second row — and at either edge of a row a further outward press keeps focus clamped instead of wrapping

#### Scenario: The walker yields to the photo stage

- **WHEN** the photo browse view is open on an item page and the operator presses ArrowRight
- **THEN** the photo steps to the next image exactly once — focus does not also move to another card, and the stage handles the press no matter which window listener registered first

#### Scenario: The walker yields to overlays and text entry

- **WHEN** a DialogShell overlay is open, or focus rests inside an input field (the login token form), and the operator presses an arrow key
- **THEN** the walker does not move focus out of the overlay or into a page card — the overlay's own focus trap keeps focus, and the text field keeps caret navigation

### Requirement: Media keys drive the player through the shared normalization table

The remote's media keys SHALL act on the watch view through the SAME normalization table as the 3.4 desktop keyboard — transport behavior cannot fork per input device: `MediaPlayPause` toggles playback (the Space action), `MediaTrackNext` and `MediaPrevTrack` step to the next/previous episode (the N/P actions), `MediaFastForward` and `MediaRewind` seek ±10 s (the ←/→ actions), and `MediaStop` exits the watch view (a new `exitWatch` action returning to the item page). The 3.4 legend row SHALL render on TV unchanged (TV Chrome reports `pointer: fine`, so the shipped fine-pointer visibility covers it), and the desktop bindings themselves SHALL NOT change.

#### Scenario: Every media key lands on its 3.4 action

- **WHEN** the watch view is open in tv mode and the operator presses MediaPlayPause, MediaTrackNext, MediaPrevTrack, MediaFastForward, and MediaRewind in turn
- **THEN** playback toggles, the episode steps forward then back, and the playhead seeks +10 s then −10 s — the same calls the Space, N, P, →, and ← keys make, with the browser default dropped exactly once

#### Scenario: Stop exits playback

- **WHEN** the watch view is open and the operator presses MediaStop
- **THEN** the SPA leaves the watch view and returns to the item page, and pressing MediaStop outside the watch view does nothing

#### Scenario: The legend renders on TV

- **WHEN** the watch view renders in tv mode
- **THEN** the 3.4 keyboard legend row renders as on desktop, and the desktop Space/arrows/F/N/P/digit bindings behave exactly as before

### Requirement: Browser Back closes overlays instead of leaving the SPA

Every DialogShell overlay SHALL push a history entry when it opens, so Android TV Back — which is a history-back, not a key event — pops that entry and closes the overlay through the consumer's existing close policy (the Esc matrix: a consumer with an `onEscape` walk runs it, the rest close). Closing the overlay by any other path (Esc, scrim click-away, a completed action, a route change) SHALL consume the pushed entry so the stack never accumulates stale overlay entries, and a popped-but-already-closed overlay SHALL NOT close anything twice. At the root of the history, Back SHALL behave as plain router-back — the SPA never traps it.

#### Scenario: Back closes the overlay it opened

- **WHEN** the operator opens the ⋯ menu overlay and presses Android TV Back
- **THEN** the overlay closes through its normal close path, focus returns to the card's trigger, and the SPA stays on the same page — it never exits to the browser's previous site

#### Scenario: Esc-then-Back does not double-close

- **WHEN** the operator closes an overlay with Esc and then presses Back
- **THEN** the pushed entry has already been consumed, so Back navigates the router as usual instead of re-running a close on nothing

#### Scenario: A view walk answers Back like Esc

- **WHEN** an overlay consumer with a view walk (menu → identify view → close) is open past its first view and the operator presses Back
- **THEN** the same walk step runs that Esc would run — Back never skips the consumer's pending-mutation guard

### Requirement: TV chrome persists without hover

In tv mode the card `⋯` triggers and the management gear SHALL stay visible without hover — the persistent reveal the SPA ships for `pointer: coarse` pointers SHALL also apply when the `tv` class is set, because Android TV Chrome reports `pointer: fine` and its hover-less remote would otherwise hide every management entry. The menu (sidebar) SHALL stay hidden by default as everywhere, opened from the rail; coarse-pointer desktops and fine-pointer desktops keep their current reveal behavior.

#### Scenario: The ⋯ trigger is visible before any hover

- **WHEN** a tv-mode SPA renders a collection grid
- **THEN** every card's ⋯ trigger is visible at rest with the ≥40px hit target, before any pointer or focus interaction

#### Scenario: Desktop reveal behavior is unchanged

- **WHEN** the SPA renders without the `tv` class on a fine-pointer desktop
- **THEN** the ⋯ triggers stay hidden until hover or focus, exactly as shipped

### Requirement: The photo stage is immersive and remote-driven

In tv mode the item page's photo browse view SHALL be an immersive stage: the image SHALL always fit inside the viewport against a single status line (collection · filename · index), the metadata column SHALL hide, and the remote SHALL drive it — ←/→ step to the previous/next photo, OK (Enter) toggles the slideshow, and Back closes the stage back to the masonry grid. The stage's arrow handling SHALL claim the press so the focus walker never also moves focus.

#### Scenario: The photo never clips

- **WHEN** the photo stage renders in tv mode at a short viewport
- **THEN** the whole image fits inside the viewport above the status line — no part is cut at the fold, and the desktop 80vh-cap clipping (chrome-above + 0.8×vh > viewport) does not recur

#### Scenario: The remote drives the stage

- **WHEN** the stage is open in tv mode and the operator presses ArrowRight, then OK, then Back
- **THEN** the next photo renders, the slideshow toggles, and the stage closes back to the photo grid without leaving the item page

### Requirement: Autodetect sets the first-load default only

On first load with no stored ruling, the SPA SHALL detect a TV best-effort, in ladder order: (1) the Chromium high-entropy `model` hint, (2) the `navigator.userAgent` TV-marker regex, (3) wide-short-viewport + zero-touch corroboration — corroboration SHALL NEVER be sufficient alone to enable tv mode. The detection SHALL decide only the FIRST-load default: it never re-fires to undo a stored ruling, and an unknown device SHALL fall to the desktop layout with the «Режим ТВ» override still reachable. Detection failure or an unavailable storage layer SHALL degrade to the desktop layout, never a crash.

#### Scenario: Known TV markers detect on first load

- **WHEN** the SPA first loads in a browser whose model hint or user agent carries a TV marker (a BRAVIA, an Amazon AFT box, a Shield) with no stored ruling
- **THEN** tv mode is applied for that load — and the operator's later «Режим ТВ: Выкл» ruling survives every reload after it

#### Scenario: A lookalike desktop does not trigger TV

- **WHEN** the SPA first loads in a desktop browser whose user agent merely contains a weak TV-like token but the window is neither wide-short nor touch-free
- **THEN** the desktop layout renders — corroboration alone never suffices, and a weak token without corroboration stays desktop

#### Scenario: Unknown box degrades honestly

- **WHEN** the SPA first loads on a box the ladder cannot recognize
- **THEN** the desktop layout renders, no error surfaces, and the «Режим ТВ» control in the menu is reachable so the operator can force tv mode on

### Requirement: The manual «Режим ТВ» override always wins

The SPA SHALL offer a three-state «Режим ТВ» control — Авто / Вкл / Выкл — persisted in localStorage under the fixed key `mellifera.tv` (the `mellifera.theme` idiom), reachable from the menu on a TV. A stored Вкл or Выкл SHALL win over every autodetect outcome on every load, and Вкл/Выкл SHALL apply live (the class toggles without a reload). An absent, unreadable, or invalid stored value SHALL mean Авто (the autodetect default), with an unavailable storage layer degrading to session-only behavior, never a crash.

#### Scenario: Выкл beats a TV-marker device

- **WHEN** the operator sets «Режим ТВ: Выкл» on a device whose markers the ladder matches, and the SPA reloads
- **THEN** the desktop layout renders — the stored ruling beats the autodetect on every subsequent load

#### Scenario: Вкл forces TV on an unknown box

- **WHEN** the operator sets «Режим ТВ: Вкл» from an unrecognized device and the SPA reloads
- **THEN** tv mode renders immediately and on every subsequent load regardless of what the ladder concludes

#### Scenario: Invalid or absent stored value means Авто

- **WHEN** localStorage carries `mellifera.tv` with an unrecognized value, or storage is unavailable
- **THEN** the SPA falls back to the autodetect first-load default (or the desktop layout when storage is unavailable), never a crash

### Requirement: Desktop rendering stays unchanged

A SPA load without tv mode SHALL render byte-for-byte as before this change: no `tv` class on the document root, the desktop grid widths, type sizes, the 80vh photo cap with its density-contract chrome, the hover-gated ⋯ reveal, the Esc-only overlay closing, and the 3.4 keyboard map all unchanged. The tv-mode CSS block SHALL be inert without the `tv` class, and the change SHALL add no Go source edits — the slice is pure SPA plus the rebuilt embedded dist.

#### Scenario: A desktop load carries no tv behavior

- **WHEN** the SPA loads in an ordinary desktop browser with no stored «Режим ТВ» ruling
- **THEN** the document root carries no `tv` class, the density contract's poster grid and the 80vh photo cap render as shipped, and the existing desktop test suite passes untouched

#### Scenario: The Go tree is untouched

- **WHEN** the change is implemented and the embedded dist is rebuilt
- **THEN** no file under the Go packages changes except the regenerated embedded `internal/web/dist` artifacts, and `go build ./...` and the Go suite behave exactly as before
