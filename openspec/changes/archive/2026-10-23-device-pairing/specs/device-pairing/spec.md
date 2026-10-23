# device-pairing Delta

## Purpose

Lets a TV (or any client device) obtain scoped playback access without ever holding the admin token: the device requests a short single-use pairing code, the admin approves it with one tap in the web SPA, and the device receives a durable, revocable client-role token minted by the auth seam that previously gated `RoleClient` without minting it.

## ADDED Requirements

### Requirement: Pairing request creation

The API SHALL accept an unauthenticated `POST /api/v1/pair` and create a pending pairing request: a cryptographically random capability id (`pairing_id`) plus a short single-use human-comparable code (6-8 characters, `crypto/rand`). The response SHALL carry both; the code is what the admin compares against the TV screen. The endpoint SHALL be rate-limited per client IP, rejecting excess requests with 429. Pairing request creation SHALL be the ONLY unauthenticated API verb besides token pickup.

#### Scenario: TV creates a pairing request
- **WHEN** a device calls `POST /api/v1/pair` with no Authorization header
- **THEN** the response carries a `pairing_id` and a short code, and the request appears as pending for the admin

#### Scenario: Pairing spam is rate-limited
- **WHEN** one IP issues pairing requests beyond the configured burst within the window
- **THEN** further requests are rejected with 429 and no new pending requests are created

### Requirement: Pairing expiry and single use

A pairing request SHALL expire after 5 minutes. Approval SHALL be refused on an expired request, and the wait endpoint SHALL report it as expired. An approved request SHALL be consumed exactly once: after the device token is picked up, the wait endpoint SHALL never hand the token out again.

#### Scenario: Expired request is dead
- **WHEN** more than 5 minutes pass between `POST /pair` and the admin approval attempt
- **THEN** the approval is refused and the request reads as expired

#### Scenario: Token is handed out exactly once
- **WHEN** the wait endpoint returns an approved request's device token and the same request is polled again
- **THEN** the second poll reports the request consumed and no token is returned

### Requirement: Admin review of pending pairings

The API SHALL expose the pending pairing requests (with their codes) to admin principals and let an admin approve or deny each one. Approval SHALL mint a device token whose raw value is returned to the DEVICE only — it SHALL be persisted as a hash and SHALL NOT appear in any admin-facing response. Denial SHALL move the request to a terminal denied state visible to the waiting device.

#### Scenario: Admin approves the TV
- **WHEN** the admin approves a pending pairing request from the admin surface
- **THEN** the server mints a device token for it, the request reads approved, and no admin response carries the raw token

#### Scenario: Admin denies the TV
- **WHEN** the admin denies a pending pairing request
- **THEN** the request reads denied and the waiting device never receives a token

### Requirement: Device token pickup

The API SHALL let the device learn the outcome via `GET /api/v1/pair/{id}/wait`, an unauthenticated poll keyed by the unguessable `pairing_id` (knowing the id IS the capability). A pending request SHALL answer with its pending status, an approved one SHALL answer with the device token (once), and denied/expired ones SHALL answer with their terminal status. An unknown pairing id SHALL be rejected with 404.

#### Scenario: Device polls until approved
- **WHEN** the device polls the wait endpoint before and after approval
- **THEN** the pending poll answers `pending` and the next poll answers with the device token

#### Scenario: Unknown pairing id is rejected
- **WHEN** a caller polls a wait id that was never issued
- **THEN** the response is 404

### Requirement: Unauthenticated pairing entry

When the SPA holds NO stored credential (neither a device token nor the admin token), the root/main-screen surface SHALL be the pairing entry: the SPA starts the flow ITSELF — calling `POST /api/v1/pair`, displaying the returned code prominently for the admin to match, and polling `GET /api/v1/pair/{id}/wait` — and on approval SHALL store the device token and enter the library main screen without any token pasting. A 401 from the API SHALL clear the stored device credential and return the SPA to the pairing entry (the revoked-device path). The operator path is unchanged: deep links to protected routes still redirect to the existing admin-token `/login`, and a stored admin token still enters the app shell as today.

#### Scenario: No credential shows the pairing entry
- **WHEN** a browser with no stored device or admin credential opens the SPA root
- **THEN** the pairing entry is the visible main surface and it displays a pairing code — no admin-token prompt is shown

#### Scenario: Approval enters the library view
- **WHEN** the admin approves the pending request while the SPA is polling
- **THEN** the SPA persists the device token and lands on the library main screen without any pasted token

#### Scenario: Revocation returns to the entry
- **WHEN** a stored device credential is revoked and an API call answers 401
- **THEN** the SPA clears the credential and returns to the pairing entry

### Requirement: Client-role authentication for devices

`authMiddleware` SHALL resolve a bearer credential that misses the admin compare against the device-token store; a hit SHALL mint `Principal{Role: RoleClient}` (the previously gated, never-minted role). A device token SHALL be accepted by the browse route group (playback, progress, libraries/items/series views) and SHALL be rejected with 403 on every admin route; a credential matching neither the admin token nor any device token SHALL be rejected with 401. Handlers SHALL NOT fork on role; the route group remains the only authZ gate.

#### Scenario: Device token plays
- **WHEN** a device token calls `GET /api/v1/items/{id}/playback` (or another browse route)
- **THEN** the call succeeds under `RoleClient`

#### Scenario: Device token cannot administer
- **WHEN** a device token calls an admin route (e.g. `POST /api/v1/libraries`)
- **THEN** the call is rejected with 403

#### Scenario: Garbage token is unauthenticated
- **WHEN** a request carries a bearer credential that matches neither the admin token nor any device token
- **THEN** the request is rejected with 401 before any handler runs

### Requirement: Device token durability and revocation

Device tokens SHALL be durable across server restarts: persisted in sqlite with only their SHA-256 hash stored (never the raw token), so a redeploy never forces re-pairing. Revocation SHALL delete the token row; the next API call with a revoked token SHALL be rejected with 401.

#### Scenario: Token survives a restart
- **WHEN** the server restarts after a device paired
- **THEN** the device token still authenticates and resolves to `RoleClient`

#### Scenario: Revoked token loses access
- **WHEN** the admin revokes a device and the device calls a browse route with its old token
- **THEN** the call is rejected with 401

### Requirement: Admin pairing panel

The web SPA's admin area SHALL gain a pairing panel (alongside the existing admin tabs, behind the existing admin token auth): the pending pairing requests with their codes and one-tap approve/deny actions, and the device list with a revoke action. The panel SHALL consume the pairing endpoints above; no device-management UI exists beyond list + revoke.

#### Scenario: Admin pairs a TV from the panel
- **WHEN** the admin opens the pairing panel while a device waits, matches the code on the TV screen, and taps approve
- **THEN** the pending entry clears and the TV proceeds to playback

#### Scenario: Admin revokes a lost device from the panel
- **WHEN** the admin revokes a device in the panel
- **THEN** the device disappears from the list and its token stops authenticating
