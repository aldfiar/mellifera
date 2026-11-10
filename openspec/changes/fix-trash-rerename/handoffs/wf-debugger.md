# Handoff — wf-debugger → fix-trash-rerename

Written 2026-11-10 after the diagnose pre-step. Evidence over belief: `cmd/mellifera/playback.go` + `cmd/mellifera/retention_test.go` in this worktree are the ground truth.

## Root cause

`evictDir` (playback.go:671) is the repo's ONLY `.trash` writer: it unconditionally does `trash := path + ".trash"; os.Rename(path, trash)` (672–673) then `os.RemoveAll(trash)` (677). The sweep feeds already-`.trash`-suffixed dirs back into it:

- `nonces()` (playback.go:865) lists EVERY dir under the item dir — no `.trash` filter. A stranded trash sibling is re-encountered as an ordinary stale candidate (stale forever: rename doesn't change mtime, name ≠ doc nonce).
- `sweepRetention` (627) calls `evictDir(p)` (661) per stale dir; budget (594) and demotion (509) share `evictDir` via the same unfiltered `nonces()` — all three call sites carry the defect class; the guard belongs in `evictDir` alone.
- When removal fails but rename succeeds (removal must empty the tree; rename needs only dir+parent write), every pass appends one suffix — ~38 boots grew `44b3d67ef54a2033` + 39×`.trash` = 250 chars; the 40th rename target exceeds NAME_MAX 255 → ENAMETOOLONG at line 674, the prod WARN (one per boot, dir immortal — the failing rename blocks RemoveAll from ever running).
- The sweep's own doc (621–624) already states the intended law: stale `.trash` is "reclaimed like any other stale directory" — reclamation was just implemented as rename-aside-then-delete, correct only for non-suffixed paths.
- Coverage gap: `retention_test.go` covered only a removable trash dir; the growth path had zero coverage. The prod removal blocker itself is environmental/transient (not this repo's bug); the defect is turning a transient blocker into permanent unbounded growth.

## Repro test (authored, RED for the right reason)

`cmd/mellifera/retention_test.go` — new `TestSweepRetentionTrashDeleteOnSight`, two subtests:

1. "unremovable stranded trash never gains a suffix across passes" — stale `dead1.trash` that is movable but unremovable (0o755 dir with 0o555 `sub/`: rename succeeds, RemoveAll EACCES — the portable model of the prod asymmetry; root skips), TWO passes, asserts no `.trash` name beyond the original single suffix ever exists. **FAILS today at pass 1** (`dead1.trash.trash` exists — the growth).
2. "deeper stranded suffixes delete on sight" — removable depth-2 stranded dir must leave NO trash-bearing residue (passes today via rename+remove; must keep passing post-fix via direct delete).

Run: `go test ./cmd/mellifera -run 'TestSweepRetentionTrashDeleteOnSight' -v`. Existing sweep tests untouched: `TestSweepRetention` 7/7, `TestSweepBudget` 4/4 green.

## First fix step (for the planner's task 1)

Guard inside `evictDir`: when `strings.HasSuffix(path, ".trash")` → delete directly (`os.RemoveAll(path)`, best-effort WARN-and-return-false on failure, same shape as today's removal failure path) instead of renaming aside. Growth becomes impossible (a removal failure retries the SAME name); any removable stranded dir (any suffix depth) is reclaimed on sight. Prod file: post-fix the 39-suffix dir is RemoveAll'd on the next sweep pass the moment the (transient) blocker lifts.

## Scope

- Fix: `cmd/mellifera/playback.go` ONLY — the `evictDir` body (~6–8 lines, `strings` import if absent). No sweep/loop signature changes.
- Tests: extend existing `cmd/mellifera/retention_test.go` (repro already in it — no new file).
- Suggested verify duty for task 1: `go test ./cmd/mellifera -run TestSweepRetentionTrashDeleteOnSight || exit 1`.
