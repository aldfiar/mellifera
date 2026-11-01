# wf-debugger handoff — fix-reheal-eviction (diagnose round)

Worktree `feature/fix-reheal-eviction` @ base 2950ace. Diagnose-only: no product code changed. Artifacts produced: the repro test + this record.

## Root cause

**Face (b) — HEAL-DURING-PLAY (the kill, confirmed in-tree).** The lazy re-heal's publish path evicts the superseded build the instant it lands, with zero playback/session/age awareness. Chain: the enrich streams lane fires its seam immediately after the success persist (`internal/enrich/streams.go:147-149`, `AfterPackPersist(itemID, outcome.Nonce)` with the NEW nonce); `cmd/mellifera/main.go:236` wires that seam to `scanDeps.Enrich.AfterPackPersist = mediaSvc.EvictSuperseded`; `EvictSuperseded` (`internal/stream/service.go:166-186`) does `os.RemoveAll` on EVERY directory under `Root/<itemID>/` except the keep-nonce — no grace, no retention, no serve-awareness. A live session holds playlist/segment URLs under the OLD nonce; the moment the re-heal publishes, those URLs 404 (fatal beacon `networkError`/`audioTrackLoadError`), and the session would die ~30s later anyway on buffer advance past deleted segments. Eviction is synchronous inside `workStreams`, so the publish and the kill are the same instant — exactly the prod log pairing at 20:52:14 (publish of `c354e231007c2559` + `streams: evicted artifact directory path=data/streams/itm_4_4abdae6f23167012/68c3740dfd0705ad`).

**Face (a) — PLAY-DURING-HEAL (stale-serve; fail-open BY DESIGN, acceptable once (b) is fixed).** `legacyRepackOnPlay` (`cmd/mellifera/playback.go:101-118`) enqueues ONE repack and hands the play back; the descriptor (`internal/stream/describe.go:135-146`) answers the stored namespace while it still names the old build (`buildHealthy`/ValidateBuild passes — the old build is intact), so the full heal window serves the stale v1 pack. The 20:20 incidents are the v1 master composition itself tripping full-hls.js (`CHUNK_DEMUXER_ERROR_APPEND_FAILED`, aac-vs-opus mismatch); both self-healed 3-4s later when the publish flipped the doc and the client's retry fetched the v2 build. This is the documented contract ("the old build keeps serving", playback.go:90-96). The residual risk — a client that fetched the stale master mid-heal and never retries stalls until user action (the TV) — is bounded and pre-existing; the (b) fix makes the stale pack harmless because it keeps SERVING while the heal runs (the repro test pins exactly this property).

**Consequence confirmed:** every future `pack.MasterRuleVersion` bump re-heals every packed item (the v1-boolean/low-version predicate, playback.go:105) and each publish kills every active session on that item. No retention/grace mechanism exists anywhere: no last-access tracking, no age rule, no grace window (`grep` over internal/stream: only the bare `ServeHTTP` at serve.go:43). Evict-on-publish is the only lifecycle on this path.

## Evidence chain

- `internal/enrich/streams.go:141-149` — success persist, then the seam fires synchronously with the new nonce (comment cites playback-capability-gate D5 "publish replacement").
- `cmd/mellifera/main.go:232-236` — the wiring: `scanDeps.Enrich.AfterPackPersist = mediaSvc.EvictSuperseded`.
- `internal/stream/service.go:156-186` — `EvictSuperseded`: unconditional `os.RemoveAll` of every non-keep, non-`.tmp-` directory; best-effort, never fails the pack.
- Prod log line matches source verbatim: `streams: evicted artifact directory` = service.go:184.
- Asymmetry proving publish-eviction is the odd one out: the budget-LRU path (`cmd/mellifera/playback.go:406-424` `evictDir`) moves to a `.trash` sibling first and (`:425-459` `resetStreamsState`) unpublishes the doc when it took a PUBLISHED build while explicitly NOT unpublishing stale nonces (`:446`). The publish path is the only eviction with neither atomicity nor session care.
- Descriptor during heal: `internal/stream/describe.go:135-146` — serves the stored playlist while `buildHealthy` passes; face (a)'s fail-open.
- Token scale for the fix: media tokens are TTL-bound (`internal/stream/service.go:26`, default 4h, D-6) and re-issued per descriptor fetch — a refreshed descriptor names the NEW nonce post-publish, so the dangerous window for an old URL is "until the session's next descriptor fetch or buffer exhaustion (~30s observed)".
- Repro test log reproduces the incident sequence verbatim, including `streams: evicted artifact directory path=.../reh_b/rehlegacy1` in the same second as `streams: pack published item=reh_b nonce=a7b8d8a4e3368030`.

## Reproduction test (RED)

`internal/itest/reheal_eviction_joint_test.go` — `TestRehealEvictionRetainsSupersededBuild`. Binds the REAL eviction path: `pmaQueue` wires `deps.AfterPackPersist = media.EvictSuperseded` (the exact main.go:236 value) behind the real enrich lane seam, drives a real pack (ffmpeg fixture, skips without ffmpeg/ffprobe per harness precedent), arms the re-heal through the real router's play closure (202 queued), awaits the fresh nonce, then asserts the superseded nonce directory still exists AND still serves 200 through the real media surface with the session's token. RED tail:

```
--- FAIL: TestRehealEvictionRetainsSupersededBuild (2.09s)
    reheal_eviction_joint_test.go:108: superseded build directory rehlegacy1 was evicted by the re-heal (stat: stat /var/folders/.../streams/reh_b/rehlegacy1: no such file or directory) — a live session holding its URLs 404s like the 20:52 incident
```

## Suggested fix shape (direction, not the fix)

Give superseded builds a retention window instead of immediate deletion; the sweep owns reclamation.

1. `EvictSuperseded` stops deleting at publish. Keep the seam firing (log line, future hooks) but leave superseded directories at their paths. Note: a `.trash` move-aside is NOT sufficient — rename breaks opens-by-path just like delete; the grace must keep the directory LIVE at `Root/<item>/<oldNonce>` for the window.
2. Reclamation moves to the budget sweep, which already walks every item's directories, reads the doc, and distinguishes current vs stale nonces (`cmd/mellifera/playback.go:446` stale-nonce branch). Add the age rule there: a directory whose name is neither the doc's current nonce nor `.tmp-*` and whose age exceeds the grace constant gets `evictDir`'d (the atomic `.trash` vocabulary, fine here — nobody is supposed to open it after the grace). Zero new state: "superseded" is derivable (dir name ≠ doc nonce); age from dir mtime. Budget pressure may reclaim retained builds early (LRU wins under pressure — same precedence as today).
3. Grace constant: the tension is proportionate (minutes — covers "until next descriptor fetch or buffer exhaustion", the observed kill window) vs complete URL-lifetime safety (token TTL, 4h — covers a paused-then-resumed client holding old token'd URLs across the whole TTL). Open question 1 below.

Ripples the planner must author as tasks:

- **Contract flips in existing tests (they encode the defective contract):** `internal/stream/evict_test.go:49-115` (`TestEvictSuperseded` asserts non-keep dirs removed), `internal/itest/pack_manifest_audio_joint_test.go` pma_e leg (~:1235 "want exactly [%s] (publish replacement)") and pma_f leg (~:1333, same), `internal/itest/playback_capability_gate_joint_test.go` leg (b) (~:545 "exactly ONE build directory survives"). Each needs rewording to the retention contract (current build serves + superseded present within grace; optionally a sweep tick later removes them post-grace).
- **`EvictSuperseded` doc-comment + the D5 invariant wording** ("one current build per item") — the delta should say: one CURRENT build named by the document; superseded builds retained for a grace window, reclaimed by the sweep; budget pressure may reclaim early.
- **Seam fate:** if eviction moves fully to the sweep, `AfterPackPersist`'s remaining value is the log/hook. Smallest diff keeps the seam non-destructive; cleaner shape retires it (touches `internal/enrich/enrich.go:54` deps doc, `internal/enrich/streams.go:147-149`, `internal/enrich/streams_test.go:480-519 TestStreamsLaneAfterPackPersist`, and both joint wirings). Planner's call — open question 3.
- **Coverage gap (finding):** no existing test covered session-liveness across a repack — every prior assertion is directory-count-based. The repro test is the first and must survive as the regression anchor (it flips GREEN with the fix, unchanged).

## Baseline status

- Full go suite at base 2950ace + scaffold (before the repro file landed): COMPLETED, green — 22 packages `ok`, zero FAIL/panic lines. (The dispatch note said pending; it finished early — disclosed with its actual result. The suite does NOT include the new test; with it, `internal/itest` is RED by design.)
- Web baseline: green 447/447 (observed, as dispatched).

## Open questions for GATE 1

1. **Grace constant + scale:** fixed minutes (proportionate; recommend ~10 min, a few sweep ticks) vs token-TTL-bound 4h (complete URL-lifetime safety, doubles per-item disk for the window). Residual under a short grace: a client pausing longer than the grace and resuming on old token'd URLs 404s — materially the same exposure as any budget eviction today.
2. **Grace vs sweep cadence:** is the grace a duration checked against dir mtime each tick (recommended) or N ticks? Who owns the constant (config knob vs locked default — repo precedent is locked defaults, e.g. TokenTTL 4h, relay 10m)?
3. **Seam fate:** keep `AfterPackPersist` non-destructive (smallest diff) vs retire it entirely (cleaner; bigger ripple incl. `TestStreamsLaneAfterPackPersist` and both joint wirings).
4. **Face (a) scope:** confirm out of scope (fail-open by design; the repro pins the harmless-stale-serve property). Optional future, NOT this change: a descriptor hint while a re-heal is pending.
5. **Budget-pressure precedence:** confirm retained superseded builds are early-reclaimable under budget pressure (recommended yes) — the delta should state the precedence explicitly.
