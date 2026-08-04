# DOCS 02 — operator runtime-deps runbook: document the `exiftool` install (alongside ffmpeg/ffprobe)

> Add the operator-facing runtime-dependency documentation for image enrichment.
> There is NO dedicated operator-runbook/INSTALL.md in the repo (confirmed by a
> repo-wide search) — the de-facto runtime-deps docs are inline in `architecture.md
> §1.2` + `project_structure.md` Overview/Stack, with the decision/Q&A record in
> `open-questions.md`. This task consolidates the exiftool runtime-dep statement +
> install hints into those locations (and a short note in the build skill), matching
> the established Q6 "external binary is the plugin's, not the core's" framing.

## Context

- **feature_goal:** (shared) image media type + EXIF enricher.
- **why:** `exiftool` is a NEW system runtime dependency (operators must install it for image EXIF enrichment). It is NOT a Go module dep and NOT a build dep — a missing exiftool is a per-source SOFT-FAIL at enrichment (AC-softfail), never a startup/build failure. Operators need to know to install it (`brew install exiftool` / `apt install libimage-exiftool-perl`) and that its absence degrades gracefully.
- **audience:** operator (deployment/install/config) + developer (runtime-dep posture). Tone: concise install instructions + the failure-mode contract.
- **related_tasks:** Task 01 (image-enricher invokes exiftool), Task 06 (Makefile runtime-dep comment points here).

## Type

MODIFY (additive runtime-dep statement + Q/D record); NO new file (no runbook exists; this task does NOT create one — it lands the content in the established inline locations. If the project later wants a consolidated INSTALL.md, that is a separate effort).

## Files to MODIFY

### 1. `docs/architecture.md` — §1.2 Hard constraints (THE runtime-deps anchor)

`existing_code_snapshot` (line 41, the sole normative runtime-deps row):
```
| External runtime deps (core) | `ffmpeg`/`ffprobe` via `os/exec` only | No other host binaries required by the core |
```
**Change:** Add a sibling row (or extend the note) for the PLUGIN-scoped deps, preserving the precise core-vs-plugin scoping that Q6 established:
```
| External runtime deps (plugins) | `ffmpeg`/`ffprobe` (base-scanner, video probe) and `exiftool` (image-enricher, image EXIF) via `os/exec` arg-slice only | Invoked by plugin subprocesses, NOT the core; a missing binary is a per-source SOFT-FAIL (empty metadata → B1 no_data → settle), never a startup/build failure |
```
Keep the existing core-scoped row TRUE (the core itself still requires only ffmpeg/ffprobe transitively + SQLite; exiftool is the image-enricher plugin's dep). Add install hints inline: "Install: `brew install exiftool` (macOS) / `apt install libimage-exiftool-perl` (Debian/Ubuntu)."

### 2. `docs/project_structure.md` — Overview + Stack table

`existing_code_snapshot`:
- line 34 (Overview): "The only external core runtime dependency is `ffmpeg`/`ffprobe`, invoked via `os/exec`."
- line 48 (Stack table — "Media probe" row): `| Media probe | ffmpeg/ffprobe 7.1.1 via os/exec (arg slice, never shell) | arch §1.2; enhanced_obj §7 |`.

**Change (additive):**
- Overview (line 34): refine to "...the only external CORE runtime dependency is `ffmpeg`/`ffprobe`; the image-enricher plugin additionally requires `exiftool` (both invoked via `os/exec`, never shell). A missing `exiftool` soft-fails image enrichment per-source (the scan still succeeds)."
- Stack table (line 48): add a sibling row `| Image metadata | exiftool via os/exec (arg slice, never shell) | image-enricher plugin (Phase B2); arch §1.2 |` and an install note ("Install: brew/apt — see operator runbook §1.2").

### 3. `docs/open-questions.md` — add Q29 + D21 (the decision record)

`existing_code_snapshot`:
- Q6 (lines 113-117) — the ffprobe responsibility/failure-mode template: "the scanner plugin runs ffprobe ... the core never invokes ffmpeg/ffprobe directly ... This keeps 'the only external runtime dep for the core' technically true (the dep is the plugin's...)."
- Decision log table (lines 447-468) — ends at D20; `---` separator at line 470.

**Change (additive):**
- Add Q29 (sibling to Q6): "## Q29. exiftool responsibility & failure modes — DECIDED. **Question:** who runs exiftool, and what if it's missing? **Decision:** the **image-enricher plugin** runs exiftool (`exec.CommandContext` arg-slice, `-j -n <selected tags> <absPath>`); the core never invokes it. `exec.LookPath("exiftool")` on each use; a missing/failing/non-zero/timeout/non-JSON exiftool is a per-source SOFT-FAIL (empty metadata → B1 `no_data` terminal → 30-day cooldown → settle — AC-6/AC-softfail). Never a startup/build failure. Replaces the earlier pure-Go `bep/imagemagick`/`imagemeta` direction (user plan-review decision)."
- Add a D21 decision row to the table AFTER D20 (before the `---`): "| D21 | EXIF via the system `exiftool` subprocess (os/exec, no CGO, no Go module dep); HEIC/RAW read natively; missing exiftool soft-fails per-source | DECIDED | 2026-07-30 | Q29 / arch §1.2 / B2 plan D-2 |".

### 4. `.claude/skills/mellifera-build/SKILL.md` — short runtime-deps note

`existing_code_snapshot`: the build skill has NO runtime-deps section (only line 26 mentions ffprobe incidentally inside the base-scanner module-map row). Task 06 adds a Makefile comment pointing at the docs; this task adds the matching short note in the skill (the dev/operator-facing entry point for build/deps).

**Change (additive):** Add a short "## Runtime dependencies (operators)" subsection near the top of the skill:
```
## Runtime dependencies (operators)

These are NOT Go module dependencies and are NOT required to BUILD Mellifera
(the binary is pure-Go, CGO_ENABLED=0). They are required at RUNTIME by plugin
subprocesses (invoked via os/exec arg-slice — never a shell):

- `ffmpeg`/`ffprobe` 7.1.1 — video probe (base-scanner). Install: brew/apt.
- `exiftool` — image EXIF (image-enricher, Phase B2). Install: `brew install
  exiftool` (macOS) / `apt install libimage-exiftool-perl` (Debian/Ubuntu).

A missing binary is a per-source SOFT-FAIL (empty metadata → B1 no_data →
settle); the scan always succeeds. See docs/architecture.md §1.2.
```

## behaviors (doc-correctness)

- An operator reading `architecture.md §1.2` learns exiftool is required (plugin-scoped) + how to install it + that its absence soft-fails (scan still succeeds).
- The Stack/Overview in `project_structure.md` no longer claims "only ffmpeg/ffprobe" without the image-metadata qualifier.
- The decision record (`open-questions.md`) has a Q29 + D21 anchoring the exiftool decision (replaces the earlier pure-Go-lib direction), so a future reader understands WHY.
- The build skill (operator/dev entry point) has a consolidated runtime-deps subsection.

## invariants

- CORE-vs-PLUGIN scoping preserved (Q6 framing): exiftool is the image-enricher plugin's dep, not the core's. The §1.2 core-scoped row stays TRUE.
- CONSISTENT with AC-2/AC-softfail: docs say "NOT a build dep; missing → soft-fail, scan succeeds" (matches the code + the Makefile comment from Task 06).
- NO new file (lands in established locations; a future consolidated INSTALL.md is out of scope).

## negative_examples

- DO NOT document exiftool as a Go-module or build dependency (it is runtime-only, plugin-scoped).
- DO NOT claim the core requires exiftool (it does not — only the image-enricher plugin does).
- DO NOT document a hard failure on missing exiftool (it is a per-source soft-fail — AC-softfail).
- DO NOT edit the feature-planning dirs.

## out_of_scope

- The module-map plugin rows (DOCS 01 owns those — keep the cross-reference consistent: DOCS 01 says image-enricher "reads EXIF via system exiftool" and points here for install).
- Creating a new INSTALL.md / runbook file (consolidation is a separate effort; this task lands content in the established inline locations).
- `Makefile` (Task 06 owns the Makefile comment, which points at these docs).

## scope_boundary

MODIFY `docs/architecture.md` (§1.2), `docs/project_structure.md` (Overview + Stack), `docs/open-questions.md` (Q29 + D21), `.claude/skills/mellifera-build/SKILL.md` (runtime-deps subsection). Additive content only.

## project_scope

.

## refactoring_docs

- Renaming/moving: NONE.
- Cross-ref check: `grep -rn 'exiftool' docs/architecture.md docs/project_structure.md docs/open-questions.md .claude/skills/mellifera-build/SKILL.md Makefile` hits in all five (Makefile from Task 06 + the four docs here) — consistent install hint.

## skill_hint

- grounding (G2 the exact anchors from the docs survey: architecture.md §1.2 line 41; project_structure.md lines 34/48; open-questions.md Q6 lines 113-117 + decision table lines 447-470; SKILL.md)

## deps

- Task 06 (Makefile comment points at these docs — land together).
- Coder task 01 (the exiftool invocation the docs describe).

## verify

```
cd /Users/alldfiar/projects/go/mellifera
grep -rn 'exiftool' docs/architecture.md docs/project_structure.md docs/open-questions.md .claude/skills/mellifera-build/SKILL.md   # all four hit
grep -n 'Q29\|D21' docs/open-questions.md    # both present
grep -n 'brew install exiftool\|libimage-exiftool-perl' docs/architecture.md .claude/skills/mellifera-build/SKILL.md   # install hints present
```
