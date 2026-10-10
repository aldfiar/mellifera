# Gate record: element-pages

## Verdict

RED → F1 fixed → **GREEN**.

@wf-reviewer's review returned RED with finding **F1**: the stored per-library
parser chain was write-only — `GetLibraryChain` had zero production callers, so
two SHALLs ("order = footer group order" and "order = enrichment queue
priority") were undelivered behind vacuous greps. The reviewer's own closure
criterion: *"After F1 lands and `wf change check` re-derives green, the gate can
go GREEN without reopening anything else."*

F1 fix (corrective @wf-coder launch, verified on disk by the session):

- `orderParserBindings` overlay in `internal/api/handlers.go` (getLibrary):
  chain-named parsers first in chain order (first occurrence wins on
  duplicates), unchained config parsers retain relative order after them;
  absent chain → config order. Footer order now derives from the stored chain.
- `internal/enrich/queue.go` `deriveLibrary`: reads
  `Store.GetLibraryChain(ctx, libraryID)` once per library and feeds
  `chainOrderedSources` into `pendingSources`. Deliberate deviation from the
  reviewer's "Deps closure" wording: the enrich package's idiom is direct
  `Deps.Store` reads; a closure would add a seam with no second
  implementation.
- Two new assertions: `TestLibraryChainOrderServed`
  (internal/api/libraries_test.go — PATCH chain reorders served parser list)
  and `TestDerivationChainPriority` (internal/enrich/queue_test.go — absent
  chain → (tv-parser, tmdb); after `SetLibraryChain(["tmdb","tv-parser"])` →
  (tmdb, tv-parser)). Both re-run by the session: PASS.

## Gate evidence

- `wf change check element-pages`: **OK** — 21 done, 0 pending; marker
  `6b05f8aeccbad5f6e02ab88fdb2ff218304c39a0b41f736459ca78024218a9ef`;
  coverage requirements=10 probe_backed=10 gaps=0.
- 7.3 close-out re-run by the session AFTER the F1 fix (the reviewer's
  full-suite run predates it): `make build` OK, `make check` OK (one
  pre-existing WARN: internal/api 10 exported symbols, warn-level), `make test`
  exit 0, `cd web && npm test` 119/119 green — node-free throughout.
- Box 7.3 (unprobeable) hand-ticked at gate per the wf-0.1.0 pattern after the
  reviewer confirmed its mechanical acceptance green; the manual-walkthrough
  portion is judgment reserved to the human at archive approval.
- All 20 probeable boxes re-ticked by wf (probe re-run on every tick); the
  reopen+retick cycles executed during the change were the sanctioned wf-0.1.0
  remedy for fingerprint staleness, never hand-written state.

## Reviewer-visible change-folder repairs (pre-GATE-2, validated)

- Box **2.2 authored** by the session (plan repair, not scope change): durable
  per-library chain state had no enabling storage — group 3 HALTed correctly.
  `library_parsers` table + `SetLibraryChain`/`GetLibraryChain` +
  `TestLibraryChain`, against already-approved spec behavior. Spec scenario
  "The collection chain persists per library" (probe 49fa25a53ecde01e) added.
- Box **7.1 relinked**: its probe id duplicated 4.1's (tick refused as
  ambiguous); a 7.1-owned scenario + non-vacuous itest probe
  (9a958b55c9e001fb) replaced it.
- Both repairs passed `openspec validate --strict` (valid) and
  `wf change check` (no id/ambiguity findings) before apply resumed.

## Non-blocking findings (surfaced, not gating)

- `web/src/pages/browse/ItemDetail.tsx` at 671 lines — reviewer FLAG; follow-up
  extraction refactor suggested.
- Element attachment (O2) is API-only — no SPA affordance; not a spec breach
  (the spec scopes an API, not a UI).
- Pre-existing repo state: ~400 dirty entries (deleted legacy `backend/` tree,
  untracked docs/) unrelated to this change; the entire element-pages delta is
  uncommitted working-tree state on main (base e5cff66).

## Archive approval

APPROVED — the human approved archiving in session on 2026-10-10 ("archive"),
after the gate record above was presented. Recorded before
`openspec archive element-pages --yes` ran.
