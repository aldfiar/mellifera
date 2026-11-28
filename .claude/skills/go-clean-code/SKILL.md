---
name: go-clean-code
description: How to write and review Mellifera Go code — the comment law (doc comments only on exported API and interface types, WHY-only body comments, no WHAT narration) plus the base Go principles — clarity/SOLID/DRY at Go scale, concurrency rules, performance rules, language pitfalls. Load before editing any .go file, when adding comments or docs, or when trimming "too many comments".
---

# Go clean code — the comment law and the core principles

## When to use

- Writing or reviewing any Go file — apply the decision tree before adding
  a comment or doc comment.
- The user flags "too many comments/docs" in a Go file or asks for a
  comment cleanup pass.
- Deciding whether a symbol needs a doc comment (exported/interface: yes;
  self-describing unexported: no).
- Writing or reviewing Go logic — the design, concurrency, performance, and
  pitfall rules below apply, not just the comment law.

A comment is a confession that naming or structure failed. First make the
code say it (better name, smaller function, an honest type); only what
survives that gets written down.

Composes with `mellifera-build` (module structure and complexity budget),
`coding-principles` (SOLID/DRY theory), and `stack-patterns` (Go imports/
errors) — this skill carries the comment law and the Go-specific rules.

## Decision tree (per symbol)

| Symbol                              | Comment                                        |
|-------------------------------------|------------------------------------------------|
| Exported (public API surface)       | REQUIRED — doc the contract, 1-3 lines         |
| Interface type                      | REQUIRED — contract semantics, not the impl    |
| Package with a non-obvious purpose  | one short paragraph (doc.go for real contracts)|
| Unexported, self-describing         | NONE                                           |
| Unexported, non-obvious             | WHY only, 1-3 lines                            |

Self-describing test: can a reader predict the behavior from name +
signature in ten seconds? If yes, any comment is noise.

Exported ALWAYS gets a doc comment even when self-describing — godoc is the
public interface (`pkg/sdk` is a consumed SDK; its `doc.go` is the pattern).
In mellifera this is policy, not tooling: `.golangci.yml` enables no
comment linter (no revive/golint).

## Doc comments: contract, not narration

- Start with the symbol name (godoc convention).
- State the contract: what it returns, what it guarantees, how failure
  floors. NOT a step-by-step replay of the body.
- Trivial exported pass-throughs get ONE line.

Bad (narration — restates the body, real example from
`cmd/mellifera/browse_wiring.go`):

	// corpus walks the whole media corpus — the boot build's and every drift
	// rebuild's input (browse.Deps.Corpus). Walk failures are log-and-skip per
	// library; a whole-walk failure floors to the empty corpus (the honesty
	// backstop keeps serving truthful — recall alone degrades until the next
	// pass).

Good (contract, compressed):

	// corpus returns the whole-corpus walk; failure floors to the empty
	// corpus (honesty backstop D3 — recall degrades, serving never lies).

## Body comments: WHY only

Write one ONLY for:

- a hidden invariant or constraint (cache cleared per pass; who holds the
  lock and why)
- a workaround with a reason (bug link, upstream quirk)
- a deliberate floor/degradation the signature cannot show
- a one-line pointer to the governing decision, e.g.
  `// 60 s locked (browse-scale D4), not a knob`

Never: step narration of the code below it; restating the name ("facetIDs
resolves facet ids"); tutorial prose; TODO/FIXME (those live in specs);
commented-out code; essay headers on small helpers.

Proportion rule: a comment longer than the code it describes means the
rationale belongs in the spec/design doc — leave the one-line ID pointer in
the code.

## Base principles (clarity, SOLID, DRY)

Canonical source: https://google.github.io/styleguide/go/best-practices.html
(the tie-breaker when rules here and the guide disagree). Core law:
CLARITY over cleverness — simple, readable code wins; simplicity is traded
for speed only when a profile names the hot path.

- SRP at Go scale: one package = one concern; funlen (60 lines) and
  gocognit (15) already lint the function level — split before they fire.
- Interfaces belong to the CONSUMER: define them where they are used
  (domain ports), not beside the concrete type "just in case". Accept
  interfaces, return concrete structs.
- Liskov by contract: an implementation may strengthen guarantees, never
  weaken them (a floor that lies violates descriptor honesty).
- Dependency inversion = manual constructor injection in cmd/; depguard
  denies reflect and DI frameworks — flat main.go wiring only.
- DRY, Go-flavored: a little copying beats a little dependency. Extract
  when copies must stay in lockstep; sanctioned when they evolve
  independently across a seam (viewTitleFloor mirrors the unexported
  composer floor). dupl (threshold 100) is the tripwire.
- YAGNI: no speculative generality; no interface wrapper around a concrete
  type without a second implementer or an architecture boundary (a port)
  to justify it.

## Concurrency rules

- Every goroutine has a known owner and an exit path (ctx cancel or
  channel close). A goroutine you cannot stop is a leak.
- context.Context is the FIRST parameter, never a struct field; every
  request-scoped context gets `defer cancel()`.
- Channels move data ownership; sync.Mutex guards state. Pick one per
  resource and don't mix.
- Locks live on pointer receivers; never copy a sync type (govet copylocks
  is on). Critical sections stay tiny — no I/O or unknown calls under a
  lock (the browseComposer namers cache is the shape).
- x/sync/errgroup for fan-out with error propagation; WaitGroup for pure
  joins. Buffered channels only to bound producer memory — never to paper
  over a deadlock.
- Concurrent code runs under -race before it ships; tests exercise the
  contested state, not one happy interleaving.

## Performance rules

- Measure FIRST: no optimization without a named hot path (a benchmark in
  _test.go or a pprof profile). Clear-but-slow beats fast-but-clever until
  proven otherwise.
- Preallocate what you can size: `make([]T, 0, n)` / `make(map, n)` when
  the count is known (the browse_wiring walk does this).
- Build strings in loops with strings.Builder; never `+=`.
- Watch slice/map aliasing: slices share backing arrays — copy on
  ownership transfer, and don't retain a small slice of a huge array (it
  pins the whole array).
- Receiver choice: a value receiver copies the struct — big structs take
  pointers; small read-only value types (time.Time, naming.Namer) are
  fine by value.

## Language pitfalls

- defer in a loop accumulates until the FUNCTION returns — close
  explicitly or hoist the body into a helper.
- nil map reads fine, writes panic. JSON: nil slice encodes as null, empty
  slice as [] — pick deliberately at API boundaries.
- Loop variables are per-iteration since Go 1.22 (repo is on go 1.25) —
  closure capture is safe here; code shared to older toolchains pins with
  `v := v`.

## Trimming an existing file

Grounded anchors (comment lines / total, measured 2026-11, post-cleanup):
`stream/describe.go` 31%, `stream/pack.go` 28%, `module/registry.go` 27%,
`main.go` 23%, `browse_wiring.go` 19%. Doc-heavy wiring/API files sit
19–31% after a full trim — the ~10-15% band fits plain-logic files, not
doc-mandated exported surfaces. Small-file floor: `internal/pack/pack.go`
62% (18/29 lines — three contract-mandated exported types; proportion,
not noise).

When EDITING a function: shed its comment if the resulting code is
self-describing; compress surviving WHY to 1-3 lines. Do NOT comment-sweep
untouched files as a drive-by — full-file cleanup is its own explicit task:

1. Delete every WHAT-narration comment and restated-name doc comment.
2. Compress multi-paragraph essays to 1-3 WHY lines + the spec/decision ID.
3. KEEP: SPDX/file headers (all files carry them), exported doc comments
   (shortened to contract), genuinely non-obvious WHY (the namers-cache
   lifetime block in browse_wiring.go is a legitimate keep, compressed).
4. Helper example: `lastPathSegment` carried a two-line provenance essay →
   delete it, or one line `// mirrors the naming composer's unexported
   floor.` if the provenance matters.

## Verification after a trim

`gofmt -l .` (reflowed comments can break `lll` line-length 120), then
`go build ./... && go vet ./...` for touched packages; run the touched
package's tests even though comment deletion alone can't break them.

Cross-references: quality vocabulary → `code-quality` (comment policy, size
limits); Go idioms/imports/errors → `stack-patterns` (go); architecture →
`go-development`; SOLID/DRY vocabulary → `coding-principles`; Google Go
style guide (canonical): https://google.github.io/styleguide/go/best-practices.html
