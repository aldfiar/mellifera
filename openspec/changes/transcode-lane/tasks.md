# tasks - transcode-lane

# All verify duties run from the repo root in one shot (no setup, no context);
# targeted tests first per the preferred-forms ladder. Groups appear in
# dependency order: the gate arm + the knob (1) before the transcode lane
# (2 — its mode decision reads the knob and the same video predicate the
# gate arm reads), healing + observability (3 — the heal arm enqueues
# transcode repacks; the progress lines ride the mode), and the joint (4).
# RIDES ON pack-manifest-audio: the composed master, the publish-time codec
# record, the lazy repack-on-play seam + marker, and the flow vocabulary are
# that change's landed artifacts — this change must not start before it
# closes (GATE 1 is held on it), and its delta texts (observability, lazy
# repack) are re-based against the merged living spec at propose time.
# No wire change, no SPA change — no openapi or embedded-build regen tasks;
# web/ is untouched. Encode duties guard for ffmpeg WITH libx264 (a host
# whose ffmpeg lacks the encoder fails honestly at the guard).

## 1 - the gate's transcode arm + the knob (internal/stream, cmd/mellifera)

- [ ] 1.1 PackGate transcode arm (internal/stream): PackGate's signature gains the transcode bool beside optInCodecs — the ClassOptIn case opens when optInCodecs OR (transcode AND the video stream is hevc/h265, the same set Classify's videoOptIn arm reads, via a new unexported videoTranscodable(ff) predicate over the same stored facts); refusal tokens unchanged (codec_not_opted_in / codec_unsupported — knob-off answers are today's answers), Classify untouched (the primitive — classes are codec facts, knobs are policy), and the descriptor's honesty projection (describe.go's PackGate call site) rides the same judge so a transcodable unpackaged item answers preparing with no new token; table tests in classification_test.go pin the knob matrix (optIn x transcode over: hevc video, h265 alias, ac3-audio-only h264, mpeg4-ASP, >8-bit h264, pack-class, absent facts) and the describe-honesty test pins preparing-vs-unsupported per knob state
  verify: set -e; go test ./internal/stream -run 'TestClassification|TestPackGate|TestDescribeHonesty' || exit 1
  file: tasks/1.1.md
- [ ] 1.2 The knob end-to-end in cmd (cmd/mellifera): MELLIFERA_STREAM_TRANSCODE parsed beside MELLIFERA_STREAM_OPT_IN_CODECS (envBool, default false — malformed falls back + warns, the MELLIFERA_ENRICH_* precedent) into a cfg.transcode field, wired into stream.Service.Transcode (a field — no new export) at the existing Service construction, and carried by EVERY PackGate seam beside optInCodecs: packGateRefusal (the build executor), packOnPlay + retryFailedPack (the play verb), newSweep's refusal + the frontier's Packable, and pack-manifest-audio's lazy-repack pre-check; no decision-line change (a transcode-open item is not a refusal); pinned by cmd tests: transcode-on opens retry and Packable for an hevc item while the opt-in knob stays off, transcode-off keeps every shipped refusal byte-identical
  verify: set -e; go test ./cmd/mellifera -run 'TestTranscodeKnob|TestPlayRetryGate|TestWatchedSemantics' || exit 1
  file: tasks/1.2.md

## 2 - the transcode build lane (internal/stream)

- [ ] 2.1 Transcode arg builders (internal/stream, pure): unexported builders composing the video encode args (-c:v libx264 -preset veryfast -crf 22 -pix_fmt yuv420p — crf 22 is the default within the 21–23 band, a builder constant, no new knob) and the per-audio-stream rule (aac, mp3 → -c:a copy; ac3, eac3, opus, vorbis, flac → -c:a aac — ffmpeg's native encoder, no new dependency); table-driven tests with one row per admitted audio family; no exec-site or Pack wiring in this task — pure arg-slice composition only
  verify: set -e; go test ./internal/stream -run TestTranscodeArgs || exit 1
- [ ] 2.2 The build-mode branch (internal/stream): Pack decides mode = transcode iff Service.Transcode AND videoTranscodable(facts) — the SAME predicate the gate arm reads (one helper, two readers, no drift) — and the lane's arg sites (the head args, the tail/full args, the rendition args) take the branch: video encoded per the builders, audio per the per-stream rule, mapping/-movflags/hls flags unchanged; knob off composes args byte-identical to today (pinned by the existing pack suite staying green untouched); doc.go's no-encode invariant amended to the knob-gated exception (encode ONLY in the transcode branch; the direct floor stays unconditional; remux is the default when the knob is off); committed fixtures internal/stream/testdata/tiny_hevc_aac.mp4 + tiny_hevc_ac3.mp4 (tiny HEVC sources — generation recipe in the task file; decode is native ffmpeg, only generation needs libx265 once) and a real-ffmpeg test transcodes tiny_hevc_aac.mp4 into a valid fMP4-HLS build whose init carries avc1 and whose aac track is copied
  verify: set -e; command -v ffmpeg >/dev/null || { echo "ffmpeg is required to verify the pack lane"; exit 1; }; ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libx264 || { echo "ffmpeg lacks libx264 — the transcode lane cannot be verified on this host"; exit 1; }; go test ./internal/stream -run 'TestPackLane|TestPackTranscode|TestHeadFirst' || exit 1
  file: tasks/2.2.md

## 3 - healing + flow observability (cmd/mellifera, internal/stream)

- [ ] 3.1 Codec-superseded lazy repack (cmd/mellifera): the play verb's stale-build decision (pack-manifest-audio's lazy repack-on-play) gains the second arm — state complete WITH the build-generation marker (a current-layout build) whose RECORDED codec record's first entry names hvc1/hev1, judged while the transcode knob is on → the same ONE-enqueue repack through the same path (the PackGate pre-check runs first — open under the knob; the per-item lease absorbs plays while it runs; the fresh transcode build replaces the old at publish via the shipped eviction); knob off → the arm is inert (the gate pre-check answers codec_not_opted_in — ONE INFO refusal line, no enqueue, no state change, the shipped refusal); codecs absent or uncomposable → the arm stays silent (fail-open — never requeue on an unjudgeable fact); pinned by cmd tests: an hevc-codecs build enqueues exactly one repack on play under the knob and nothing once avc1 lands, knob-off enqueues nothing, the legacy-layout arm is unaffected
  verify: set -e; go test ./cmd/mellifera -run 'TestPlayLazyRepack|TestTranscodeHeal' || exit 1
  file: tasks/3.1.md
- [ ] 3.2 Transcode flow observability (internal/stream + one cmd line): the publish line (the pack-manifest-audio streams: pack published vocabulary) gains mode (remux | transcode); transcode builds log ONE "streams: transcode progress" INFO line per published chunk — item, nonce, chunk index, percent from the chunk boundary against the stored format.duration (arithmetic; no ffmpeg -progress parsing) — bounded by the segment count, nothing per segment beyond it, no token, no play URL (INV4); a remux build logs no progress lines; the job-start gate line's class renders the codec class with the knobs out of the way (Classify(ff, true)) so a transcode-open item never logs a closed-class-with-open-gate contradiction (the cmd closure renders the knob-free class — a one-line amendment there); pinned by slog-capture tests in internal/stream
  verify: set -e; go test ./internal/stream -run 'TestPackFlowLog|TestTranscodeProgress' || exit 1

## 4 - joint (internal/itest)

- [ ] 4.1 Joint itest over real transcodes, no mocks @qa: (a) knob on, the committed hevc+ac3 fixture packs through the ordinary play flow — descriptor answers preparing then hls, the published build carries the composed master with CODECS naming avc1 + mp4a.40.2 (video transcoded, ac3 encoded to aac), exactly one build directory after replacement, the captured log shows the flow lines with mode transcode and bounded progress lines and no token or play URL anywhere; (b) the hevc+aac fixture's aac track is stream-copied (the recorded codecs keep mp4a.40.2, no audio encode); (c) knob off: the same hevc item answers unsupported with codec_not_opted_in, enqueues nothing, writes no ledger row — today's behavior pinned; (d) an hevc-codecs complete build seeded in the current layout heals on POST /play — exactly ONE repack enqueued under the knob, the transcode build replacing it, the second play enqueueing nothing; (e) an mpeg4-ASP item stays refused (codec_unsupported) under both knobs
  verify: set -e; command -v ffmpeg >/dev/null || { echo "ffmpeg is required to verify the pack lane"; exit 1; }; ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libx264 || { echo "ffmpeg lacks libx264 — the transcode lane cannot be verified on this host"; exit 1; }; go test ./internal/itest -run TestTranscodeLaneJoint || exit 1
  file: tasks/4.1.md
  qa: tests/internal/itest/transcode_lane_joint_test.go::TestTranscodeLaneJoint
