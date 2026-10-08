# Gate record — media-preview

## Reviewer verdict (GATE 2)

@wf-reviewer, 2026-10-08: **PASS** with 2 flags, resolved same day.

- Probes re-run from the deltas, all exit 0; inherited (unchanged) scenarios
  verified byte-identical to the living `web-ui`/`scan-library`/
  `playback-progress` specs they amend; committed dist proven fresh by a
  byte-identical vite rebuild; endpoint-allowlist audit green.
- Diff vs deltas: media-serving (new capability) 4/4 PASS; web-ui amendments
  PASS with FLAG S1 (401 rotation duplicated across the two channels) and
  FLAG S2 (`variant` typed as bare string) — both FIXED in `620abc8`
  (shared `handle401` chokepoint; `MediaVariant` union), vitest 93/93, dist
  rebuilt, SPA probes re-run.
- Absence of a `wf: source_fingerprint` marker in tasks.md is the norm for
  this installed wf vintage (checked against all three archived changes) —
  not a violation.
- Standards axis: no new exported Go symbols beyond the handler, document-only
  path resolution (client-steered paths tested against), strict D6 thumb
  contract, `<img>` channel never carries the endpoint URL, fidelity
  invariants untouched by the disclosure move.

## Walkthrough resolution (operator feedback at the gate, 2026-10-08→09)

Human walkthrough against the real library (:8090) confirmed collection card
previews and photo/episode tiles; one gap reported — the item page showed
fields only, no large image. That closes design.md's open question ("optional
ItemDetail hero image"): resolved **yes**, shipped in `e29e92b` — the Details
surface leads with the item's media (thumb variant on the frame-grabber fact,
original for image-typed items, no hero + no request when nothing
image-resolvable), through the already-landed media channel, spec'd as the
"Hero image leads the details surface" scenario (probe `d209cc37dda978ea`).
tasks.md gained box 3.3, ticked after the probe run.

## Session check re-derivation (final, post-`e29e92b`)

- All 18 scenarios re-derived with the per-scenario-split recipe: 17 probe
  ids match and all 17 probe blocks re-run exit 0; the 1 UNPROBEABLE (4.3
  close-out walkthrough) confirmed by inspection — the operator's own
  walkthrough served it (previews, hero, collapsed disclosure).
- `openspec validate media-preview --strict` → valid;
  `openspec validate --changes --strict` → 1/1.
- `cd web`: vitest 96/96 (3 new hero tests), `tsc --noEmit` clean,
  `eslint src` clean; dist rebuilt and committed (`index-L_pjEUg4.js`).
- Node-free gate: `make build && make check` OK (no Go source changed in
  `e29e92b`; the Go suite stood green at `620abc8` and the media code is
  untouched since).

## Human archive approval

Approved by the operator, 2026-10-09 — walkthrough complete, instruction:
"update docs if neeede, merge to main" (archive recorded as its
prerequisite).
