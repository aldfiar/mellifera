# DOCS 01 — module-map sync: image-enricher plugin + image module + image discovery

> Synchronize the project's AUTHORITATIVE module map (a 3-way cross-referenced roster
> that MUST stay in sync) + the capability roster + add an `image` module-config
> example. The image-enricher is a `metadata_source` plugin (NOT an `image_provider` —
> that capability type stays reserved), so the change is additive rows/examples, not
> a new capability type. ONE synchronized change across the 4 files that document the
> same fact.

## Context

- **feature_goal:** (shared) image media type + EXIF enricher.
- **why:** the module map is documented as "authoritative — keep in sync with the skill" (`ai-architecture.md §4` header). Adding image-enricher + the image module without syncing all three copies leaves the docs lying about what ships. This is the doc analog of the additive code: new rows/examples only, no existing row's meaning changes.
- **audience:** developer (technical internals — package roster, capability model, module config).
- **related_tasks:** Task 01 (image-enricher plugin), Task 02 (base-scanner image discovery), Task 04 (image module seed), Task 05 (cmd wiring).

## Type

MODIFY (additive rows/examples; no semantic change to existing rows).

## Files to MODIFY (one synchronized change)

### 1. `docs/ai-architecture.md` — §4 Module map (THE authoritative one)

`existing_code_snapshot` (lines 63-74, the two plugin rows):
```
| `plugins/base-scanner` | one subprocess binary — **[A]** media-type-agnostic (walk + ffprobe + withinRoot; parseTV extracted to tv-parser) | per-capability (scanner.v1 + plugin.v1) | sdk, proto |
| `plugins/tv-parser` | **[A]** first `metadata_source` subprocess binary (parseTV moved here verbatim; serves `metadata.v1.MetadataSource`) | per-capability (metadata.v1 + plugin.v1) | sdk, proto |
```
**Change:**
- Update the `plugins/base-scanner` row: note it is now module-type-aware (image vs video extension selection; stdlib image base info) — still "media-type-aware ONLY as a plugin; core never branches (INV2)".
- Add a new row for `plugins/image-enricher`: "**[B2]** `metadata_source` subprocess binary serving `metadata.v1.MetadataSource`; reads EXIF via the system `exiftool` subprocess (`os/exec` arg-slice — no CGO, no Go module dep). Mirrors tv-parser." Public API: per-capability (metadata.v1 + plugin.v1); package main ~0 exports. Depends on: sdk, proto.
- Update `cmd/mellifera` row (line 63): it now loads base-scanner + tv-parser + image-enricher.

### 2. `.claude/skills/mellifera-build/SKILL.md` — "The module map" (lines 17-30)

`existing_code_snapshot` (line 26 — currently STALE vs ai-architecture):
```
| `plugins/base-scanner` | one subprocess binary (walk + ffprobe + TV parse) | per-capability | sdk, proto |
```
**Change:** This table is STALE (parseTV was extracted to tv-parser; no tv-parser row exists). Fix AND sync in one pass:
- Correct the `plugins/base-scanner` row to "walk + ffprobe (video) + stdlib image base info; module-type-gated discovery".
- Add a `plugins/tv-parser` row: "metadata_source subprocess (parseTV); serves metadata.v1.MetadataSource".
- Add a `plugins/image-enricher` row: "metadata_source subprocess (EXIF via system exiftool); serves metadata.v1.MetadataSource".
- The documented sync instruction at SKILL.md line 76 ("Add the package to the module map above and in `docs/ai-architecture.md`") is what this task fulfills — quote it in the change rationale.

### 3. `docs/project_structure.md` — directory tree + entry points + capability model

`existing_code_snapshot`:
- lines 84-88 (plugins subtree): lists `base-scanner/` + `tv-parser/` only.
- lines 99-103 (Entry points table): "Metadata-source plugin | `plugins/tv-parser/main.go` | Phase A. ... the first `metadata_source` capability plugin."
- lines 218-222 (Capability model): "Two capability types now ship ... `metadata_source` (tv-parser + future enrichers)."
- lines 161-162 ("What exists now"): `plugins/{base-scanner,tv-parser}/` + "mellifera binary (server) + base-scanner + tv-parser binaries".

**Change (additive):**
- Directory tree (84-88): add `├── image-enricher/  # metadata_source subprocess: EXIF via system exiftool (Phase B2)`.
- Entry points (99-103): add a row "Metadata-source plugin (image) | `plugins/image-enricher/main.go` | Phase B2. Separate subprocess binary; EXIF `metadata_source` capability plugin; reads EXIF via the system `exiftool` binary (os/exec)."
- Capability model (218-222): update "`metadata_source` (tv-parser + image-enricher)" — note image-enricher is the second `metadata_source` plugin (still ZERO new capability types — decision D-1 holds; `image_provider` stays reserved).
- "What exists now" (161-162): add `image-enricher/` + the `image-enricher` binary.

### 4. `docs/architecture.md` — capability roster + module-config example

`existing_code_snapshot`:
- §1.4 lines 82-88 (capability roster): `metadata_source` MVP plugins column lists "tmdb (bundled), kinopoisk (bundled)"; `image_provider` is reserved-but-empty.
- §2.4.1 lines 678-691: only the `tv` module config example exists.
- §9.1 lines 1384-1403: `modules` table comment example `"tv"`; `plugins` table comment example `"tmdb"`.

**Change (additive):**
- §1.4 roster: clarify `metadata_source` ships tv-parser + image-enricher (local) in addition to the designed tmdb/kinopoisk. Do NOT promote `image_provider` (image-enricher is a `metadata_source`, not an `image_provider` — note this explicitly to prevent confusion).
- §2.4.1: add a short `image` module-config example mirroring the `tv` example (`media_type: image`; scanner base-scanner; metadata_sources: image-enricher priority 1, no auth_mode; note: pure EXIF, no filename fallback — D-4).
- §9.1: optionally add `"image"` to the `modules.media_type` comment example and `"image-enricher"` to the `plugins` comment example (the schema itself is media-type-agnostic — no DDL change).

## behaviors (doc-correctness)

- The 3-way module map (ai-architecture §4, build SKILL.md, project_structure.md) all list `plugins/image-enricher` with a consistent description after this task.
- The capability roster (architecture §1.4) reflects that `metadata_source` has a second shipping plugin (image-enricher) without introducing a new capability type.
- An `image` module-config example exists (architecture §2.4.1) so operators can see the module shape.
- No existing row's MEANING changes (additive only — mirrors the code's AC-3 posture).

## invariants

- SYNC: all three module-map copies describe the same plugin set after this task (the skill explicitly says "keep in sync").
- ADDITIVE: no existing capability type is removed/renamed; `image_provider`/`subtitle_provider`/`transcoder` stay reserved.
- CONSISTENT WITH CODE: the descriptions match what Tasks 01/02/04/05 actually built (image-enricher is `metadata_source`; base-scanner is module-type-gated; the image module is a config seed).

## negative_examples

- DO NOT promote `image_provider` to an active capability — image-enricher is a `metadata_source` plugin.
- DO NOT describe image-enricher as CGO or as having a Go EXIF dependency (it invokes the system exiftool via os/exec — see DOCS 02).
- DO NOT change the meaning of existing rows (tv-parser, base-scanner's video role, the tv module example).

## out_of_scope

- Runtime-deps / exiftool install (DOCS 02 owns that).
- The feature-planning dirs (`docs/image-enrichment/**`, etc.) — these are per-feature artifacts, not the shipped docs.
- `docs/open-questions.md` Q/D entries (DOCS 02 owns the exiftool Q29/D21).

## scope_boundary

MODIFY `docs/ai-architecture.md`, `.claude/skills/mellifera-build/SKILL.md`, `docs/project_structure.md`, `docs/architecture.md` (§1.4 + §2.4.1 + optional §9.1 comment). Additive rows/examples only.

## project_scope

.

## refactoring_docs

- Renaming/moving: NONE (no symbols moved; this is additive doc content).
- Cross-ref check: after the edit, `grep -rn 'image-enricher' docs/ai-architecture.md docs/project_structure.md .claude/skills/mellifera-build/SKILL.md docs/architecture.md` hits in all four files (the sync invariant).

## skill_hint

- grounding (G2 the exact line ranges from the docs-anchor survey; cite them in the edits)

## deps

- Coder tasks 01/02/04/05 should be reviewed/merged (the docs describe what they built); this task can be authored in parallel but should land after the code is finalized.

## verify

```
cd /Users/alldfiar/projects/go/mellifera
grep -rn 'image-enricher' docs/ai-architecture.md docs/project_structure.md docs/architecture.md .claude/skills/mellifera-build/SKILL.md   # all four hit
grep -n 'image_provider' docs/architecture.md    # still reserved (not promoted)
```
