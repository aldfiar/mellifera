# Gate 2 Review — fix-tv-server-ua

Reviewer: wf-reviewer · 2026-11-02 · Range `git diff 918a03f..3d0ed10` (6 files, +296/−58)

## Verdict per axis

| Axis | Verdict | Evidence (one line) |
|---|---|---|
| Re-verify (all green tasks) | **PASS** | `wf pipeline verify --by wf-reviewer`: 1.1 exit 0 (66/66 tvmode), 1.2 exit 0 (`ok internal/web` 0.423s), 1.3 exit 0 (17.1s — fresh `make web-build` byte-identical, `git status --porcelain dist+api` empty, `go build ./...` ok); receipts re-journaled. |
| Full-suite anchors | **PASS** | `go test ./...` rc 0 (every package ok, incl. itest 300s); `web` vitest 41 files / 595 tests rc 0; `npx tsc --noEmit` rc 0. |
| Diff vs spec delta | **PASS** | All four ADDED requirements hold in shipped code (evidence below); internal/web/api delta EXACTLY ZERO; REMOVED clause retired per the GATE 1-approved restructure. |
| Standards | **PASS** | No hard violations; three judgement-call notes below (string-surgery choice, defensive redundancy in the reader, none load-bearing). |
| Strict validate | **PASS** | `npx --yes -p @fission-ai/openspec@1.14.0 openspec validate fix-tv-server-ua --strict` → "Change 'fix-tv-server-ua' is valid", rc 0, zero ❌. |

`wf pipeline status fix-tv-server-ua`: 3/4 green — git-check red by design (see Pending Fixes). All three authored tasks green under the cmd-match rule.

## Diff-vs-delta evidence

- **Server-UA decisive** ("The server-observed user agent detects a TV decisively"): `serverUserAgent` enters the strong scan only — `web/src/lib/tvmode.ts:97-101` — the weak `\bTV\b` token and `corroboratesTvShape` are untouched by the diff; guard rows `server_ua_desktop_stays_desktop` and `server_ua_weak_token_never_corroborates` pin "never a corroboration input" (`web/src/lib/tvmode.test.ts:318-332, 359-377`, the latter at corroborating 960×540 zero-touch so the clause genuinely bites); override law `resolveTvMode` (`tvmode.ts:111`) untouched; `probeTvModel` keeps the upgrade-only contract through the `readTvEnvironment` spread (`tvmode.ts:186-189`). The 4 debugger repro rows pass with expectations unchanged.
- **Shell carries UA** ("The SPA shell carries the caller's user agent"): `html.EscapeString` into `<meta name="mellifera-client-ua">` after the FIRST `<head>`, `strings.Replace(…, 1)`, per-request copy — `internal/web/web.go:88-91`; both call sites pass `r` (`web.go:66, 76`); no-cache on root and fallback asserted by the pre-existing rows `root_serves_index_no_cache` / `client_route_falls_back_to_index` (`web_test.go:59-66, 74-81`); no-UA omission guarded (`web_test.go:285-298`, with a premise guard on httptest's own UA); embedded shell byte-stable at rest — `git show 3d0ed10:internal/web/dist/index.html` is the plain Vite shell with no meta baked in, re-pointed to `index-BvNIFsq3.js`; `mellifera-client-ua` present in the bundle (grep count 1); `internal/web/api` absent from the range diff.
- **Tolerance** ("The SPA tolerates a missing or garbled server user agent"): `readServerUserAgent` floors absent/empty/whitespace/garbled to undefined — `tvmode.ts:144-153`; 4 floor rows + 1 decisive boot row through the exported `applyTvMode` chain (`tvmode.test.ts:393-433`); the absent-meta row covers the Vite dev-proxy path.
- **Injection-inert desktop** ("Desktop rendering is injection-inert"): sole reader of the meta is `readServerUserAgent` (repo sweep: no CSS, no other src reference); the meta is the only added DOM node; the desktop suite passes untouched (595/595).
- **Task-scope conformance**: module keeps exactly its 7 exports (`tvmode.ts:26, 31, 36, 93, 111, 125, 203`); no new routes, no swag annotations, no DevMode changes; the range touches exactly the 6 files the tasks name.

## Standards axis — judgement-call notes (no hard violations)

- String surgery over a template engine (`web.go:91`): repo-first (no template execution precedent anywhere), single injection point, embedded bytes stay stable at rest — justified and documented in the handler comment (`web.go:77-81`).
- `readServerUserAgent` computes `content.trim()` twice and carries a redundant `typeof` guard (`tvmode.ts:149-152`) — defensive redundancy, negligible cost, consistent with the task's defensive-reader mandate.
- Test shapes are honest: surface-level HTTP assertions with a premise guard (`web_test.go:289-291`); jsdom rows clean up their own stubs (`tvmode.test.ts:412-417`); table-driven floors. No garbage tests, no mock-the-unit-under-test.

## Pending Fixes

- **git-check red by design** — 3 fix commits (209cb6b, 6f61490, 3d0ed10) unpushed + the untracked change folder `openspec/changes/fix-tv-server-ua/`. Session commits + pushes at close (fix-autodetect gate precedent). Not a task failure; the built-in git-check duty stays open until the close-time commit/push.

Gate: **Approved** — Pending Fixes: git-check (close-time commit + push).
