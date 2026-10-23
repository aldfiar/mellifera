# Spec Delta

## MODIFIED Requirements

### Requirement: CardActions element menu

Every item card (movie cards, episode flow rows) and every series card SHALL
carry a quiet CardActions trigger (a ⋯ glyph at the card's top-right) that
reveals on card hover/focus and opens ONE dialog overlay: `role="dialog"`,
`aria-modal`, `aria-haspopup="dialog"` on the trigger, `aria-expanded`
tracking the open state. The overlay is portaled/fixed-position (never
clipped by the card's overflow), carries a scrim with click-away, traps focus
while open (a Tab loop), and returns focus to the trigger on close; the
trigger's open state persists while focus is inside the overlay
(`data-open`). On coarse pointers (`pointer: coarse`) the trigger SHALL be
persistently visible with a muted glyph and a hit target of at least 40px —
touch/TV need no pointer and no learned gesture. Escape SHALL back out of a
view to the menu, close everything from the menu, and be IGNORED while a
mutation is pending (an error never renders into an unmounted view). The
overlay hosts views — menu → rename | identify | refresh — as local state,
never URL state: a route change discards it, and an awaited mid-flight
mutation completes with its result simply not shown. A successful mutation
closes its view via the awaited-mutation collapse; a canonical error renders
inline and the overlay stays open.

Item-card menu rows: Rename… (the rename view), Identify… and Refresh
metadata… (offered when the library's module block is present AND its parser
chain is non-empty — the gate signals module wiring, not authorization; today
every minted token is admin so the two coincide — and Identify is promoted to
the first row when the card is unidentified), and Mark watched — offered only
when the item's duration is known (`durationSeconds ≠ null`; never a guessed
duration): it PUTs `PUT /api/v1/progress/{item_id}` with
`position=durationSeconds`, keeps the menu open, and surfaces a row-local
transient error line on failure. The server has no watched concept —
`position=duration` does not leave an item on the Continue rail (for series
it genuinely advances Next up); "watched flag / Continue-rail filtering" is a
named Go backlog line.

Series-card menu rows: Identify… (the three-step series identify overlay,
offered under the same module-wired gate as the item rows — the row is
absent when the module block is missing or its chain empty), Rename… (curing
a polluted composed name on every episode at once through read-time
recomposition), and Refresh metadata… (the series id as the refresh row —
series rows live in the refresh row space).
The series card's lifecycle status pill and its "file" chip leave the chip
row; the backing fact re-lands as a menu footer ("File-backed series")
rendered only when the document's backing marker is `file`.

The rename view SHALL reuse the existing rename form semantics untouched —
the `useTitleOverride` mutations (retry:0, awaited-collapse, `role="alert"`
inline error, the same invalidation keys) with the closed-button branch
removed; the always-visible per-card rename affordance dies, and MovieCard's
`rename` prop slot dies with it.

#### Scenario: The menu opens with accessible state and closes through the shell

- **WHEN** the operator opens a card's menu, tabs through it, and closes it — by Escape and by a scrim click
- **THEN** the trigger carries `aria-haspopup="dialog"` with `aria-expanded` tracking the open state and the open state persists while focus is inside the portaled overlay, focus stays trapped while open, each close affordance works, and focus returns to the trigger on close
<!-- wf:probe id=f96cbb81e18b86b9 -->
```bash
set -e
cd web && npx vitest run src/pages/collections/Collection.test.tsx
```
<!-- /wf:probe -->

#### Scenario: The Escape matrix backs out of views and respects pending mutations

- **WHEN** the operator presses Escape inside an open view, then inside the menu, and once more while a mutation is pending
- **THEN** the first Escape returns to the menu, the second closes the overlay entirely, and the pending-mutation Escape is ignored — no error renders into an unmounted view
<!-- wf:probe id=8bf67e2f3056a1f9 -->
```bash
set -e
cd web && npx vitest run src/pages/collections/Collection.test.tsx
```
<!-- /wf:probe -->

#### Scenario: Success closes via the awaited mutation; an error stays open

- **WHEN** the operator submits a rename that succeeds and, separately, one that answers a canonical error
- **THEN** the success collapses the overlay once the awaited mutation resolves — never via a flag that fires before the close — and the error renders inline with the overlay still open
<!-- wf:probe id=2f40c64b4dc63f01 -->
```bash
set -e
cd web && npx vitest run src/pages/collections/Collection.test.tsx
```
<!-- /wf:probe -->

#### Scenario: Mark watched is gated on a known duration

- **WHEN** the card menu opens for an item whose duration is known and for one whose duration is unknown, and the operator activates Mark watched on the first
- **THEN** the row is absent for the unknown-duration item, the activation PUTs `/api/v1/progress/{item_id}` with `position=durationSeconds`, the menu stays open, and a failed PUT renders a row-local error line
<!-- wf:probe id=917fd52941b38d07 -->
```bash
set -e
cd web && npx vitest run src/pages/collections/Collection.test.tsx
```
<!-- /wf:probe -->

#### Scenario: Series cards manage from the menu with the file-backed footer

- **WHEN** the operator opens a directory-backed series card's menu and a file-backed series card's menu
- **THEN** both cards carry no status pill and no "file" chip, both menus offer Identify, Rename, and Refresh metadata rows — the Identify row opening the series identify overlay, and the file-backed card's menu carries the "File-backed series" footer while the directory-backed card's carries none
<!-- wf:probe id=5f877a45c887f1cc -->
```bash
set -e
grep -q 'identify={seriesIdentifyGate' web/src/pages/collections/Collection.tsx
```
<!-- /wf:probe -->

#### Scenario: Coarse pointers see the menu without hover

- **WHEN** the collection surface renders on a coarse-pointer device (touch/TV)
- **THEN** the CardActions trigger is persistently visible with a muted glyph and a hit target of at least 40px, with no hover and no learned gesture required

## ADDED Requirements

### Requirement: Series identify overlay

The series card's Identify… row SHALL open ONE overlay with three steps:
search (the input pre-filled from the current display name), candidates (the
source's served order rendered verbatim), and confirm (stating plainly what
replaces what). The search step SHALL show the current match for
orientation — the served metadata identity (title, kind, year, score) when
the served about block carries them, the honest none-state when the row
carries no match. A search in flight SHALL render as a quiet text line,
never a spinner. Zero candidates SHALL render the honest empty state
suggesting the original title or the source id. A failed search SHALL
render the canonical inline error with retry disabled, the overlay staying
open. The candidates step SHALL offer a source picker built from the served
`refresh_sources` bindings when more than one is served, defaulting to the
first. The confirm step SHALL name the picked title and state that
description, genres, and facts re-pull from the source while the display
name stays. Confirm SHALL `PUT /api/v1/series/{id}/identify` with the picked
`{source_id, external_id}`, invalidate the series reads on the 202, state
the background-refresh staleness honestly, and collapse via the
awaited-mutation idiom; a canonical error renders inline with the overlay
open. The overlay SHALL obey the CardActions shell idioms (the Escape
matrix, awaited collapse, inline errors). A candidate's poster SHALL render
from the served URL when the source carries one and be honestly absent when
it does not.

#### Scenario: Search opens pre-filled with the current match for orientation

- **WHEN** the operator opens the series identify overlay on a series whose
display name is "Aria" and whose served metadata names «Проснись, Ария!»
- **THEN** the search input is pre-filled with "Aria" and the current-match
line names the served match with its kind, year, and score
<!-- wf:probe id=4f17167b11654553 -->
```bash
set -e
test -f web/src/components/manage/IdentifySeries.tsx
grep -q 'data-testid="identify-search-input"' web/src/components/manage/IdentifySeries.tsx
grep -q 'data-testid="identify-current-match"' web/src/components/manage/IdentifySeries.tsx
```
<!-- /wf:probe -->

#### Scenario: Candidates render the served order verbatim

- **WHEN** the search answers three candidates carrying titles, years,
kinds, episode counts, and posters
- **THEN** the list renders them in the served order with the served fields,
the optional poster rendering from its served URL when present, and no
client-side re-scoring or re-sorting exists in the component
<!-- wf:probe id=696a6aa22b39159b -->
```bash
set -e
grep -q 'data-testid="identify-candidate"' web/src/components/manage/IdentifySeries.tsx
if grep -qE '\.sort\(' web/src/components/manage/IdentifySeries.tsx; then exit 1; fi
```
<!-- /wf:probe -->

#### Scenario: The search states render honestly

- **WHEN** the search is in flight, answers zero candidates, and separately
fails
- **THEN** the in-flight state is a quiet text line (no spinner), zero
candidates render the suggest-original-title-or-source-id empty state, and
the failure renders the canonical inline error with retry disabled while
the overlay stays open
<!-- wf:probe id=7081cde90fb10bf5 -->
```bash
set -e
grep -q 'data-testid="identify-searching"' web/src/components/manage/IdentifySeries.tsx
grep -q 'data-testid="identify-empty"' web/src/components/manage/IdentifySeries.tsx
grep -q 'data-testid="identify-error"' web/src/components/manage/IdentifySeries.tsx
```
<!-- /wf:probe -->

#### Scenario: Confirm states the replacement plainly and PUTs the override

- **WHEN** the operator picks a candidate and confirms the replacement
- **THEN** the confirm step names the picked title and states that
description, genres, and facts re-pull while the display name stays, the SPA
PUTs `/api/v1/series/{id}/identify` with the picked source_id and
external_id, and the 202 invalidates the series reads with the staleness
copy
<!-- wf:probe id=1bdd78db58439891 -->
```bash
set -e
grep -q '/identify' web/src/lib/api.ts
grep -q 'data-testid="identify-confirm"' web/src/components/manage/IdentifySeries.tsx
```
<!-- /wf:probe -->

#### Scenario: The row gates on the wired chain

- **WHEN** a library's module block is absent or its chain is empty
- **THEN** the series card's menu offers no Identify… row — the designed
empty state, never spinners
<!-- wf:probe id=bb7791e40f40101e -->
```bash
set -e
grep -q 'identify={seriesIdentifyGate' web/src/pages/collections/Collection.tsx
```
<!-- /wf:probe -->
