# Proposal — tv-style-parity

## Why

The TV app reads visibly off the SPA it mirrors: default text renders the
tv-material neutral (#E6E1E5) instead of the SPA foreground (#F8FAFC), four
ad-hoc muted idioms stand where one token should, every unriched item renders
a bare black rectangle where the SPA draws its pastel fallback, and the chip,
typography, focus and geometry idioms drifted (25 drifts, evidence in
`.tmp/android-tv-web-parity-proposal.md` §6, both sides file:line). This is
slice C of the parity design (`.tmp/android-tv-web-parity-design.md` §5) —
style only, zero behavior, zero wire — run FIRST so every later parity surface
(search rows, subtitle chips, toggle chrome) is born on the final token
surface instead of being swept twice.

## What Changes

- **S-1 token surface**: `ui/Colors.kt` becomes the single token home —
  `tvForeground` #F8FAFC, one shared muted `tvMuted` #94A3B8 replacing the
  four-idiom mix, destructive #7F1D1D + banner border/surface styling on
  Dead/Failed, in-progress fill #F8FAFC on the #1E293B track, rail-row
  selection #1E293B fill, the D3 pastel map absorbed from BrowseFlow; every
  token's KDoc names its SPA origin (selector + file).
- **S-2 missing-artwork fallback**: pure `fallbackGradient(name)` — FNV-1a
  hue law (+40..+119 second hue, 140° pastel gradient) + first-grapheme
  initial — JVM-pinned, rendered by the grid cards and home cards whose
  fixed-aspect art box would otherwise show bare canvas.
- **S-3 typography**: weights 600 titles / 500 secondary; card title 7sp,
  hero 10sp, pairing code 18sp monospace + letterspacing, episode titles 7sp
  over TWO lines; synopsis clamps 2; the `TypeScale.kt` "SPA 28px" wrong
  citation fixed with the size it annotates.
- **S-4 chip idiom + skip-fade repair**: pill chips (fully rounded,
  transparent, 1px #1E293B border, muted text; active solid #F8FAFC +
  #020617 text) on folder/facet/genre/settings chips; skip chips per-kind
  pastels (intro sky, credits violet), auto-next emerald, rounded + border;
  the skip chip's alpha ANIMATES over `SKIP_FADE_MS` (the constant is
  applied today, but the fade is a one-frame snap — design §3.6 resolved the
  audit conflict).
- **S-5 geometry ÷2 repairs (within-law corrections)**: gutter 16→6dp
  (SPA gap-3), hero poster 60×90→48×72dp (w-24 2:3), screen-edge overscan
  32dp→24dp/14dp constants (OQ-C rec), content column 0.60→0.92 (SPA tv
  shell `min(92vw, 1800px)`).
- **S-8 home chrome + tile clipping**: home cards gain the SPA card chrome
  (rounded-md border + p-3 ÷2, Home.tsx:407 law); artwork boxes clip to the
  card radius.
- **S-7 focus ring (decided-pending-GATE-1, OQ-B rec: adopt)**: slate
  #CBD5E1 outline, dpr-clamped width, element radius, NO scale — revises the
  L4 design-doc pin; on a declined ruling the fallback is keep-scale +
  recolor-slate and the task re-authors.
- **S-6 grid density: closes as documented-deliberate — NO code task.** The
  fixed-3 count ruling (`browse/LayoutParity.kt:38-42`, the operator's
  2026-11-16 ruling) stands; SPA auto-fill applies only if the operator
  reopens the ruling (Q2 rec: keep — encoded decided-pending-GATE-1).
- §6.3 follow-ups absorbed: TypeScale citation → S-3, SKIP_FADE wiring →
  S-4, the Colors.kt consolidation residual → S-1.
- Out of scope (slices A/B): Q1 MediaSession next/prev, OQ-D long-press,
  OQ-E household ledger semantics, OQ-F episode-row anatomy. No Go, web, or
  wire changes; no new Gradle dependencies.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `android-tv-client`: the visual token surface, the missing-artwork
  fallback, the typography scale, the chip idiom, the within-law geometry
  repairs, the home-card chrome, and the focus-ring law are added as
  style-law requirements; the episode-row clamp scenario moves from a
  one-line to a two-line slot.

## Impact

- Android Kotlin only: `android/src/main/java/tv/mellifera/` — `ui/`
  (Colors, TypeScale, Focus, App, SettingsSection), `browse/`
  (BrowseScreen, HomeRows, BrowseFlow, LayoutParity, new FallbackGradient),
  `playback/` (PlayerScreen, SkipSections), `pairing/` (PairingScreen) —
  plus the JVM test tree (tests updated in-task where they pin the moved
  constants; new `FallbackGradientTest` and `FocusRingTest`).
- Zero server delta, zero SPA delta, zero new dependencies — every idiom
  rides already-declared Compose/tv-material artifacts (the dependency
  surface lists no unmet import).
- Baseline (all green @ f6ae4c4): Go suite, web vitest, Android JVM 210
  tests. Duties run targeted JVM tests only; GATE 2 runs the full Android
  suite.
