# GATE 2 record — display-naming

Date: 2026-10-14

## Verdict

@wf-reviewer: **Approved** on all five gate obligations —

1. **Probes**: all 12 probe blocks re-executed for real, every one rc=0, including the
   node-free full gate (`make build check test lint`) and the web tier (159 vitest
   tests + clean tsc).
2. **Diff vs spec deltas**: every scenario verified implemented — read-time
   composition at the api DTO boundary (`internal/api/display.go`, all-unexported
   namer), the exact precedence chain (override > composed > `_view.title` > ""),
   namespace-agnostic episode facts in fixed order (serial-parser → tv-parser →
   sorted), deleted-series skip, Cyrillic verbatim, per-library naming columns with
   guarded-ALTER migration and PATCH validation before write, serial seed v3
   (`{title} · S{season}E{episode}`, U+00B7) with guarded UPDATE for pre-v3 stores,
   `Module.ItemName` through the presentation closure, SPA consuming the served
   `display_name`, joint itest on real plugin subprocesses with `t.TempDir()`
   datadir.
3. **UNPROBEABLE confirmed by inspection**: none — 9/9 requirements probe-backed,
   0 unprobeable, 0 gaps.
4. **Standards**: within project bounds (display.go 435 lines — above the 400
   target, under the 500 hard limit); table-driven in-package tests; no dead code,
   no error-swallowing; golangci-lint green.
5. **Deviations ruled** (all non-blocking): gate-fix rounds during apply (namerFor
   floor moved inside `namerFor` after the `ac1_roles` probe caught a missing-library
   500; INV4 wantKeys gained the two naming_* keys — a documented strengthening, no
   assertion weakened); vacuous-probe flag fixed by repointing a delta scenario from
   the nonexistent `TestItemDisplayNameFloors` to `TestItemDisplayNamePrecedence`.

**Reviewer FLAG — client file-name floors** (resolved by human decision): the SPA
still carried `|| fileName(...)` fallback legs at three sites (Home nextUpEntries,
Collection seriesTitle + EpisodeCard), contradicting the web-ui delta's "each
verbatim as served". Two options offered: A) amend the delta wording; B) strict
served-verbatim client rendering.

## Human decision — Option B

User (aldfiar) chose **"B, approve"** on 2026-10-14: strict served-verbatim client
rendering AND archive approval in one line. Option B applied post-verdict: the three
fallback legs dropped (`Collection.tsx:681`, `Collection.tsx:987`, `Home.tsx:288` —
`?? ""` for the optional TS field), Home.tsx's now-dead local `fileName` removed,
ContinueCard's spec-blessed `viewTitle` em-dash path untouched; the two
floor-pinning tests repinned to verbatim-empty (159 tests, count unchanged); tick
cure re-run (reopen+retick, all 12 probes re-executed green, fingerprint rewritten
by wf itself).

## Backstop

`bash ~/.claude/bin/wf --repo-root mellifera change check
display-naming` → OK (rc=0) after the Option B fix: 12 done (re-run), 0 pending;
coverage requirements=9 probe_backed=9 unprobeable=0 gaps=0. The dirty-outside-
openspec WARNs are the change's own uncommitted work in the main tree (D3 run —
worktree creation refused `WorktreeBaseMissing`, main-tree fallback per the
worktree skill).

## Human archive approval

User (aldfiar) approved archive in this session on 2026-10-14 with: "B, approve".
