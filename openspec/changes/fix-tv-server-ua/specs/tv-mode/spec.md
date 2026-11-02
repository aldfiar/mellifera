# Spec Delta

## ADDED Requirements

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

## REMOVED Requirements

### Requirement: Desktop rendering stays unchanged

**Reason**: The requirement's "the change SHALL add no Go source edits" clause was the tv-mode slice's change-scoped boundary, not a standing law of the capability. fix-tv-server-ua serves the caller-identity meta from the Go serving layer (its own requirement above), so keeping the clause would make the living spec contradict the shell-carries-UA requirement; and a MODIFIED block cannot drop the obsolete slice-boundary scenario ("The Go tree is untouched") by name.

**Migration**: Replaced by "Desktop rendering is injection-inert" (ADDED above) — every desktop-rendering guarantee is carried verbatim, and the capability's serving-layer footprint is bounded to rendering-inert, requirement-mandated changes only.

- **WHEN** the SPA loads in an ordinary desktop browser with no stored «Режим ТВ» ruling
- **THEN** the document root carries no `tv` class, the density contract's poster grid and the 80vh photo cap render as shipped, and the existing desktop test suite passes untouched

#### Scenario: Serving-side tv-mode edits stay rendering-inert

- **WHEN** the server injects the caller-identity meta into a shell request from an ordinary desktop browser
- **THEN** the page renders exactly as before the injection — no `tv` class, the desktop layout — the meta being the only added DOM node, and neither CSS nor the detection ladder changes the desktop rendering because of it
