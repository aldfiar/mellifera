# Task 01 — internal/enrich/state.go: add `ready`/`stale` states + exercise `retry`

- **Type:** coder
- **Step:** 1 (Outline)
- **Seams:** S2 (state machine)
- **AC trace:** AC-states, AC-2
- **Project scope:** `.` (root; MODIFY `internal/enrich`)
- **Deps:** none (leaf — Phase A `state.go` exists)
- **Estimated LOC:** ~40 (XS)

## behaviors

- **B1** Add two new status literals to the canonical set owned here: `statusReady = "ready"` (async settlement — all queueable sources terminal: done or terminal-failure-in-cooldown) and `statusStale = "stale"` (re-scan detected the file changed since its last good scan → re-enrich). | ac: AC-states | kind: normal
- **B2** Add three new events: `evSettled` (`enriched → ready`), `evStale` (`* → stale`), `evRehydrate` (`stale → pending`). | ac: AC-states | kind: normal
- **B3** Encode the new LEGAL transitions as rows in the `transitions` map (data, not `switch` arms — INV-pure-table): `enriched --settled--> ready`; `new|pending|parsed|enriched|ready|failed --stale--> stale`; `stale --rehydrate--> pending`; `stale --deleted--> deleted`. | ac: AC-states | kind: normal
- **B4** `retry` (`failed --retry--> pending`, already a row at `state.go:65` and defined-but-unexercised in Phase A) remains a legal transition; B1 does NOT remove it — the queue (Task 05) now exercises it. Document this in the table comment. | ac: AC-states | kind: normal
- **B5** Every transition NOT in the table is ILLEGAL — `nextState` returns a non-nil error (the map-miss), unchanged from Phase A. Concretely `ready --parsed-->` and `ready --begin-->` are illegal (ready is terminal-success). | ac: AC-states | kind: error

## invariants

- **INV-pure-table:** `nextState` stays a PURE function (no I/O). Every legal transition is a `transitions` map row; every illegal transition is the map-miss that returns an error. Add states/transitions as ROWS, never `switch` arms. (conventions.md §State machine discipline.)
- **INV-status-owner:** the canonical status string set `{new,pending,parsed,enriched,failed,deleted}` + `{ready,stale}` (B1) lives HERE as unexported literals. The store stays value-agnostic (owns only the column + DEFAULT `'new'`). The acceptance.md state machine is the authority.
- **INV-reject-illegal:** the caller MUST NOT persist an illegal transition — it checks the error. `nextState` never silently coerces.
- **Legal-transition set after B1** (the authority — acceptance.md §Lifecycle state machine):
  - (existing) `new--begin-->pending`, `pending--parsed-->parsed`, `parsed--begin-->pending`, `pending|parsed--enriched-->enriched`, `new|pending|parsed|enriched--failed-->failed`, `failed--retry-->pending` (now exercised), `*--deleted-->deleted`.
  - (B1 new) `enriched--settled-->ready`; `new|pending|parsed|enriched|ready|failed--stale-->stale`; `stale--rehydrate-->pending`; `stale--deleted-->deleted`.
  - (B1 illegal examples the test MUST assert rejected) `ready--parsed-->`, `ready--begin-->`, `ready--enriched-->`, `stale--parsed-->`, `stale--begin-->`.

## precondition

Phase A `internal/enrich/state.go` exists with the canonical literals (`state.go:11-18`), the `enrichEvent` consts incl. `evRetry` (`state.go:24-31`), the `transitions` map incl. `{statusFailed, evRetry}: statusPending` (`state.go:51-67`), and the pure `nextState` fn (`state.go:74`).
- evidence: `internal/enrich/state.go:11-18` (literals), `:29` (`evRetry`), `:65` (`{statusFailed, evRetry}: statusPending`), `:74-80` (`nextState`).
- evidence (consumer): `internal/enrich/enrich.go:120` (`advance` calls `nextState`); `internal/enrich/enrich_test.go:283` (`TestNextState` table — the test to extend).

## postcondition

`internal/enrich/state.go` carries `statusReady`,`statusStale` literals + `evSettled`,`evStale`,`evRehydrate` events + the new legal-transition rows; the `TestNextState` table in `enrich_test.go` is EXTENDED to enumerate every new legal transition AND assert the new illegal ones (e.g. `ready--parsed-->`) are rejected. `nextState` remains pure. `go test ./internal/enrich/...` green.

## test_seed

Extend the existing `TestNextState` table (`internal/enrich/enrich_test.go:283`) — do NOT rewrite it. Add `statusReady`,`statusStale` to the `states` slice and `evSettled`,`evStale`,`evRehydrate` to the `events` slice (the illegals-enumeration loop then auto-covers the new illegal pairs). Add legal rows:
- `{statusEnriched, evSettled, statusReady}`
- `{statusNew, evStale, statusStale}`, `{statusPending, evStale, statusStale}`, `{statusParsed, evStale, statusStale}`, `{statusEnriched, evStale, statusStale}`, `{statusReady, evStale, statusStale}`, `{statusFailed, evStale, statusStale}`
- `{statusStale, evRehydrate, statusPending}`
- `{statusStale, evDeleted, statusDeleted}`
Table-driven, in-package (literals are unexported). Assert `illegal > 0` (the existing guard) and specifically that `nextState(statusReady, evParsed)` returns an error.

## callers_to_update

- `internal/enrich/enrich_test.go` — EXTEND `TestNextState` (`enrich_test.go:283-332`) with the new states/events/rows. evidence: `internal/enrich/enrich_test.go:283`.
- (no production caller change — `advance()` (`enrich.go:120`) consumes `nextState` unchanged; the new transitions are emitted by the queue in Task 05 and by scan in Task 06.)

## allowed_imports

- `fmt` (stdlib — already the sole import)

## allowed_categories

- `stdlib`

## test_exclusions

- `nextState` IS logic (the transition table) — NOT excluded; the full legal/illegal table test is required (check.sh mandates a co-located test per behavior-bearing symbol, and `nextState` is the load-bearing one).
- The status literals and event consts are data — covered via the `nextState` table (consumed/asserted), no standalone test.

## negative_examples

- DO NOT add `switch` arms for the new transitions — they are MAP ROWS (INV-pure-table). A `switch`/`if` here is a conventions violation.
- DO NOT export the status literals or events (the set stays unexported; store is value-agnostic).
- DO NOT persist a status the store cannot round-trip — `ready`/`stale` are plain TEXT column values (`items.status` `open.go:72`); no store change.
- DO NOT remove or rename the existing `evRetry`/`{statusFailed, evRetry}` row — it is now exercised by the queue.

## existing_code_snapshot

```go
// internal/enrich/state.go:11-18
const (
	statusNew      = "new"
	statusPending  = "pending"
	statusParsed   = "parsed"
	statusEnriched = "enriched"
	statusFailed   = "failed"
	statusDeleted  = "deleted"
)
// internal/enrich/state.go:24-31
const (
	evBegin    enrichEvent = "begin"
	evParsed   enrichEvent = "parsed"
	evEnriched enrichEvent = "enriched"
	evFailed   enrichEvent = "failed"
	evRetry    enrichEvent = "retry"    // Phase B retry (failed -> pending)
	evDeleted  enrichEvent = "deleted"
)
// internal/enrich/state.go:65
	{statusFailed, evRetry}: statusPending,
```
The `transitions` map (`state.go:51-67`) and pure `nextState` (`state.go:74-80`) are the edit targets; their shape is unchanged (add rows + literals only).

## contract_test_scope

- **joint (S2):** `internal/enrich.nextState table` | assert: every new legal transition yields the documented next status; every illegal transition (incl. `ready--parsed-->`, `ready--begin-->`) returns a non-nil error. Verified in this task's extended `TestNextState`.

## scope_boundary

- MODIFY `internal/enrich/state.go` (add 2 literals, 3 events, ~9 transition rows; extend the doc comment).
- MODIFY `internal/enrich/enrich_test.go` (extend `TestNextState` only — do not touch `TestEnrich`/`TestValidateNamespace`).

## out_of_scope

- The queue emitting `settled`/`stale`/`rehydrate` (Task 05) and scan emitting `stale` on re-scan change (Task 06). This task only LANDS the states + transitions + their table test.
- Any store / SQL / migration change (none — `items.status` already holds arbitrary TEXT).

## line_budget

40 (flex 1.2)

## acceptance_criteria

- AC-states (ready/stale/retry via nextState)
- AC-2 (gates — state.go stays small, table test green)

## refactoring_checklist

- `cd mellifera && go test ./internal/enrich/...` green.
- `grep -nE 'statusReady|statusStale|evSettled|evStale|evRehydrate' internal/enrich/state.go` → ≥6 hits (all new symbols present).
- `grep -nE 'switch|case ' internal/enrich/state.go` → 0 hits in `nextState` (pure-table preserved; the existing file has no switch — keep it that way).
- `./.claude/skills/mellifera-build/scripts/check.sh` OK (enrich symbol count unchanged here — new symbols are unexported literals).

## source_anchor

`internal/enrich/state.go:11-18` (literals block — INSERT `statusReady`/`statusStale`), `:24-31` (events block — INSERT `evSettled`/`evStale`/`evRehydrate`), `:51-67` (transitions map — INSERT new rows), `:74-80` (`nextState` — no body change). Test: `internal/enrich/enrich_test.go:283-332`.

## skill_hint

`mellifera-build`, `grounding`, `stack-patterns`
