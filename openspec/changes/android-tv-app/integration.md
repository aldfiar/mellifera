# Integration audit — android-tv-app (PLANNED graph, pre-implementation)

Surveyor: @wf-surveyor · Date: 2026-11-12 · Map: d1d2441 (CURRENT, auto-rebuilt at audit start)
Method: plan-vs-plan and plan-vs-repo audit. Every existing-code claim below was re-grounded by grep/live source
(this map is regex-floor for Go — `wf index query def` returns nothing for Go, so citations carry `file:line`
grep evidence per code-search §Evidence). Planned-new nodes verified absent from disk. Read-only: nothing in
the plan artifacts or the repo was modified.

## 1. Scope + artifacts read

- `proposal.md`, `design.md` (D1–D8), `tasks.md` (8 groups, 23 authored tasks, grammar-exact), spec deltas
  ×4 (`android-app-delivery`, `android-tv-client`, `device-telemetry`, modified `device-pairing`), six-slot
  contracts (`tasks/1.2.md`, `tasks/1.3.md`, `tasks/5.1.md`, `tasks/5.5.md`, `tasks/5.11.md`,
  `contracts/7.1-wire-joints.md`), context draft `.tmp/android-tv-app-design.md`.
- Trigger: T1 (design.md exists) + T2 (planned-new files absent from disk) + T3 (23 ≥ 6) — all three held.

## 2. The planned graph

### Nodes

**Task nodes — 23 authored** (the register appends the built-in git-check last; not counted):

| Group | Tasks | Planned surface (file-level) |
|---|---|---|
| 1 T0 groundwork | 1.1, 1.2, 1.3 | SDK post-state; `android-tvprobe/` NEW (transient, deleted by 5.1); `tasks/1.3.md` evidence |
| 2 /apk surface | 2.1, 2.2 | `internal/web/apk.go` NEW (`registerApk`, `apkTarget`); touch `web.go` (registration + HEAD mount + contentType row) |
| 3 debug flag + events | 3.1, 3.2 | `internal/api/debug_events.go` NEW; touch `router.go` (2 mounts), `pairing.go` (deviceDTO +field), `profile.go` (+field), `open.go` (credentials.debug migration) |
| 4 release mechanics | 4.1 | Dockerfile COPY slot + :45 comment fix; `.gitignore`/`.dockerignore`; `android/apk/.gitkeep` |
| 5 the app | 5.1–5.11 | `android/` NEW module (scaffold, Api.kt, pairing, flow machine, browse, player, voiceover+beacon, d-pad, MediaSession, telemetry); `Makefile` apk target (5.2) |
| 6 SPA surfaces | 6.1, 6.2 | `web/src/pages/admin/Pairing.tsx` +test (exists — verified); `web/src/components/ApkDownload.test.tsx` NEW |
| 7 wire joints | 7.1 | 4 JVM joint test files under `tests/android/…/joint/` |
| 8 regen + glossary | 8.1 | `internal/web/api/*` + `internal/web/dist` regen; `GLOSSARY.md` +2 entries |

**Grounding of planned-new nodes (absent from disk today — correct):** `android/`, `android-tvprobe/`,
`android/apk/` absent (ls); `apkTarget`/`registerApk` absent from internal/web (grep); Makefile has no apk
target (grep); `.gitignore`/`.dockerignore` carry no android entries (grep).

**Grounding of every touched existing node (all verified live):**

| Plan citation | Reality |
|---|---|
| web.go:65 `/assets/*` GET-only | `r.Get("/assets/*", …)` at internal/web/web.go:65 |
| web.go:63 registerSwagger ahead of SPA fallback | internal/web/web.go:63; func at swagger.go:35 |
| serveAsset + contentTypeFor | web.go:101, web.go:130 |
| NotFound leaks index for unregistered /apk | web.go:68–74 — `/assets/*` unmatched → 404; everything else → serveIndex; `/apk` unregistered → index. The leak 2.1 fixes is REAL |
| router.go:202-203 /pair, /pair/{id}/wait | :202, :203 |
| router.go:234 series-episodes | :234 |
| router.go:261 playback-events mount | :261 |
| router.go:364 admin device bind (3.1 mounts beside) | :364 (`PUT /admin/devices/{id}/user`); revoke at :360 |
| GET /profile | :277 |
| pairing wait single-use pickup service.go:174-189 | internal/pairing/service.go:174–189 — map-delete-under-lock pickup, restart→approved-no-token (:180-185), consumed set |
| double-approve conflict :233-235 | ErrConflict → 409 at internal/api/pairing.go:84 |
| wait status vocabulary | pending\|approved\|denied\|expired\|consumed — service.go:45-49; wire `{status, device_token,omitempty}` pairing.go:33-37; second poll → `consumed` no token (service.go:182-183) |
| playback describe-only law :92-95 | internal/api/playback.go:92-95 |
| play_url verbatim passthrough :141-150 | playback.go:141-150 — `{mode,state,play_url,state_reason,codecs,layout,sections,voiceovers}` |
| play 202 queued / 200 degrade :229-233 | playback.go:229-233 (`{queued}` + 400 on retry&&!queued) |
| describe.go:103 hls / :117 direct (relative `?token=`) | internal/stream/describe.go:103, :117 |
| media gate accepts query token serve.go:127-141 | internal/stream/serve.go:124–141 (cookie-first, then query) |
| ensureColumn idiom open.go:495-498 | internal/store/open.go:455 (`func ensureColumn`); precedent call :495-501; **the idiom includes the column in the CREATE TABLE** (items.status at :74 + ALTER at :497) — 3.1's "plus the column added to the CREATE TABLE" matches the shipped idiom exactly |
| coreVersion main.go:52 | cmd/mellifera/main.go:52 |
| beacon pattern playback_events.go:21-29 | internal/api/playback_events.go:21-29 (30/min, 256 detail); `beaconLimiter` :58 |
| deviceDTO | internal/api/pairing.go:64 (type def); construction :269-273 |
| profile kinds admin\|user\|device; zero debug today | internal/api/profile.go:48-49 (consts); `grep -c debug` → 0 |
| progressRequest shape | internal/api/handlers.go:183-186 — `{position_seconds *int64 (required, ≥0), completed bool}` |
| chi v5.3 no HEAD fold | go.mod: chi/v5 v5.3.1; GET-only route → HEAD 405 (chi method routing) |
| api.ts:310-351 descriptor + :315-320 k+1 law | web/src/lib/api.ts:310-351 (`PlaybackDescriptor`, voiceovers/state_reason/codecs/layout additive-optional) — matches playback.go:141-150 field-for-field |
| itest joint posture | internal/itest/qa_pairing_joint_test.go exists |
| Pairing.tsx + test exist | web/src/pages/admin/Pairing.tsx, Pairing.test.tsx |
| GLOSSARY.md / internal/web/api exist | both present |

### Edges (cross-group interfaces, design D8 + the wiring that implements them)

| # | Edge | Builder task | Consumer task | Joint pinned by |
|---|---|---|---|---|
| E1 | filename law: `make apk` → `android/apk/mellifera-tv-<v>.apk` | 5.2 | 2.1 (apkTarget glob `mellifera-tv-*.apk`) | 5.2 duty (real filename + no-clobber checksum) + 2.1 fstest tests |
| E2 | Docker COPY `android/apk/` → dist/assets → embed | 4.1 | 2.1 discovery; 5.2 output | 4.1 duty (COPY line + APK-less green build); AC-4 operator deploy smoke crosses gradle→image |
| E3 | HEAD /apk 307/404 semantics | 2.1 | 6.2 SPA probe | 2.1 go tests + 6.2 vitest (per-leg); spec android-app-delivery "HEAD on the APK surface" + "SPA advertises the app" |
| E4 | HEAD /assets/* 200 immutable (probe final URL) | 2.2 | 6.2 label parse | 2.2 tests + 6.2 vitest (per-leg) |
| E5 | Location `/assets/<name>` → label `/mellifera-tv-(.+)\.apk$/` | 2.1 | 6.2 | literal identical in both duties; spec scenario "Version label from the redirect target" |
| E6 | PUT /admin/devices/{id}/debug `{debug: bool}` → 200/404/503 | 3.1 | 6.1 SPA toggle | TestDeviceDebugFlipRoute + Pairing.test.tsx (per-leg); device-pairing delta scenario pins end-to-end |
| E7 | additive registry `debug` field (deviceDTO) | 3.1 | 6.1 render | TestDeviceDebugListField + 6.1 vitest |
| E8 | additive profile `debug` field → client two-tier gate | 3.1 | 5.11 gate | TestDeviceDebugProfileField + TelemetryGateTest::release_silent_until_flip / profile_refetch_on_resume (per-leg) |
| E9 | POST /debug-events ingest ← app sender | 3.2 | 5.11 | 3.2 captured-log tests + 5.11 SenderTest; **shape authority incomplete — Q1** |
| E10 | debug-events joint across the wire | 3.2 + 5.11 | 7.1(d) DebugEventsWireJointTest | 7.1 qa: entry — fixture authority blocked by Q1 |
| E11 | Api.kt DTOs vs real handler JSON (pair/wait, libraries, series, episodes, descriptor, play, progress, profile) | 5.3 | 5.4–5.8, 7.1 | ApiContractTest ×4 + 7.1(a)-(c); shapes verified against handlers (table above) — all consistent |
| E12 | pairing flow vs shipped single-use pickup | 5.4 | 7.1(a) | PairingFlowTest truth table — all 5 outcomes match service.go (verified) |
| E13 | flow machine vs shipped descriptor/play law | 5.5 | 5.7 wiring | PlaybackReduceTest 9-row table — matches playback.go:92-95/141-150/229-233 + describe.go:103/:117 |
| E14 | browse vs shipped /libraries + /series/{id}/episodes | 5.6 | — | browse tests; endpoints live (router.go:234) |
| E15 | voiceover k+1 + beacon strip-query | 5.8 | 5.11 tracer (audio-track readout) | VoiceoverSelectionTest + BeaconWorkerTest; law matches api.ts:315-325 |
| E16 | PlayerController seam contract (D8 app-internal) | 5.1 (interface) | 5.7 impl, 5.10 MediaSession, 5.11 tracer hooks | AppSmokeTest + 5.7/5.10/5.11 qa: lists |
| E17 | reduce machine ← event ferrying | 5.5 | 5.7 | PlaybackReduceTest + PlayerOrchestrationTest |
| E18 | probe → evidence: 1.2 APK → 1.3 T0-RESULT sections | 1.2 | 1.3 | 1.3 duty greps marker; audit:true |
| E19 | T0 evidence → 5.10 fallback decision (OQ-T3) / 5.1 UI stack (OQ-T4) | 1.3 | 5.10, 5.1 | both six-slot files name the read explicitly |
| E20 | scaffold home: 5.1 → every 5.x task | 5.1 | 5.2–5.11 | group order; 5.1 Done-when fixes the packages |
| E21 | 5.1 DELETES android-tvprobe/ (built by 1.2) | 5.1 | — | removal map in tasks/5.1.md — DAG-safe (§3c) |
| E22 | 4.1 .dockerignore android-tvprobe/ entry survives 5.1's deletion as no-op | 4.1 | — | explicitly authored in tasks/5.1.md removal map |
| E23 | swag annotations (3.1/3.2) → 8.1 regen → dist clean | 3.1, 3.2 | 8.1 | 8.1 duty (porcelain-clean check) |
| E24 | inv4 strip-before-send client-side | 5.11, 5.8 | 3.2 ingest (INV4 line law) | TracerTest::timeline_events_path_only + 7.1(d) |

Total: 23 task nodes, 24 enumerated cross-task edges. No planned node is unwired: every new module/file
lands with a consuming task or a duty-pinned registration (`/apk` always-mounted law, debug-events mounted
beside playback-events, apk route registered ahead of the SPA fallback).

## 3. Check verdicts

### a) Wiring coverage — ONE finding (Q1)

All four cross-group server↔app joints (pairing, playback, progress, debug-events) have both ends authored
plus the 7.1 crossing test. The release contract chain (5.2 → 4.1 → 2.1 → 6.2) is consistent on the
filename literal across all three producing/consuming tasks. The SPA↔server seams (E3-E8) are pinned per-leg
(Go tests + vitest mocks) with the spec deltas carrying the end-to-end law — consistent with this repo's
established posture (internal/itest joints are Go-side; SPA vitest mocks the fetch surface). No orphan node.

**The one gap:** the debug-events request contract (E9/E10) is under-authored — see Q1. 5.11's consumer
assumes a shape (tracer/snapshot kinds) that no plan artifact enumerates.

### b) QA seam coverage — COVERED (with two notes)

@qa tasks: 10 in group 5 (5.1, 5.3–5.11) + 7.1 (`@wf-qa` cross-module joint) = 11 total, every one with a
non-empty `qa:` list naming test files + nodes. 5.2 is deliberately unannotated — the group header's law is
"every **source** task carries @qa" and 5.2 authors Makefile/keystore mechanics, not app source; its duty
(the two-run checksum) is its own verification.

Seam map: app↔server pairing (7.1a), playback (7.1b), progress (7.1c), debug-events (7.1d) — all crossed by
the dedicated @wf-qa task. SPA admin↔3.1 (E6/E7), SPA probe↔/apk (E3-E5), profile.debug↔gate (E8) — covered
per-leg as mapped above; the crossing lives in the spec scenarios + GATE 2 review, matching repo precedent.
Notes, not questions: (i) 7.1 does not cross the profile.debug field (E8's legs are server test + JVM-mocked
gate test) — the field is a boolean on an already-jointed endpoint, so the per-leg pinning is adequate;
(ii) the keystore failure law (android-app-delivery "Release without the keystore fails loudly") has NO
covering automated task — see Q4.

### c) Blast radius — CLEAN

The law is "ALL server deltas additive, no existing-law modifications." Task-by-task against live source:

- 2.1/2.2 web.go touches: +registerApk registration, +`r.Head("/assets/*")`, +`.apk` contentType row — all
  additive rows/mounts; GET laws untouched; the `/assets/*` unmatched→404 NotFound branch (web.go:69-73)
  already exists and is untouched.
- 3.1: credentials.debug via the exact shipped ensureColumn idiom (open.go:455 + items.status precedent
  :74/:497 — fresh-install CREATE TABLE treatment verified as part of the idiom); deviceDTO/profile
  additive fields; new admin route beside :364. Additive.
- 3.2: new file, new mount beside playback-events (:261); the beacon (playback_events.go) itself is NOT
  edited — 3.2 follows its pattern. Additive.
- 4.1: Dockerfile COPY slot + the :45 comment reword — the sanctioned touches; `.gitignore`/`.dockerignore`
  — sanctioned; `android/apk/.gitkeep` new. (1.2's body also adds android-tvprobe/ entries to `.gitignore`
  — sanctioned by its contract and D7(e).)
- 5.2: Makefile apk target — new target, additive.
- 8.1: generated regen + GLOSSARY entries — additive.

Nothing beyond the sanctioned set modifies an existing line of law. The only existing-line EDIT in the whole
plan is the Dockerfile :45 comment reword, which is explicitly sanctioned and load-bearing (D3).

**5.1-deletes-android-tvprobe DAG safety:** verified — readers of the probe dir after creation: 1.3 (adb
install; runs in group 1, before 5.1); 5.10 and 5.1 read `tasks/1.3.md` (the EVIDENCE file), not the dir;
4.1's .dockerignore entry is authored to survive the deletion as a no-op (tasks/5.1.md removal map). No task
after 5.1 touches android-tvprobe. Built-in git-check: appended last by register, referenced by no authored
task; group order 1→8 is dependency-sound (1.1→1.2→1.3; 2/3/4 android-independent; 5.1 after 4.1 by
design ("runs before the scaffold exists") and after 1.3's evidence; 5.2 after 5.1 (gradlew); 5.3 before
5.4/5.6; 5.5 before 5.7; 5.7 before 5.8/5.10/5.11; 6 after 2/3; 7 after 5+3; 8 last).

### d) Contradictions — see §4

### e) Duty honesty — CLEAN

All 23 `verify:` duties read and checked:

- Prefix-match law: every duty's test selector matches every test its task names by name. 2.1 `-run TestApk`
  covers all five named Test* tests; 2.2's alternation covers both; 3.1 `-run TestDeviceDebug` covers all
  four across `./internal/store ./internal/api` (TestDeviceDebugColumnMigration included); 3.2, 5.x
  `--tests` package filters cover every named class (5.7/5.8 share `tv.mellifera.playback.*` — each duty is
  a superset, both green, harmless); 6.1/6.2 vitest name-filters match their single test files (6.2's
  two-layer pins deliberately in ONE file so the duty matches both — self-consistent).
- Exit law: every duty is positive-chained (`|| exit 1`, `&&` chains); no bare negative grep anywhere.
- Operator-assisted honesty: 1.1 pins only the SDK post-state (`sdkmanager --list_installed` grep) — no
  network/download assertion in the duty; 1.3 greps the `T0-RESULT` marker only with `audit: true` and the
  reviewer reads the evidence at GATE 2 — exactly the declared shape. 5.2's checksum duty honestly proves
  the no-clobber law (second assembleRelease produces different bytes via `versionCode=$(date +%s)` but
  `cp -n` keeps the first file — the checksum comparison is sound), and its keystore generation lives in the
  body, never weakening the 5.1 signing law.
- 4.1's grep-based duty is the ladder's last resort but correctly so (Dockerfile pins have no unit-test
  surface) and is anchored by `go build ./...`.

## 4. Numbered questions (surface at GATE 1; answers route through @wf-planner as amendments)

**Q1 (HIGH — wire-shape authority, blocks E9/E10 authoring).** The `/debug-events` request contract is
under-authored: design D8 and tasks.md 3.2 say body `{kind, mode?, phase?, item_id?, detail?}` with "the
closed vocab (fatal\|video-error\|stalled carried; crash reserved)" — but those three values are the BEACON's
*phase* vocabulary (playback_events.go:36-38), and 5.11's sender must emit tracer timeline events AND
capability snapshots, the route's primary payload classes per device-telemetry's own Purpose ("playback
traces, capability snapshots, crash reports (reserved)"). If 3.2 implements kind's closed set as literally
{fatal, video-error, stalled} (+reserved crash), every 5.11 trace/snapshot POST 400s; if the set is broader,
no artifact names the values and 7.1(d) has no shape authority to mirror. Evidence: design.md:29,
tasks.md:26 (3.2), tasks.md:67-69 (5.11), specs/device-telemetry/spec.md:5,10, playback_events.go:36-38.
**Recommended answer:** enumerate kind's closed set explicitly in 3.2's prose + design D8 — e.g. `kind ∈
{playback-trace, capability-snapshot, fatal, video-error, stalled}` with `crash` reserved-not-implemented —
and state which optional fields are required per kind; 5.11 and 7.1(d) then mirror one authored set.

**Q2 (LOW — citation drift, informational pointer).** tasks/5.5.md cites "relative play_url + ?token=
(describe.go:103, :106)" — the direct-mode mint is internal/stream/describe.go:**117** (:103 hls, :117
direct, as design D8 and contracts/7.1 correctly cite). The encoded fact is right; only the line number
drifts. **Recommended answer:** amend 5.5's pointer to :103/:117; no design change.

**Q3 (LOW — citation drift).** design.md D8's device-debug contract cites "pairing.go:271 deviceDTO" — the
type definition is internal/api/pairing.go:**64**; :269-273 is the admin-list construction site. Fact right,
line drifted. **Recommended answer:** re-anchor the citation to pairing.go:64 (def) or :269 (construction);
no design change.

**Q4 (LOW — spec scenario without a covering automated task).** android-app-delivery's "Release without the
keystore fails loudly" scenario has no covering duty: 5.1's duty runs assembleDebug + unit tests only, and
5.2's body GENERATES the keystore, so the failure path never executes under any green receipt. The law is
D6's costliest rationale (a debug-signed release shipped once blocks updates on that TV forever), so a
silent no-op implementation would pass every gate. **Recommended answer:** accept reviewer inspection of the
~3-line signing block at GATE 2 (stated in 5.1's contract as an audit note), or add a cheap negative probe
to 5.1's body; recommend the former — the blast radius is one build-script block and the positive path is
exercised by 5.2's real release run.

Non-findings recorded as notes (no question raised): the spec's "Dev builds SHALL stream unconditionally"
vs D5/5.11's "beacons emitted before a profile lands are dropped" tension is theoretical (pre-profile the
app has no server address to send to; pairing precedes playback in practice, as both artifacts state).
7.1 reading swag/handlers is unaffected by 8.1's later regen (7.1's authority is handler source + Go tests,
both landed by group 3). The dispatch's "debug-events 4.1" numbering refers to the draft/legacy comment
numbering (playback_events.go:31's historical reference); in this plan the task is 3.2.

## 5. Human resolutions (round-1 amendment applied · round-2 re-audit 2026-11-12)

| Question | Resolution | Round-2 verification |
|---|---|---|
| Q1 | AMENDED — kind closed set + per-kind fields enumerated in all five places (tasks 3.2, design D8, device-telemetry delta, tasks/5.11.md, contracts/7.1) | CLOSED — enumeration byte-consistent across all five; matches the live beaconRequest shape (playback_events.go:38-44); 7.1 names its fixture authority (tasks 3.2 + design D8) — see §6 |
| Q2 | AMENDED — 5.5 cites describe.go:103 hls / :117 direct | CLOSED — tasks/5.5.md:16 matches live source |
| Q3 | AMENDED — "pairing.go:64 deviceDTO, constructed at :269-273" in design D8 + tasks 3.1 | CLOSED — matches live source (def :64, construction :269-273) |
| Q4 | WAIVED to reviewer inspection (pre-authorized through the GATE-1 fix-amend loop; waiver surfaced at GATE 2) | CLOSED — audit note authored in tasks/5.1.md §Audit ("keystore-failure path has NO automated green receipt by design… reviewer inspects the signing block") |

**Question frontier after round 2: EMPTY.**

## 6. Round-2 re-audit (amendment verification, 2026-11-12)

Method: every amended passage re-read; re-grounded against live source; `openspec validate android-tv-app
--strict` re-run (rc 0, "valid"). `git status --porcelain` shows zero tracked-file modifications — the
amendment touched plan artifacts only, so every round-1 line anchor remains valid.

**Q1 closure evidence (five places, consistent):**
- tasks.md 3.2 (rewritten single line): closed set `playback-trace|capability-snapshot|fatal|video-error|stalled`,
  crash reserved-never-accepted; per-kind fields — playback-trace → item_id + mode(direct|hls) +
  phase="trace" + code; capability-snapshot → detail only (not item-scoped, no item_id/mode/phase);
  fatal|video-error|stalled → beaconRequest five-field mirror (item_id, mode, phase = the kind, code,
  detail ≤256 — playback_events.go:38-44); unknown kind OR missing per-kind required fields → 400
  bad_request; TestDebugEventsVocab400 extended to cover both 400 classes.
- design.md D8 /debug-events bullet: the same enumeration verbatim.
- specs/device-telemetry/spec.md: requirement text carries the same set + per-kind fields + 400 law; now
  FOUR scenarios — added "Per-kind required fields enforced" (playback-trace without item_id → 400).
- tasks/5.11.md Done-when: tracer emits kind=playback-trace (item_id, mode, phase="trace", code, detail);
  snapshot emits kind=capability-snapshot (payload rides detail); sender bullet pins 3.2's closed set with
  per-kind fields; crash never emitted.
- contracts/7.1-wire-joints.md: DebugEventsWireJointTest pins the enumerated set + each kind's required
  fields; crash never a fixture value; **fixture authority named — tasks.md 3.2 + design.md D8** (the gap
  Q1 flagged is closed).

**Consistency with the live beacon shape** (playback_events.go:38-44, re-grepped this round): beaconRequest
= {item_id, mode, phase, code, detail}, all five required, mode ∈ direct|hls, phase ∈
fatal|video-error|stalled. The fatal|video-error|stalled mirror keeps phase inside the beacon vocabulary
(phase = the kind); `phase="trace"` is a route-local extension for playback-trace, authored identically in
all five places, and the beacon route itself is untouched (additive law intact).

**Residual observation (NOT a question):** the amended D8 sketch `{kind, mode?, phase?, item_id?, detail?}`
omits `code` from the field union, while the normative per-kind lists (all five places) require it for
playback-trace and the beacon mirrors. The sketch reads as the optional-field list; the per-kind lists are
the authority and are complete and consistent. Cosmetic — no amendment raised; GATE 2 already holds
tasks 3.2 + design D8 as the fixture authority.

**Axis re-verdicts:** wiring coverage now fully COVERED (the E9/E10 shape authority exists — the round-1
finding is resolved); QA seam coverage / blast radius / duty honesty unchanged CLEAN (round-1 grounding
held — anchors unchanged, no source drift); strict validation green.
