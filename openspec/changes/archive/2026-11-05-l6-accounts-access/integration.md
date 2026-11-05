# Integration Survey — l6-accounts-access

Surveyor audit of the PLANNED integration graph (read-only; grounded against
the live tree at `949f39a` in this worktree). Plan-truth sources:
`proposal.md`, `design.md` (Interfaces + D1–D11), `tasks.md` (11 groups /
42 tasks after amendment round 2), `specs/` deltas ×11,
`contracts/4.5-system-sweep.md`.

> **Amendment round 2 re-ran 2026-11-04** (42 tasks; new 1.3 ctx viewer
> carrier in `internal/access`; 10.1 stays cmd-only via `access.FromContext`
> — no Deps widening; `Deps.Identity` wiring pinned in 10.1; design bullets
> restated; D8 cite corrected to main.go:392). §Numbered questions and
> §Checks below are the ROUND-0 record kept for provenance; the round-1
> verification + Q9/Q10 text live in **§Amendment re-run — round 1**, and
> the round-2 verification + the empty-frontier verdict live in
> **§Amendment re-run — round 2** at the bottom.

## Grounding method (and one environment caveat)

- `wf index query status`: MAP `949f39a`, CURRENCY CURRENT — but the map's
  **Go symbol layer is empty** (`stats`: `symbols=0`, `importers=0`; the
  regex-floor backend extracts nothing for `.go`). `def`/`callers` queries
  return `(none in map)` for every Go symbol. Grounding therefore ran as
  **targeted grep over the live tree at 949f39a**, cited `file:line`
  throughout (the code-search fallback; file-inventory facts still came from
  the map). Consequence for GATE 2: wf-reviewer's re-ground duty
  (`wf index query callers`) hits the same wall on Go symbols — ground via
  grep the same way (Q8).
- Every design-cited anchor was verified in place: `principalFromContext`
  middleware.go:22 (def), :42, :83 — exactly 3 non-test refs, matching design
  Context; `authMiddleware(token, devices *pairing.Service)` middleware.go:39,
  mounted router.go:301/:368; `pairing.NewService` service.go:116; pairing
  limiter `allow` service.go:326; `ResolveGates` gates.go:25 with the
  library-row-REPLACES override at gates.go:42–45; `principalInjector`
  role_gating_test.go:21 (design cites :24 — 3-line drift, harmless);
  ModulePresentation closure main.go:414 (`ResolveGates` call at :415),
  source_chain block main.go:445–457, `ModuleSources` main.go:488;
  boot-backfill read `ListProgressAll` store/progress.go:79 (design cites
  progress.go:73–78 — the caller is cmd/mellifera/recs_backfill.go:43);
  `Store.DB()` open.go:523; `schemaSQL` open.go:26+ with `device_tokens`
  :255, `playback_progress` :169, `watched_items` :295; check.sh carries lint
  + symbol count only, zero grep rules today (design claim holds);
  `TOKEN_KEY = "mellifera.token"` web/src/lib/auth.ts:18; Sidebar role probe
  web/src/components/Sidebar.tsx:38–46; `itemPlayback`/`itemPlay`
  internal/api/playback.go:105/:172; `ClaimOldestRelayJob`
  internal/store/relayjobs.go:83, relay `Ingest` internal/enrich/relay.go:230,
  plan blob relay.go:136.
- MUST-be-true site counts verified exactly: internal/scan/run.go = 4
  threaded-read sites (GetLibrary :122, QuerySeries :230, GetSeriesByPath
  :399, GetItem :444); internal/art/settle.go = 3 (ListLibraries :145,
  QuerySeries :154, QueryItems :165).

## The planned graph

### Nodes (new)

| Node | Plan | Grounding |
|---|---|---|
| `internal/access` — `Viewer`, `System()`, `Admin()`, `User()`, `LegacyDevice()` (5 exports) | 1.1–1.2 | NEW (absent from disk; pure leaf below store) |
| `internal/identity` — `Service`, `User`, `Group`, `Session` + CRUD/session/`ResolveViewer`/`HasUsers` methods | 3.1–3.4 | NEW (the pairing precedent: `NewService(st *store.Store,…)` service.go:116 over `Store.DB()` open.go:523) |
| `internal/api/viewer.go` — `viewerFor(r) access.Viewer` | 6.1 | NEW file (api stays at 12 exports) |
| `Deps.Identity *identity.Service` (nil-safe) | 6.1 | `Deps` router.go:24; `Deps.Pairing` precedent router.go:210 |
| check.sh FIRST grep rule (`principalFromContext` legal only in middleware.go + viewer.go) | 6.4 | check.sh has no grep rules today — verified |
| SPA: unified `/login`, Profile block, autoNextPrefs, admin Accounts panels | 8.2–8.4, 9.4 | `web/src/pages/Login.tsx` exists; Profile/Accounts NEW; `web/src/pages/admin/` exists |
| `internal/itest` joints: `TestSameCollectionTwoViewers`, `TestAccountsAuthChainJoint`, `TestAccountsViewerThreadingMatrix`, `TestAccountsACMatrix` | 10.2, 11.3, 11.5 | NEW |

### Nodes (touched)

| Node | Plan | Grounding (live) |
|---|---|---|
| `internal/store` schemaSQL: 5 accounts tables + credentials | 2.1 | open.go:26+ (idempotent CREATE set; addDDL column-adds only — the rebuild is a NEW migration class, task 2.3 owns it) |
| one-time guarded copy `device_tokens`→`credentials`; pairing mint→credentials | 2.2 | `device_tokens` open.go:255; mint path = `Approve` service.go:219; lookup = `LookupToken` service.go:312 over `LookupDeviceTokenByHash` store/pairing.go:132 |
| ledger rebuild: `playback_progress` + `watched_items` → PK `(user_id, item_id)` | 2.3 | open.go:169 / :295 (both single-PK `item_id` today) |
| `visibleWhere` + 17 threaded reads | 4.1–4.4 | all 17 verified present: ListLibraries libraries.go:333, GetLibrary :306, LibrarySummary :167, LibraryFolders :186, `libraryExists` :292 (internal; write-path callers :168/:187/:230), QuerySeries series.go:118, GetSeries :89, GetSeriesByPath :101, ListSeriesIDs :154, QueryItemsBySeries :184, QueryItems items.go area, GetItem items.go:73, ListItemParsers item_parsers.go:68, ListProgress progress.go:110, ListProgressAll :79, GetProgress :60, PutProgress's existence check progress.go:34–41 |
| ledger writes/reads viewer-keyed | 5.1–5.2 | `PutProgress` progress.go:33, `InsertWatched`, `ListWatched` recs.go:54, `ListUnappliedWatched` recs.go:83, `ApplyTagWeights` recs.go:122 |
| relay claim conjunct | 11.1 | `ClaimOldestRelayJob` relayjobs.go:83 (the ONE conditional claim UPDATE) |
| middleware credentials branch + `Principal.UserID` + login/logout | 7.1–7.2 | middleware.go:39–79 (admin compare → `devices.LookupToken` today); pair group mount router.go:293–297 (login mounts beside it) |
| handler threading + 4 ListWatched consumers | 6.2 | handlers.go:880 (scored continue rail), :1193 (opt-out branch stamps), :1592 (series all-episodes law), recs_ordering.go:116 — all four verified |
| playback pre-mint check | 6.3 | playback.go:105/:172 |
| profile + prefs endpoints | 8.1 | NEW routes |
| admin users/groups/bind/adopt/explain | 9.1–9.3 | NEW routes |
| ModulePresentation mute AND-down | 10.1 | main.go:414 closure over `ResolveGates` (:415); `ModuleSources` :488 stays System |
| relay result-time re-check | 11.2 | relay.go:230 `Ingest`; identity re-resolution via `ResolveViewer` |
| swag/openapi regen | 11.4 | `internal/web/api/openapi.yaml` exists; Makefile `web-build` target :51 |

### Edges (planned, grounded)

| # | Edge | Implementing task(s) |
|---|---|---|
| E1 | store → access (import; `visibleWhere(v, col)` consumes Viewer) | 4.1 |
| E2 | identity → store (`Store.DB()`, pairing precedent) | 3.1–3.4 |
| E3 | identity → access (`ResolveViewer` produces the Viewer) | 3.4 |
| E4 | api → identity (`Deps.Identity`; `viewerFor`→`ResolveViewer`/`HasUsers`; middleware session branch) | 6.1, 7.1 |
| E5 | api → access (`viewerFor` produces) | 6.1 |
| E6 | 17 threaded reads ← handler call sites with `viewerFor(r)` (handlers.go, display.go :83/:90, art.go loadArtEntity :393 request paths, recs_ordering.go) | 6.2 |
| E7 | `ListWatched` ← 4 handler consumers viewer-keyed | 6.2 |
| E8 | playback handlers → viewer-scoped GetItem pre-check → `Deps.Playback`/`Play` | 6.3 |
| E9 | middleware → credentials resolution (device-kind via flipped `pairing.LookupToken`; session-kind via identity) | 7.1 (+2.2 flip) |
| E10 | pairing mint → credentials rows directly | 2.2 |
| E11 | relay claim SQL ← claimant's visible set (`(library_id = 0 OR library_id IN …)`) | 11.1 |
| E12 | relay `Ingest` → claimant's CURRENT `ResolveViewer` re-check (409 + re-pool) | 11.2 |
| E13 | ModulePresentation closure → request viewer → `ChainMutes` AND-down on copies | 10.1 |
| E14 | admin endpoints → identity CRUD / bind / adopt / explain | 9.1–9.3 |
| E15 | SPA → new wire (`/auth/login`, `/auth/logout`, `/profile`, `/profile/prefs`, `/admin/users*`, `/admin/groups*`, `/admin/devices/{id}/user`, `/admin/visibility-explain`) | 8.2–8.4, 9.4 |
| E16 | ledger writes viewer-stamped ← progress handler (`PutProgress`) + completion detector (`InsertWatched`) | 5.1 (store half) — **detector half unplanned → Q1** |
| E17 | ledger reads viewer-scoped + conjunct; learning/backfill stay System (`recs_janitor.go:59/:81`, `recs_backfill.go:35/:43`) | 5.2 (reads) — **backfill write side unplanned → Q2** |
| E18 | `DeleteUser` cascade → session credentials + ledger rows, one tx | 3.1 — **ledger-cascade SQL + test not authored → Q5** |
| E19 | check.sh grep rule gates `principalFromContext` (2 legal files) | 6.4 |
| E20 | watch detector → viewer-stamped `InsertWatched` | **NO TASK — Q1** |
| E21 | recs backfill → per-row `(user_id,item_id)` stamps + slot-aware dedupe | **NO TASK — Q2** |
| E22 | art.go composition (`artworkFor` :254, `usablePosters` :126) → `ChainMutes` floor | **NO TASK — Q3** |
| E23 | display.go namer chain walk (:73–90) → `ChainMutes` display-title floor | **NO TASK — Q4** |
| E24 | device list/revoke reads → credentials (`ListDevices` store/pairing.go:151, `DeleteDevice`, pairing `Devices()` service.go:284, `Revoke` :295) | **NO TASK — Q7** |
| E25 | adopt-legacy newer-wins merge SQL (`playback_progress`+`watched_items`, slot 0 → user) | **NO home — Q5** (9.3 is pure delegation; store export-capped) |

## Check 1 — Wiring coverage

Every planned edge E1–E19 has an implementing task in tasks.md; the DAG
order matches design §Migration Plan (1 access → 2 schema → 3 identity →
4 store A → 5 store B → 6 api → 7 auth → 8 profile/SPA → 9 admin → 10 chain
→ 11 relay/close-out), and group-7 consumption of `Deps.Identity` is safely
after group 6 creates the field. **Verdict: COVERED for E1–E19; SIX planned
edges carry NO implementing task — E20, E21, E22, E23, E24, E25 — raised as
Q1–Q5, Q7.** Two secondary wiring notes:

- **Compile-pin hole.** 4.5's `go build ./...` is the only full-compile
  duty, and it runs at the END of group 4 — BEFORE group 5 changes
  `InsertWatched`'s signature. Task 5.1's verify compiles `internal/store`
  only, so E20/E21's broken cmd callers would surface only at GATE 2's full
  suite (11.5 readiness). Any amendment answering Q1/Q2 should carry
  `go build ./...` in its duty.
- **`Deps.Identity` production wiring** (constructing
  `identity.NewService(st, …)` in cmd/mellifera) is nowhere explicit — 10.1
  touches cmd and implies it ("resolves the group mutes … via identity"),
  but if 10.1 edits only the closure, production `Deps.Identity` stays nil
  and every principal resolves legacy (the feature would fail only at 11.5).
  Fold the explicit wiring bullet into 10.1 (recommended, folded into Q6's
  amendment).

Blast radius: the plan's "~78 call sites / 20 non-test files" is consistent
with the live tree — grep counts 87 non-test call sites of the 17 reads +
ledger methods across 21 repo files (5 plugin-file grep hits are false
positives: `grep -l 'mellifera/internal/store' plugins/*/*.go` is EMPTY —
plugins never import internal/store; store-internal callers excluded).
4.5's contract is mechanism-based (grep closure + `go build ./...`), so the
extra files its sweep will force — cmd/mellifera/{watch_detect,recs_backfill,
thumb,decision_log,playback,recs_janitor,main}.go, internal/enrich/{search,
reenrich,queue,streams}.go (7 sites), internal/api/{art,display,enrich_admin,
source_admin}.go — are inside its "any file the grep sweep finds" scope.
No hidden file lies outside tasks 4.2–4.5 for GROUP 4; the hole is group 5's
(above). Two inventory notes, no action: `ListSeriesIDs` has no non-test
production caller (only internal/scan/series_test.go:200) — threading is
harmless; `GetLibraryChain` (libraries.go:264) is unthreaded and correctly
so — its only request-path caller (handlers.go:655, library footer) is
transitively gated by the viewer-scoped `GetLibrary` 404 (reviewer: confirm
at gate).

## Check 2 — QA seam coverage

Annotated joints: 1.1/1.2 (`internal/access` contracts), 3.1–3.4
(`internal/identity`), and 11.3 — the ONE cross-module @wf-qa task: real
server, login → `identity.ResolveViewer` → store `visibleWhere` + the
threading matrix (admin/device/user × libraries/items/series/progress ×
visible/hidden). 10.2 is a joint test over real instances (chain-mute
seam). Coverage vs the risky seams:

| Risky seam | Joint |
|---|---|
| auth chain → ResolveViewer → visibleWhere | 11.3 ✔ |
| threading matrix incl. hidden ≡ 404/200-empty | 11.3 + 11.5 ✔ |
| chain-mute two-viewer namespace byte-identity | 10.2 ✔ |
| pairing mint → credentials → authn | 2.2 tests ✔ |
| relay claim set-scoping + result-time re-check | 11.1/11.2 ✔ |
| rebuild zero-row-loss + idempotence | 2.3 tests ✔ |
| ledger writes land in the WRITING viewer's slot THROUGH THE DETECTOR (handler PUT → `OnProgress` leg → `InsertWatched`) | **NOT JOINTED** — 5.1 tests the store level only; part of Q1's amendment (extend 11.3 or add the assertion) |
| artwork composition muted-source floor; display-title floor | **NOT JOINTED** — rides Q3/Q4 |
| adopt-legacy newer-wins merge | 9.3 endpoint test ✔ once Q5 gives it an implementation home |

**Verdict: the planned joints match the risky seams EXCEPT the detector
stamping path and the two viewer-mute composition legs** — joint additions
ride Q1, Q3, Q4.

## Check 3 — Complexity / blast radius

- The 78-site sweep lands as compiler-forced literals across 20+ files
  (verified inventory above); MUST-be-true annotations verified to match
  reality exactly (scan 4 / art 3). Edge counts per module stay within
  budgets: store/api/enrich gain ZERO exports (all new surface unexported or
  in new packages) — consistent with the check.sh count rule (design D4).
- Hidden-scope files NO task names but the compile force will touch: group 4
  stragglers (covered by 4.5's contract) and group 5's cmd callers (NOT
  covered — Q1/Q2). `contracts/4.5-system-sweep.md` pins recs_backfill.go:35
  and the janitor as CORRECT System literals — true for their READS; the
  same files' ledger WRITES are the unplanned part (Q1/Q2 must not be
  "fixed" to System).
- Table rebuild blast: every reader/writer of `playback_progress`/
  `watched_items` accounted — store/progress.go (4 methods), store/recs.go
  (4), recs_backfill.go, recs_janitor.go, boot backfill (progress.go:79),
  adopt (Q5), DeleteUser cascade (Q5), watch detector (Q1).
- Auth-chain rewiring blast: middleware 2 mount sites (router.go:301/:368),
  pairing lookup/list/revoke (lookup covered by 2.2; **list/revoke NOT —
  Q7**), Deps wiring (Q6 note), SPA auth.ts key reuse (8.2 rides
  `mellifera.token`, verified auth.ts:18).

## Numbered questions (recommended answers — the human decides at GATE 1)

**Q1 — Who carries the writing viewer into the ledger's production write
paths? (wiring, HIGH)**
`InsertWatched` gains the viewer stamp (5.1), but its only production
callers are the completion detector (cmd/mellifera/watch_detect.go:67) and
the recs backfill (cmd/mellifera/recs_backfill.go:73) — files NO task owns;
between group 5 and GATE 2 nothing compiles cmd/mellifera (4.5's
`go build ./...` precedes group 5; 5.1's verify compiles store only). Worse,
`access.System()` is the WRONG literal for both: the spec delta requires the
row "STAMPED WITH THE WRITING VIEWER's user slot", and the detector cannot
know that viewer — the `Deps.OnProgress` closure signature
(router.go:75: `func(ctx, itemID, position, completed)`) carries none.
**Recommended answer:** amend 5.1 (or author 5.3) to own the stamp carriers:
pick the carrier per Q6 (ctx-stash preferred — the legs already receive
`r.Context()`), thread watch_detect.go + recs_backfill.go + thumb.go's local
GetItem interface (thumb.go:41/:112), widen the duty to
`go build ./... && go test ./internal/store ./cmd/mellifera -run …`, and
extend 11.3's joint to assert a user's PUT past the 90% floor ledgers into
that user's slot.

**Q2 — The recs backfill must become slot-aware; which task does it?
(correctness, HIGH)**
The backfill dedupes by item id alone (`done` map, recs_backfill.go:38–42)
and reconciles ALL slots' stock (System `ListProgressAll`). After the
keying, stamping every reconciled row `System` would write per-user stock
into slot 0: adopted users' completions would never land in their slots and
the legacy viewer's ledger would grow rows for watches it never made.
**Recommended answer:** fold into Q1's amendment task — dedupe per
`(user_id, item_id)` and stamp each row with a per-row
`access.User(row.UserID)`-shaped viewer (the row's own slot), plus a test
(`TestRecsBackfillSlotAware`-class) pinning: per-user stock reconciles into
its own slot; slot-0 stock stays in slot 0.

**Q3 — The artwork delta's per-viewer composition has no implementing task.
(wiring, MEDIUM-HIGH)**
specs/artwork MODIFIED requires composition to walk the chain "AS THE
CALLING VIEWER SEES IT — a muted source composes nothing for that viewer",
but 10.1 only ANDs `ModulePresentation`'s projection and 6.2 gives art.go
visibility only. The composition site — internal/api/art.go
(`artworkFor` :254, `usablePosters` :126, entity loads :393–:407) — never
reads `ChainMutes` in any task, and no test authors the delta's muted-source
scenario. **Recommended answer:** add a group-10 task threading `ChainMutes`
into the composition walk (floor to the next unmuted source) + a test
pinning the two-viewer artwork scenario from the delta.

**Q4 — Same question for the display-title floor. (wiring, MEDIUM)**
metadata-source-admin requires "display titles floor to the next source"
per viewer; 10.2's joint TEST asserts the floor, but no task authors the
flooring CODE — the namer chain walk (internal/api/display.go:73–90) reads
no `ChainMutes` in the plan; 10.1's scope is the cmd closure only.
**Recommended answer:** extend 10.1's scope (or a sibling 10.1b) to the
api-side name-floor site, keeping 10.2 as its joint.

**Q5 — Where do the adopt-legacy merge and the DeleteUser ledger cascade
live? (wiring, MEDIUM)**
9.3's adopt endpoint is "pure delegation" and 9.1's DELETE carries "state
cascade", but the SQL (newer-wins-by-`updated_at` merge of slot 0 into the
user's slots across BOTH ledger tables; per-user ledger + credential
cascade in one tx) is authored by no task: store is export-capped (zero new
exports — proposal Enforcement), and group 3 plans no such identity
methods; 3.1's tests (`TestIdentityUserCRUD`, `TestIdentityLastUserGuard`)
never pin the cascade the accounts delta requires. **Recommended answer:**
author both as `internal/identity` methods over `Store.DB()` in group 3
(adopt-merge + delete-cascade, one test each — merge newer-wins/no-op
rerun; delete cascades credentials + both ledgers), keeping 9.1/9.3 pure
delegation.

**Q6 — Pin the viewer-carrier contract for cmd-side closures. (seam
contract, MEDIUM)**
10.1 says the ModulePresentation closure "fetches the request's Viewer from
the request context (via the api Deps contract)", and 6.1 extends
`principalInjector` with a viewer field — but no artifact states the
mechanism: does `viewerFor` memoize the resolved Viewer into the request
context under a key (closures + test injector read it back), or do closure
signatures widen? **Recommended answer:** viewerFor resolves ONCE per
request (D5) and memoizes into the request context; one unexported accessor
in viewer.go; `principalInjector` seeds the same key (test seam); 10.1 and
Q1's detector leg consume the accessor; add the mechanism to design
Interfaces. Also fold the explicit `Deps.Identity` cmd wiring bullet into
10.1 (see Check 1). Note: the playback-progress delta prose still names
`Deps.OnProgress(ctx, itemID, positionSeconds)` — 3-arg against the live
4-arg (completed, handlers.go:814); if any answer widens that signature,
restate the requirement text in the delta.

**Q7 — Device list/revoke read the dormant table; new devices vanish from
the panel. (wiring, MEDIUM)**
2.2 makes pairing mint into `credentials` and leaves `device_tokens`
dormant, but the admin device list reads `FROM device_tokens`
(store/pairing.go:151–152 `ListDevices`; pairing `Devices()` service.go:284)
and revoke deletes from it (`Revoke` service.go:295 → `DeleteDevice`). A
device paired post-migration never appears in the panel, cannot be bound
(9.3 keys on device id), and cannot be revoked. **Recommended answer:**
extend 2.2 to re-point the device-management reads/writes
(`ListDevices`/`DeleteDevice`, pairing `Devices()`/`Revoke()`) onto
`credentials` `kind='device'`; test: a newly paired device lists, binds,
and revokes.

**Q8 — The wf map's Go symbol layer is empty; grounding was grep-based.
(environment, LOW)**
`symbols=0`/`importers=0` at CURRENT currency — the regex-floor backend
extracts nothing for `.go`, so `wf index query def/callers` answers
`(none in map)` repo-wide. This audit grounded every node/edge by targeted
grep at 949f39a (file:line above). **Recommended answer:** record as an
environment caveat; wf-reviewer's GATE-2 re-ground must grep the same way;
fixing the wf Go backend belongs to a separate tooling change, not this
plan.

## Human resolutions (recorded at GATE 1 — surveyor does not decide)

Round-0 questions Q1–Q8: the human APPROVED the recommended answers at
GATE 1 (waiver authority exercised = none; all eight routed as answers
through wf-planner into amendment round 1). Post-amendment state:

| Q | Resolution | Amendment evidence | Surveyor verdict |
|---|---|---|---|
| Q1 | approved → implemented | task 5.3 (ledger write carriers; detector + backfill owned; `go build ./...` in its duty; tests `TestWatchDetectStampsViewer`/`TestBackfillSlotAwareness`) | closed as wired — **two residuals surfaced → Q9 (order + mechanism consistency)** |
| Q2 | approved → implemented | 5.3 (per-(user_id,item_id) dedupe, per-row stamps) + 5.2 cross-ref; 11.3 joint extended with the detector end-to-end slot assertion | closed |
| Q3 | approved → implemented | task 10.3 (`artworkFor` art.go:254 / `usablePosters` :126 thread `ChainMutes`; `TestArtworkMuteFloorsPerViewer`) | closed |
| Q4 | approved → implemented | task 10.4 (`namerFor` display.go:79-cited, def :81; `TestDisplayWalkMuteFloor`) | closed |
| Q5 | approved → implemented | task 3.5 @qa (`AdoptLegacyRows` newer-wins + `DeleteUser` one-tx cascade; `TestIdentityAdoptLegacyNewerWins`/`TestIdentityDeleteUserCascade`); 3.1 amended to defer the cascade | closed |
| Q6 | approved → PARTIALLY implemented | design Interfaces "viewer carrier" bullet (design.md:214–232) + 6.1 ctx-stash prose + `principalInjector` same-key; **the explicit `Deps.Identity` production-wiring bullet remains absent** — residual folded into Q10 | closed for the carrier mechanism; residual → Q10 |
| Q7 | approved → implemented | 2.2 amended (device MANAGEMENT onto `credentials kind='device'` — `ListDevices` store/pairing.go:152, the DELETE at :185; `TestDeviceManagementOnCredentials`) + device-pairing delta scenario "Post-migration device management operates on credentials" | closed |
| Q8 | approved → recorded caveat | grounding-method section (top) + handoff record carry it; backend fix stays a separate tooling change | closed (recorded caveat) |
| Q9 | approved → implemented (round 2) | task 1.3 @qa authors the carrier in `internal/access` (unexported key + exported `WithViewer`/`FromContext`; package 7 exports ≤ 8; `FromContext` of bare ctx = zero Viewer, fail closed); 6.1 = ONLY production stasher; `principalInjector` seeds via `WithViewer`; 5.3 (cmd-only) reads `FromContext`; playback-progress delta restated (:58, :137) | closed |
| Q10 | approved → implemented (round 2) | 10.1 cmd-only, ctx-read (no Deps widening); closure built main.go:392, invoked with request ctx api/display.go:129; `Deps.Identity` MUST-assign bullet in 10.1 prose AND duty (`TestDepsIdentityWired`); design bullets restated (api⇄identity MUST-assign :219–221, chain-layer :245–246, D8 cite :392); 10.4 cite :82 | closed |

## Amendment re-run — round 1 (2026-11-04)

Re-surveyed ONCE against the amended plan (tasks.md 41 tasks; design.md
Interfaces viewer-carrier bullet; playback-progress delta restated against
the LIVE 4-arg `Deps.OnProgress(ctx, itemID, position, completed)` — delta
line :52; device-pairing delta device-management requirement + scenario).
All new tasks' cited lines verified against live source: art.go `artworkFor`
:254 / `usablePosters` :126 (exact); display.go `namerFor` def :81 (task
cites :79 — 2-line drift, harmless); store/pairing.go `ListDevices` :152 and
the `DELETE FROM device_tokens` at :185 (exact); router.go:75 `OnProgress`
field and watch_detect.go:67 `InsertWatched` call (exact). Task count 2+3+5+
5+3+4+2+4+4+4+5 = 41 ✓.

### Per-question verification (Q1–Q7 recommended answers now in the plan)

- **Q1 — implemented** as task 5.3: owns the detector
  (watch_detect.go:67) and backfill (recs_backfill.go) carriers, duty
  `go build ./... && go test ./cmd/mellifera -run 'TestWatchDetectStampsViewer|TestBackfillSlotAwareness'`.
  The compile hole I flagged (nothing compiles cmd between group 5 and
  GATE 2) is now pinned WITHIN group 5 — with one order/mechanism catch → **Q9**.
- **Q2 — implemented**: 5.3 dedupes per `(user_id, item_id)` and stamps each
  reconciled row from its own `user_id`; 5.2 pins reads-System vs
  writes-per-row; 11.3 asserts the ≥90% PUT's detector row lands in THAT
  user's slot via a direct store read. Closed.
- **Q3 — implemented**: 10.3 threads `ChainMutes` through `artworkFor`
  (:254) + `usablePosters` (:126) with the two-viewer test. Closed.
- **Q4 — implemented**: 10.4 threads the mute floor through `namerFor` with
  `TestDisplayWalkMuteFloor`; 10.2's joint (now LAST in group 10, id stable,
  prose extended to artwork) asserts the served outcome over 10.1+10.3+10.4.
  Closed.
- **Q5 — implemented**: 3.5 @qa authors `AdoptLegacyRows` + the DeleteUser
  cascade as identity methods with both tests; 3.1 defers the cascade; 9.1/
  9.3 stay pure delegation. Closed.
- **Q6 — mechanism closed, one residual**: design.md:214–232 pins the
  carrier (resolve ONCE, memoize under ONE unexported key, injector seeds
  the same key) AND the explicit-pass rule ("cmd-side closures never import
  api internals: the api caller reads the stash and passes the Viewer INTO
  the closure explicitly"). Residual: the explicit `Deps.Identity`
  production wiring (constructing `identity.NewService` in cmd and
  assigning `Deps.Identity`) is still nowhere explicit — without it every
  principal resolves legacy in production and only 11.5 would notice →
  folded into **Q10**.
- **Q7 — implemented**: 2.2 re-points device MANAGEMENT onto `credentials
  kind='device'` (list + revoke; "dormant table untouched after
  migration"), adds `TestDeviceManagementOnCredentials`, and the
  device-pairing delta carries the requirement + scenario. Closed.
- **Q8 — closed** as a recorded caveat (grounding-method section + handoff).

### Check re-verdicts (post-amendment)

- **Wiring coverage:** the six previously-unwired edges are now owned —
  E20/E21 → 5.3, E22 → 10.3, E23 → 10.4, E24 → 2.2, E25 → 3.5. COVERED
  EXCEPT the two residuals below (Q9 order/mechanism; Q10 scope).
- **QA seam coverage:** all previously-unjointed risky seams are now
  jointed — detector→ledger-slot end to end (11.3), artwork mute floor
  (10.3 + 10.2), display-title floor (10.4 + 10.2), adopt/cascade (3.5 @qa).
  COVERED.
- **Complexity/blast radius:** unchanged conclusions; the compile pin now
  exists at 5.3 (`go build ./...`) and the 10.2-last ordering makes the
  group-10 joint assert all three mute legs. Residual scope/order gaps →
  Q9/Q10.

### New questions (round 1)

**Q9 — Task 5.3 sits BEFORE its own dependency and its stated mechanism
contradicts the design bullet. (DAG order + mechanism consistency,
MEDIUM-HIGH)**
5.3 (group 5) consumes "the 6.1 ctx-stash", but 6.1 (group 6) authors it —
under the design's own explicit-pass rule the stash does not exist when 5.3
runs, and even the widened `Deps.OnProgress` would have no viewer source to
pass. Separately, 5.3's prose says the OnProgress closure "reads the
request's Viewer from the context" — impossible as written: the stash key
and accessor are UNEXPORTED in `internal/api` (6.1: "a single unexported
accessor"), and cmd cannot read api internals — the exact rationale 10.1
and the design bullet give for passing the Viewer explicitly INTO the
closure. **Recommended answer:** move the ctx key + a `WithViewer`/
`FromContext` pair into `internal/access` (authored in group 1 — access
goes from 5 to 7 exports, inside the ≤8 budget; layering-clean: api and cmd
both already import access, nothing imports down into it), restating the
design bullet's "unexported api key" to the access-owned pair; 5.3's legs
then read `access.FromContext(r.Context())` legitimately, 5.3 stays in
group 5 (its tests seed the ctx directly — the test-fixture convention the
4.5 contract already allows), and 6.1 keeps only `viewerFor` as the
stasher. Alternative (kept as fallback): keep the api-owned unexported key,
re-author 5.3 as 6.5 after 6.1 under the explicit-pass mechanism (widening
the OnProgress field + handlers.go:814 call inside the task's scope), and
update 5.2's cross-ref.

**Q10 — The ModulePresentation widening's api side is outside 10.1's
declared scope, and `Deps.Identity` production wiring remains implicit.
(scope, MEDIUM)**
Under the design's explicit-pass rule (design.md:231–232, mirrored in
10.1's prose), the `Deps.ModulePresentation` field signature widens — the
field lives in `internal/api/router.go` and its handler call sites are in
`internal/api`, but 10.1 declares only `cmd/mellifera`; no task owns the
api-side widening, so 10.1's verify (`go test ./cmd/mellifera`) would force
out-of-scope api edits mid-task. And the production wiring of
`Deps.Identity *identity.Service` (constructing `identity.NewService(st,
…)` in cmd main.go and assigning the Deps field — without which `viewerFor`
nil-falls back to legacy for EVERY principal) is still named by no task.
**Recommended answer:** state 10.1's file scope as cmd/mellifera PLUS the
internal/api router.go Deps field and the ModulePresentation handler call
sites (or move the widening into 6.x where router.go is already owned), and
add the explicit wiring bullet (`identity.NewService(st, time.Now)` →
`Deps.Identity`, plus the closure builder's identity argument) to 10.1's
prose — the AC matrix (11.5) is currently the only backstop. Note: if Q9 is
resolved via the access-owned ctx key, 10.1's closure may read the ctx
itself (`access.FromContext`) instead of widening — pick ONE mechanism for
both cmd closures and restate the design bullet accordingly.

### Question frontier state

Q1–Q8: resolved (implemented / recorded caveat) per the table above.
**Q9–Q10: OPEN** — surfaced to the coordinator for the next amendment
round; the frontier is NOT yet empty and must reach empty-or-waived before
register.

## Amendment re-run — round 2 (2026-11-04)

Re-surveyed ONCE against the second amended plan (tasks.md 42 tasks; new
task 1.3; 10.1 rewritten cmd-only ctx-read; design Interfaces bullets
restated; D8 cite corrected). Scope per coordinator: verify the Q9/Q10
resolutions are mechanistically sound against the live source, reach
EMPTY-or-RESOLVED frontier, and re-check the DAG, duty/test-name
consistency, and task grammar. Every line cite below grep-verified in this
worktree.

### Q9 verification — CARRIER RESOLUTION SOUND

- **Task 1.3 exists and owns the carrier**: `- [ ] 1.3` in tasks.md, @qa,
  authors in `internal/access` an unexported context key plus the exported
  pair `WithViewer(ctx context.Context, v Viewer) context.Context` /
  `FromContext(ctx context.Context) Viewer`; package reaches **7 exports**
  with 1.1's five — inside the ≤8 budget (D4); **`FromContext` of a
  context with NO stashed viewer returns the ZERO Viewer** (fail closed —
  zero `VisibleLibraryIDs` → visibleWhere yields nothing, legacy slot-0
  only). Named tests `TestViewerContextRoundtrip` /
  `TestViewerContextAbsentIsZero`; qa: list non-empty (strict-lane legal).
- **Mechanism layering holds**: `internal/api` and `cmd/mellifera` both
  already import `internal/access` in the planned graph (6.1 viewerFor,
  10.1 closure); nothing imports down into access — the "cmd reads an
  api-unexported key" impossibility from round 1 is gone.
- **6.1 = ONLY production stasher**: prose amended to "viewerFor resolves
  ONCE per request and is the ONLY production stasher — one
  `access.WithViewer(ctx, v)` call per request"; `principalInjector` seeds
  via `access.WithViewer` too (same key, test-fixture path, mirrors
  role_gating_test.go:21 today); 10.1 prose keeps the composition-root
  assignment note. The intermediate DAG state (5.3 runs, 6.1 not yet)
  degrades fail-closed: detector legs read a bare ctx → zero Viewer →
  writes land in the legacy slot-0 — never a leak, and 5.3's tests seed the
  ctx directly with `WithViewer` per its prose.
- **Delta restated**: playback-progress delta cites the LIVE 4-arg
  `Deps.OnProgress(ctx, itemID, position, completed)` (:52), the
  access-owned carrier pair (:58), and "the detector reads the WRITING
  VIEWER via `access.FromContext`" (:137). Consistent with tasks.
- **DAG holds**: 1.3 (group 1) precedes every consumer — 5.3 (group 5),
  6.1 (group 6), 10.1 (group 10). Group order = dependency order; no
  back-edge.

### Q10 verification — CMD-ONLY CTX-READ RESOLUTION SOUND

- **Closure built cmd-side, invoked with the request ctx** — verified in
  live source: `ModulePresentation: func(ctx context.Context, moduleID
  string, libraryID int64) (api.ModulePresentation, error) {` at
  **cmd/mellifera/main.go:392** (the design's D8 cite corrected
  :414→:392 is EXACT); the invocation
  `mp, err := a.deps.ModulePresentation(ctx, lib.ModuleID, lib.ID)` at
  **internal/api/display.go:129** inside elementTemplate (:125), reached
  from namerFor (:82→:98). **No Deps signature widening, zero api edits**
  — the closure already receives the request ctx today.
- **Full ctx chain verified across ALL 10 namerFor call sites** — every
  one passes `r.Context()` (or an http-ctx-derived ctx): art.go:521/:625,
  handlers.go:972/:1125/:1279/:1544/:1654/:1723, recs_ordering.go:492,
  source_admin.go:456. The cmd closure reading `access.FromContext(ctx)`
  therefore sees the request's stashed viewer on every production path.
- **`Deps.Identity` wiring now explicit**: 10.1 prose adds the MUST-assign
  bullet (composition root constructs `identity.NewService` over the store
  and assigns `Deps.Identity`) with test `TestDepsIdentityWired`; the duty
  covers it: `go test ./cmd/mellifera -run
  'TestChainMuteClosure|TestDepsIdentityWired' || exit 1`. Design restates
  the obligation (api⇄identity MUST-assign, design.md:219–221 — "nil wiring
  would silently legacy-fall EVERY principal") and the chain-layer bullet
  (:245–246). Test name in prose == name in duty; no test the task edits
  escapes its -run patterns (register-grammar rule).
- **10.4 cite conceded**: planner's namerFor :82 is correct —
  `grep -n 'func (a \*app) namerFor'` → internal/api/display.go:82; my
  round-1 note (:81) was the doc-comment line. Conceded on line evidence.
- **Task count + grammar**: 42 tasks, ids unique (awk $4 over
  `- [ ] N.M` lines), group counts 2+3+5+5+3+4+3+4+4+4+5 = 42 ✓; every
  @qa task carries a non-empty qa: list.

### Check re-verdicts (round 2)

- **Wiring coverage: COVERED** — all planned edges carry an owning task;
  the round-1 residuals (Q9 order/mechanism, Q10 scope) are resolved by
  1.3 + the cmd-only ctx-read rewrite. No orphan nodes.
- **QA seam coverage: COVERED** — every cross-module seam is jointed:
  detector→ledger-slot (11.3 + 5.3 duties), viewer carrier itself (1.3
  @qa — NEW, the seam's own unit seam), identity adopt/cascade (3.5 @qa),
  mute floors (10.3/10.4 + 10.2 joint), Deps.Identity wiring
  (TestDepsIdentityWired), device management on credentials (2.2).
- **Complexity/blast radius: unchanged, within plan scope** — the
  round-0 sweep inventory stands (~87 non-test call sites / 21 files;
  scan/run.go ×4 at :122/:230/:399/:444, art/settle.go ×3 at
  :145/:154/:165 — both MUST-be-true counts verified); the compile pin
  lives at 5.3 (`go build ./...`) and now runs AFTER 1.3 authored the
  carrier (group 1 < group 5), so the pin compiles against real symbols.

### Watch-items (NOT questions — recorded for the reviewer's gate)

- **Non-request-ctx callers**: any FUTURE caller passing a bare
  background ctx through a cmd closure gets the zero Viewer → NO chain
  mutes applied on that projection. This degrades toward legacy-visible,
  never toward a leak (zero Viewer = slot-0/legacy semantics), but a
  reviewer should flag any new ModulePresentation/namerFor call site that
  does not pass a request ctx. Today all 10 sites pass request ctx
  (verified above).
- **GetLibraryChain transitive gating** (round-0 watch, unchanged): the
  chain-mute AND-down must cover libraries reached transitively through
  the chain, not only direct grant rows — 10.1/10.3 tests exercise the
  composition; reviewer re-checks the gate walk.
- **Grounding caveat stands (Q8)**: the wf map's Go symbol layer is empty
  at this install; every cite in this record is grep-based `file:line`
  over the live tree at 949f39a. wf-reviewer's GATE-2 re-ground must use
  the same method.

### Question frontier state (round 2, final)

Q1–Q10: **all closed** — Q1–Q8 implemented/recorded per the round-1
table; Q9 implemented by tasks 1.3 + 5.3 + 6.1 (+ injector seeding);
Q10 implemented by task 10.1 (+ design restatement). **The question
frontier is EMPTY — register may proceed** (human waiver authority unused;
nothing waived).
