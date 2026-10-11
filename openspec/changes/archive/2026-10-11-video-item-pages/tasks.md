<!-- wf: source_fingerprint=f6f8a19436f597c924622c932ff2cacafdaeffd5971a6d5427917bbfba2a549f -->
# Tasks: video-item-pages

Probe CWD is the project root. Probes are greps over `web/src` plus targeted
`vitest run` files (dev-time node for the SPA floor only — the Go gate stays
node-free); the delivery probe rebuilds the bundle (`npm run build`) and
asserts the committed dist is the fresh build. Probe bodies live in the spec
delta (`specs/web-ui/spec.md`); each box links one. Every fixture this change
touches must carry production-shaped media_type values (`tv`/`serial`/`image`)
— the synthetic `"video"` fixtures are the vacuous-fixture class that shipped
the dead gates. Group dependencies (DAG): 1 → 2 → 3; 2 → 4. Max concurrency
2: (3 + 4) after 2.

## 1. SPA: structural video-ness — the playback gate (R1)

- [x] 1.1 `web/src/lib/api.ts` gains the shared predicates beside the existing document-fact helpers: `isPhotoItem(item)` = `media_type === "image"`, `isVideoItem(item)` = `!isPhotoItem(item)` — the single definition site of the image/non-image split — and the `ItemDTO.media_type` doc comment is corrected to the production vocabulary (`"tv" | "image" | "serial"`; no scanner ever writes `"video"` — module registry seeds exactly these). `web/src/pages/browse/ItemDetail.tsx` swaps every `media_type === "video"` gate to `isVideoItem(item)` — the descriptor query's `enabled` (~line 324), the Player mount (~379), the watch-controls mount (~390), the media-first lane split (~449), the resume row in IdentityBlock (~838) — and the `isPhoto` splits (~198, ~289, ~312) read `isPhotoItem(item)` (the identity-block resume row takes the predicate as a prop or re-derives from `item` — implementer's choice). `web/src/pages/browse/ItemDetail.test.tsx` fixture moves to `media_type: "serial"` (with `module_id: "tv"`-style consistency or an explicit serial module id) and asserts the ready serial episode renders the video lane and mounts the Player when the mocked descriptor resolves [probe:7a4e2f2915af9172]
- [x] 1.2 Remaining suites' fixtures move to production-shaped values: `web/src/lib/api.test.ts` two item fixtures (`media_type: "video"` → `"tv"`, matching their `module_id: "tv"`), `web/src/pages/home/Home.test.tsx` `item()` helper (serial module → `media_type: "serial"`), `web/src/pages/collections/Collection.test.tsx` `item()` helper (derive from `moduleId`: `image` → `"image"`, `tv` → `"tv"`, `serial` → `"serial"`) — no `media_type: "video"` remains anywhere in `web/src` (the ffprobe `codec_type: "video"` stream fact in `document.test.ts` is a different datum and stays) [probe:f7e4e5f8f6fad844]

## 2. SPA: collapsed technical parity (R2)

- [x] 2.1 `web/src/pages/browse/ItemDetail.tsx` folds the flat always-visible "Item" core-field dl, "Identifiers", and "View" sections inside the collapsed "Technical details" `<details>` disclosure, ahead of Sources/Provenance/Pipeline stages — the renders stay byte-identical to the former always-visible sections, only their visibility moves; the always-visible tier remains the media-first ladder, the identity block, and the `ParserFooter` (photo and video tails end up structurally identical). `web/src/pages/browse/ItemDetail.test.tsx` updated to match: core fields, identifiers, and view content asserted after expanding the disclosure; the collapsed-by-default test keeps asserting on the `<details>` open flag [probe:947598386519921e]

## 3. Delivery: embedded build

- [x] 3.1 Regenerate the committed embedded build via `make web-build` (swag + `cd web && npm ci && npm run build`; vite `outDir` is `../internal/web/dist`) and commit `internal/web/dist`; `internal/web/api/openapi.{json,yaml}` MUST come out byte-identical — this change authors no route or annotation edits, so on drift STOP and surface it instead of committing [probe:db2523330ec28b10]

## 4. QA: joint contract (production vocabulary end-to-end)

- [x] 4.1 `TestVideoItemPagesJointE2E` in `internal/itest` (follow the `TestSerialWatchFlowJointE2E` hermetic pattern): a fixture serial library scanned through the real plugin subprocesses; assert the stored episode's `media_type` is `serial` (never `video`), and `GET /api/v1/items/{episode}/playback` answers 200 with mode `direct` or `hls`, a packaging state, a non-empty token-carrying `play_url`, and `sections`/`voiceovers` arrays — the descriptor shape the SPA's player mounts (Tier 1 joint: the scanner's stored document satisfies the descriptor contract the SPA gate consumes; real instances, no mocks) [probe:dbec622421aa3de9]
