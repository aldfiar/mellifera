# Proposal

## Why

Mellifera runs on an Android TV, and pasting the admin token there is too complicated. The user wants playback without a token ceremony: the TV should ask, the admin taps approve in the web UI, and the TV plays — the admin token never touches the TV. This is the first slice of the Layer 6 accounts/access track.

## What Changes

- New unauthenticated pairing entry in the SPA: with no stored credential, the root/main-screen surface IS the pairing flow — it starts the pairing itself, displays the code, polls, and on approval stores the device token and enters the library view; a revoked credential (401) clears and returns to the entry. No admin-token prompt is ever shown to the TV.
- New unauthenticated pairing flow: a device calls `POST /api/v1/pair` (no token) and receives a short single-use code + capability id; it polls `GET /api/v1/pair/{id}/wait` until an admin approves.
- The web SPA's admin area gains a minimal pairing panel: pending pairing requests (with their codes) plus one-tap approve/deny, and a device list with revoke.
- Approval mints a durable device token; the server stores only its SHA-256 hash. The TV picks the token up via the wait endpoint and uses `Authorization: Bearer <device_token>` from then on.
- `authMiddleware` gains its second branch: a credential that misses the admin compare is resolved against the device-token table, minting `Principal{Role: RoleClient}` — the seam `internal/api` has gated but never minted.
- No route-group authZ changes: the browse group (playback, progress, libraries/items/series views) already admits `requireRole(RoleAdmin, RoleClient)`; admin routes stay admin-only; the pairing endpoints are the only unauthenticated API surface.
- Device tokens are durable across restarts (sqlite, the existing idempotent-migration pattern); revocation deletes the row, so the next API call 401s.

## Capabilities

### New Capabilities

- `device-pairing`: TV-to-server device pairing — code request, admin approval, device-token pickup, RoleClient minting, durability and revocation, and the admin pairing panel in the SPA.

### Modified Capabilities

- `web-ui`: the "Role-gated API authentication" requirement changes — `RoleClient` is no longer "gated but not minted"; a valid device token now resolves to a client principal (browse routes accept it, admin routes still 403).

## Impact

- `internal/store`: two new control tables (`pairing_requests`, `device_tokens`) in the idempotent `schemaSQL` set + CRUD methods.
- NEW `internal/pairing`: the minting/approval service (code + token minting via crypto/rand, TTL, single-use consumption, per-IP rate limit, token hashing) — api imports it directly (INV2 may-list grows by one plain domain package, like scan).
- `internal/api`: `Deps` gains a `Pairing *pairing.Service` field (no new exported symbols — INV5 stays at 8); `mountV1Routes` restructures into pair (no authN) + browse + admin groups; `authMiddleware` gains the client-token branch; new handlers are pure delegation.
- `cmd/mellifera`: composition root builds `pairing.NewService(st)` and passes it into `api.Deps`.
- `web/src`: pairing/device wire types + query hooks, a `/admin/pairing` panel behind `AdminTabs`; `make web-build` regenerates the committed `internal/web/api/openapi.*` + `internal/web/dist`.
- Out of scope: personal accounts, groups, per-user progress, visibility scoping (Layer 6 slices 2-3 — device tokens are "a principal with a role", designed so an account can later own them); an auto-approve config flag; any device-management UI beyond list + revoke.
