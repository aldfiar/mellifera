# wf-surveyor → wf-reviewer — android-tv-app integration audit (round 2, 2026-11-12)

Belief record, latest-wins (supersedes the round-1 record of the same date). The evidence is
`openspec/changes/android-tv-app/integration.md` (§1–4 = round-1 audit; §5 = resolutions; §6 = round-2
re-audit) + the live source (map was CURRENT at d1d2441; re-verified this round). Re-ground at GATE 2 per
the surveyor section of the loop.

## Round-2 verdict

- **Amendment round 1 verified.** `openspec validate android-tv-app --strict` rc 0. `git status --porcelain`:
  zero tracked-file modifications — the amendment touched plan artifacts only, so every round-1 line anchor
  remains valid.
- **Q1 CLOSED (HIGH → resolved).** The /debug-events kind contract is now enumerated consistently in all
  five places (tasks.md 3.2 rewritten, design.md D8, device-telemetry delta — now 4 scenarios incl.
  "Per-kind required fields enforced", tasks/5.11.md Done-when, contracts/7.1): closed set
  playback-trace|capability-snapshot|fatal|video-error|stalled, crash reserved-never-accepted;
  playback-trace → item_id + mode(direct|hls) + phase="trace" + code; capability-snapshot → detail only
  (not item-scoped); fatal|video-error|stalled → beaconRequest five-field mirror (phase = the kind,
  playback_events.go:38-44); unknown kind OR missing per-kind fields → 400 (TestDebugEventsVocab400 covers
  both classes); 7.1 names its fixture authority (tasks 3.2 + design D8). Consistent with the live beacon
  shape; `phase="trace"` is a route-local extension authored identically everywhere; the beacon route is
  untouched (additive law intact).
- **Q2 CLOSED.** tasks/5.5.md:16 now cites describe.go:103 hls / :117 direct — matches live source.
- **Q3 CLOSED.** design D8 + tasks 3.1 cite "pairing.go:64 deviceDTO, constructed at :269-273" — matches
  live source.
- **Q4 CLOSED as WAIVED to reviewer inspection** (pre-authorized through the GATE-1 fix-amend loop; the
  waiver is surfaced here for GATE 2): tasks/5.1.md §Audit now states the keystore-failure path has NO
  automated green receipt by design and the reviewer inspects the signing block by audit; the positive path
  is exercised by 5.2's real release run.
- **Question frontier: EMPTY.** No open questions after round 2.

## Standing verdicts (round 1, held in round 2)

- Graph: 23 authored task nodes / 8 groups, 24 enumerated cross-task edges; every planned-new node absent
  from disk (correct pre-implementation); every touched existing node verified live. No orphan node.
- Wiring coverage: COVERED (round-1's single finding Q1 resolved by the amendment).
- QA seam coverage: COVERED — 11 @qa tasks with non-empty qa: lists; 5.2 deliberately unannotated; SPA
  seams pinned per-leg per repo precedent; 7.1 crosses the four app↔server joints.
- Blast radius: CLEAN — all server deltas additive; the only existing-line edit is the sanctioned
  Dockerfile :45 comment reword; 5.1's deletion of android-tvprobe/ is DAG-safe; group order 1→8
  dependency-sound.
- Duty honesty: CLEAN — all 23 duties prefix-match their named tests; exit law holds; 1.1/1.3
  operator-assisted shapes honest; 5.2's checksum duty soundly proves no-clobber.

## Residual observation (NOT a question — no action required)

The amended D8 sketch `{kind, mode?, phase?, item_id?, detail?}` omits `code` from the field union while
the normative per-kind lists (all five places) require it for playback-trace and the beacon mirrors. The
sketch reads as the optional-field list; the per-kind lists are the authority and are complete and
consistent. Cosmetic; no amendment raised.

## GATE-2 pointers for the reviewer

- Re-ground the /apk filename literal across 5.2 (producer), 2.1 (discovery glob), 6.2 (label parse) —
  three tasks share one string; drift there is silent.
- Orphan-check the three always-on registrations: `internal/web/apk.go` (route registered ALWAYS, ahead of
  the SPA fallback), `internal/api/debug_events.go` (mount beside playback-events, router.go:261), and the
  7.1 joint test package (`tv.mellifera.joint.*`).
- When 3.2/5.11/7.1(d) land: check the implemented kind set + per-kind required fields match the amended
  enumeration byte-for-byte (authority: tasks 3.2 + design D8), including 400 on unknown kind AND on
  missing per-kind fields.
- HONOR THE Q4 WAIVER: read tasks/5.1.md's signing-law audit note and inspect the assembleRelease signing
  block by audit — no automated receipt exists for the keystore-failure path by design.
- Read tasks/1.3.md's four T0-RESULT sections as real device observations (the audit:true payload); a miss
  on the media-keys bar means 5.10 implements the PlaybackService fallback — check it did (or the amendment
  round happened).
