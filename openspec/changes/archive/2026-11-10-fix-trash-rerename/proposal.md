# Proposal

## Why

The eviction sweep re-renames already-`.trash`-suffixed stream build directories instead of deleting them: a stranded trash directory (an earlier pass's removal-failure leftover, or crash-hygiene debris) is re-encountered as an ordinary stale candidate and renamed aside again, appending one `.trash` suffix per sweep pass. The prod artifact `44b3d67ef54a2033` grew 39 suffixes (~38 boots, a 250-char name) until the next rename target exceeded NAME_MAX (255) and began failing with ENAMETOOLONG — one WARN per boot, forever, with the directory's bytes never reclaimed and permanently miscounted against nothing that can free them. The root cause is the shared eviction vocabulary: `evictDir` renames-aside unconditionally, and the sweeps feed it every directory under an item's artifact dir with no `.trash` filter. Why now: the diagnose pre-step reproduced the growth mechanism in a red test in this worktree, and the fix is a small guard in the one shared function all three sweep call sites ride.

## What Changes

- `evictDir` (cmd/mellifera/playback.go) gains a stranded-trash guard: a path already ending in `.trash` is deleted directly — best-effort, a failed removal logs a warning and returns false exactly like today's removal-failure path — instead of being renamed to a second suffix. Growth becomes structurally impossible (a failed removal retries the SAME name); any removable stranded directory is reclaimed on sight, whatever its suffix depth; the prod 39-suffix directory becomes reclaimable the moment its (environmental, transient) removal blocker lifts.
- All three `evictDir` call sites heal through the single guard — the retention sweep, the budget sweep, and completion-driven demotion. No sweep or loop signature changes; the unsuffixed eviction path (rename-aside protecting a client mid-fetch) stays byte-identical.
- Spec: packaged-playback's eviction vocabulary law is amended — an already-suffixed directory SHALL be deleted on sight, never renamed again, and the suffix SHALL never grow beyond one (`Remux-only pack lane` and `Budget-capped artifacts` MODIFIED; `Completion-driven demotion` rides the shared vocabulary unchanged).
- The reproduction test `TestSweepRetentionTrashDeleteOnSight` (authored red by the diagnose pre-step in cmd/mellifera/retention_test.go) is the acceptance floor: red today, green after; the existing retention and budget sweep tests stay green as the regression net.

## Capabilities

### New Capabilities

(none — no new system behavior is introduced)

### Modified Capabilities

- `packaged-playback`: the eviction vocabulary's reclamation law changes — a directory already carrying the `.trash` suffix SHALL be deleted on sight rather than renamed aside again, and a `.trash` suffix SHALL never grow beyond the stranded one, so a failed reclaim retries the same directory under the same name on a later tick.

## Impact

- Code: `cmd/mellifera/playback.go` only — the `evictDir` body (lines 671-683; the `strings` import already exists at line 16). No API surface, no store schema, no web surface, no dependency changes.
- Tests: existing `cmd/mellifera/retention_test.go` — the repro test already lives there (uncommitted, red); it flips green. No new test file.
- Ops: on alatoic, the next sweep pass after deploy reclaims the stranded prod directory once its transient removal blocker lifts; the per-boot ENAMETOOLONG WARN disappears. Deploy risk is minimal: the unsuffixed eviction path is unchanged.
- Docs: living spec `openspec/specs/packaged-playback/spec.md` gains the stranded-trash law at archive (delta merge).
