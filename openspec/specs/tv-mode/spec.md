# tv-mode Specification

## Purpose
Turns the same embedded SPA into a 10-foot TV surface: a `.tv` display mode whose px-floor legs divide by the reported devicePixelRatio (`--tv-dpr`, set exactly while tv mode applies) so the designed fraction density lands on any panel — high-dpr boxes included — while pure viewport fractions stay raw, D-pad focus walking and remote media keys mapped onto the existing player actions through one normalization table, overlays that close on browser Back instead of dropping the operator out of the SPA, persistent chrome without hover, an immersive photo stage, and a best-effort device autodetect that a manual «Режим ТВ» override always beats. The slice is SPA-first with exactly one serving-layer assist: the Go shell handler stamps each response with the caller's User-Agent header (`mellifera-client-ua` meta) so devices whose WebView fakes a JS-visible UA still autodetect truthfully.

## Requirements

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

### Requirement: The server-observed user agent detects a TV decisively

The autodetect ladder SHALL accept a second user-agent source beside the JS-visible `navigator.userAgent`: the User-Agent header the server observed for the SPA shell request, delivered to the SPA through the shell's caller-identity meta (see "The SPA shell carries the caller's user agent"). The ladder SHALL rule tv mode when EITHER source carries a strong marker, with the same decisive precedence as the existing strong table — no geometry or touch corroboration consulted, and none able to vote the decision away. The server-observed UA SHALL be a decisive-only source: the generic weak TV token and the wide-short-viewport + zero-touch corroboration apply to the JS-visible UA only, and the server-observed UA SHALL NEVER serve as a corroboration input — corroboration remains insufficient alone. The «Режим ТВ» override law is unaffected — a stored Вкл or Выкл still beats every detection outcome — and the async model-hint probe keeps its upgrade-only contract: it may add tv mode, never remove one.

#### Scenario: A faked JS user agent cannot hide the header's verdict

- **WHEN** the SPA first loads in a browser that presents JavaScript a plain desktop user agent while the server observed a User-Agent header carrying a strong Smart-TV marker (for example the spaced "Smart TV Pro"), at a full-HD zero-touch viewport whose geometry would NOT corroborate a weak token
- **THEN** tv mode is applied for that load — the server-observed source is decisive on its own and no corroboration leg is consulted

#### Scenario: A weak token in the server UA never corroborates

- **WHEN** the JS-visible user agent carries no strong marker, the server-observed UA carries only the generic word-bounded TV token, and the viewport shape would corroborate (wide, short, zero-touch)
- **THEN** the desktop layout renders — the weak token over the server-observed source is never sufficient, with or without geometry

#### Scenario: Two desktop sources stay desktop

- **WHEN** both the JS-visible and the server-observed user agents are plain desktop UA strings, at any viewport — including a corroborating wide-short zero-touch one
- **THEN** the desktop layout renders — neither source can conjure a TV ruling without a strong marker

### Requirement: The SPA shell carries the caller's user agent

The server serving the SPA shell SHALL inject into the served document, per request and before it is written, an HTML-attribute-escaped `<meta name="mellifera-client-ua">` element whose content is the request's User-Agent header value, placed in the document head. Every shell-serving path SHALL inject identically — the site root and the client-route fallback alike. The shell SHALL continue to be served under a no-cache policy so each request re-injects the caller's own header. The injection SHALL be skipped when the request carries no User-Agent header or an empty one. The injection echoes only what the caller itself sent, so it adds no auth surface and leaks nothing about other clients. The committed embedded shell artifact SHALL stay byte-stable at rest — injection is serve-time, never baked into the build output.

#### Scenario: The shell echoes the caller's user agent

- **WHEN** a client requests the SPA shell with a User-Agent header containing characters that are special inside HTML attributes (quotes, angle brackets)
- **THEN** the served HTML carries the mellifera-client-ua meta whose content is the header value HTML-attribute-escaped, and the response carries the no-cache policy

#### Scenario: Deep links get the same injection

- **WHEN** a client requests an unmatched client-side route that the SPA fallback serves
- **THEN** the served shell carries the same per-request meta injection as the site root

#### Scenario: A missing user agent omits the meta

- **WHEN** a request arrives without a User-Agent header, or with an empty one
- **THEN** the shell is served without the meta element and the response body is otherwise identical to the embedded artifact

### Requirement: The SPA tolerates a missing or garbled server user agent

The SPA's boot autodetect SHALL read the caller-identity meta defensively and synchronously at boot: an absent meta, an empty or whitespace-only content, or otherwise unusable content SHALL floor to "no server UA observed", and the ladder SHALL then rule exactly as before the server-observed source existed — from the JS-visible user agent alone. The SPA SHALL NOT crash, SHALL NOT block or delay boot awaiting the meta, and SHALL NOT issue any network request to learn its server-observed UA. This tolerance is required wherever the shell arrives without the injection — notably the Vite dev-server path, where the dev proxy serves the SPA and the Go server never sees the shell request.

#### Scenario: A shell without the meta boots as today

- **WHEN** the SPA boots from a shell that carries no mellifera-client-ua meta — the Vite dev proxy served it, or the bundle predates the injection
- **THEN** the autodetect rules exactly as before the server-observed source existed, boot is neither blocked nor delayed, and no error surfaces

#### Scenario: A garbled meta floors to absent

- **WHEN** the meta exists with empty, whitespace-only, or unusable content
- **THEN** the ladder treats the server UA as unobserved and the JS-visible user agent rules as today

### Requirement: Desktop rendering is injection-inert

A SPA load without tv mode SHALL render byte-for-byte as the tv-mode slice shipped it: no `tv` class on the document root, the desktop grid widths, type sizes, the 80vh photo cap with its density-contract chrome, the hover-gated ⋯ reveal, the Esc-only overlay closing, and the 3.4 keyboard map all unchanged. The tv-mode CSS block SHALL be inert without the `tv` class. The capability MAY touch the Go serving layer only where a tv-mode requirement demands it — today, the caller-identity meta injection — and every such serving-side change SHALL leave desktop rendering unchanged: the injected meta is invisible metadata no desktop rule or layout reads. The slice-scoped "no Go source edits" clause was a boundary of that slice, not a standing law of the capability.

#### Scenario: A desktop load carries no tv behavior

- **WHEN** the SPA loads in an ordinary desktop browser with no stored «Режим ТВ» ruling
- **THEN** the document root carries no `tv` class, the density contract's poster grid and the 80vh photo cap render as shipped, and the existing desktop test suite passes untouched

#### Scenario: Serving-side tv-mode edits stay rendering-inert

- **WHEN** the server injects the caller-identity meta into a shell request from an ordinary desktop browser
- **THEN** the page renders exactly as before the injection — no `tv` class, the desktop layout — the meta being the only added DOM node, and neither CSS nor the detection ladder changes the desktop rendering because of it

### Requirement: TV display mode scales by the physical viewport

When the SPA boots in tv mode, the document root SHALL carry the `tv` class and SHALL additionally carry a `--tv-dpr` custom property on the root's inline style, set to the reported `devicePixelRatio` (floored to 1 when it is absent, non-finite, or not positive) exactly while tv mode applies. The property SHALL be removed whenever the ruling is desktop — the boot desktop ruling and the live «Режим ТВ» toggle-off alike — and the async model-probe upgrade path SHALL set it together with the class. The px floor legs of the `.tv` block's size clamps — the root type's floor and cap legs, the focus-ring width's legs, and the persistent card-action trigger hit-target's legs — SHALL resolve through division by `var(--tv-dpr, 1)`, so each floor expresses one physical minimum at any dpr while the vw preferred legs stay raw and keep the designed fraction; on a device whose dpr is above 1 the fraction legs therefore win wherever raw CSS floors used to catch, and the layout renders the designed 10-foot density (more elements in view), never a multiplied overscale. The content cap `min(92vw, 1800px)` SHALL stay unwrapped — its px term is a layout cap, not a readability floor, and no division may shrink it. Every pure viewport-fraction rule SHALL stay unscaled: the 2.5% overscan padding, the poster chrome reserve, the status-line reserve and the stage cap arithmetic built on it, the poster-grid track budget (whose governing leg is a 100vh fraction with its raw floor leg), and the focus outline-offset. A device reporting dpr 1 SHALL render every tv-mode size identical to the shipped `.tv` block (the var default 1). A SPA load without tv mode SHALL never carry the property, and desktop rendering stays byte-identical. The two-rows-fit-100vh law, the overscan law, and the never-a-bare-px law are unchanged. The ≥40px card-action hit target reads in physical pixels under this law — at dpr 2 the fraction-resolved 24 CSS px are 48 physical px.

#### Scenario: The operator's box renders the designed fraction

- **WHEN** a tv-mode SPA renders at a reported 960×511 CSS viewport with devicePixelRatio 2
- **THEN** the root type resolves through the 1.05vw fraction leg (≈10.08 CSS px, the divided 8/15 floor legs not binding) — the designed glass fraction with more elements in view, NOT the desktop-scale 16px floor and NOT a doubled scale — and the card-action trigger resolves 2.5vw (24 CSS px = 48 physical px), while the poster grid keeps its 100vh-fraction track budget and both poster rows still fit the viewport

#### Scenario: The content cap never shrinks

- **WHEN** a tv-mode SPA renders at a reported 1920×1080 CSS viewport with devicePixelRatio 2
- **THEN** the content width resolves from the raw unwrapped `min(92vw, 1800px)` — the vw term governs below ~1957 CSS px exactly as shipped, and no `--tv-dpr` division ever reduces the cap

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
