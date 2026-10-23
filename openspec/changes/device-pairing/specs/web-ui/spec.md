# web-ui Delta

## MODIFIED Requirements

### Requirement: Role-gated API authentication

The API SHALL resolve a valid `MELLIFERA_ADMIN_TOKEN` bearer credential to `Principal{Role: RoleAdmin}`; a missing or wrong token SHALL be rejected with 401 unauthorized. A bearer credential that misses the admin compare SHALL additionally be resolved against the device-token store (device-pairing): a hit SHALL mint `Principal{Role: RoleClient}`. Routes SHALL be gated by per-group role checks: browse routes (`GET /libraries`, `GET /items`, `GET /items/{id}`, playback and progress verbs) accept admin+client; admin routes (`POST /libraries`, `POST /libraries/{id}/scan`, `GET /admin/status`, pairing/device administration) accept admin only; the pairing endpoints (`POST /pair`, `GET /pair/{id}/wait`) are the ONLY unauthenticated API surface. Handlers SHALL NOT fork on role; `RoleClient` is minted by device tokens minted through pairing, never by the admin token.

#### Scenario: Admin token reaches both route groups
- **WHEN** the admin token calls a browse route and an admin-only route
- **THEN** every call succeeds

#### Scenario: Client role denied admin routes
- **WHEN** a client-role principal calls `GET /api/v1/admin/status` (or another admin-only route)
- **THEN** the request is rejected with 403

#### Scenario: Pairing endpoints are unauthenticated
- **WHEN** a device calls `POST /api/v1/pair` or `GET /api/v1/pair/{id}/wait` with no Authorization header
- **THEN** the calls reach their handlers (no 401), while every other API path without a valid token still 401s
