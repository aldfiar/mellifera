# review — playback-capability-gate

## GATE 2 record (2026-10-31)

**Verdict: PASS-WITH-FLAGS.**

- First round @ 5dbf4b1: FAIL — single gate-blocking finding F1:
  `internal/api` at 13 exported symbols against the repo's hard 12 bar
  (`type PlayRefusal`); `make check` and the full suite's ac7_gates both
  deterministically red. Everything else green: all 11 duty re-runs
  PASS, spec axis fully traced (every delta requirement to real code,
  every scenario pinned by a named test or a duty), INV4 clean, purity
  pins hold, eviction edges verified.
- Discharge @ 9bb0ad4 (single fix commit): both refusal types re-homed
  into `internal/refusal` (2 exports) — api 13→12, enrich 12→11;
  F2a/F2b wording drift fixed (delta sentence, tasks.md 2.1 title via
  re-register, proposal "What Changes"; tasks/5.1.md names the real qa
  nodes — the `qa:` line's `tests/...::node` shape is register-mandated,
  QA_ENTRY_RE `^tests/\S+::\S+$`). design.md Interfaces carries the
  dated GATE-2 amendment.
- Re-verdict @ 9bb0ad4 (reviewer's own shell): check.sh OK rc 0
  (golangci-lint zero); full `go test ./...` rc 0, 22 packages, ac7
  live (5.94s, real make build && make check); touched-package batch
  green (itest 276s incl. all joints); receipts 1.2/1.3/5.1 re-verified
  `--by wf-reviewer`; pipeline 11/11 green rc 0 with fresh git-check;
  `openspec validate --strict` (pin 1.14.0) rc 0; re-home verified
  strictly mechanical (ripple grep for the old homes: zero hits).
- Remaining flags (non-blocking, routed to the docs pass):
  - P3: proposal.md Impact (~line 84) and tasks/2.1.md six-slot prose
    retain pre-apply "init segments" mechanism wording; the authoritative
    homes (delta, tasks.md title, design.md D2) are correct.
  - Pre-existing, out of scope: gofmt-dirty qa_display_naming /
    qa_episode_titles joint tests; pbNewWorld harness Playback closure
    drops Describe's Codecs (green — nothing asserts codecs through it).

## Human archive approval

**Approved (2026-10-31)** — structured answer: "Approve — archive &
close (Recommended)". Close proceeds per the loop: delta merge, TBD
police, @wf-docs, close-out notes, `wf pipeline clean`.
