# Proposal

## Why

The SPA plays every multi-audio pack silent — video only. Prod-proven
2026-11-01 by full-vs-light discrimination on itm_3_27f11ecc1129499d (the
seed record at `handoffs/wf-debugger.md` is authoritative): every
rendition-layout pack mounts with zero audio on any MSE device, the TV
included, and the voiceover switch (`Player.tsx:273–292`) can never match —
`hls.audioTracks` never populates, so the `EXT-X-MEDIA` audio renditions are
never fetched. The regression rode in with the light-build lane itself
(packaged-playback D-12); fix-tv-unblock-2's close-out flagged the swap as
the pending remainder.

Root cause, confirmed in-tree: `web/src/components/playback/Player.tsx:3`
imports `hls.js/light` — the ONLY production importer of that specifier —
and the light dist ships no audio-track controller. hls.js 1.7.3's full dist
injects `audioTrackController: AudioTrackController` into `defaultConfig`;
light injects `undefined`, and `createController` answers null when the
class is absent. The delegation getters exist in BOTH dists (`get
audioTracks` returns `[]` behind a null controller), so the API surface
looks wired while the machinery is dead. No existing test caught it: the
suite rides the module-seam fakes that fabricate `audioTracks` — mocking
away exactly the missing capability — which is why 421 tests stayed green
while the product was broken. The diagnosis authored the missing
import-axis test (`PlayerHlsBuild.test.tsx`), RED today by exactly one
vector; manifest-parse/runtime playback behavior remains untested and stays
out of scope (heavier integration territory).

## What Changes

- **The import swap** (the fix): `Player.tsx:3` — `"hls.js/light"` →
  `"hls.js"`. The full build's audio-track controller populates
  `hls.audioTracks` from the master's `EXT-X-MEDIA` groups and fetches the
  renditions; the voiceover switch revives unchanged — its gating on the
  tracks populating was correct all along.
- **Mock ripples**: the two fake mocks re-target to `"hls.js"` —
  `Player.test.tsx:44` and `pages/browse/ItemDetail.test.tsx:1001` —
  otherwise they load the REAL full dist in jsdom (no MediaSource →
  `isSupported()` false) and packaged-attach vectors break. The repro
  test's own capture mocks stay as authored — they are the discriminator's
  witness vectors, pinned so a dependency bump re-derives it.
- **Stale rationale debt**: the LIGHT-build/D-12 comment block
  (`Player.tsx:13–18`) is rewritten to the full-build lane;
  `web/src/types/hls-light.d.ts` is NOT dead — the repro test's
  light-witness import and `importActual` (`PlayerHlsBuild.test.tsx:8,69`)
  type through the shim, so removing it fails `tsc --noEmit` — it stays,
  its comment rewritten from lane-rationale to witness-only.
- **Committed embedded dist regenerated**: vite build into
  `internal/web/dist` (the `//go:embed all:dist` target, `web.go:20`) and
  committed — the TV payload carries the full build. OpenAPI untouched: no
  new endpoints, no wire change.
- **The repro turns green unmodified**: `PlayerHlsBuild.test.tsx` asserts
  `hls.audioTrackController` `toBeInstanceOf(AudioTrackController)` on the
  instance the player built — the import swap alone turns it green;
  reverting re-reddens it.

**Accepted bundle cost (disclosed)**: vite.config has no manualChunks, so
hls rides the main chunk served to the TV. Minified ESM 371,222 → 593,080 B
(+221,858 ≈ +217 KiB, +59.8%); gzip -9 of min 115,540 → 180,780 B
(+65,240 ≈ +64 KiB over the wire, +56.5%).

**Non-goals**: no manifest-parse/runtime playback test expansion (the
import-axis gap is what closes); no server-side change of any kind — packs,
descriptors, endpoints, OpenAPI untouched; no manualChunks/bundle-splitting
work — the cost is accepted as disclosed. **TV retest on real hardware is a
HUMAN acceptance step after deploy** — listed here for visibility, never an
automatable task in this change.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

(none) — zero-delta change, `skip_specs: true`. Ruling: grep across
`openspec/specs/` for `hls.js/light|light build|D-12` finds nothing naming
the light build as the shipped lane; the web-ui spec's "Video playback in
the SPA" requirement is deliberately build-agnostic ("an `hls` item plays
the stream playlist through an HLS client library", `web-ui/spec.md:902`),
and its MSE-less refusal requirement stays true as written. The fix
conforms the implementation to the existing spec — no requirement text
changes, so no delta is authored.

## Impact

- `web/src`: `components/playback/Player.tsx` (import line 3 + the comment
  block), `components/playback/Player.test.tsx:44` and
  `pages/browse/ItemDetail.test.tsx:1001` (mock re-targets),
  `types/hls-light.d.ts` (comment only), `components/playback/
  PlayerHlsBuild.test.tsx` (already authored, untracked — turns green
  UNMODIFIED).
- `internal/web/dist`: regenerated and committed (vite build; hashed assets
  swap).
- No Go source change; no dependency change (the full dist is the same
  installed hls.js 1.7.3 package — the light specifier was a subpath of it);
  no OpenAPI change.

## Baseline (bootstrap, disclosed)

Worktree at `532f50f`, both green BEFORE the diagnosis dropped the repro
file into the tree: `go test ./...` rc 0; `cd web && npx vitest run` 31
files / 421 tests passed. Current tree adds the untracked repro test: 32
files / 424 tests, exactly ONE red — the repro vector (`expected null to be
an instance of AudioTrackController`, `PlayerHlsBuild.test.tsx:216`), the
red reality task 1.1 turns green. Full-suite anchors stay baseline + GATE 2
only; no task duty runs the full Go suite.

## Isolation

```json
{"mode":"worktree","name":"fix-hls-light-audio","branch":"feature/fix-hls-light-audio","base":"532f50f"}
```
