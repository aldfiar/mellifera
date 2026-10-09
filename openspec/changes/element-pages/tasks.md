# Tasks: element-pages

Probe CWD is the repo root. All probes are node-free (`go build`/`go test` +
greps over `internal/` and `web/src`). Probe bodies live in the spec deltas
(`specs/*/spec.md`); each box links one. Group dependencies (DAG):
1 → 2 → {3, 4}; 1 → 5 → 6 → 7; {3, 4} → 7. Max concurrency 2: (2 + 5), then
(3 + 4), then 6, then 7.

## 1. Module presentation config (internal/module)

- [ ] 1.1 `display_fields` on parser bindings + `identity_fields` per module in the seed config; accessors on the module registry; media-type literals stay in config only [probe:285e0cf7ae7d58d6]
- [ ] 1.2 Composite label resolution contract in the renderer (camera = make+model, dimensions = width×height, thumbnail/grabbed_at from the frame-grabber namespace) [probe:c91674ddc94d4640]

## 2. Store: item_parsers control table

- [ ] 2.1 `item_parsers` table (DDL in `Open`), `SetItemParsers`/`ListItemParsers` (parameterized SQL), re-scan survival + re-identify cleanup semantics [probe:1d262fc42ed96151]

## 3. API: chain editing + element attachment

- [ ] 3.1 `PATCH /libraries/{id}` parsers list: replacement semantics, seed default when absent, 400 validation (unknown id, capability mismatch, empty), order = footer + queue priority [probe:b3d338bc6e3874c4]
- [ ] 3.2 Chain-validation unit tests beside the handler [probe:f4e6e8eda34ef919]
- [ ] 3.3 `PUT/DELETE /items/{id}/parsers` (admin group) + additive `extra_parsers` on `GET /items/{id}`; 404 unknown item [probe:d9da15ad9ea78699]
- [ ] 3.4 `GET /libraries/{id}` carries the additive module presentation block (`identity_fields`, ordered parsers with `display_fields`) [probe:1cc4bb449c22a0e1]

## 4. Enrich queue derivation

- [ ] 4.1 Queue derivation includes `(item, element-attached plugin)` under the D-Q1 rule; sync `Enrich` honors extras; standard namespace/provenance/stages writes [probe:5fb5840b18489272]
- [ ] 4.2 CLIENT-locked attached source stays out of the queue (test) [probe:3f2bac60767f478b]

## 5. SPA: media-first element page + parser footer

- [ ] 5.1 Media-first arrangement: video two-column (media stage + play affordance left, identity column right), photo full-width identity-below; Technical details stay collapsed [probe:0fbfc7bc48168bfb]
- [ ] 5.2 Identity block from `identity_fields` (name heading + mandatory badges); missing mandatory field renders the slot state (episode-name case) [probe:afad16ae58c19414]
- [ ] 5.3 `ParserFooter` component: groups in chain order (collection chain + element-only after, marked), parser's display_fields order, absent pairs skipped, seeded slot groups, verbatim values [probe:a01c342b67758ff2]
- [ ] 5.4 Footer skip-absent + composite-label coverage in Vitest [probe:8fc084d8ee58d4aa]

## 6. SPA: browsing + slideshow

- [ ] 6.1 Prev/next: `←/→` + chevrons within the loaded ordered view, wrap-around, position counter, keys hint; tiles/cards/rows all navigate and open at their position [probe:f7828854518d4efe]
- [ ] 6.2 Position handoff from every grid surface (photo tiles, film cards, episode rows) into the detail page [probe:4fbcf412bcbaa05e]
- [ ] 6.3 Photo slideshow: S/button toggle, ~2.5s auto-advance, pause keeps the current photo [probe:9bec8b9a5052df21]
- [ ] 6.4 Slideshow interplay: manual nav resets the timer, Esc stops first then navigates, leaving the page stops [probe:6dbafb440f895ee6]

## 7. QA + delivery

- [ ] 7.1 itest: hermetic element-attachment E2E (attach → queue drain → namespace + provenance written; sibling untouched; re-scan keeps the attachment) joining the existing harness [probe:5fb5840b18489272]
- [ ] 7.2 Regenerate committed `internal/web/api/openapi.{json,yaml}` + rebuild committed `internal/web/dist` carrying the new UI; SPA endpoint-allowlist audit re-run [probe:6c03f9c2829e0509]
- [ ] 7.3 Close-out: `make build && make check && make test` green node-free; `cd web && npm test` green; manual walkthrough against `.tmp/webui-mockup.html` (media-first pages, footer groups, browsing, slideshow) [unprobeable]
