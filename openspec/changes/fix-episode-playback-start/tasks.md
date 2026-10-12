# Tasks: fix-episode-playback-start

Single group, no DAG branch (1.2 gates 1.1's outcome and edits nothing).
Probe CWD is the repo root; both probes `cd` into `web/` absolutely. Group 1
anchors on the diagnosis repro `web/devproxy.test.ts` — box 1.1 commits it
unchanged; its probe FAILS on today's code (the `/media` assertion) and
passes only after the proxy entry lands; box 1.2 is the regression gate and
edits nothing. Probe id derivation for this skip_specs change (task-anchored
grammar): an id is the first 16 lowercase hex chars of sha256 over the box's
task line from `- [ ]` through the end of the line, EXCLUDING the trailing
`[probe:<id>]` link suffix — `printf '%s' "<task line sans suffix>" |
shasum -a 256 | cut -c1-16`. `wf change tick` re-runs a box's probe and is
the only writer of `[x]`; the `<!-- wf: source_fingerprint=... -->` marker
is written by wf at tick time, never by hand.

## 1. Dev proxy: /media reaches the Go origin on :5173

- [x] 1.1 `web/vite.config.ts`: add `"/media": "http://127.0.0.1:8080"` to the `server.proxy` table, beside the existing `/api` and `/docs` entries — the whole fix. Why: the playback surface mounts at `/media` (`internal/stream/service.go` `mediaPrefix`), the descriptor's `play_url` is root-relative under it (`web/src/lib/api.ts`), and the Player attaches it verbatim (`video.src` / `hls.loadSource` in `web/src/components/playback/Player.tsx`); with `/media` missing from the table the Vite dev server answers media requests with the SPA fallback (`200 text/html`, index.html) instead of media bytes, so playback can never start on :5173 — every item, both lanes. Commit `web/devproxy.test.ts` UNCHANGED (already on disk, untracked; currently fails on exactly the `/media` assertion) as the permanent repro and coverage. Placement constraints — the test stays at the web root under its current name: moved into `src/` it would import the composite-project `vite.config.ts` into the root tsconfig program and break `npm run build` with TS6305; renamed to any `vite.config.*`-named test it is swallowed by vitest's default exclude and silently stops running. Box probe (hermetic, self-contained — this wf build renders task-anchored probe blocks as unfound in envelopes): `cd /Users/aldfiar/projects/go/mellifera/web && npx vitest run devproxy.test.ts` — fails on today's code (the `/media` assertion), passes only after the entry lands. [probe:90dfd8e916727332]

<!-- wf:probe id=90dfd8e916727332 -->
```bash
cd /Users/aldfiar/projects/go/mellifera/web && npx vitest run devproxy.test.ts
```
<!-- /wf:probe -->

- [x] 1.2 Regression gate — NO edits belong to this box; it proves the group left the whole web project healthy: from `web/`, the full vitest suite passes (`npx vitest run` — the suite stood at 1 failed / 154 passed before the fix, the one failure being box 1.1's devproxy `/media` assertion, and everything passes after, the two devproxy tests included) and the type check stays clean (`npx tsc --noEmit` — clean before the change, must remain clean). Box probe (hermetic, self-contained): `cd /Users/aldfiar/projects/go/mellifera/web && npx vitest run && npx tsc --noEmit`. [probe:aa0e4f0fd6612c23]

<!-- wf:probe id=aa0e4f0fd6612c23 -->
```bash
cd /Users/aldfiar/projects/go/mellifera/web && npx vitest run && npx tsc --noEmit
```
<!-- /wf:probe -->
