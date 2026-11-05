# Spec Delta

## MODIFIED Requirements

### Requirement: Client-role authentication for devices

`authMiddleware` SHALL resolve a bearer credential that misses the admin
compare against the unified credentials store (`kind='device'` — the
post-migration mint target, seeded by the one-time guarded copy from the
dormant `device_tokens` table); a hit SHALL mint `Principal{Role:
RoleClient}` (the previously gated, never-minted role) carrying the device's
resolved Viewer: a device bound to a user resolves THAT user's Viewer, an
unbound device resolves the legacy device Viewer (today's see-all). A device
token SHALL be accepted by the browse route group (playback, progress,
libraries/items/series views) and SHALL be rejected with 403 on every admin
route; a credential matching neither the admin token nor any credentials row
SHALL be rejected with 401. Handlers SHALL NOT fork on role; the route group
remains the only authZ gate.

#### Scenario: Device token plays
- **WHEN** a device token calls `GET /api/v1/items/{id}/playback` (or another browse route)
- **THEN** the call succeeds under `RoleClient`

#### Scenario: Device token cannot administer
- **WHEN** a device token calls an admin route (e.g. `POST /api/v1/libraries`)
- **THEN** the call is rejected with 403

#### Scenario: Garbage token is unauthenticated
- **WHEN** a request carries a bearer credential that matches neither the admin token nor any credentials row
- **THEN** the request is rejected with 401 before any handler runs

#### Scenario: A bound device sees its user's scope

- **WHEN** a device bound to a user whose groups carry two libraries calls `GET /api/v1/libraries`
- **THEN** the listing contains exactly those two libraries — the device rides the bound user's Viewer; an unbound device on the same server still lists everything

### Requirement: Device token durability and revocation

Device tokens SHALL be durable across server restarts: persisted in sqlite
as rows of the unified `credentials` table with only their SHA-256 hash
stored (never the raw token), seeded by the one-time guarded copy from the
dormant `device_tokens` table at Open, so a redeploy never forces
re-pairing. The device-management surfaces SHALL operate on the
`credentials` rows after the migration — the device list SHALL read them
and revocation SHALL delete there — so post-migration devices appear,
bind, and revoke correctly, and the dormant `device_tokens` table SHALL
stay write-untouched. The next API call with a
revoked token SHALL be rejected with 401.

#### Scenario: Token survives a restart
- **WHEN** the server restarts after a device paired
- **THEN** the device token still authenticates and resolves to `RoleClient`

#### Scenario: Revoked token loses access
- **WHEN** the admin revokes a device and the device calls a browse route with its old token
- **THEN** the call is rejected with 401

#### Scenario: Pre-accounts tokens migrate without re-pairing

- **WHEN** a server holding pre-accounts device tokens opens with the new schema
- **THEN** every legacy token row lands in `credentials` (hash-only) exactly once and still authenticates after the restart

#### Scenario: Post-migration device management operates on credentials

- **WHEN** the admin lists devices after the migration and revokes one
- **THEN** the list shows both the migrated and newly paired devices, the revoke deletes that token's `credentials` row so it stops authenticating, and the dormant `device_tokens` table is untouched

### Requirement: Admin pairing panel

The web SPA's admin area SHALL gain a pairing panel (alongside the existing
admin tabs, behind the existing admin auth): the pending pairing requests
with their codes and one-tap approve/deny actions, and the device list with
revoke and bind-to-user actions (the bind names an existing user; an unbind
returns the device to the legacy viewer). The panel SHALL consume the
pairing endpoints and the device bind endpoint above; no device-management
UI exists beyond list + revoke + bind.

#### Scenario: Admin pairs a TV from the panel
- **WHEN** the admin opens the pairing panel while a device waits, matches the code on the TV screen, and taps approve
- **THEN** the pending entry clears and the TV proceeds to playback

#### Scenario: Admin revokes a lost device from the panel
- **WHEN** the admin revokes a device in the panel
- **THEN** the device disappears from the list and its token stops authenticating

#### Scenario: Admin binds a device to a user from the panel

- **WHEN** the admin uses the bind affordance to attach a device to a user, then unbinds it
- **THEN** the bound period scopes the device to that user's visible set and the unbind returns it to the legacy viewer — both states visible on the device list
