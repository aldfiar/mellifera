# Proposal

## Why

The native TV client (`tv.mellifera`, change `android-tv-app`) shipped its browse
surface with self-contained layouts that already drifted from the web UI: the
2026-11-12 on-device audit (relay-adb walk, screenshots + a11y dumps in
`.tmp/tv-ui-backup-2026-11-12/`) found every default-styled text rendering
black-on-black (no `MaterialTheme` — titles, loading and error rows invisible,
"the app shows only posters"), and episode rows with no click wiring at all
("selecting an episode, nothing happens"). Both are now fixed in the working
tree, but they prove the real gap: the TV app has no layout contract tying it to
the web UI, so every surface grows bespoke and every web-UI feature needs a
fresh TV design decision. The user goal is one product: the TV app renders the
SAME layouts as the web UI, dpad-native, and features are designed once in the
web UI and mirrored on TV by standing laws — the same laws the browse surface
already proved (field-driven rendering, cursor-in-state dpad law, focus visual
law, back restoration).

## What Changes

- A layout-parity guideline (design.md) that ports the browse surface's proven
  laws to every remaining surface and maps each SPA surface → its TV layout:
  Home (Collections → Continue → Next up), series detail (hero + Synopsis +
  episodes with progress), module-keyed collection bodies (serial/tv/image/
  unknown), card anatomy (poster, title, meta line, ONE ✓ state glyph, progress
  bar, type pastel accent), watch-flow affordances (skip chip, auto-next,
  OK-revealed info blocks).
- The two 2026-11-12 live fixes ride as group 1 (already in the working tree,
  APK `mellifera-tv-0.2.0-dpad-fixes`): app-wide dark `MaterialTheme` and
  episode-OK → `PlayerOrchestration.play(itemId)` wiring.
- The watched WORD chips («Просмотрено»/«Не просмотрено») are RETIRED in favor
  of the SPA's card state-signal scale law (one ✓ glyph, accent color, meta-line
  scale — user ruling 2026-11-04). The chips violate that law on TV today.
- No server deltas: every surface reads shipped endpoints the SPA already reads
  (`/progress`, series episodes, library summary, the packaged-playback
  descriptor). The TV app never invents endpoints or client-side derivations.

## Capabilities

- **New Capabilities:** `android-tv-client` (shares the capability path with the
  in-flight `android-tv-app` change whose delta is not yet archived — both
  deltas merge into the same living spec at archive; requirement titles do not
  collide). Adds the layout-parity requirements: text-visibility default, card
  state-signal scale, home surface, series-detail surface, module-keyed
  collection bodies, watch-flow affordances.
- **Modified Capabilities:** none (no spec-level behavior of the server or the
  SPA changes).

## Impact

- `android/src/main/java/tv/mellifera/**` only (UI layer + its JVM tests); no
  `web/`, no Go code, no new dependencies beyond what the scaffold pinned.
- Device evidence workflow (operator-assisted adb walks through the
  `.claude/skills/adb-local` relay) is the verification lane for on-device
  tasks; the TV box (192.168.0.215) cycles off the network every few minutes,
  so walks are batched single-window scripts.
- The SPA remains the design source of truth: when a web-UI feature lands, its
  TV mirror is added under this capability's requirements — never designed
  independently on TV.
