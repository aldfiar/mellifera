# Design

## Context

The auth seam this change fills already exists and is documented for exactly this evolution: `internal/api/middleware.go` resolves `Principal{Role: RoleAdmin}` from the single admin bearer token (constant-time compare) and `requireRole` gates per route group — while the comments state "RoleClient is gated but not minted" and `internal/api/router.go:174` defines `RoleClient` as "the Phase-2 swap point". The browse group (`internal/api/router.go:216`) ALREADY admits `requireRole(RoleAdmin, RoleClient)` — playback, progress and library/item/series views need zero authZ changes. Persistence follows the idempotent `schemaSQL` migration set with small control tables (`playback_progress`, `title_overrides`, `metadata_source_prefs` are the precedents). The SPA admin area is three tabs (`web/src/pages/admin/AdminTabs.tsx`) over TanStack Query v5 hooks; wire types are hand-mirrored verbatim in `web/src/lib/api.ts`; the OpenAPI contract is swag-generated from handler annotations and committed (`make web-build`). Package gates (`.claude/skills/mellifera-build/scripts/check.sh`): warn >8 / fail >12 exported symbols — api and store are already warn-listed (12 and 10).

## Goals / Non-Goals

**Goals:**
- Mint `RoleClient` through the existing middleware seam: device bearer token → `Principal{Role: RoleClient}`.
- One-tap admin approval from the SPA; the admin token never reaches the TV.
- Durable device tokens (hashed at rest, survive restarts), one-click revocation.
- The pairing endpoints are the only unauthenticated API surface, rate-limited and short-TTL'd.

**Non-Goals:**
- No TV client ships here — the API contract is the TV-side deliverable.
- No personal accounts, groups, per-user progress, or visibility scoping (Layer 6 slices 2-3). Device tokens are "a principal with a role", shaped so an account can later own them.
- No auto-approve config flag; no device-management UI beyond list + revoke; no TTL/rate-limit config knobs (constants).

## Decisions

- **D1 — new `internal/pairing` domain package, imported directly by api.** Pairing is plain domain logic (minting, TTL, single-use, rate limiting) over the store — the scan precedent, not the anti-corruption-closure precedent (closures exist because api MAY NOT import enrich/plugin/module; pairing has no such taint). `api.Deps` gains ONE field `Pairing *pairing.Service` (mirroring `Store *store.Store`), so INV5's count is untouched and handlers stay parse → ONE domain call → write. INV2's may-list grows by one line (doc.go comment + contracts.md §10 import map updated in the same box). Alternative rejected: seven new Deps closures built in cmd — ceremony without an anti-corruption payoff. Dependency direction stays acyclic: web → api → pairing → store.
- **D2 — `mountV1Routes` restructures into three groups; `authMiddleware` moves inside.** Today `New` applies `authMiddleware` at the router root, so every `/api/v1` route 401s without the admin token. The pair endpoints must skip authN, and chi panics on `Use` after route registration — so the middleware moves INTO the authed groups: a pair group (no authN), a browse group (`authMiddleware` + `requireRole(RoleAdmin, RoleClient)`), an admin group (`authMiddleware` + `requireRole(RoleAdmin)`). Same wiring point, so the role-gating test keeps exercising the real composition. Alternative rejected: exempting `/pair` by path match inside the middleware — a string-match hole in authN (the INV-no-handler-fork smell one layer up).
- **D3 — the middleware grows a second branch.** `authMiddleware(adminToken string, devices *pairing.Service)`: admin compare hit → `RoleAdmin`; miss → `devices.LookupToken(raw)` (SHA-256 + indexed store lookup) hit → `RoleClient`; else 401 canonical body. Lookup is by hash of a 256-bit random token, so the non-constant-time index seek leaks nothing usable. A nil Service skips the second branch (today's behavior — the Deps nil-safe convention). INV-authn-then-authz and INV-default-deny hold unchanged.
- **D4 — credential material.** Device token: 32 `crypto/rand` bytes, base64url — shown to nobody, stored SHA-256-hashed. Pairing code: 8 chars from an unambiguous uppercase alphabet (no 0/O/1/I/L) via `crypto/rand`, stored plaintext — it is short-lived (5 min), single-use, displayed on the TV for the admin to compare, and the capability secret is the unguessable 128-bit `pairing_id`, not the code.
- **D5 — polling, not long-polling.** `GET /pair/{id}/wait` answers immediately with the request state; the TV polls (~2-3s) for at most 5 minutes during pairing. Long-polling needs cross-request signaling machinery for a flow that runs once per device.
- **D6 — two control tables in `schemaSQL`, the store-methods convention.** `pairing_requests` (id PK, code, status pending|approved|denied|expired|consumed, created_at, expires_at) and `device_tokens` (id PK, token_hash UNIQUE, code, created_at). RFC3339Nano TEXT timestamps (`formatTime`/`parseTime`); expiry is lazy (checked on read — no sweeper goroutine); revocation = DELETE row. Store gains methods + two row structs (the `PlaybackProgress` precedent), +2 exported (10 → 12: gate-green, still warn-listed). Alternatives rejected: raw SQL in pairing via `Store.DB()` (the S10 seam — reserved for cases like module; not the dominant convention), JSON-document columns (control state, not documents).
- **D7 — per-IP rate limit is in-process memory.** Fixed window in `pairing.Service` (e.g. 5 requests / 5 min per IP on POST /pair). Resets on restart; accepted for a 127.0.0.1/LAN personal server — the alternative (a persistence-backed counter) adds write load to defend against a rare event.

- **D8 — the SPA auth gate gains a device path (no backend change).** The seven-route surface (POST /pair, GET /pair/{id}/wait) already carries everything the entry needs — this is a pure SPA state machine, no new endpoint. auth.ts gains a device-token slot beside the admin one (`mellifera.device_token`, fixed-key INV style); the root gate reads BOTH: no credential at all → the pairing entry (`PairingEntry.tsx`: start pairing, show the code, poll the wait endpoint, on approved store the token and enter the library view); either stored credential → the app shell exactly as today (admin sees everything, device token rides RoleClient); any 401 clears the matching token and lands back on the entry (revoked device). `/login` stays for operator deep links — the web-ui "SPA token authentication" requirement is untouched for protected routes.

## Interfaces (cross-group)

Status lifecycle: `pending → approved | denied | expired → consumed` (consumed = token picked up; approved-but-unpicked-up is the only state whose wait response carries a token).

`internal/pairing` (exported surface, 6 symbols ≤ 8; methods excluded by the gate):

    type Service struct{...}
    func NewService(st *store.Store, now func() time.Time) *Service
    func (s *Service) CreateRequest(ctx, ip string) (Pairing, error)      // rate limit + mint
    func (s *Service) Wait(ctx, pairingID string) (WaitOutcome, error)    // status; token only once
    func (s *Service) ListPending(ctx) ([]Pairing, error)
    func (s *Service) Approve(ctx, pairingID string) (Pairing, error)     // mints token hash
    func (s *Service) Deny(ctx, pairingID string) error
    func (s *Service) Devices(ctx) ([]Device, error)
    func (s *Service) Revoke(ctx, deviceID string) error
    func (s *Service) LookupToken(ctx, raw string) (bool, error)          // middleware branch
    type Pairing struct{ ID, Code, Status string; CreatedAt, ExpiresAt time.Time }
    type Device struct{ ID, Code string; CreatedAt time.Time }            // Code = approval code, for recognition
    type WaitOutcome struct{ Status string; Token string }                // Token "" unless approved-and-unconsumed
    var ErrUnknownPairing = errors.New(...)                                // → 404 at handlers

`internal/api` route table (swag-annotated; canonical `writeError` envelope everywhere; nil `Deps.Pairing` → 503 on pair routes, middleware keeps admin-only behavior):

    POST /api/v1/pair                        unauth  200 {pairing_id, code} | 429 rate_limited
    GET  /api/v1/pair/{id}/wait              unauth  200 {status, device_token?} | 404 not_found
    GET  /api/v1/admin/pairings              admin   200 {pairings: [{pairing_id, code, created_at, expires_at}]}
    POST /api/v1/admin/pairings/{id}/approve admin   200 {pairing_id, status} | 404 | 409 conflict (expired/consumed)
    POST /api/v1/admin/pairings/{id}/deny    admin   200 {pairing_id, status} | 404
    GET  /api/v1/admin/devices               admin   200 {devices: [{device_id, code, created_at}]}
    DELETE /api/v1/admin/devices/{id}        admin   204 | 404

SPA contract (hand-mirrored TS in `web/src/lib/api.ts`, INV-verbatim-field-names; hooks in `web/src/lib/queries.ts`; new `/admin/pairing` tab in `AdminTabs.tsx`): the seven shapes above as `PairingRequest`, `PairingWait`, `AdminPairing`, `AdminDevice` interfaces + `usePairings`/`useApprovePairing`/`useDenyPairing`/`useDevices`/`useRevokeDevice` admin hooks, PLUS the device-side auth gate (D8, three states: no credential → pairing entry running start+poll; valid credential → app; 401 → clear + pairing entry) with `useStartPairing`/`usePairingWait` consuming the unauthenticated endpoints — NO backend change, the seven-route surface already supports it. `make web-build` regenerates the committed `internal/web/api/openapi.{json,yaml}` (swag annotations from the new handlers) and `internal/web/dist` — the only node/swag touchpoint, INV-node-free-gate preserved.

## Risks / Trade-offs

- [store exported count 10 → 12, at the fail edge (>12 fails)] → 2 row structs is the whole addition; future store additions go through the S10 `DB()` seam or a trim pass. Gate-checked by `make check` in the api box's review.
- [Pairing code brute force] → the code never authenticates anything; the capability is the 128-bit pairing_id. POST /pair is rate-limited per IP; codes are single-use with a 5-minute TTL.
- [Token theft] → browse-group reach only (no admin verbs), SHA-256 at rest, one-click revocation.
- [In-memory rate limiter resets on restart] → accepted (D7); a restart also cannot resurrect consumed state (that lives in sqlite).
- [Committed-artifact drift (openapi/dist)] → both are reviewed in the diff; the gate re-runs `npm run build` + swag comparison duties.

## Migration Plan

Additive only: the two `CREATE TABLE IF NOT EXISTS` statements join `schemaSQL` (safe on every re-open, B7); pre-existing DBs pick them up on next boot; rollback = redeploy the previous binary (inert tables). No config, no env, no data migration.

## Open Questions

- Exact code alphabet beyond "unambiguous uppercase" (e.g. Crockford base32 vs digits+letters) — implementation detail; the spec pins 6-8 chars via crypto/rand, single-use, 5 min TTL. Default: 8 chars from a 29-glyph alphabet.
- Whether devices later gain an operator-facing label column — Layer 6 slice 2 territory (accounts owning devices); the panel shows the approval code meanwhile.
