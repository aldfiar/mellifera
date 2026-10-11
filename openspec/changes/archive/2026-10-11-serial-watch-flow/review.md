# Gate 2 record — serial-watch-flow

- **Reviewer verdict: PASS-with-flags** (@wf-reviewer, 2026-10-11). 19/19 probe
  blocks exit 0 (14 box-linked + 5 unlinked requirement scenarios; vacuousness
  guard: every `-run` pattern's test symbol verified present). Spec axis PASS on
  all four capability deltas (serial-library, media-serving, packaged-playback,
  web-ui); OpenAPI regen verified fully additive vs HEAD; UNPROBEABLE count 0.
  Standards axis: no hard violations — 2 P2 judgement notes (library-root
  derivation duplicated across api/enrich with cross-referencing comments; N+1
  override lookups on list reads, MVP per design.md) and 3 P3s (single embedded
  audio track mapped in rendition builds; existence-based soft-omit; jsdom
  stderr noise). `wf change check` OK (requirements=9 probe_backed=9
  unprobeable=0 gaps=0).
- **Human archive approval: approved 2026-10-11** ("solve flags, then archive").
  Flag resolution at close-out: rebuilt `internal/web/dist` committed (reviewer
  verified byte-identical to a fresh build); regenerated
  `internal/web/api/openapi.{json,yaml}` committed; pre-existing
  `scripts/dev.sh` + the `.gitignore` `/.tmp/` hunk and repo-parent junk
  excluded from this change's commits; follow-up candidates recorded in
  `docs/backlog.md` (legacy head-only pack path deletes published segments;
  Safari native-HLS voiceover select enabled-but-inert; single-embedded-audio
  rendition mapping; api/enrich library-root derivation dedup).
