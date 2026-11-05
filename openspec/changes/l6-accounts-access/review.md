# GATE 2 review — l6-accounts-access

Reviewer: @wf-reviewer · 2026-11-05 · base 949f39a → HEAD 9074dfd
(worktree, branch feature/l6-accounts-access, pushed). Evidence: every verify
duty re-run in the reviewer's own shell (receipts `--by wf-reviewer`), the
full diff read against the 11 spec deltas, integration.md edges re-grounded
by grep (Q8 caveat: the wf map's Go symbol layer is empty — `wf index query
callers` returns nothing for Go symbols; all grounding below is grep +
`file:line` over the post-change tree).

**VERDICT: HOLDS-WITH-CHANGES.** No code fix required. The changes are:
(1) two archive-time delta-text amendments the human must rule at archive
approval (flags (j) and (o) below — both name the human explicitly); (2) the
close-order act of committing review.md + the session handoff update and
re-verifying git-check green (procedural, the close sequence does this by
construction). **Archive approval is NOT granted here** — this reviewer has
no archive authority; the human decides after reading the escalated list.

## Checklist results

1. **Verify re-runs (43/43)** — all 42 authored duties re-ran rc 0 in this
   shell, sequential, `--by wf-reviewer` (log: `.tmp/l6-accounts-access/
   gate2-verify.log`; slow itests included: 10.2, 11.3, 11.5, plus
   11.4's `make web-build`). **PASS.**
   The built-in `git-check` re-run is **RED — FLAG, not a code failure**: the
   worktree carries exactly one uncommitted edit, `handoffs/session.md`'s own
   "GATE 2 IN FLIGHT" cadence update (the skill mandates the session write
   its record at gate points), written after the session's green git-check
   receipt. Resolution: the close sequence commits it together with this
   review.md and re-verifies git-check green — no production act needed.
2. **Diff vs spec deltas** — every delta scenario has code + a pinning test
   in the diff, or a recorded deviation. Spot-verified beyond the duties:
   middleware credentials branch (`internal/api/middleware.go:75-139`),
   login/logout (`internal/api/auth.go:136-198`, (IP,username) limiter,
   uniform 401, kind-guarded logout), viewer mapping
   (`internal/api/viewer.go:67-164`), profile kinds
   (`internal/api/profile.go:103-243`), relay claim conjunct + result
   re-check (`internal/store/relayjobs.go` — `relayClaimWhere` spliced
   INSIDE the single atomic claim UPDATE; completion guard ANDs the same
   conjunct at statement time; `internal/enrich/relay.go:265-268` reads the
   claimant's CURRENT viewer from the ctx), playback pre-mint check
   (`internal/api/playback.go:106-124/:185-210`), artwork + display mute
   floors (`internal/api/art.go`, `internal/api/display.go`), cmd wiring
   (`cmd/mellifera/main.go` — `newIdentityService` + `Identity:` in the
   Deps literal; `newModulePresentationClosure` mute AND-down post-
   ResolveGates on copies; `watch_detect.go:65-77` stamps the writing
   viewer; `recs_backfill.go` per-(user_id,item_id) dedupe + per-row
   stamps), route mounts (`internal/api/router.go` — /auth/login
   unauthenticated beside the pair verbs; profile/prefs/auth/logout
   authenticated; all accounts-admin routes in the admin group),
   `check.sh` grep rule (legal files exactly middleware.go + viewer.go).
   **PASS** with the two spec-text deviations ruled below.
3. **Standards axis** — see below. **PASS** (judgement calls documented;
   zero hard violations).
4. **Symbol-removal check** — two exported methods removed+replaced:
   `InsertDeviceToken`→`InsertDeviceCredential`,
   `LookupDeviceTokenByHash`→`LookupDeviceCredentialByHash`
   (store/pairing.go). Grep over the post-change tree: **zero** remaining
   references outside the diff (production AND test). `libraryExists` →
   `libraryVisible`: zero stale refs. No removed top-level exports in
   store/api/enrich. **PASS.**
5. **integration.md obligations** — every planned edge E1–E25 evidenced in
   the diff (grounding cites in §2 above; E17's learning-stays-System
   verified at `cmd/mellifera/recs_janitor.go:114/:123` — explicit
   `access.System()` on the janitor's entity reads, learning methods
   unthreaded). Orphan check re-run: **one orphan — web
   `useAdminStatus`** (`web/src/lib/queries.ts:279`): defined + tested,
   zero component callers since 8.3 removed the probe. Flag (l) ruling
   below. Recorded waivers: **none** (frontier was empty; Q1–Q10 all
   implemented — each verified in the diff: 5.3, 10.3, 10.4, 3.5, 2.2
   device-management re-point, 1.3 carrier, 10.1 wiring). **PASS.**
6. **Belief records** — 3 surveyor watch-items ruled:
   - bare-ctx degradation: real and fail-closed — `access.FromContext`
     of a bare ctx reads the zero Viewer → empty ChainMutes → the mute
     loop is a no-op; ledger writes land slot 0. Pinned by tests
     (`TestViewerContextAbsentIsZero`, the closure degradation pin in
     10.1's tests). RESOLVED (documented posture, never widens).
   - GetLibraryChain transitive gating: VERIFIED —
     `internal/api/handlers.go:635-659`: `getLibrary` resolves
     `GetLibrary(ctx, id, v)` first and 404s an invisible library BEFORE
     the `GetLibraryChain` footer read runs; the chain only ever loads for
     an already-admitted library.
   - Q8 grep-grounding caveat: honored throughout this review.
   Session flags (a)–(o): ruled below. 11.5 flake disclosure + the
   {200,202} play-ack family: ruled below.
7. **Final status** — `wf pipeline status` rc **1**, green 42/43: the only
   ungreen row is git-check, whose latest receipt is this reviewer's own
   red re-run against the in-flight handoff edit (cause named in item 1).
   Every authored task's latest receipt is green with cmd == current duty.
   The close sequence re-derives rc 0 after commit. **PASS with the named
   procedural residue.**

## Flag rulings (session handoff list (a)–(o))

- **(a)** QueryItems empty-shape — RESOLVED: `out := make([]Item, 0)`
  (`internal/store/items.go:132`) — non-nil empty, `[]` on the wire; the
  observation was informational.
- **(b)** 4.4 INNER-JOIN question — RESOLVED: base `progress.go` already
  used INNER `JOIN items` at :65/:83/:114 (git show 949f39a); the visibility
  conjunct rides `i.library_id` without changing join shape.
- **(c)** 4.5's `-run 'TestScan'` leg under-matches — HOLD-WITH-NOTE: the
  duty's test selection is loose, but the task's real pin is the
  mechanism-based sweep contract (`contracts/4.5-system-sweep.md`, verified:
  scan/run.go 4 sites, art/settle.go 3 sites annotated) plus the full-tree
  suite anchor (11.5 proved `go test ./... -count=1` rc 0 over 25 packages;
  this reviewer re-ran the 4.5 duty green). Non-blocking.
- **(d)** store/doc.go ledger bullet stale since 2.3 — docs pass owns.
  Non-blocking.
- **(e)** gofmt residue — RESOLVED by 5.3 (verified: no gofmt findings in
  the changed files; 11.5's two flagged files are pre-existing, unmodified).
- **(f)** device credentials survive user delete — RESOLVED as documented
  and fail-closed: DeleteUser cascades `kind='session'` only
  (`internal/identity/user.go:288-293`); a dangling bound device resolves
  `ResolveViewer` → empty visible set → `1=0` (sees nothing), and /profile
  404s the dead user (`profile.go:248-255`). Sound.
- **(g)** 5.3/2.2/9.3 new exported store methods
  (`PlaybackProgress.UserID`, `ListWatchedSlots`, `SetDeviceUser`,
  `InsertDeviceCredential`, `LookupDeviceCredentialByHash`) vs the
  proposal's "zero new exports" — RESOLVED as judgement call: the PINNED
  budget mechanism (check.sh's counter — top-level declarations only,
  methods/fields excluded by design) holds everywhere; re-derived:
  **store 12, api 12, identity 7, access 7, enrich 12**. The new names are
  methods on existing types, each load-bearing and documented; the
  alternative (extending pairing's surface or fabricating authority in the
  backfill) would be worse. Noted for the docs pass to reconcile the
  proposal text with reality.
- **(h)** recs.go ListWatched comment describes the group-6 threading as
  future ("until api's viewer threading lands") — stale now that group 6
  landed. Docs pass. Non-blocking.
- **(i)** per-site System() postures (namerFor's two reads, loadArtEntity,
  posters picker, itemDTOs lazy seriesOf) — RESOLVED: re-derived each —
  the namer reads only the already-admitted library's own rows (an
  invisible library 404s upstream; `QuerySeries` is the whole-library map),
  loadArtEntity's callers are admin-group routes (empty mutes in
  production), the floor is a namespace walk never a row gate. Inline
  reasoning present at each site (`art.go:403-415`, `display.go:96-106`).
  No leak path found.
- **(j)** 8.1 bound device serves `kind:"user"` — **ESCALATE TO HUMAN.**
  The delta's Served-identity requirement reads "a device answering
  `kind: device` (with the bound user's groups when bound)"; the code keys
  kinds on USER-BACKEDNESS (`profile.go:27-44,116-168`): a bound device
  serves kind "user" with the bound user's facts — substance (groups +
  prefs) satisfied, literal differs; Principal carries no credential-kind
  fact, so the literal fix ripples middleware. **Recommended answer: amend
  the delta text to the user-backedness law at archive** (one sentence),
  not the code. The SPA composes correctly with either reading (bound TV =
  the user's editable prefs; unbound = hidden).
- **(k)** check.sh amendment residue — RESOLVED: final diff carries only
  6.4's original rule (verified in the diff above).
- **(l)** `useAdminStatus` orphan — confirmed (zero component callers;
  endpoint itself stays by law). Ruling: **remove in the docs/cleanup
  pass** (dead code: one hook + its test); keeping it is harmless but it
  is exactly the orphan the gate flags. Non-blocking.
- **(m)** no logout affordance in the profile block — RESOLVED as
  design-grounded: the web-ui delta names login + profile + probe-removal
  and carries no logout requirement; `/auth/logout` exists server-side.
  Follow-up if the operator wants one — not a gap in 8.3.
- **(n)** 10.2's TestPairingJointFlow repair — RESOLVED: RED at BASELINE
  (pre-existing stale 3-field pin vs the new deviceDTO wire); the repair
  pins exactly `{device_id, code, user_id, created_at}` with user_id==0,
  which the device-pairing delta REQUIRES ("both states visible on the
  device list"). In-scope, delta-required.
- **(o)** 11.2 delta-text realization — **ESCALATE TO HUMAN.** The delta
  lists "logout, login-as-restricted, unbind" as narrowing cases answered
  409+re-pool. Realized: a revoked session is refused **401 at the
  middleware** (it no longer authenticates at all — the plan blob cannot
  leak) and the job re-enters the pool by **lazy lease expiry** (≤ the
  lease), not immediate release; the **409+release machinery** serves the
  authenticated-but-narrowed case (revoked grant) — verified
  (`relayjobs.go` `refuseRelayCompletion`, release re-checks state+hash;
  `TestRelayResultViewerRecheck` green); **unbind is NOT a narrowing** —
  it widens to the legacy see-all device viewer per the decided D1 law, so
  a claim minted while bound still ingests after unbind (no leak relative
  to the holder's current authority). The security intent (titles never
  reach a principal that cannot see the library) holds on every axis, but
  the delta text contradicts the repo's decided unbind law.
  **Recommended answer: amend the delta sentence at archive** — narrowing
  cases = revoked grant (409 + immediate release) and logout (401 at the
  chain + lazy lease expiry); unbind removed from the list.
- **11.5 flake disclosure** — RESOLVED: one lost-name red run under heavy
  parallel itest load, immediate full-log green re-run, matrix green 3x
  including this reviewer's own sequential re-runs (10.2/11.3/11.5 all
  rc 0); consistent with the known load-flake signature; nothing silenced.
- **{200,202} play-ack family** — RESOLVED: POST /play on the allowed path
  answers 202 (queued) / 200 (already-queued) per the pack-on-play D-8
  law — the AC matrix asserts family membership, documented in the file
  header; grounded, not a defect.
- **10.3 task-line "banner/fanart" wording** (session scope note) —
  RESOLVED: the artwork spec delta (the authority) requires poster-only
  composition ("the first non-placeholder poster URL"); server-side
  composition covers exactly the two poster legs, so the task line's
  banner/fanart mention is vacuously satisfied. No delta scenario names
  banner/fanart.

## Escalated to the human (at archive approval)

1. **Flag (j)** — profile `kind` for a bound device: amend the accounts
   delta's Served-identity text to the user-backedness law (recommended),
   or rule the literal must be "device" (code ripple: Principal gains a
   kind fact).
2. **Flag (o)** — client-relayed-fetch delta's narrowing list: amend to
   the realized law (recommended), or rule unbind must gate ingestion
   (contradicts the decided D1 unbind=see-all law).
3. **Archive approval itself** — explicitly NOT granted by this gate.

## Non-blocking residue

- Close order: commit review.md + the session.md cadence update, re-verify
  git-check green (restores status rc 0).
- Docs pass items: flags (d), (h), (g)'s proposal-text reconciliation,
  flag (l) hook removal.

Gate: **Pending Fixes** — no code fixes; the pending items are the two
archive-time spec-text amendments ((j), (o)) and the close-order
commit/re-verify. Code, tests, and budgets hold as-is.
