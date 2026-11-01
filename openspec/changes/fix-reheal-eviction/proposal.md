# Proposal

## Why

A lazy re-heal publish kills every live playback session on the item: the
publish path evicts the superseded build directory in the same breath the
success persist lands (prod 2026-11-01 20:52 — publish of a fresh nonce and
`streams: evicted artifact directory` in the same second, the active player's
next loader request 404s into a fatal beacon). Eviction-on-publish has no
playback, session, or age awareness, and every future pack-rule bump re-heals
every packed item, re-arming the kill. Supersession must become
playback-aware retention.

## What Changes

- **Publish stops deleting.** The publish-time eviction seam is retired:
  publishing a fresh build only persists the document that names it; the
  superseded build directory stays live on disk and keeps serving.
  **BREAKING** for the internal seam only (`Deps.AfterPackPersist` and
  `Service.EvictSuperseded` are deleted — no wire change, no API change).
- **The sweep owns reclamation.** The periodic streams sweep gains a
  retention pass: a build directory that is neither the document-named build
  nor in-use `.tmp-*` staging, and whose age is past the retention grace both
  on disk and since the item document's last write, is reclaimed through the
  existing move-aside eviction vocabulary. Grace is 10 minutes, locked (repo
  precedent: `TokenTTL` 4h, relay 10m — no env knob by design).
- **Budget precedence made explicit.** Retained superseded directories count
  against the storage budget like any other artifact and are reclaimed FIRST
  under budget pressure — before any current build, regardless of their
  grace — because reclaiming a superseded directory unpublishes nothing
  while reclaiming a current build forces a re-pack (the evict-heal churn
  loop). The budget LRU gains a stale-before-current precedence.
- **The defective contract flips in the three suites that encode it**
  (`internal/stream/evict_test.go`, the pma_e/pma_f legs of
  `TestPackManifestAudioJoint`, leg (b) of `TestPlaybackCapabilityGateJoint`)
  and the RED repro `TestRehealEvictionRetainsSupersededBuild` turns GREEN
  untouched — it is the regression anchor and must not be modified.
- Face (a) — play-during-heal serves the stale build until the publish flips
  the document — is out of scope: fail-open BY DESIGN (the debugger's
  ruling), and the repro pins the harmless-stale-serve property this fix
  makes safe.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `packaged-playback` — the publish-replacement rule (evict immediately,
  one build directory survives) becomes the retention rule (one CURRENT
  build named by the document; superseded builds retained for a grace
  window, reclaimed by the sweep; budget pressure reclaims them first); the
  budget requirement gains the stale-first precedence; the pack-flow log
  requirement moves the eviction line from the publish flow to the sweep.

## Impact

- `internal/enrich` — `Deps.AfterPackPersist` (field + contract doc) and its
  fire site in the streams lane go away; the success persist becomes the
  publish path's last act.
- `internal/stream` — `Service.EvictSuperseded` and its acceptance test are
  deleted; the serving surface and descriptor are untouched.
- `cmd/mellifera` — the seam wiring in main goes away; the playback sweep
  gains the retention pass (new pass between frontier and budget) and the
  budget pass learns the stale flag.
- `internal/orchestrator` — `ArtifactDir` gains a `Stale` bit and the
  eviction sort gains one precedence clause.
- `internal/itest` — two joint suites flip to the retention contract; the
  repro goes green unchanged.
- No SPA, API, OpenAPI, or embedded-build change (no wire surface moves).
