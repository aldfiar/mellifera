# close-out — fix-tv-unblock-2 (2026-11-01)

TV audio unblock round 2: the pack lane keys layout on TOTAL audio
(build-time embedded probe + resolvable sidecars), rendition composition
generalizes to N embedded audio streams, DEFAULT=YES rides the first
AAC rendition, the enrich marker became rule version 2 driving the lazy
re-heal wave, the descriptor carries the build layout to the wire, and
the SPA direct floor refuses rendition masters on MSE-less devices with
an honest classified banner (no more silent video-only mounts).

Archived as `2026-11-01-fix-tv-unblock-2`; deltas merged into
`openspec/specs/packaged-playback/spec.md` (+1/~3) and
`openspec/specs/web-ui/spec.md` (~1). Branch `feature/tv-playback-unblock`.

## Final per-task receipts (apply verify / reviewer re-run)

| task | apply verify | reviewer re-run |
|---|---|---|
| 1.1 layout rule + build-time probe | exit 0, 4.1s | 0, ~5s |
| 1.2 generalized composition + DEFAULT rule | exit 0, 0.3s | 0, 10s |
| 1.3 rule version + lazy re-heal gate | exit 0, 7.6s | 0, 11s |
| 2.1 descriptor layout end-to-end | exit 0, 4.4s | 0, 2s |
| 2.2 SPA direct-floor refusal | exit 0, 6.4s | 0, 7s |
| 2.3 embedded build regen | exit 0, 6.6s (after scoped commit b8c0d42; first run RED at porcelain-vs-HEAD leg) | 0, 7s |
| 3.1 joint @qa | exit 0, 8.1s | 0, 3s |
| git-check | exit 0 (commits 7a5b492, be85b36 pushed) | 1→FLAG (handoff write after HEAD) → 0 on close re-run |

Full-suite GATE 2 anchor: `go test ./...` rc 0, 22/22 packages (288s).
Web suites: Player 41/41, api 29/29, tsc clean.

## Gate record

GATE 1: approved with D1 = build-time source probe. GATE 2:
PASS-WITH-FLAGS (review.md) — sole flag git-check residue from the
session's own gate-cadence handoff write; two P3 smells noted
(Describe's 9 positional string returns; renditionArgs 7 params),
both pre-existing conventions extended, non-blocking. Archive approved
by the human.

## Deviations and lessons

- Task 2.3's porcelain leg asserted tree-vs-HEAD, but the loop defers
  commits so regen output MUST differ from HEAD; the coder HALTed
  correctly, the session made the task's own scoped commit (b8c0d42).
  Future regen tasks: author the porcelain leg as build determinism
  (hash before/re-build/hash after).
- The session handoff record is written at gate cadence and is
  therefore ALWAYS dirty at git-check time — expected; the close
  commit absorbs it (this happened identically on the pma arc).

## Residue (unscheduled)

- AAC publish-probe profile blindness (itm_3-class, codecs=degraded):
  ASC-parse fallback proposed as a separate change.
- Posters 403 auth gap from the TV; opus-audio Classify mix under
  knob=true; rus×3 labeling nit (future builds get unique NAMEs);
  INV4 comment cosmetic in internal/api/playback.go; docs-debt pass
  (api-reference, api/doc.go INV2/INV5).
- Prod will re-heal ~40 legacy packs lazily (version-2 wave, one play
  each). Deploy + prod agent verification follows close (standing
  directive).
