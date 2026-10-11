# Gate record: fix-episode-playback

## Verdict

**GREEN** — @wf-reviewer: spec axis PASS; standards axis one FLAG, resolved
by the session before the gate closed.

The FLAG: `internal/stream/pack.go` crossed the documented 500-line file
budget (490 → 501, doc-comment mass from the fix; "a failed check means
redesign, not relax"). Session fix: three doc-comment tightenings on the
arg builders (every technical fact kept — the unbounded-tail rationale, the
window-of-5 defect, the rendition group order) → **498 lines**.
Re-verified after the trim: gofmt clean, `go build ./...` clean, full
`go test ./internal/stream -count=1` ok (9.3s), golangci-lint on
`./internal/stream/...` clean.

## Gate evidence

- All 7 box probes green twice over: once re-run by @wf-reviewer uncached
  (`-count=1` where applicable), once by `wf change check` at the final
  fingerprint `9f2f77a9…` → **OK**, coverage requirements=5
  probe_backed=5 gaps=0.
- The reviewer also re-ran all 8 non-box delta scenario probes
  (TestHeadFirst + the web-ui greps) — green; `openspec validate
  fix-episode-playback --strict` (pin 1.14.0) valid; project check.sh OK;
  eslint/tsc on the touched web files clean; probe 3.2 confirmed the
  committed `internal/web/dist` is byte-identical to a fresh
  `npm run build`, and `internal/web/api/openapi.{json,yaml}` untouched
  (absent from git status).
- The one UNPROBEABLE scenario ("Human walkthrough of packaged playback end
  to end") confirmed by inspection: partial-head start untouched; the
  head/tail splice no longer dies at the discontinuity (this change's
  defect); EXTINF durations are now real, so transport-key seeks and
  chapter jumps run against a true timeline; the eviction leg is untouched
  and the D5 floor additionally converts a post-eviction descriptor from a
  fatal evicted-playlist URL to the direct floor.
- Reviewer scrutiny points, all resolved with evidence: group 2's
  internal/api/playback_test.go non-touch verified correct (the test stubs
  the entire Playback domain closure; zero `streams` occurrences — the
  integrity guard is never on its code path); publishHeadOnly's dead
  `renditions bool` drop (single caller); the shared-probe-id repair
  coherent and strict-valid; the itest corruption shape keeps both defect
  halves live at `keep = min(2, len(entries)-1)` (missing referenced
  segment asserted at qa_broken_build_sweep_test.go:250, stranded
  published segment at :259); `pbIntegritySweep`'s snapshot mirror honest
  (the decision is production `orchestrator.Repacks`, enqueue errors
  Fatal in the test — harsher than production's log+retry).

## Reviewer-visible change-folder repairs (pre-GATE-2, validated)

- Box **4.1 relinked**: the planner authored one probe id shared by boxes
  2.2 and 4.1 — wf 0.1.0 refuses a probe id linked to two boxes (tick:
  ambiguous; no disambiguator exists). Element-pages precedent applied:
  box 4.1 got its own scenario ("Sweep healing repacks a corrupted build
  end to end", probe bcc5c7c2ba0aedea, id derived with the validated
  sha256 recipe) and box 2.2's probe dropped its vacuous itest line
  (id-safe — ids hash scenario text only, not commands). Strict-valid and
  check-clean before apply resumed; tasks.md header documents the repair.

## Non-blocking findings (surfaced, not gating)

- `internal/orchestrator` exported symbols 8 → 10 (`IntegrityItem`,
  `Repacks`) — the WARN band (>8, ≤12) internal/api already documents as
  accepted at 10.
- A nonce-less complete doc (a shape the lane never writes) would be
  repacked by the sweep while the descriptor keeps answering hls —
  asymmetric but healing-directed; observation only.
- Pre-existing jsdom video.load unmount warning in Player tests
  (web/src/components/playback/Player.tsx:95), untouched by this diff.
- The apply is UNCOMMITTED main-tree state (D3 fallback — the elected
  loop root is main-tree-local); loop-exit commits carry it (the dist was
  committed early as edd3b9f). The running dev server must be RESTARTED
  to serve the new embedded bundle (go:embed is compile-time).

## Archive approval

APPROVED — the human approved archiving in session on 2026-10-11
("archive"), after the gate record above was presented. Recorded before
`openspec archive fix-episode-playback --yes` ran.
