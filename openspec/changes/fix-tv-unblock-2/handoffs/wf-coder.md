
# 1.1 — Layout rule on TOTAL audio (2026-11-01, verify green exit 0 @ 4.1s)

Note for 1.2 (and the reviewer): the repro's rend1/rend2 composition could
NOT be reached without the generalized mapping, so per 1.1.md Out-of-scope
I landed the mapping generalization IN THIS TASK's working-tree state:

- `renditionArgs(src, voiceovers, embedded int, ...)` and
  `renditionMap(embedded, sidecars int)` are DONE (Interface 5 shape,
  pack.go) — 1.2 does NOT re-signature them; its remaining work is the
  FLAG pin table extension (rendition_test.go:245–300 with an embedded=2
  case) and the DEFAULT rule in master.go.
- The :245–300 pin needed a mechanical compile fix only: call sites now
  pass embedded=1 (byte-identical flags, still green unchanged). The
  TABLE EXTENSION with an embedded=2 case is still 1.2's (unstarted).
- master.go untouched: today's k==1 rule already yields exactly one
  DEFAULT=YES on the repro build (rend1), so the repro passed without
  the aac-first rule.
- New fail-open pins live in pack_multi_audio_test.go:
  TestVariantLayoutKeysOnTotalAudio (decision table incl. the embedded=0
  probe-failure shape) + TestEmbeddedAudioProbeFailsOpen (bogus path/dir →
  0; real two-audio fixture → 2).
- Also compile-fixed: pack_test.go arg-builder call sites pass embedded=0.

# 1.3 — Pack-lane rule version + the lazy re-heal gate (2026-11-01, verify green exit 0 @ 7.6s)

- The success persist now writes `master: MasterRuleVersion` (enrich
  streams.go — an untyped const 2, so the map carries an int that marshals
  as the JSON number 2). Note for 2.1: add the `layout` key in the SAME
  success map, beside the master entry — the comment block there documents
  both as the version record.
- Predicate semantics landed (cmd/mellifera masterRuleVersion + the pma
  mirror pmaMasterVersion — duplicated by the package-main mirror
  convention): `case bool: true → 1` (false falls through to 0), `case
  float64: → int(v)` — JSON namespace numbers decode as float64, a raw int
  assert would read 0 forever; default 0. Stale iff version <
  enrich.MasterRuleVersion; `>=` current (including a FUTURE version)
  hands the play back to the ordinary decision. Both call sites
  (decision_log.go descriptor closure + play verb packOnPlay) share the
  one helper — unchanged gate pre-check, one INFO line each shape.
- pma joint leg (e) extended in place: the v1 boolean seed (pma_f) plays →
  202, one repack, repacked namespace carries float64(2), a repeat play
  enqueues nothing; the current-version seed (pma_g) plays → 200, zero
  log lines, no enqueue. leg (c)'s pre-record rewind namespace (absent
  master → v0) stays marker-free and still answers legacy — untouched.
- Pre-existing gofmt dirt in internal/itest (qa_display_naming_joint_test
  .go, qa_episode_titles_joint_test.go — qa-authored, NOT touched by 1.3);
  my files are gofmt-clean.

# 2.2 — SPA direct-floor refusal (2026-11-01, verify green exit 0 @ 6.4s)

- web/ only, as scoped. `PlaybackDescriptor.layout?: "single-variant" |
  "rendition"` (api.ts, the codecs comment precedent); the refusal sits in
  the attach effect AFTER the `isHls && Hls.isSupported()` block, guarded
  `isHls && descriptor.layout === "rendition"` — so on the reachable path
  it is exactly `isHls && !Hls.isSupported()` (a direct descriptor never
  carries layout, the guard is belt-and-braces per the contract wording).
- Banner reuses the PlayerError shape with code "rendition-layout-unsupported"
  (the banner renders code as data-media-error-class — same mechanism as
  device-cannot-decode). errorText branch landed: «Ошибка видео: устройство
  не поддерживает воспроизведение потока с несколькими звуковыми дорожками
  (rendition-layout-unsupported).» — no repack invitation (a repack cannot
  help an MSE-less device), no paths, no status pill. Beacon: hls /
  video-error / rendition-layout-unsupported / "rendition", INV4-clean.
- Tests: the :207 pin re-based on hlsDescriptor({ layout: "single-variant" })
  (+ zero-beacon assert); NEW absent-layout legacy case in the same describe;
  the red mechanism-free test REWRITTEN to the exact pinned contract (banner
  class + wording, ONE beacon with the exact five args, zero hls instances,
  no src) — the mechanism-free disjunction was scaffolding for the
  undecided fix shape, the design (D6) pins one; NEW clear-on-re-attach pin
  mirroring the device-probe one. MSE-present lane-selection test untouched
  and green. api.test pins layout verbatim + absent-stays-absent.
- Note for 2.3/2.1 reviewers: nothing in web/ reads the Go side; tsc clean;
  the jsdom "Not implemented: load" stderr lines are pre-existing unmount
  noise (video.load() in the cleanup path), not new.

# 2.1 — Descriptor layout field end-to-end (2026-11-01, verify green exit 0 @ 4.4s)

- The full ride landed: PackOutcome.Layout → success persist (`layout` key,
  the codecs absent-key shape — empty stays absent, failure docs layout-free)
  → main.go adapter → Describe's 9th named return (new `streamLayout` reader
  in describe.go, hls branch only; direct answers "") → api.Playback +
  playbackResponse `json:"layout,omitempty"` → the decision closure's
  api.Playback.Layout. The decision line is byte-unchanged
  (logPlaybackDecision signature untouched — layout rides the WIRE, not the
  log; INV4-clean by construction).
- Describe call sites adapted mechanically (the appended 9th value): the
  4 internal/stream test files + 5 itest files. itest fakes that mirror the
  real adapter (pack_manifest_audio_joint_test.go,
  playback_capability_gate_joint_test.go — the Codecs-threading pair) now
  thread `Layout: build.Layout` too, so their fresh-pack fixtures answer
  layout on the descriptor; the older qa fakes (pre-codecs minimal shape)
  stay untouched, per the codecs precedent.
- New pins: internal/stream/describe_layout_test.go (TestDescribeLayout —
  rendition / single-variant / pre-record fail-open with play_url kept /
  unreadable record degrades / direct never carries); enrich streams_test.go
  subtests (layout persisted verbatim when recorded, absent when not);
  api TestPlaybackVerbs (layout on the hls wire, layout-less omits);
  cmd TestPlaybackDecisionLog extended with a layout-item case (closure
  threads "rendition"; the pre-record pkg-item pins fail-open "").
- Note for 2.3/3.1: the OpenAPI regen (2.3) must pick up
  playbackResponse.layout; the 3.1 joint can seed `layout: "rendition"` in
  the streams namespace OR pack fresh (the fakes now thread it).
- Pre-existing gofmt dirt (internal/itest qa_display_naming / qa_episode_titles)
  remains — not mine, untouched.
