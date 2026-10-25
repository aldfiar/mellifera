# Spec Delta — web-ui

## ADDED Requirements

### Requirement: Watch-view info column

The episode watch view SHALL compose the playing surface left and a watch info column right, and the info column SHALL carry, in order: the episode heading (the SxxEyy eyebrow with the served episode `title` beside or above it), the «Серия» block (the served episode `description`), the «В ролях» row (the served `cast[]` entries), and the About panel as standing context. Every block SHALL read the served convention projection on the item and series documents — the heading title from the episode block's `title`, the «Серия» block from the episode block's `description`, the «В ролях» row from `cast[]` {name, role?, photo_url?} — however many namespaces the projection carries. A block whose field is absent SHALL render nothing (no block, never a placeholder); the column SHALL NOT fabricate a value and SHALL NOT hard-code a source.

#### Scenario: Episode heading renders from the served episode block

- **WHEN** an episode's served projection carries an episode block with a `title`
- **THEN** the info column renders the SxxEyy eyebrow with the served title, and composes no title of its own

#### Scenario: Description absence leaves no block

- **WHEN** the served episode block carries no `description`
- **THEN** the column renders no «Серия» block — not a placeholder, not an empty frame

#### Scenario: Cast row renders served entries verbatim

- **WHEN** the projection carries cast entries
- **THEN** each entry renders its name, its optional role when present, and an image only when its `photo_url` is present

#### Scenario: Cast absence leaves no row

- **WHEN** the projection carries no cast entries
- **THEN** the column renders no «В ролях» row

#### Scenario: About panel stands as context

- **WHEN** the view resolves the About source (the episode's series row's served about block, else the item's own)
- **THEN** the About panel renders in the info column as the standing context

### Requirement: Skip intro/credits chip

While the playhead is inside a descriptor section classified as an intro or credits range — a served chapter section (`kind` `chapter`) carrying start and end whose served `title` classifies it — the player SHALL render a soft chip over the video's bottom-right corner: «Пропустить вступление» for an intro range, «Пропустить титры» for a credits range. The chip SHALL render only inside the range, SHALL fade away after 4 seconds inside it, SHALL return when a seek lands inside the range again, and activating it SHALL seek past the section's end with a standard media seek. A section whose title classifies as neither, a section without an end, or the absence of sections SHALL render no chip — the SPA never fabricates a skip range.

#### Scenario: Chip appears inside the intro range

- **WHEN** playback passes into a chapter section whose title classifies as an intro
- **THEN** the chip «Пропустить вступление» renders over the video's bottom-right corner

#### Scenario: Activation seeks past the section end

- **WHEN** the chip is activated
- **THEN** the media seeks to the classified section's end using a standard media seek

#### Scenario: Chip fades and returns on seek

- **WHEN** the playhead stays inside a classified range for 4 seconds
- **THEN** the chip fades; and when a later seek lands inside the range again, the chip returns

#### Scenario: Unclassified chapter renders no chip

- **WHEN** a chapter section's title classifies as neither intro nor credits
- **THEN** no chip renders while playback is inside that range

### Requirement: Auto-next card with served countdown

On the `ended` edge of an episode the watch view SHALL render the «Следующая серия» card naming the next episode — the series' served display title, the SxxEyy label, and the next episode's served `title` when present — with [Смотреть] and [Отмена]. The next-episode pick SHALL come from the pure next-up derivation core (the Home derivation's moved home). The countdown duration SHALL come from the served watch defaults shape (`auto_next_countdown_seconds`) — never a client-baked value; when the shape is unavailable the card SHALL render without a countdown and SHALL NOT autoplay. Reaching zero SHALL navigate into the next episode. [Отмена] SHALL stop the countdown and suppress the card for the rest of the browsing session. A film (an item with no parseable episode facts) SHALL never render the card.

#### Scenario: Ended episode renders the card

- **WHEN** an episode ends and the series' episode list resolves a next episode
- **THEN** the card renders the series title, the SxxEyy label and the served next-episode title with [Смотреть] and [Отмена]

#### Scenario: Countdown runs on the served value

- **WHEN** the card renders and the watch defaults shape answers `auto_next_countdown_seconds` N
- **THEN** the countdown shows N seconds and navigates into the next episode at zero

#### Scenario: Served shape unavailable means no autoplay

- **WHEN** the watch defaults request has not answered or failed when the card renders
- **THEN** the card renders without a countdown and never starts the next episode by itself

#### Scenario: Cancel persists for the session

- **WHEN** the operator presses [Отмена] and a later episode in the same browsing session ends
- **THEN** no auto-next card renders for that later episode (the durable per-user opt-out arrives with Layer 6)

#### Scenario: Films never auto-next

- **WHEN** a film — an item with no parseable episode facts — ends
- **THEN** no auto-next card renders

### Requirement: Player keyboard control and legend

The watch view SHALL answer the keyboard map: Space toggles play/pause; ←/→ step the playhead ∓/±10 seconds; ↑/↓ step the volume; F toggles fullscreen; N/P navigate to the next/previous episode item of the series when the series' episode list resolves an adjacent item; 0-9 seek to the matching tenth of the media. The map SHALL ignore keystrokes while a form field or contenteditable element owns focus. A legend row under the player SHALL render on fine-pointer (desktop) surfaces and SHALL be hidden on coarse-pointer (touch) surfaces.

#### Scenario: Transport keys act on the player

- **WHEN** the operator presses Space, ←, →, ↑, ↓ or F while focus sits outside form fields
- **THEN** the media toggles playback, steps ±10 seconds, steps volume, or toggles fullscreen accordingly

#### Scenario: N and P step through the series

- **WHEN** the operator presses N (or P) on an episode whose series' episode list resolves the adjacent item
- **THEN** the view navigates to that next (or previous) episode item

#### Scenario: Digits seek by tenths

- **WHEN** the operator presses a digit key 0–9
- **THEN** the media seeks to the matching tenth of its duration

#### Scenario: Legend is desktop-only

- **WHEN** the watch view renders on a coarse-pointer (touch) surface
- **THEN** the keyboard legend row under the player is not rendered

### Requirement: Watch defaults endpoint

The binary SHALL serve `GET /api/v1/watch-defaults` on the authenticated v1 group returning `{ "auto_next_countdown_seconds": <integer> }`. The value SHALL be the `MELLIFERA_AUTO_NEXT_COUNTDOWN_SECONDS` environment value when set and integral, else the default 10; a malformed value SHALL fall back to the default with a logged warning (the established env-knob pattern). The handler SHALL be pure delegation — the composition root reads the environment and wires the value; the handler serves exactly what it is given.

#### Scenario: Default without the environment knob

- **WHEN** the endpoint is requested with `MELLIFERA_AUTO_NEXT_COUNTDOWN_SECONDS` unset
- **THEN** the response body carries `auto_next_countdown_seconds` 10

#### Scenario: Environment override serves through

- **WHEN** `MELLIFERA_AUTO_NEXT_COUNTDOWN_SECONDS` is set to an integer
- **THEN** the response carries that integer verbatim

#### Scenario: Malformed value falls back

- **WHEN** `MELLIFERA_AUTO_NEXT_COUNTDOWN_SECONDS` is set to a non-integer value
- **THEN** the response carries the default 10 and a warning is logged

### Requirement: Embedded build carries the watch-flow surface

The committed embedded SPA dist and the committed OpenAPI documents SHALL be regenerated inside this change — the swag annotations of the new endpoint into `internal/web/api`, the vite build into `internal/web/dist` — via the `make web-build` path, and the result SHALL be reproducible: a fresh rebuild over the committed sources leaves `git diff` clean on both trees, and `go build ./...` succeeds with the embedded result.

#### Scenario: Regeneration is reproducible

- **WHEN** the committed sources are rebuilt through the make web-build path
- **THEN** `git diff` on internal/web/dist and internal/web/api is clean and `go build ./...` succeeds
