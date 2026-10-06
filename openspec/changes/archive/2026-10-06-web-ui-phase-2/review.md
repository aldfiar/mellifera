# Gate Record — web-ui-phase-2

## GATE 1 — proposal approval (2026-10-06)

Approved by the user (AskUserQuestion): start apply; commit the uncommitted
Phase 2a work first; defer the optional "recent items" admin widget (Decision 9);
browse stays library-scoped, Go byte-identical.

## GATE 2 — completion review (2026-10-06)

**VERDICT: PASS** (@wf-reviewer, independent re-derivation).

- Spec axis: 12/12 wf:probe blocks re-run verbatim, all exit 0; UNPROBEABLE
  keyboard-a11y confirmed by inspection (ThemeToggle aria-label/aria-pressed,
  focus-visible rings on raw + shadcn buttons, zero tabIndex/autoFocus, no
  keyboard traps, native disabled semantics); diff-vs-delta substance verified
  (fidelity invariants, six-route endpoint audit, ItemDTO fields verbatim vs
  internal/api/handlers.go); byte-identical Go confirmed (only
  integration_web_items_test.go added + dist bytes); make build/check/test
  green re-run; Vitest 49/49.
- Standards axis: PASS (judgement-call smells only, none hard).
- Note: `wf change check` not runnable (wf CLI absent); re-derivation stands
  on the reviewer's verbatim probe re-runs and the gate re-runs above.

## Flags (non-blocking, recorded)

1. Probe 288ac5d45de8c35e was two-fold defective (whitelist regex missed the
   comma-form `fetch(path, {`; `!`-pipeline errexit-exempt so the grep clause
   could never fail the probe). Substance independently verified clean.
   FIXED pre-archive per user approval: capture + `test -z` + widened
   `fetch\(path` whitelist; id unchanged (scenario text untouched); re-run
   green.
2. queries.ts stale "4 endpoints" header comment; route literals inlined in
   the 2a-era hooks instead of ENDPOINTS constants (DRY judgement call).
3. Browse.tsx pagination buttons duplicate the shadcn focus-visible class
   string instead of `<Button variant="outline">` (duplication judgement call).
4. `error as ApiError` casts: a non-ApiError rejection reaching ErrorState
   renders an empty AlertTitle (code undefined) — acceptable under
   apiRequest-as-sole-rejection-source.
5. ffprobe and unknown top-level namespaces modeled + byte-tested Go-side but
   not rendered — consistent with the delta text (intentional scope).
6. `make web-build` fails at `swag` on this host (binary absent; beyond the
   recorded 2a json.RawMessage issue); dist regenerated via
   `cd web && npm ci && npm run build`. openapi.{json,yaml} untouched.
7. getItem's 500 internal_error branch untested — needs a fault-injected
   store seam (production change; out of scope).
8. wf CLI absent — `wf change tick`/`check` unavailable; the apply runner
   ticked boxes only after its own on-disk probe re-runs (disclosed at GATE 1).

## Human archive approval (2026-10-06)

Approved by the user (AskUserQuestion): "Fix probe, then archive" — merge the
deltas into the `web-ui` living spec and move the change to archive.
