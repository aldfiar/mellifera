# Handoff — wf-debugger → fix-hls-light-audio (diagnosis, 2026-11-01)

## Root cause (confirmed in-tree)

`web/src/components/playback/Player.tsx:3` — `import Hls from "hls.js/light";` is the ONLY production importer of the light specifier in web/src. The light dist ships NO audio-track-controller: hls.js 1.7.3's `defaultConfig` injects `audioTrackController: AudioTrackController` in the full dist (dist/hls.mjs:38397) but `undefined` in light (dist/hls.light.mjs:23220); `createController` answers null when the class is absent. The delegation getters exist in BOTH dists (`get audioTracks` returns `[]` with a null controller) — that is why the API surface looks wired while the machinery is dead. Consequence: `hls.audioTracks` never populate, EXT-X-MEDIA audio renditions are never fetched → every rendition-layout pack plays silent video-only in the SPA on any MSE device (incl. TV), and the voiceover switch (Player.tsx:273–292, `hls.audioTrack =`) never matches. Prod-proven 2026-11-01 by full-vs-light discrimination (itm_3_27f11ecc1129499d, .tmp/handoff.md in the main tree).

## The repro test (the fix's first verify duty — RED today)

- Path: `web/src/components/playback/PlayerHlsBuild.test.tsx` (NEW, authored this diagnosis).
- Shape: pass-through capture mocks bound to BOTH specifiers ("hls.js" and "hls.js/light") over importActual; renders Player and asserts `hls.audioTrackController` `toBeInstanceOf(AudioTrackController)` ON THE INSTANCE THE PLAYER BUILT — so the one-line import swap turns it green without editing the test; reverting re-reddens it.
- Discriminator pinned by two witness vectors (full → instance; light → toBeNull) so a dependency bump re-derives it. First draft's `toBeDefined` was WRONG (null is defined) — the in-file witness caught it.
- RED tail: `AssertionError: expected null to be an instance of AudioTrackController` at PlayerHlsBuild.test.tsx:216 (main vector; the 2 dist witnesses pass).
- GREEN under simulated swap: scratch config `.tmp/vitest.hls-swap-sim.config.ts` (gitignored) aliases /^hls\.js\/light$/ → "hls.js"; `cd web && npx vitest run --config ../.tmp/vitest.hls-swap-sim.config.ts src/components/playback/PlayerHlsBuild.test.tsx`.

## Exact fix + ripples (for the fix tasks)

1. `web/src/components/playback/Player.tsx:3`: `"hls.js/light"` → `"hls.js"`.
2. `web/src/components/playback/Player.test.tsx:44` and `web/src/pages/ItemDetail.test.tsx:1001` (grep `vi.mock("hls.js/light"` to confirm) must switch to `vi.mock("hls.js")` — otherwise those suites load the REAL full dist in jsdom (no MediaSource → `isSupported()` false) and packaged-attach vectors break. Their fakes currently fabricate `audioTracks` — mocking away exactly the missing capability (why 421 tests stayed green while the product was broken).
3. Comment/type-shim debt the swap invalidates: Player.tsx:15–17 (LIGHT-build/D-12 rationale) and `web/src/types/hls-light.d.ts` (ambient shim typing light as the main entry — removal decision belongs to the fix task).

## Bundle delta (disclosure — accepted cost)

vite.config has NO manualChunks → hls rides the main chunk served to the TV. Minified ESM: 593,080 → 371,222 B (+221,858 B ≈ +217 KiB, +59.8%); gzip -9 of min: 180,780 → 115,540 B (+65,240 B ≈ +64 KiB over the wire, +56.5%).

## Coverage gap closed

No existing test caught this bug — the suite rides the module-seam fake. The new file closes the import-axis gap (manifest-parse/runtime behavior remains untested — heavier integration territory).
