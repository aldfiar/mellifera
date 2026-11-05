# Proposal

## Why

mellifera serves one household through one shared admin token: every surface
(TV devices, the SPA) sees every library, every watch lands in one global
ledger, and there is no personal identity to scope anything by. The household
needs personal accounts — users who authenticate by password, groups that
scope which Collections they see, per-user watch state, and per-group
enrichment mutes — without breaking the zero-user deployments that work today.
This is Layer 6 of the UI improvement roadmap; the adult-collection gate
(re-converged 2026-11-04) re-bases onto THIS visibility model, so its seam
must land first. Frozen design input: `.tmp/l6-accounts-access-design.md`
(converged 2026-11-04, HOLDS-WITH-CHANGES, R1–R3 folded).

## What Changes

- **New `internal/access` leaf** — the `Viewer` visibility context (≤8
  exports: `Viewer` + `System()`/`Admin()`/`User()`/`LegacyDevice()`
  constructors; zero value hides everything, fail closed; structs copied on
  read, never shared mutable). `internal/store` imports it; nothing imports
  down into it.
- **New `internal/identity` domain package** over `Store.DB()` (the
  `pairing.NewService(st *store.Store…)` precedent): users/groups/credentials
  CRUD, argon2id password hashing (dep `golang.org/x/crypto`, pure Go; params
  pinned t=1, m=64MiB, p=1, checked only at session mint), session
  mint/verify/revoke, `ResolveViewer`, `HasUsers`, last-user delete guard.
- **Schema**: `users`, `groups`, `group_collections` (display positions,
  overlap allowed), `group_members`, unified `credentials` (kinds
  `device|session`, SHA-256 token hashes); one-time guarded copy
  `device_tokens → credentials` at Open with pairing minting into
  `credentials` directly post-migration; **the repo's FIRST table-rebuild
  migration** — `playback_progress` AND `watched_items` rebuild to PK
  `(user_id, item_id)` with secondary indexes (SQLite cannot ALTER a PK;
  create-new → INSERT SELECT legacy rows as `user_id=0` → drop → rename, one
  transaction, PRAGMA-guarded, idempotent, zero row loss).
- **Grant-based DEFAULT-HIDDEN visibility** for user principals: a user sees
  exactly the union of their groups' member Collections; legacy principals
  (env admin token, unbound devices) keep today's see-all; admin-role users
  see all. Roles gate DO (403 stays on admin routes), groups scope SEE
  (hidden ≡ unknown: 404 / 200-empty) — orthogonal axes, no new Role
  constant. **Runtime legacy mode**: `HasUsers()==0` collapses every
  principal to today's scope — zero-user deployments byte-identical; first
  user creation is a one-way door (explicit notice); deleting the last user
  is forbidden. No guest principals: a guest is a real user in a minimal
  group, 401 fail-closed.
- **Viewer threading**: `visibleWhere(v, col)` — ONE unexported store
  fragment (legacy/admin → `""` byte-identical; user → bound IN-list; empty →
  `1=0`); the gate-inventory 17 content reads plus `ListWatched` gain a
  trailing `v access.Viewer`; `InsertWatched` gains viewer stamping; the ~78
  internal call sites sweep to compiler-forced `access.System()` (MUST-be-true
  annotations on `internal/scan/run.go` and `internal/art/settle.go`);
  learning/backfill stays System. Export budgets hold: ZERO new exports in
  `internal/store`, `internal/api`, `internal/enrich` (each at the 12 hard
  cap) — signatures widen, names never added.
- **Auth chain**: the middleware resolves bearer credentials against the
  unified credentials store after the admin compare; `POST /api/v1/auth/login`
  (unauthenticated, rate-limited keyed (IP, username), uniform 401 — no
  account enumeration) and `POST /api/v1/auth/logout`; sessions are
  revocation-only (no TTL), password change auto-revokes; login is the only
  NEW unauthenticated surface.
- **Wire (all additive)**: `GET /api/v1/profile` (served identity — kind,
  name, role, groups, prefs; the SPA stops probing its role via
  /admin/status), `PUT /api/v1/profile/prefs` (per-user preference document;
  auto-next flag rides here, env watch-defaults stays the default), admin
  users/groups CRUD, device→user binding (`PUT /admin/devices/{id}/user`),
  explicit one-shot adopt-legacy-rows (newer-wins by `updated_at`),
  `GET /admin/visibility-explain` (the grant-based silent-nothing antidote).
- **Per-user viewer state**: progress and watch-ledger writes stamp the
  viewer, reads are viewer-scoped (badges, Continue rows follow the viewer);
  rec tag-learning and completion-ledger learning semantics stay GLOBAL —
  documented so nobody "fixes" it; `DeleteUser` cascades that user's sessions
  and ledger rows in one transaction.
- **Per-group enrichment (read-time only)**: group `doc_json` per-source
  mutes applied as a post-`ResolveGates` AND-down on copies at the ONE
  client-facing presentation site (mute-wins across overlapping groups; a
  library-row override never defeats a group mute); derivation, queue, settle
  stay group-blind and operator-gated — write-time scoping is killed (tier
  inversion). The SPA learns mutes from served `source_chain`
  (`enabled=false`) with zero new wire.
- **Relay**: the claim conjunct becomes `(library_id = 0 OR library_id IN
  visible-set)` for ANY authenticated principal (0-jobs carry no titles), and
  the viewer is re-checked at result ingestion — closing the identity-switch
  window (claims carry titles in the plan blob).
- **Enforcement**: `internal/api` gains THE ONE `viewerFor(r)` read;
  `principalFromContext` becomes legal only in `middleware.go` + the
  `viewerFor` file — **L6 owns adding check.sh's first grep rule** (third hit
  fails). The adult-gate change's planned trailing `allowRestricted bool`
  never lands — the Viewer param IS the seam.
- **SPA**: unified `/login` (username+password primary, admin-token paste
  preserved for the operator, pairing link for TVs), profile block reading
  `/profile`, admin users/groups/mutes/bind/adopt/explain panels — Vitest
  duties; swag regen (`make web-build`, GOPATH/bin on PATH) at close-out.
- **Adult-gate contract recorded** (in the new `accounts` capability): the
  reversal of adult-gate-design §6's visible-id-set rejection (allow-list
  adopted; zero-value `1=0` restores the fail-safe direction §6 feared lost;
  "heavier" is moot at household scale; no column existed to predicate on),
  and the 4-step gate re-base (restricted column dual-site → User set query +
  NOT restricted → LegacyDevice + NOT restricted clause — byte-identity
  deliberately surrendered there → toggle+PATCH+itests).
- **Named residuals** (documented, not built): per-user direct visibility
  overrides, policy export/import, session TTL, multi-admin granularity,
  password self-service change, admin "preview what user X sees" (the explain
  endpoint covers the question), auth-seam extraction from `internal/api`
  (named door for next time), unbound devices keep see-all until the
  restricted floor lands.

**Isolation mode**: this loop runs in a managed worktree
(`/Users/aldfiar/projects/go/mellifera.worktrees/l6-accounts-access`,
worktree-skill default) — the register's git-check runs `git -C <worktree>`
via `wf pipeline attach-worktree`.

## Capabilities

### New Capabilities

- `accounts`: users, groups, roles, credentials/sessions, grant-based
  visibility resolution, per-user viewer state, per-group mutes, the admin
  accounts surfaces — and the adult-gate §6 reversal + 4-step re-base record.

### Modified Capabilities

- `web-ui`: auth-surface amendment (login is the second unauthenticated
  verb), credential types, unified login surface, profile block (role-probe
  removal), per-user prefs, viewer-scoped library list + watched states, the
  accounts admin panels.
- `device-pairing`: device tokens mint into + resolve from the unified
  credentials table; bound devices resolve the bound user's Viewer; the panel
  gains the bind affordance.
- `playback-progress`: per-user progress store (PK rebuild), viewer-stamped
  writes, viewer-scoped reads, viewer-stamped completion detection.
- `recommendation-sorting`: per-user completion ledger (PK rebuild, viewer
  stamping, indexes), global-learning invariant pinned, viewer-scoped
  continue/watched reads — carries the ledger half the design called
  "watched-states" (that capability lives here and in web-ui since its
  archive; there is no separate `watched-states` spec).
- `client-relayed-fetch`: the set-based claim conjunct for any authenticated
  principal + the result-time viewer re-check.
- `metadata-source-admin`: per-viewer chain mutes (dormant symmetry per
  viewer), mute-wins, group-blind derivation.
- `media-serving`: the pre-mint gated GetItem check — no media token is ever
  minted for an item invisible to the caller.
- `artwork`: composition walks the viewer's effective chain (a muted source
  composes nothing for that viewer).
- `scan-library`: library summary/folders become viewer-scoped (hidden ≡
  unknown 404).
- `serial-library`: the series API surface becomes viewer-scoped (hidden ≡
  unknown 404).

## Impact

- **Code**: `internal/access` (new), `internal/identity` (new),
  `internal/store` (threading + schema + migration, zero new exports),
  `internal/api` (`viewerFor`, handler threading, auth chain, new routes,
  zero new exports), `internal/enrich` (none — the mute layer reads gates in
  cmd; zero new exports), `internal/pairing` (mints into credentials),
  `cmd/mellifera` (wiring: `Deps.Identity`, the ModulePresentation mute
  closure), `web/` (SPA login/profile/panels + Vitest),
  `.claude/skills/mellifera-build/scripts/check.sh` (first grep rule).
- **Dependencies**: `golang.org/x/crypto` (argon2id; pure Go, no CGO).
- **Data**: first table-rebuild migration (`playback_progress`,
  `watched_items` → PK `(user_id, item_id)`); five new tables; one-time
  `device_tokens` copy.
- **Wire**: additive only — `/auth/login`, `/auth/logout`, `/profile`,
  `/profile/prefs`, `/admin/users*`, `/admin/groups*`,
  `/admin/devices/{id}/user`, `/admin/visibility-explain`; no shape breaks.
- **Docs debt note**: `docs/api-reference` and `internal/api/doc.go` INV
  notes stay behind (known debt, dedicated docs pass later); swag + OpenAPI
  regen rides the close-out task.
