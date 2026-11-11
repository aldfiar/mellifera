# Design

## Context

Baseline is GREEN (`go test ./...` rc 0 at 792031a; web/ not baselined). The work is
comment-only, law-driven, and pre-inventoried: the audit at
`/Users/aldfiar/projects/go/mellifera/.tmp/comment-noise-audit.md` (read-only input)
carries the P0s, the P1 index with per-file line anchors, the cross-cutting patterns,
and the recommended execution order. The law is
`/Users/aldfiar/projects/go/mellifera/.claude/skills/go-clean-code/SKILL.md` (main tree,
untracked — read-only input; absent from this worktree). See proposal.md — Why.

## Goals / Non-Goals

**Goals:**

- Every actively-wrong comment statement removed first (group 1).
- Duplicated invariant narrations collapsed to one canonical home + ID pointers (group 2).
- Every touched file lands in the law's healthy 10–18% comment-density band, with
  contract-not-narration docs and WHY-only body comments.
- Zero behavior change provable at every task (structural duties).

**Non-Goals:**

- No code changes, renames, or deletions of code lines (the audit's secondary CODE
  findings are a separate pass).
- No `web/` files, no generated code, no dist, no spec deltas (skip_specs: true).
- No new tests, no @qa tasks (no new modules — the register's @qa mandate never fires).
- Not updating the go-clean-code skill's density anchors (file lives only in the main
  tree, untracked — post-merge follow-up).

## Decisions

- **D1 — Duty rung: structural, not tests.** Comments are not executed, so targeted
  tests cannot fail on the red reality; per the preferred-forms ladder this change
  authors the structural/grep rung. P0 fixes carry negative greps pinning the stale
  text's absence (plus positive greps where a replacement is mandated); trim tasks carry
  the shared convention (§Interfaces). The full suite runs only at baseline + GATE 2,
  never in a duty.
- **D2 — Group DAG = the audit's execution order.** P0s → DRY pinning → per-area trims
  in density order → doc.go strips → itest. Pinning (group 2) precedes trims (groups 3–7)
  so a pointer never fights a later trim of the same file; groups run in order, so files
  shared across groups (viewer.go, open.go, recs_ordering.go, store/doc.go, main.go,
  playback.go, plugin doc.go) never edit concurrently.
- **D3 — One concern per task, files named in the task line.** Tasks carry the file set,
  the law pointer, and the audit path; the executor re-reads each file with the law in
  hand. The audit's 587 P2/P3 line findings are deliberately NOT transcribed into task
  text — line anchors drift as earlier groups land; relocate by symbol at apply.
- **D4 — audit: true + six-slot `file:` contracts for the three big-rework tasks**
  (3.1, 4.1, 5.1 — the six audit-marked files live in exactly these tasks). The reviewer
  reads their contract prose at the gate. No other task carries a contract: their task
  line + the audit are sufficient.
- **D5 — doc.go strips keep every INV registry.** The INV sections are ID-pointer
  targets cited from code comments; only the godoc-duplicating "Public API" catalogs
  die. Task 7.1's duty greps INV anchors to hold the keep-law.
- **D6 — Negative greps follow the explicit-exit law.** `! grep -q '<stale>' <file> ||
  exit 1` (red path exits 1, green path continues), every duty ends `exit 0`, positives
  chain `|| exit 1`.

## Interfaces

Cross-group notes and the shared conventions the task lines stay lean by referencing.

- **Shared verify convention (every trim/P0 task's `verify:`):** `gofmt -l <touched
  files> | grep . && exit 1` (reflowed comments; lll-120's failure surface) `;` scoped
  `go build ./<touched pkgs> || exit 1` (a line deleted too many) `;` `exit 0`. Tasks
  touching `_test.go` files use `go vet ./<pkg>` instead of/in addition to build (vet
  type-checks test files). Duties run clean from the repo root, no setup, one line.
- **File-overlap map (sequential by group order, no intra-group overlap):**
  store/doc.go: 1.2 (INV5 rewrite — affirmative phrasing, MAY NOT dies) → 2.1
  (error-floor canonical — the "ERROR-FLOOR LAW" bullet) → 7.1 (catalog strip; its duty
  greps the anchor, INV5, and the seam names survive).
  store/viewer.go: 2.1 (D7 canonical) → 5.2 (twin-doc residual). store/open.go: 2.1
  (ensure* pin) → 5.1 (schema essays). store/relayjobs.go: 2.1 (D7 pointer) → 5.2
  (relayClaimWhere doc) — surveyor Q6.
  main.go + cmd/mellifera/playback.go: 2.2 (invariant pinning) → 3.1 (essay trims).
  internal/api/playback.go: 4.2 only (viewer-scope canonical + pointers, FOUR sites
  ~:97/:114/:173/:203 — surveyor Q3+Q9).
  api/viewer.go: 1.1 (tutorial delete) → 4.2 (head trim).
  api/recs_ordering.go: 1.3 (doc reattach) → 4.2 (essay trims). api/facets.go: 4.2
  only (viewer-scope canonical + pointers, ~:9/:48 — surveyor Q3).
  api/handlers.go:639 viewer-scope site: 4.1's contract scope (surveyor Q3).
  Plugin code files: 2.3 (invariant pinning) → 7.2 (replica residual trims). Plugin
  doc.go files: 2.3 (invariant canonical, where doc.go is the home) → 7.1 (catalog
  strip).
  stream/classification.go: 5.1 only (matroska cross-reference; canonical pinned at
  describe.go's containerNative doc — surveyor Q4).
  identity/service.go: 1.4 (clause) → (nothing later). itest: 8.1 only (including
  integration_async_test.go:15's predecessor reword — surveyor Q7).
- **Canonical homes fixed by the dispatcher's pinning law:** D7 ledger law →
  internal/store/viewer.go; D3 suppression → cmd/mellifera/playback.go's suppressionSet
  doc; process-ctx detachment → the first main.go site; per-plugin invariants → the
  plugin's doc.go or owning symbol; error-floor boilerplate (ErrNoRows / value-agnostic /
  404-mapping) → internal/store/doc.go's `# Invariants` section, landed as the
  "ERROR-FLOOR LAW:" bullet (NOT the Public API catalog — 7.1 deletes that and its duty
  greps the anchor survives); ensure*-mechanics → ensureColumn. Non-dispatcher
  families: mute-floor → 4.2 (art.go); the viewer-scope dedup spans one owning task per
  site — internal/api/playback.go ~:97/:114/:173/:203 → 4.2, facets.go ~:9/:48 → 4.2,
  handlers.go:639 → 4.1's contract (surveyor Q3+Q9); embedded-audio → 5.1
  (stream/pack.go); matroska
  asymmetry → 5.1, canonical at describe.go's containerNative doc with
  classification.go as the one-line cross-reference (surveyor Q4);
  "moved to pkg/releasename" story → 7.2.
- **Invariant pointers are one line:** `// <invariant ID> — see <canonical home>`
  (the law's pointer form, e.g. `// 60 s locked (browse-scale D4), not a knob`).
  Information deleted from a replica must survive verbatim-in-meaning at the canonical
  home before the pointer replaces it.

## Risks / Trade-offs

- [Audit line anchors drift as groups 1–2 edit shared files] → task text and contracts
  name symbols and distinctive phrases, not bare line numbers; the executor relocates
  by symbol with the law in hand.
- [Comment deletion mangles an adjacent code line] → every duty runs gofmt -l over the
  touched files plus a scoped build/vet; the gate re-runs every duty.
- [A doc.go strip eats an INV registry another comment cites] → D5 keep-law + 7.1's
  positive INV greps.
- [gofmt misses an over-length line (lll-120 is a lint, not gofmt)] → accepted: trims
  shorten lines; the gate's lint anchor catches residue.
- [One wide task (6.1, 16 files) invites executor fatigue] → the work is mechanical
  law application per file; the reviewer's gate re-run plus the audit's own P1 list
  bound the scope; a failed pass re-verifies cheaply (structural duty).

## Open Questions

- none — the skill-anchor exclusion is recorded in proposal.md and routed to the
  session as a post-merge follow-up, not a deferrable design unknown.
