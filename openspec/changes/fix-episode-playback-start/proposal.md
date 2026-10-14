# Proposal: fix-episode-playback-start — the dev origin proxies /media so playback can start

## Why

Playback cannot start on the Vite dev origin (:5173): every item, both lanes
(direct and hls), dies before the first byte of media. The chain, verified
live by the diagnosis (the wf-debugger handoff record in this folder):

- the playback surface mounts at `/media` (`internal/stream/service.go`,
  `mediaPrefix`);
- the descriptor answers a root-relative `play_url` under it
  (`web/src/lib/api.ts`, `PlaybackDescriptor.play_url`);
- the Player attaches it verbatim — `hls.loadSource(descriptor.play_url)`
  and `video.src = descriptor.play_url`
  (`web/src/components/playback/Player.tsx`);
- `web/vite.config.ts`'s `server.proxy` covers only `/api`, `/openapi.yaml`,
  `/openapi.json`, `/docs` — `/media` is missing, so the Vite dev server
  answers media requests with the SPA fallback: `200 text/html` (index.html)
  instead of media bytes.

Live evidence: the same `play_url` fetched via :5173 returns `200
text/html`; via :8080 it returns `200 video/x-matroska` — the backend is
healthy, only the dev proxy is blind. Latent since `/media` shipped in
packaged-playback (79cb50c): the embedded :8080 topology is unaffected (Go
mounts `/media` before its SPA fallback), so the defect hid in dev-only
topology until an episode was played through :5173.

The repro is already on disk: `web/devproxy.test.ts` (untracked) — vitest,
node environment, imports the real `web/vite.config.ts` and asserts the dev
same-origin contract (`/api` AND `/media` must be proxied). It currently
fails on exactly the `/media` assertion; the full web suite stands at
1 failed / 154 passed with `npx tsc --noEmit` clean — no collateral.

## What Changes

- **Dev proxy (`web/vite.config.ts`):** `server.proxy` gains the one missing
  entry, `"/media": "http://127.0.0.1:8080"`, beside the existing four —
  the whole fix.
- **Repro committed (`web/devproxy.test.ts`):** the diagnosis repro is
  committed unchanged as permanent coverage of the dev same-origin contract.
  It stays at the web root under its current name: moved into `src/` it
  would drag the composite-project `vite.config.ts` into the root tsconfig
  program and break `npm run build` (TS6305); renamed to a `vite.config.*`-
  named test it would vanish into vitest's default exclude.

Explicitly out of scope (both faults recorded in this change's wf-debugger
handoff record, `handoffs/wf-debugger.json` — never boxes here):

- **Fault 2 (product decision, D-2):** the reported episode's audio is
  aac+ac3+eac3 (DDP); with opt-in codecs locked off, classification folds it
  to ClassDirectOnly and it cannot play ANYWHERE (dev or embedded) until the
  opt-in-knob/transcode decision ships. This change only restores the
  transport for playable items.
- **Fault 3 (residue):** pack-lane ffmpeg exit 254 rows from the boot sweep
  that ran while the media volumes were unavailable (stderr truncated to
  512 B, `internal/stream/pack.go:492`); never gates this fix.
- **The committed embedded build (`internal/web/dist`):** `server.proxy` is
  dev-only topology; the embedded topology never had the bug, so no rebuild.

## Capabilities

None — this change opts out of specs (`skip_specs: true` in
`.openspec.yaml`): the dev-server proxy table is developer tooling and
topology, not product behavior; no living spec's requirements change.

## Impact

- `web/vite.config.ts` — one `server.proxy` entry.
- `web/devproxy.test.ts` — committed unchanged (already on disk, untracked).
- Tests: the web suite goes from 1 failed / 154 passed to all green (the
  devproxy file contributes two tests); `npx tsc --noEmit` stays clean.
- No API/wire changes, no new Go or npm dependencies, no embedded-dist
  rebuild, no scanner/plugin changes.

## Verification

- **Probe (box 1.1, hermetic):** `cd mellifera/web && npx vitest run devproxy.test.ts`
  — fails now on the `/media` assertion; passes after the proxy line lands.
- **Regression gate (box 1.2):** `cd mellifera/web && npx vitest run && npx tsc --noEmit`.
- **HTTP confirmation (manual evidence, NOT a probe — needs the user's live
  dev servers):** GET the item's `play_url` through :5173 and confirm
  `200 video/x-matroska` instead of `200 text/html`.
