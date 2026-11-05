# Spec Delta

## MODIFIED Requirements

### Requirement: Role-gated API authentication

The API SHALL resolve a valid `MELLIFERA_ADMIN_TOKEN` bearer credential to
`Principal{Role: RoleAdmin}`; a missing or wrong token SHALL be rejected with
401 unauthorized. A bearer credential that misses the admin compare SHALL
additionally be resolved against the credentials store: a device-kind hit
SHALL mint `Principal{Role: RoleClient}` (device-pairing); a session-kind hit
SHALL mint the owning user's principal — role `admin` for an admin-role user,
`RoleClient` routing for a user-role principal — carrying the user's
resolved Viewer. Routes SHALL be gated by per-group role checks: browse
routes (`GET /libraries`, `GET /items`, `GET /items/{id}`, playback and
progress verbs) accept admin+client; admin routes (`POST /libraries`,
`POST /libraries/{id}/scan`, `GET /admin/status`, pairing/device and
accounts administration) accept admin only; the pairing endpoints
(`POST /pair`, `GET /pair/{id}/wait`) and `POST /auth/login` are the ONLY
unauthenticated API surface. Handlers SHALL NOT fork on role;
`RoleClient` is minted by device tokens minted through pairing, never by the
admin token.

#### Scenario: Admin token reaches both route groups
- **WHEN** the admin token calls a browse route and an admin-only route
- **THEN** every call succeeds

#### Scenario: Client role denied admin routes
- **WHEN** a client-role principal calls `GET /api/v1/admin/status` (or another admin-only route)
- **THEN** the request is rejected with 403

#### Scenario: Pairing endpoints are unauthenticated
- **WHEN** a device calls `POST /api/v1/pair` or `GET /api/v1/pair/{id}/wait` with no Authorization header
- **THEN** the calls reach their handlers (no 401), while every other API path without a valid token still 401s

#### Scenario: A session token authenticates as its user

- **WHEN** a minted session token calls a browse route and an admin-role user's session token calls an admin route
- **THEN** the user-role session reaches the browse handler and the admin-role session reaches the admin handler — the session kind rides the same route groups

#### Scenario: Login is the only new unauthenticated verb

- **WHEN** `POST /api/v1/auth/login` is called with no Authorization header and any other new API path is called unauthenticated
- **THEN** the login reaches its handler while the other path is rejected with 401

### Requirement: SPA token authentication

The SPA SHALL store the caller's credential — the admin token, a login
session token, or a device token — under `mellifera.token`; `<RequireAuth>`
SHALL guard protected routes by credential presence, redirecting to
`/login` when absent. Every `/api/v1/*` request SHALL carry
`Authorization: Bearer <token>` via the fetch wrapper. A 401 from any API
call SHALL clear the credential and redirect to `/login` — the existing
handle401 rotation stays the SOLE 401 authority; no feature code clears
credentials directly.

#### Scenario: Login flow and 401 rotation
- **WHEN** an operator without a token opens a protected route and submits the token on `/login`, and later an API call returns 401
- **THEN** the token is stored and the operator reaches the requested route; the 401 clears the token and redirects back to `/login`

#### Scenario: A session credential rides the same wrapper

- **WHEN** a user logs in with username and password and opens protected routes
- **THEN** the stored session token rides the same Authorization wrapper on every request, and a 401 (revoked session) clears it through the same rotation

### Requirement: Library list endpoint

The API SHALL expose `GET /api/v1/libraries` (admin+client) returning every
library VISIBLE TO THE CALLER via `store.ListLibraries` as
`{items:[{id, module_id, root_path, display_name, description}]}` where
`description` is the library's human description (empty string when unset).
A user principal's listing SHALL contain exactly the union of its groups'
member Collections — an invisible library is indistinguishable from a
nonexistent one; legacy principals and admin-role users keep the full
listing.

#### Scenario: Listing created libraries

- **WHEN** libraries exist and `GET /api/v1/libraries` is called
- **THEN** the response is 200 with one entry per library, each carrying its `description` (empty string when never set)

<!-- wf:probe id=10a04e7e23934383 -->
```bash
set -e
grep -q 'description' internal/api/handlers.go
go test ./internal/api -run TestLibraryListDescription
```
<!-- /wf:probe -->

#### Scenario: A scoped user lists only granted libraries

- **WHEN** a user whose groups carry libraries 1 and 3 calls `GET /api/v1/libraries` on a four-library server
- **THEN** the response lists exactly libraries 1 and 3 — no 403, no empty-marker for the hidden pair

### Requirement: Watched element states

Every browsable element SHALL render a tri-state watch presentation derived
ONLY from served data, scoped TO THE VIEWER: `watched` (the DTO's
`watched: true`) renders a small ✓ mark in the library's pastel accent plus a
dimmed title (~0.55 opacity) and NO progress bar; an in-progress element (a
positive served position on an unwatched item) renders the progress bar as
today; a new element renders today's clean state. Each viewer's served rows
carry that viewer's own state — another user's watch never marks an element.
The SPA SHALL NOT derive watched client-side (a zero `rec_score` is not a
watched signal). The ✓ is a color-change mark — no pill or badge chrome.
Sites: per-series episode table rows, series cards in the collection series
grid (SeriesCard; the series DTO's `watched`), cards in the collection item
grid (ItemGrid — TV mode is the same grids under the html.tv CSS layer), the
element page heading beside the served display name, and Continue rail rows.

#### Scenario: A finished episode renders watched

- **WHEN** an episode row's served DTO carries `watched: true`
- **THEN** the row renders the ✓ pastel mark, the dimmed title, and no progress bar, while an in-progress sibling keeps its bar

#### Scenario: The Continue rail hides served-watched rows

- **WHEN** Home fetches progress with `include=watched` and the response carries rows both with and without `watched: true`
- **THEN** the Continue rail renders only the unwatched rows, and the Next-up derivation still anchors from every served row (a fully-watched series still surfaces its next unwatched episode)

#### Scenario: Watch state follows the viewer

- **WHEN** user A completes an episode while user B has not started it, and B's browser lists the same series
- **THEN** B's served rows carry no watched flag and no A-position progress bar — the states are per-viewer, never global

## ADDED Requirements

### Requirement: Unified login surface

The SPA's `/login` SHALL be the unified credential entry: username +
password as the PRIMARY flow (posting `POST /api/v1/auth/login` and storing
the session token), the admin-token paste PRESERVED for the operator, and a
pairing link for TVs — the device-pairing deep-link pinning is unchanged.
The SPA SHALL render the flow appropriate to the credential it holds and
never require more than one credential kind at once.

#### Scenario: Password login is primary, paste preserved

- **WHEN** a user opens `/login`, submits username and password, and separately an operator pastes the admin token
- **THEN** the password flow stores a session credential and enters the app, and the paste flow keeps working exactly as today — both land in the same authenticated shell

#### Scenario: TVs keep the pairing entry

- **WHEN** a TV (or a browser following the pairing deep link) opens the SPA with no credential
- **THEN** the pairing entry renders as before — the unified login never displaces the pairing surface

### Requirement: Profile block served identity

The SPA SHALL render the caller's identity from `GET /api/v1/profile` —
display name, role label, groups — in a profile block, and SHALL NOT derive
identity any other way: the `/admin/status` role probe is REMOVED (an
operator surface check is never an identity oracle), and client-side
visibility logic stays absent (hidden = whatever served lists omit).

#### Scenario: The profile block reads the served identity

- **WHEN** a logged-in user loads the app shell
- **THEN** the profile block shows the name, role label, and groups exactly as `/profile` served them, with zero probing of `/admin/status`

#### Scenario: No client-side visibility derivation

- **WHEN** a scoped user's library list omits a library
- **THEN** no SPA code path asks whether the library exists — the omission IS the rendering truth

### Requirement: Per-user viewer preferences

The SPA SHALL read viewer preferences from the served profile document and
write changes through `PUT /api/v1/profile/prefs`: the auto-next playback
flag rides the per-user document (the served toggle edits prefs, not
localStorage); the env watch-defaults remain the fallback for any knob the
document does not override.

#### Scenario: The auto-next toggle persists per user

- **WHEN** a user flips the auto-next toggle off on one device, then loads the SPA on another device
- **THEN** the toggle reads off from the served prefs — the state is the user's, not the browser's

### Requirement: Admin accounts panels

The admin area SHALL gain the accounts panels behind the existing admin
auth: a users panel (create with the first-user notice, role select,
disable, password reset, delete with the last-user guard disabled),
a groups panel (member users, member Collections with display positions,
per-source mute toggles), the device bind affordance on the device list, the
one-shot legacy-row adoption action per user, and a visibility-explain
viewer answering what a named user sees for a named library. The panels
consume only the admin accounts endpoints; no client-side visibility
computation exists.

#### Scenario: The admin composes a group end to end

- **WHEN** the admin creates a group, adds two users, adds two Collections with positions, and mutes one metadata source
- **THEN** the panels persist each edit through the admin endpoints and a member user's listing and chain reflect exactly the composed scope — verified through the explain viewer, never client-side derivation
