# tasks - fix-hls-light-audio

# All verify duties run from the repo root in one shot (no setup, no
# context); targeted runs per the preferred-forms ladder. ONE group — the
# swap must land before the embedded dist regen (1.2 bakes 1.1's source
# into the committed //go:embed payload). The red repro test anchors 1.1:
# web/src/components/playback/PlayerHlsBuild.test.tsx fails today by
# exactly one vector (instanceof AudioTrackController on the instance the
# player built) and the whole-suite duty covers it red→green plus both
# mock-swap suites in one ~7s run. No full-suite Go anchors inside tasks —
# baseline + GATE 2 only; go build ./... in 1.2 is a compile check of the
# embed, never the test suite. TV retest on real hardware is a HUMAN
# acceptance step after deploy — never a task here.

## 1 - the import swap: Player loads the full hls.js build (web, internal/web/dist)

- [ ] 1.1 Import swap + ripple repairs (handoffs/wf-debugger.md §Exact fix): web/src/components/playback/Player.tsx:3 imports "hls.js" instead of "hls.js/light" (the ONLY production importer of the light specifier — the full dist's audio-track controller populates hls.audioTracks and fetches the EXT-X-MEDIA renditions, reviving the voiceover switch at Player.tsx:273–292 unchanged); the two fake mocks re-target "hls.js/light" → "hls.js" (web/src/components/playback/Player.test.tsx:44 and web/src/pages/browse/ItemDetail.test.tsx:1001 — otherwise they load the real full dist in jsdom, isSupported() false, packaged-attach vectors break); the stale LIGHT-build/D-12 rationale comment (Player.tsx:13–18) is rewritten to the full-build lane; web/src/types/hls-light.d.ts is NOT removed — the repro test's light-witness import + importActual (web/src/components/playback/PlayerHlsBuild.test.tsx:8,69) type through it, so its comment is rewritten from lane-rationale to witness-only (removal would fail tsc --noEmit); the repro test web/src/components/playback/PlayerHlsBuild.test.tsx turns green UNMODIFIED
  verify: set -e; cd web && npx vitest run || exit 1
- [ ] 1.2 Embedded dist regen committed: npm run build (tsc --noEmit + vite, outDir internal/web/dist — the //go:embed all:dist payload at internal/web/web.go:20) and COMMIT the regenerated dist (hashed assets swap; the porcelain probe below stays red until the regen is committed inside this task); OpenAPI untouched — no new endpoints, no wire change; go build ./... compiles the embed
  verify: set -e; cd web && npm run build >/dev/null 2>&1 && cd .. && test -z "$(git status --porcelain internal/web/dist)" && go build ./... || exit 1
