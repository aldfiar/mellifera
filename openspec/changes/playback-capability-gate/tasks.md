# tasks - playback-capability-gate

# All verify duties run from the repo root in one shot (no setup, no context);
# targeted tests first per the preferred-forms ladder. Groups appear in
# dependency order: the pack gate (1) and the codec truth (2) before the SPA
# consumer (3), artifact replacement (4), joints and living docs last (5).

## 1 - the pack gate: one source of truth for may-this-be-packed (internal/stream, cmd/mellifera, internal/api, internal/enrich)

- [ ] 1.1 PackGate predicate: internal/stream gains the single judge — PackGate(ffprobe, optInCodecs) Gate (GateOpen = "", refusals exactly the state_reason tokens codec_not_opted_in / codec_unsupported, pure over the stored facts Classify reads, Classify untouched); describe floorReason refactors onto it with byte-identical answers; cmd/mellifera episodeFromDoc's Packable rides GateOpen (equivalent to today's pack||opt_in-with-knob)
  verify: set -e; go test ./internal/stream -run 'TestPackGate|TestDescribeHonesty|TestClassification' || exit 1; go test ./cmd/mellifera -run TestWatchedSemantics || exit 1
- [ ] 1.2 Enqueue-site gates: the POST /play retry closure checks PackGate before EnqueuePack and returns the api PlayRefusal (400, code = the gate token); the integrity repack sweep skips a gate-closed item with one INFO refusal line — no enqueue, no ledger row; knob-on opt_in items and capable items answer exactly as today (202 / enqueue)
  verify: set -e; go test ./cmd/mellifera -run TestPlayRetryGate || exit 1; go test ./internal/api -run TestPlayGateRefusal || exit 1
  file: tasks/1.2.md
- [ ] 1.3 Build-time gate: the PackItem closure wraps the PackGate verdict in the enrich PolicyRefusal error; workStreams branches it before recordPackFailure — state failed + the policy reason persisted, NO pack_failed ledger row (a knob flip between enqueue and build never charges the 30-day cooldown; knob-on re-heals via the frontier)
  verify: set -e; go test ./internal/enrich -run 'TestStreamsLane|TestPackPolicyRefusal' || exit 1
  file: tasks/1.3.md

## 2 - pack codec truth on the wire (internal/stream, internal/enrich, internal/api)

- [ ] 2.1 Codecs recorded at publish: Pack probes each distinct EXT-X-MAP init segment of the published build with ffprobe and composes the RFC 6381 codec strings through one pure table over the classifier-admitted families (avc1, hvc1/hev1, mp4a.40.2, opus, flac, ac-3, ec-3, mp3, vorbis); Build carries Codecs — video first, then audio in the pinned rendition order, deduped; a stream the table cannot compose degrades the record to absent (fail-open)
  verify: set -e; command -v ffmpeg >/dev/null || { echo "ffmpeg is required to verify the pack lane"; exit 1; }; command -v ffprobe >/dev/null || { echo "ffprobe is required to verify the pack lane"; exit 1; }; go test ./internal/stream -run 'TestPackCodecs|TestPackLane' || exit 1
  file: tasks/2.1.md
- [ ] 2.2 Codecs projected end to end: PackOutcome gains Codecs and the streams lane persists doc[streams].codecs at the completion write; Describe answers codecs on hls answers only (7th return value, the stateReason pattern) with the read-side legacy composition from stored source ffprobe facts when the namespace predates the record (recorded value wins) and nothing on direct answers; api Playback + playbackResponse gain additive codecs through the wireArray guard; the decision-log line is unchanged
  verify: set -e; go test ./internal/stream -run 'TestDescribeCodecs|TestDescribeHonesty' || exit 1; go test ./internal/api -run TestPlaybackVerbs || exit 1; go test ./internal/enrich -run TestStreamsLane || exit 1

## 3 - SPA capability gate (web/src)

- [ ] 3.1 Pre-mount probe: web/src/lib/api.ts PlaybackDescriptor gains codecs?: string[]; the Player's hls branch composes ONE probe — MediaSource.isTypeSupported('video/mp4; codecs="<video>,<first audio>"') — before new Hls(); a miss renders the honest device-unsupported banner (never a spinner, never the cryptic fatal) and sends one best-effort beacon {mode:"hls", phase:"video-error", code:"device-cannot-decode", detail: probe mime}; absent/empty codecs or no MediaSource mounts exactly as today; a probe pass mounts with zero behavior change; banners clear on re-attach
  verify: set -e; cd web && npx vitest run src/components/playback/Player.test.tsx src/lib/api.test.ts || exit 1; npx tsc --noEmit || exit 1
- [ ] 3.2 Embedded build regen: make web-build (swag + vite) and commit internal/web/dist + internal/web/api/openapi.{json,yaml} carrying the codecs descriptor field; node-free Go gate untouched
  verify: set -e; test -f internal/web/dist/index.html || exit 1; grep -qF '"codecs"' internal/web/api/openapi.json || exit 1; grep -qF 'codecs' internal/web/api/openapi.yaml || exit 1; grep -qs "isTypeSupported" internal/web/dist/assets/*.js || exit 1; (cd web && npm run build >/dev/null 2>&1); test -z "$(git status --porcelain internal/web/dist)" || exit 1

## 4 - one current build per item (internal/stream, internal/enrich, cmd/mellifera)

- [ ] 4.1 Publish-replacement eviction: stream.Service gains EvictSuperseded(itemID, keepNonce) — every directory under the item's artifact root except keepNonce removed at once, .tmp-* names never touched, other items never touched, one log line per removal, best-effort (WARN on failure, the landed pack never fails); enrich gains the optional Deps.AfterPackPersist func field, workStreams calls it once AFTER the success persistStreams and never on the failure path; cmd wires the seam to mediaSvc.EvictSuperseded; budget recency accounting untouched
  verify: set -e; go test ./internal/stream -run TestEvictSuperseded || exit 1; go test ./internal/enrich -run TestStreamsLane || exit 1

## 5 - joints and living docs

- [ ] 5.1 Joint itest for the cross-group contracts over real instances, no mocks: (a) a real pack through the pack lane publishes and the served descriptor answers hls with codecs matching the published init segment's sample entries; (b) repacking the same item leaves exactly one build directory under the item's artifact root and the descriptor answers the new build; (c) a gate-closed failed item's POST /play retry answers 400 carrying the gate token through the real router @qa
  verify: set -e; go test ./internal/itest -run TestPlaybackCapabilityGateJoint || exit 1
  file: tasks/5.1.md
  qa: tests/internal/itest/playback_capability_gate_joint_test.go::TestPlaybackCapabilityGateJoint, tests/internal/api/play_gate_refusal_test.go::TestPlayGateRefusal
- [ ] 5.2 Living docs: docs/playback-postmortem-2026-10-31.md — the Post-archive findings (HEVC-on-TV MSE fatal, the packer knob gap, artifact replacement ruling) routed to this change; the F5 transcode lane and the manifest-CODECS follow-up stay open
  verify: set -e; grep -q "playback-capability-gate" docs/playback-postmortem-2026-10-31.md || exit 1
