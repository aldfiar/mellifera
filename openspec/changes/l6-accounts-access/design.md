# Design

## Context

Single-principal today: `Principal{RoleAdmin|RoleClient}` minted by the env
admin token compare or the device-token lookup (`internal/api/middleware.go`);
route groups are the only authZ; content reads are per-concern store methods
with their own SQL — no central choke point. `principalFromContext` is
referenced only at `middleware.go:22/:42/:83` (def, authMiddleware,
requireRole). Budgets: `internal/store`, `internal/api`, `internal/enrich`
each sit at exactly 12 exported top-level symbols — the check.sh count is
`func/type/var/const [A-Z]`, so methods, params, struct-field widening and
unexported types are free. check.sh today has NO grep rules (lint + symbol
count only, `.claude/skills/mellifera-build/scripts/check.sh`). Precedents
this design extends: `pairing.NewService(st *store.Store, now func() time.Time)`
(`internal/pairing/service.go:116` — a domain package over `Store.DB()`), the
`Deps.Pairing *pairing.Service` lateral import, `ResolveGates` AND-down on
copies (`internal/enrich/gates.go:25`), the `principalInjector` role-test
seam (`internal/api/role_gating_test.go:24`), and the
`ensureLibrariesStreamsEnabled` dual-site column pattern. Frozen design input:
`.tmp/l6-accounts-access-design.md` (§1 model, §2 mechanism, §10 resolved
decisions — this document shapes, never re-litigates). Motivation lives in
proposal.md — Why.

## Goals / Non-Goals

**Goals:**

- One visibility mechanism for every content read: a `Viewer` threaded as an
  explicit trailing parameter, resolved once per request, consumed by BOTH
  SQL (the `visibleWhere` fragment) and Go (browse-scale's RAM filtering).
- Personal accounts that authenticate by password; groups that scope SEE;
  roles that gate DO; zero-user deployments byte-identical (runtime legacy
  mode).
- Per-user viewer state (progress + completion ledger) with the repo's first
  table-rebuild migration done once, correctly, zero row loss.
- Per-group read-time enrichment mutes (mute-wins) with derivation,
  queue and settle staying group-blind.
- The adult-gate change's seam: the Viewer param replaces the planned
  trailing visibility bool.

**Non-Goals:**

- No guest/anonymous principals (a guest is a real user in a minimal group).
- No write-time enrichment scoping (tier inversion — enrich never depends on
  identity; N× fetch forks; zero read-path benefit).
- No per-user rec-score forks (tag learning stays global — shared score
  model).
- No session TTL, no password self-service change, no policy import/export,
  no multi-admin granularity (§11 residuals, named not built).
- No adult-content column or restricted floor (the adult-gate change lands
  it; this change only fixes the seam it composes into).

## Decisions

- **D1 — Grant-based DEFAULT-HIDDEN with legacy runtime mode.** A user sees
  exactly the union of their groups' member Collections; env admin token,
  unbound devices and admin-role users keep see-all. `identity.HasUsers()==0`
  collapses every principal to today's scope, so zero-user deployments stay
  byte-identical (additive wire only). First user creation is a one-way door
  (explicit notice in the create-user response); deleting the last user is
  forbidden (identity guard + SPA disable; env admin token = permanent
  break-glass). Alternative rejected: schema-level `enabled` flag on
  accounts — two sources of truth for the same question, and the flag's
  false state would need its own migration story.
- **D2 — Visibility rides ONE trailing parameter, never a boolean.**
  Every gated store read gains a trailing `v access.Viewer`; the ~78 internal
  call sites sweep to compiler-forced `access.System()` (no method-value
  aliasing exists, so the compiler forces every direct call). The adult-gate
  design's planned `allowRestricted bool` never lands — this param IS the
  seam. Alternatives rejected: per-read bool (cannot express group scopes;
  the adult gate would need a second param later), a ScopedStore wrapper or
  PolicyChecker interface (violates "interfaces only at the plugin seam",
  doubles the method surface).
- **D3 — The IN-list fragment, not a subquery.** `visibleWhere(v, col)` is
  ONE unexported store constructor: System/Admin/LegacyDevice → `""`
  (byte-identical SQL today); User → bound IN-list over the visible set;
  empty set → `1=0` (fail closed). IN-list beats a per-read subquery because
  browse-scale's /search//facets//home consume the SAME Go set before paging
  (RAM model) — one mechanism, two consumers. The adult-gate §6 rejection of
  the visible-id-set is REVERSED by this design: the zero-value `1=0`
  restores the fail-safe direction §6 feared lost, "heavier" is moot at
  household scale, and no column existed to predicate on. Per-read rule: the
  fragment applies to the row's library-identity column (`library_id` on
  items/series/progress; `id` on library reads).
- **D4 — New packages own the new concepts; capped packages gain zero
  exports.** `internal/access` (pure leaf below store): ≤8 exports —
  `Viewer{Admin bool, UserID int64, VisibleLibraryIDs []int64, ChainMutes …}`
  + ctors `System()`, `Admin()`, `User(…)`, `LegacyDevice()` + the
  request-context carrier pair `WithViewer(ctx, Viewer)` / `FromContext(ctx)`
  (7 total); zero value hides everything; a context with no stashed viewer
  reads back the zero Viewer; structs copied on read, never shared mutable.
  `internal/identity` (domain package over `Store.DB()`, the pairing
  precedent): one exported `Service` + `User`, `Group`, `Session` types,
  everything else methods — target ≤8, hard ceiling 12. `internal/store`,
  `internal/api`, `internal/enrich` stay at 12: `visibleWhere`,
  `viewerFor`, new DTOs are all unexported.
- **D5 — ResolveViewer runs ONCE per request.** One grant query
  (`group_members ⋈ group_collections`) intersected live with `libraries` —
  orphaned grant rows are harmless and invisible; DeleteLibrary's
  transactional cascade stays untouched. Chain overrides resolve at viewer
  construction (one batched read per request — amortized, not per-module).
  The set rides `access.Viewer` with two consumers (SQL + Go).
- **D6 — Unified credentials, one table.** `credentials(id, kind CHECK IN
  ('device','session'), token_hash UNIQUE, user_id NULL, label, created_at,
  expires_at NULL)`; SHA-256 for tokens (existing discipline), argon2id for
  passwords only (new dep, params pinned t=1, m=64MiB, p=1). One-time
  guarded copy `device_tokens → credentials` at Open (dormant source table),
  AND pairing writes `credentials` directly post-migration — a device paired
  before a restart must resolve (fixes the mid-run pairing gap). Sessions:
  revocation-only (household posture, matches device tokens); password
  change auto-revokes that user's sessions; logout deletes own session row.
  Login rate-limited keyed **(IP, username)** reusing the pairing limiter
  shape (`internal/pairing/service.go:326`), uniform 401 body (no account
  enumeration), constant-ish work (hash regardless of user existence).
- **D7 — Per-user ledgers, learning stays global.** `playback_progress` AND
  `watched_items` rebuild to PK `(user_id, item_id)` in ONE migration task
  (SQLite cannot ALTER a PK): create-new → INSERT SELECT legacy rows as
  `user_id=0` → drop → rename, one transaction, PRAGMA `table_info`-guarded,
  idempotent, zero row loss. Secondary indexes `(completed_at)`,
  `(applied_at)` keep ledger queries off table scans. `user_id 0` = legacy
  slot (env-admin + legacy viewers read/write it). Writes stamp the viewer;
  reads are viewer-scoped. Rec tag-learning + completion-ledger learning
  semantics stay GLOBAL (learning consumes all rows via System reads) —
  documented so nobody "fixes" it. Legacy-row adoption is an EXPLICIT admin
  action (one-shot, newer-wins by `updated_at` per item, while the user is
  alive) — never automatic seed-on-first-login. DeleteUser cascades the
  user's credential(session) rows AND ledger rows in one tx.
- **D8 — Read-time-only chain mutes, mute-wins.** Group `doc_json` carries
  per-source mutes shaped like the metadata_source_prefs vocabulary, applied
  as a post-`ResolveGates` AND-down on copies in the ONE client-facing
  ModulePresentation closure (`cmd/mellifera/main.go:392`;
  `ModuleSources` :488 is admin/System; all queue/scan/janitor ResolveGates
  sites are write-time System). NOT synthetic pref rows: the
  library-row-REPLACES-module-row override (`gates.go:42–45`) would let an
  operator row defeat a group mute, breaking MUTE-WINS. Overlapping groups:
  mute-wins. The SPA learns mutes from served `source_chain`
  (`enabled=false`, main.go:445–456) with zero new wire.
- **D9 — Exactly one principal read in api.** `viewerFor(r *http.Request)
  access.Viewer` is THE ONE read; `principalFromContext` stays legal only in
  `middleware.go` + `viewerFor`'s file, enforced by check.sh's FIRST grep
  rule (third hit fails) — authored by this change. `Deps` gains `Identity
  *identity.Service` (the `Pairing` precedent). Playback handlers run a
  viewer-scoped GetItem pre-check before `Deps.Playback`/`Play` (no media
  token is ever minted for a hidden item — the worst leak), closure
  signatures untouched. Role-test seam: `principalInjector` seeds via
  `access.WithViewer` — the carrier key lives in `internal/access`, one
  key, one seam.
- **D10 — Relay claims are set-scoped for any principal.** The claim
  conjunct becomes `(library_id = 0 OR id IN (visible-set))` for ANY
  authenticated principal (0-jobs carry no titles — provably safe; corrects
  the earlier "legacy-principal-only" mistake). The viewer is re-checked at
  `relayResult` — a see-all claim minted under a principal that outlives
  logout/login-as-restricted must not leak titles via the plan blob (claims
  carry titles — relayjobs.go plan JSON).
- **D11 — Role routing projects, never forks.** `users.role`
  (`user|admin`) projects onto the existing RoleAdmin/RoleClient principal
  routing; no new Role constant (api is FULL at 12 exports). 403 stays on
  admin routes (DO-gates ≠ existence oracles); content reads keep
  hidden ≡ unknown (404 / 200-empty, zero-value Viewer → `1=0`).

## Interfaces

Cross-group contracts (groups in dependency order: 1 access leaf → 2 schema →
3 identity → 4 store threading A → 5 store threading B → 6 api threading → 7
auth chain → 8 profile+SPA → 9 admin surfaces → 10 chain layer → 11 relay +
close-out):

- **`access.Viewer` (the seam everything meets):**
  `Viewer{Admin bool, UserID int64, VisibleLibraryIDs []int64, ChainMutes
  map[string]bool}` + constructors `System()`, `Admin()`, `User(userID int64,
  visibleLibraryIDs []int64, chainMutes map[string]bool)`,
  `LegacyDevice()`. The request-context carrier pair `WithViewer` /
  `FromContext` also lives HERE (see the carrier bullet below). Zero value
  hides everything (fail closed) — and a context with no stashed viewer
  reads back the zero Viewer. Structs
  copied on read — never shared mutable. Producer: group 1; consumers:
  groups 2–11. `internal/store` imports `internal/access`; NOTHING imports
  down into access.
- **`identity.ResolveViewer` (the per-request resolution):**
  `Service.ResolveViewer(ctx context.Context, userID int64, isAdmin bool)
  (access.Viewer, error)` — the grant query (`group_members ⋈
  group_collections`) intersected live with `libraries`, chain mutes merged
  mute-wins from the user's groups' `doc_json`, plus `Service.HasUsers(ctx)
  (bool, error)` (the runtime-legacy collapse input: zero users → every
  principal resolves to today's scope). Producers: group 3; consumers:
  group 6 (`viewerFor`), group 10 (chain closure re-resolution), group 11
  (relay re-check).
- **Store fragment (unexported, store-internal):**
  `visibleWhere(v access.Viewer, col string) (clause string, args []any)` —
  `""` for System/Admin/LegacyDevice (byte-identical SQL); bound IN-list
  `col IN (?,?,…)` for User; `1=0` for an empty set. Applied to the row's
  library-identity column: `library_id` on items/series/progress,
  `id` on library reads. Producer: group 4; consumers: every threaded read
  (groups 4–5) — never exported.
- **Ledger schema (per-user viewer state):** `playback_progress` and
  `watched_items` at PK `(user_id INTEGER NOT NULL DEFAULT 0, item_id TEXT)`
  + secondary indexes `(completed_at)`, `(applied_at)`; `user_id 0` = legacy
  slot. Writes: `PutProgress`/`InsertWatched` gain the viewer stamp;
  reads: `ListProgress`/`ListProgressAll`/`GetProgress`/`ListWatched` gain
  `v access.Viewer` (viewer-slot AND visibility conjunct); boot backfill +
  learning reads stay `access.System()`. Producers: groups 2 (rebuild), 5
  (threading); consumers: groups 6 (handlers), 9 (adopt endpoint), 11
  (close-out itests).
- **credentials table:** `credentials(id INTEGER PRIMARY KEY, kind TEXT NOT
  NULL CHECK (kind IN ('device','session')), token_hash TEXT NOT NULL UNIQUE,
  user_id INTEGER NULL REFERENCES users(id), label TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, expires_at TEXT NULL)`; SHA-256 token hashing;
  `device_tokens` stays as the dormant one-time copy source. Producer: group
  2 (DDL + guarded copy); consumers: group 3 (session mint/verify), group 7
  (middleware resolution), `internal/pairing` (mints device rows directly
  post-migration).
- **api ⇄ identity (`Deps` seam):** `Deps.Identity *identity.Service`
  (nil-safe — nil = runtime-legacy behavior); `viewerFor(r)` maps the
  context principal → Viewer (env-admin → `Admin()`; bound device → the
  bound user's resolved Viewer; unbound device → `LegacyDevice()`; session →
  `identity.ResolveViewer`; `HasUsers()==0` → today's scope for every
  principal). `Deps.Identity` is nil-safe at the api layer, but the
  composition root MUST assign a real service — cmd constructs
  `identity.NewService` over the store and sets the field (task 10.1,
  `TestDepsIdentityWired`); nil wiring would silently legacy-fall EVERY
  principal at runtime. Producers: groups 6–7; consumers: every content
  handler (group 6), relay claim/result (group 11).
- **viewer carrier (lives in access — the write-side seam):** the context
  key and the pair `access.WithViewer(ctx, v)` / `access.FromContext(ctx)`
  are authored in `internal/access` (group 1; package reaches 7 exports,
  ≤8) — layering-clean: api and cmd already import access, nothing imports
  down into it. `viewerFor` resolves ONCE per request and is the ONLY
  production stasher (one `WithViewer` call per request); every downstream
  consumer reads `FromContext` legitimately — content handlers, the
  `Deps.OnProgress` legs whose contexts already are `r.Context()`, and the
  ModulePresentation closure (invoked with the request ctx at
  api/display.go:129) — no second principal read, no Deps signature
  widening (the check.sh grep rule still names exactly two legal
  `principalFromContext` files). `FromContext` of a bare context returns
  the zero Viewer (fail closed; cmd write legs land in slot 0). The
  role-test `principalInjector` seeds via `access.WithViewer` — one key,
  role tests stay the one seam. The completion detector
  (`watch_detect.go:67`) and the recs boot backfill stamp per-row viewers
  from this carrier (group 5.3) — slot-0 rows stay the legacy slot, never
  a foreign row in any slot. Producers: group 1 (the pair), 6 (the
  per-request stash); consumers: 5.3 (detector + backfill stamps), 10.1
  (chain closure), 11.3 (end-to-end joint).
- **chain layer (cmd-side closure):** the ModulePresentation closure
  (built cmd-side at `main.go:392`, invoked with the request ctx at
  `api/display.go:129`) reads the request's Viewer via `access.FromContext`
  (the access-owned carrier stashed by 6.1's viewerFor — zero api changes,
  no Deps widening), resolves group mutes (mute-wins) and ANDs them down on
  COPIES of `ResolveGates` output: `if v.ChainMutes[pluginID] { out[i].Enabled
  = false }`. `ModuleSources` (:488) and every queue/scan/janitor site stay
  System. Producer: group 10; consumer: group 8–9 SPA surfaces read the
  served `source_chain` (`enabled=false`) with zero new wire.
- **wire (all additive):** `POST /api/v1/auth/login` `{username, password}`
  → `{token}` | 401 uniform | 429; `POST /api/v1/auth/logout` → 204;
  `GET /api/v1/profile` → `{kind: admin|user|device, user_id?, name, role,
  groups: [{id, name}], prefs}`; `PUT /api/v1/profile/prefs` (the doc);
  `POST/GET/PATCH/DELETE /api/v1/admin/users*`; `POST/GET/PATCH/DELETE
  /api/v1/admin/groups*` (+ member-users, member-collections with
  positions); `PUT /api/v1/admin/devices/{id}/user`; `POST
  /api/v1/admin/users/{id}/adopt-legacy`; `GET
  /api/v1/admin/visibility-explain?user_id&library_id`. Producers: groups
  7–9; consumers: the SPA (groups 8–9).

## Risks / Trade-offs

- **[The 78-site sweep touches 20 files]** → compiler-forced (no aliasing
  exists), split across tasks 4.2–4.5 by read family; `@audit` on the sweep
  audit task; MUST-be-true comments on `internal/scan/run.go` (4 sites — a
  false would re-identify restricted-less items as nonexistent) and
  `internal/art/settle.go` (3 — a false would GC live artwork).
- **[First table-rebuild migration can lose rows]** → one transaction,
  PRAGMA `table_info`-guarded, idempotent; tests pin fresh + migrated
  shapes and zero row loss (task 2.3); legacy rows land in the `user_id=0`
  slot and survive reads.
- **[IN-list arity grows with grant count]** → non-issue at household scale
  (§10 resolved); SQLite bound-parameter limits sit far above any plausible
  grant count; revisit only if a deployment outgrows it (the fragment is
  ONE constructor — swap site is single).
- **[Hash-on-miss login timing tell]** → constant-ish work: hash regardless
  of user existence (documented accept-or-fix decision, §3); uniform 401
  body bars enumeration; (IP, username) limiter bars brute force.
- **[Identity-switch leaks via relay plan blobs]** → result-time viewer
  re-check (D10) + the claim conjunct; pinned by group 11 tests.
- **[Group mute defeats operator row]** → muted at the AND-down site, not
  as synthetic pref rows (D8); the library-row override cannot reach a group
  mute; same-collection-two-viewers test pins namespace byte-identity.
- **[Users break zero-user deployments]** → runtime legacy mode collapses on
  `HasUsers()==0` (D1); the collapse is tested both directions (first-user
  door, last-user guard).
- **[check.sh grep rule over-blocks future legit uses]** → the rule names
  exactly two legal files (middleware.go, viewer.go); a future auth-seam
  extraction (§11 residual) amends the rule with its own change.

## Migration Plan

The group order below IS the DAG (tasks.md mirrors it; design §8's 11
slices):

1. `internal/access` leaf (Viewer + ctors, fail-closed contract) + tests.
2. Schema: the five tables + credentials DDL, device-token guarded copy,
   pairing writes-credentials, the TWO ledger table rebuilds (+ secondary
   indexes); fresh + migrated shapes, zero row loss.
3. `internal/identity` (CRUD, argon2id, sessions, ResolveViewer, HasUsers,
   last-user guard) + tests.
4. Store threading A: `visibleWhere` + the 17 content reads; compiler-forced
   `access.System()` sweep; MUST-be-true annotations.
5. Store threading B: per-user ledgers (viewer-keyed reads/writes,
   InsertWatched stamp, ListWatched conjunct); legacy-slot visibility tests.
6. API threading: `viewerFor` + handler threading + playback pre-check +
   check.sh grep rule + role-test seam extension.
7. Auth chain: credentials branch in middleware, Principal widening,
   login/logout (rate-limited, uniform 401), device-token resolution over
   credentials.
8. Profile + SPA identity: `/profile`, `/profile/prefs`; SPA login form +
   profile block + role-probe removal.
9. Admin surfaces: users/groups endpoints + bind + adopt + explain + SPA
   panels.
10. Per-group chain layer: closure viewer scope + post-ResolveGates AND-down;
    same-collection-two-viewers test.
11. Relay claim scoping + close-out: claim conjunct + result re-check;
    cross-module qa joint; swag regen (`make web-build`, GOPATH/bin on
    PATH); black-box AC-matrix itests; full `go test ./...` readiness (GATE 2
    = full suite).

Rollback: every step is additive until group 4 (compiler-forced sweep) — a
revert of the branch restores byte-identical behavior; the schema migration
is idempotent and forward-only (rebuild guarded, legacy slot preserved).

## Open Questions

None open — the design loop converged (HOLDS-WITH-CHANGES, R1–R3 folded)
and §10's decisions are frozen. Deferred items are §11 residuals recorded in
proposal.md, not open questions.
