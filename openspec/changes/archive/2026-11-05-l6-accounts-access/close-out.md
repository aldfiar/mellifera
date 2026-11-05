# Close-out — l6-accounts-access

Archived: 2026-11-05 · branch `feature/l6-accounts-access` · base `949f39a` ·
head at archive approval `12c7005` (+ the close-out commit). GATE 2 verdict:
**HOLDS-WITH-CHANGES, no code fixes** (full record: `review.md` in this
folder). Human archive approval recorded there with both escalated flags
ruled **AMEND DELTA TEXT** — applied to the deltas before the archive merge
(flag (j): profile kinds key on user-backedness; flag (o): relay narrowing =
revoked grant 409+release, logout 401+lazy lease, unbind removed as a
widening per D1).

## Final receipt summary (43/43 green, status rc 0)

Every task's last receipt carries rc 0 with cmd == its registered duty;
GATE 2 re-ran all 43 under `--by wf-reviewer` (log was
`.tmp/l6-accounts-access/gate2-verify.log`, machine home now cleaned — this
file is the durable record).

- **G1 (3/3)** — access.Viewer + 4-field carrier, behavioral contracts,
  ctx carrier (WithViewer/FromContext; zero-Viewer on bare ctx).
- **G2 (3/3)** — five accounts tables; credential re-point (device twins);
  ledger rebuild (user_id slots, runs last in ensure chain).
- **G3 (5/5)** — identity domain: argon2id (t=1/m=64MiB/p=1), groups,
  sessions, ResolveViewer (mute-wins, orphan-tolerant, live-intersection),
  adopt/cascade (last-user guard; watched cascade by completed_at).
- **G4 (5/5)** — visibleWhere/ledgerSlotWhere fragments; library/series/
  item/progress reads viewer-scoped; system sweep (82 prod sites/21 files).
- **G5 (3/3)** — cmd ctx carriers: writes stamp (UserID,itemID); ledger
  reads scoped (learning stays System); backfill dedupes per-(user_id,item).
- **G6 (4/4)** — viewerFor (stash-is-memo, fail-closed); 13 handlers + recs
  helpers threaded; playback pre-mint hidden→canonical-404; check.sh
  principal-placement rule (frozen duty, offender-based).
- **G7 (2/2)** — credentials middleware (device hash + session; role
  projection ONCE; devices never projected); login/logout (limiter 5/5m
  IP+username, uniform 401, kind-guarded revoke).
- **G8 (4/4)** — profile three-kind shapes + whole-doc prefs PUT (409 for
  UserID 0); SPA /login (unified slot, no rotation on expected-401);
  profile block + probe removal (assertNoProbe); auto-next prefs kind law.
- **G9 (4/4)** — admin users/groups/scoping endpoints (file-per-domain,
  409 unique-violation mapping, first-user notice, explain orphan law);
  SPA Accounts panels (21 tests; apiRequestVoid pre-stringify lesson).
- **G10 (4/4)** — cmd chain-mute closure (AND-down on copies, zero-Viewer
  no-op) + Deps.Identity wiring; artwork mute floors (5 call sites);
  display mute floors (6 call sites); two-viewers joint over a REAL server
  (byte-identical stored namespaces, derive-counter wake-proof).
- **G11 (5/5)** — relay claim conjunct (relayClaimWhere inside the atomic
  UPDATE; single-claimant race pinned); result-time re-check (same clause
  in the completion guard; classify-guarded release); @wf-qa cross-module
  joint (provenance chain + 32-cell threading matrix); swag/SPA regen
  (24 paths first-run complete); AC matrix (105 cells + zero-user mode +
  live claim scoping; full tree `go test ./...` rc 0, 25 packages).
- **git-check** — green after the close-order commit + push.

## Decisions and deviations that survive this change

- **D1 unbind law**: unbinding a device widens to the legacy see-all
  viewer — never a narrowing. Now spec text (flag (o) amendment).
- **Profile kinds key on user-backedness** (bound device = the user's
  shape). Now spec text (flag (j) amendment).
- **check.sh principal-placement rule** is a FROZEN duty: new
  principalFromContext uses outside viewer.go/middleware.go turn 6.4 red.
- **Budgets at close** (check.sh counter): store 12, api 12, identity 7,
  access 7, enrich 12 — plus new exported store METHODS (uncounted by
  design, each load-bearing): PlaybackProgress.UserID, ListWatchedSlots,
  SetDeviceUser, InsertDeviceCredential, LookupDeviceCredentialByHash.
  This reconciles the proposal's "zero new exports" wording (flag (g))
  with reality: top-level exports unchanged; methods are outside the
  counter's remit.
- **Known residue**: device credentials survive user delete (fail-closed —
  dangling device sees nothing, /profile 404s); two load-flaky itests
  (TestGateDerivation, TestSourceGateJoint) pass reliably in sequential
  runs; POST /play allowed path answers the {200,202} pack-on-play family.
- **Cleanup applied at close**: useAdminStatus orphan removed (flag (l);
  hook + import + test; suite 679/679 across 49 files, tsc clean);
  store/doc.go ledger bullet + recs.go ListWatched comment actualized
  (flags (d), (h)).
- **Not done, deliberately**: no logout affordance in the profile block
  (web-ui delta carries no such requirement) — a follow-up if the operator
  wants one.

## Close order after this file

archived handoffs/ deleted (belief records) → `wf pipeline clean` (machine
home) → merge-back dry-run → `--apply` (push + PR; the human merges).
