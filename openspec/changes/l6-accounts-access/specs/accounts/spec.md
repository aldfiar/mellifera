# Spec Delta

## Purpose

Personal accounts for the household: users authenticate by password, admin-composed groups scope which Collections each user sees (grant-based default-hidden), roles gate what they may do, per-user viewer state (progress + completion ledger) follows the viewer, and per-group enrichment mutes shape each viewer's metadata chain — with zero-user deployments staying byte-identical through a runtime legacy mode.

## ADDED Requirements

### Requirement: User accounts and roles

The system SHALL persist personal accounts in a `users` table — username
(lowercase-normalized, UNIQUE), display_name, password (argon2id hash, params
pinned t=1, m=64MiB, p=1, verified ONLY at session mint), role `user|admin`,
a per-user preference JSON document, a disabled flag, timestamps. The role
SHALL project onto the existing admin/client principal routing (no new Role
constant): an admin-role user reaches operator surfaces; a user-role
principal routes as a client and SHALL be rejected with 403 on admin routes
(DO-gates are never existence oracles). A disabled user's credentials SHALL
fail closed (no new sessions, existing sessions rejected).

#### Scenario: User creation roundtrip

- **WHEN** an admin creates a user with `username: "Anna"` (mixed case) and a password, then lists users
- **THEN** the stored username is lowercase-normalized and unique, the response carries the display name and role, and no plaintext or reversible password material is stored

#### Scenario: Role projects onto the route groups

- **WHEN** a user-role principal calls an admin route (e.g. `POST /api/v1/libraries`) and an admin-role user calls the same route
- **THEN** the user-role principal is rejected with 403 while the admin-role user succeeds — roles gate DO without changing any route group

#### Scenario: A disabled user fails closed

- **WHEN** an admin disables a user and that user presents a previously minted session token, then tries to log in again
- **THEN** the existing session token is rejected and the new login attempt answers the uniform authentication failure

### Requirement: Groups and membership

The system SHALL persist admin-composed named scopes in a `groups` table with
two membership axes: member Collections (`group_collections` — a group and a
library with a display position; overlap between groups allowed; a display
order conflict resolves min-position, tie by group id) and member users
(`group_members`). Each group SHALL carry a schema-versioned JSON document
(`doc_json`) holding per-source mutes and future knobs; schema migrations
SHALL NEVER rewrite operator-authored documents.

#### Scenario: Overlapping groups resolve display order deterministically

- **WHEN** a user belongs to two groups that both carry library 7 — group A at position 5, group B at position 3 — and two groups tie at the same minimum position
- **THEN** the library's display position resolves to the minimum (3), and the tie resolves by group id — the same ordering on every read

#### Scenario: Migrations never rewrite operator documents

- **WHEN** a schema migration adds a knob shape to the group document vocabulary while a group's stored `doc_json` was authored by an operator
- **THEN** the stored document survives byte-identical — new knobs are read as absent, never backfilled or rewritten

### Requirement: Grant-based default visibility

A user principal SHALL see exactly the union of its groups' member
Collections — default-hidden: a user in no group sees nothing. Legacy
principals (the env admin token, unbound devices) SHALL keep today's see-all,
and admin-role users SHALL see everything. Content reads SHALL keep hidden ≡
unknown: an invisible library answers 404 like an absent one, an invisible
item's listing slot answers 200-empty — never 403, never a count or existence
signal.

#### Scenario: The union of groups is the visible set

- **WHEN** a user belongs to group A (libraries 1, 2) and group B (libraries 2, 3)
- **THEN** the user's listing shows libraries 1, 2, 3 exactly, and library 4 (no group carries it) is absent from the listing and answers 404 on its direct routes

#### Scenario: Legacy principals keep see-all

- **WHEN** the env admin token or an unbound device token lists libraries on a server WITH users
- **THEN** every library is listed — grant-based hiding applies only to user principals

#### Scenario: Admin-role user sees everything

- **WHEN** an admin-role user belongs to no group and lists libraries
- **THEN** every library is listed — the role lifts the grant scoping

### Requirement: Runtime legacy mode and the one-way door

While `users` holds zero rows, the system SHALL collapse EVERY principal to
today's scope — zero-user deployments stay byte-identical (additive wire
only). Creating the first user SHALL be a one-way door: the create-user
response SHALL carry an explicit irreversible-mode notice. Deleting the last
remaining user SHALL be FORBIDDEN (the identity layer refuses; the SPA
disables the action); the env admin token SHALL remain the permanent
break-glass.

#### Scenario: Zero users means today

- **WHEN** a server with no user rows serves any principal (admin token, device token)
- **THEN** visibility and behavior are byte-identical to the pre-accounts server — the legacy collapse, not grant scoping, answers

#### Scenario: First user creation is announced as irreversible

- **WHEN** the first user is created on a zero-user server
- **THEN** the response carries the explicit notice that account mode is now permanent (grant-based hiding active; the legacy collapse is gone), and a second creation carries no such notice

#### Scenario: The last user cannot be deleted

- **WHEN** an admin (or the API) attempts to delete the only remaining user row
- **THEN** the deletion is refused with a canonical error, the user survives, and the SPA's delete affordance is disabled for the last user

### Requirement: No guest principals

Every API request SHALL stay authenticated: a request without a resolvable
credential SHALL be rejected with 401 before any handler runs. Anonymous or
guest access SHALL NOT exist — a household guest is a real user account in a
minimal group.

#### Scenario: Unauthenticated requests fail closed

- **WHEN** a request with no Authorization header (or an unresolvable token) hits any `/api/v1` route outside the unauthenticated surface
- **THEN** it is rejected with 401 and no handler observes the request

### Requirement: Unified credentials

The system SHALL persist bearer secrets in ONE `credentials` table —
`id`, `kind CHECK (kind IN ('device','session'))`, `token_hash` (UNIQUE,
SHA-256 — never the raw token), nullable `user_id`, `label`, `created_at`,
nullable `expires_at`. At Open, a one-time guarded copy SHALL migrate
existing `device_tokens` rows into `credentials` (the source table becomes
dormant), and pairing SHALL mint new device tokens directly into
`credentials` post-migration — a device paired before a server restart SHALL
still resolve.

#### Scenario: The guarded copy is one-time and idempotent

- **WHEN** a server with pre-accounts device tokens opens, then opens again (restart)
- **THEN** every existing device token lands in `credentials` exactly once (hash-only) and keeps authenticating, and the second Open copies nothing new

#### Scenario: Pairing mints into credentials after migration

- **WHEN** a new device pairs on a migrated server and the server restarts
- **THEN** the minted token resolves from `credentials` — the pairing-write and the authn-read share one table

### Requirement: Sessions

User sessions SHALL be rows in `credentials` with `kind='session'` and the
user's id. Sessions SHALL be revocation-only — NO time-to-live (household
posture, matching device tokens). A password change or admin password reset
SHALL auto-revoke that user's session rows. Logout SHALL delete only the
caller's own session row.

#### Scenario: Password reset revokes the user's sessions

- **WHEN** an admin resets a user's password while that user holds two live sessions
- **THEN** both session rows are revoked in the same flow and the user's next requests answer 401

#### Scenario: Logout deletes only the caller's session

- **WHEN** a user logs out and the same user presents a different live session token
- **THEN** only the logout-presented row is deleted — the other session keeps working

### Requirement: Login and logout

The API SHALL expose `POST /api/v1/auth/login` — an UNAUTHENTICATED route,
rate-limited keyed by (IP, username) in the pairing-limiter shape — accepting
`{username, password}`: valid credentials mint a session and return the
token; a wrong password, unknown username, or disabled user SHALL answer the
SAME uniform 401 body (no account enumeration), with hashing performed
regardless of user existence (constant-ish work). The API SHALL expose
`POST /api/v1/auth/logout` (authenticated) deleting the presented session.
`POST /auth/login` SHALL be the only NEW unauthenticated surface besides the
pairing verbs.

#### Scenario: Successful login mints a session

- **WHEN** a user posts correct credentials to `POST /api/v1/auth/login`
- **THEN** the response carries a session token that authenticates subsequent requests as that user

#### Scenario: Failures are uniform and rate-limited

- **WHEN** a client posts a wrong password for an existing user, then credentials for an unknown user, then exceeds the (IP, username) burst
- **THEN** the first two answer the identical 401 body (indistinguishable), and the burst answers 429 until the window elapses

### Requirement: Viewer resolution

The identity layer SHALL resolve each authenticated principal's visibility
exactly once per request: one grant query (`group_members` joined to
`group_collections`) intersected LIVE with the `libraries` table — grant rows
whose library has been deleted are harmless and invisible — plus the
user's groups' chain mutes merged MUTE-WINS. The result SHALL ride the
`access.Viewer` value (visible-library-id set + chain mutes) through every
content read; the zero Viewer SHALL hide everything (fail closed: `1=0`) —
no principal without a resolved Viewer ever sees a row. The Viewer struct
SHALL be copied on read, never shared mutable.

#### Scenario: Orphaned grant rows are harmless

- **WHEN** a group still references a deleted library and a member user resolves their viewer
- **THEN** the resolution succeeds with that library simply absent from the visible set — no error, no visible ghost

#### Scenario: The zero Viewer hides everything

- **WHEN** a content read receives the zero Viewer (no admin flag, no user id, no visible set)
- **THEN** the read returns empty (or unknown-404 for direct routes) — fail closed, never a leak

### Requirement: Device-to-user binding

The admin API SHALL expose `PUT /api/v1/admin/devices/{id}/user` binding a
device credential to a user: the bound device SHALL resolve that user's
Viewer on every request. Unbinding SHALL return the device to the legacy
see-all device Viewer — documented residual until the restricted-library
floor lands (the adult-gate change hides restricted content from legacy
devices).

#### Scenario: Binding re-scopes the device

- **WHEN** an admin binds device D to user U (a member of group A) and D calls a content route
- **THEN** D observes exactly U's visible set and chain mutes; after an unbind, D observes see-all again

### Requirement: Per-user viewer state

`playback_progress` AND `watched_items` SHALL be keyed by
`(user_id, item_id)` — `user_id INTEGER NOT NULL DEFAULT 0`, the legacy slot
(env-admin and legacy-device viewers read and write it). Ledger writes SHALL
stamp the requesting viewer; ledger reads SHALL be viewer-scoped AND
visibility-conjunct (rows for libraries outside the viewer's visible set
SHALL NOT leak existence). Pre-accounts rows SHALL survive the keying
migration with zero loss (they land in the legacy slot). Rec tag-learning
and completion-ledger learning semantics SHALL stay GLOBAL (learning
consumes all rows) — a documented invariant, never per-user forked.
Adopting legacy ledger rows into a user SHALL be an explicit one-shot admin
action (newer-wins by `updated_at` per item, performed while the user
exists) — never automatic on first login. Deleting a user SHALL cascade that
user's session credentials AND ledger rows in one transaction.

#### Scenario: Two users hold independent state for one item

- **WHEN** user A stops an item at minute 20 and user B completes the same item
- **THEN** A's resume row reads minute 20 with no watched flag while B's reads completed — neither observes the other's row

#### Scenario: Adopting legacy rows is explicit and newer-wins

- **WHEN** an admin runs the one-shot adopt action for user U while U holds a newer row for item X than the legacy slot's row
- **THEN** U's newer row survives, the legacy row merges only where U has none, and a second adopt run is a no-op

#### Scenario: Deleting a user cascades their state

- **WHEN** an admin deletes user U (not the last user)
- **THEN** U's session credential rows and both ledger rows vanish in one transaction — no orphaned per-user rows

### Requirement: Per-user preference document

Each user SHALL carry a preference JSON document editable via
`PUT /api/v1/profile/prefs` and served through the profile endpoint. The
document SHALL hold per-user viewer preferences (the auto-next playback flag
rides here); the env-provided watch defaults SHALL remain the default when
the document carries no override for a knob.

#### Scenario: A per-user flag persists and defaults stay

- **WHEN** user U puts `{"auto_next": false}` to `/api/v1/profile/prefs` and another user V never touches prefs
- **THEN** U's served profile carries the stored override while V's carries none — and the env watch-defaults still answer for any knob neither document overrides

### Requirement: Served identity

The API SHALL expose `GET /api/v1/profile` (authenticated) returning the
caller's resolved identity: `{kind: admin|user|device, user_id?, name, role,
groups: [{id, name}], prefs}` — the env admin token answering `kind:
admin`, a session answering its user's shape, a device answering `kind:
device` (with the bound user's groups when bound). The SPA SHALL derive
identity from this endpoint only — it SHALL NOT probe operator endpoints
(e.g. `/admin/status`) to infer its role.

#### Scenario: Each principal kind reads its own served shape

- **WHEN** the env admin token, a user session, and a bound device each call `GET /api/v1/profile`
- **THEN** the answers carry `kind` admin / user / device respectively, the session and bound device carrying their user's groups and prefs — no endpoint probing required

### Requirement: Admin accounts surfaces

The admin API SHALL expose: users CRUD (create with the first-user notice,
role change, disable, password reset with session cascade, delete with the
last-user guard and state cascade); groups CRUD with member-users and
member-Collections (+ display positions) and the per-source mute document;
the device bind endpoint; the one-shot legacy-row adoption; and `GET
/api/v1/admin/visibility-explain?user_id&library_id` — reporting the named
user's resolved visible set and mute state for the named library (the
grant-based silent-nothing antidote), computed over the same resolution the
viewer rides.

#### Scenario: Visibility-explain answers why a library is invisible

- **WHEN** an admin calls visibility-explain for a user whose groups do not carry the named library, and again for one whose groups do
- **THEN** the first answer reports the empty grant (no group carries the library) and the second reports the carrying groups with positions — one handler over the same resolved set

#### Scenario: Password reset cascades and delete guards

- **WHEN** an admin resets a user's password, then attempts to delete the last remaining user, then deletes a non-last user
- **THEN** the reset revokes the user's sessions, the last-user delete refuses with the canonical error, and the non-last delete succeeds cascading the user's state

### Requirement: Visibility mechanism commitments (adult-gate re-base)

Library visibility SHALL ride exactly ONE mechanism: the trailing
`access.Viewer` parameter and its resolved visible set — no boolean
visibility parameter, no per-call role predicate anywhere in the store or
api packages. The zero Viewer SHALL preserve the fail-safe direction
(everything hidden). The planned per-library `restricted` floor of the
adult-collection gate SHALL compose into THIS mechanism when it lands: a
`NOT restricted` term into the user-principal set query and into the
legacy-device clause (byte-identity of the legacy clause deliberately
surrendered there) — the adult-gate design's rejected visible-id-set
alternative is hereby adopted, and its planned trailing
`allowRestricted bool` SHALL NOT land.

#### Scenario: One seam, no boolean

- **WHEN** the store and api packages are inspected for visibility plumbing
- **THEN** every gated content read carries exactly one trailing Viewer parameter, zero boolean visibility parameters exist, and the principal helper is readable only in its two legal files

#### Scenario: The floor composes without a new parameter

- **WHEN** the adult-gate change adds the restricted column and its floor
- **THEN** the floor lands as terms inside the existing set resolution and the legacy-device clause — no store or api read gains a second trailing visibility parameter
