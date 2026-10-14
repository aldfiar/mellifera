# Proposal: display-naming — server-composed display names, per-library naming options

## Why

Item and series names are composed three times today — twice in the SPA
(`Home.tsx` `seriesDisplayTitle`/`continueTitle`, `Collection.tsx`
`serialTitle`/`episodeTitle`, byte-identical chains re-derived per surface)
and never on the server. Every non-SPA consumer sees raw documents only, and
the operator cannot choose how their library names things. Composition is a
presentation decision the api should own at its DTO boundary — the same seam
that already stamps `title_override` per row.

## What Changes

- **Server-composed `display_name`** (read-time at the api DTO boundary,
  never persisted, no invalidation step): items — title_override > composed
  element name (episode facts + resolved series + template) > `_view.title`
  > `""`; series — title_override > parser title > `dir_name_raw` > last
  path segment, byte-identical to the SPA's current chain (display-identical
  migration). Episode facts read namespace-agnostically in a fixed order;
  deleted series rows are skipped; Cyrillic verbatim end-to-end.
- **Per-library naming options**: two flat nullable TEXT columns on
  `libraries` (`naming_group_style` `clean|raw`, `naming_element_name`
  template); `PATCH /libraries/{id}` validates before write and a non-nil
  `""` resets to the module default; the next read re-composes — no rebuild.
- **Module default template**: the serial module seed bumps to
  schema_version 3 with `"item_name": "{title} · S{season}E{episode}"`
  (U+00B7 — byte-matches today's SPA compose); guarded UPDATE upgrades
  pre-v3 stores; `parseModule` exposes `Module.ItemName` through the
  module-presentation closure; template grammar is 3 tokens + free text with
  composer-fixed two-digit padding, absent token → empty string. Contract
  comments claiming the display block is never modeled in Go are amended.
- **Ride-along drift fix**: serial seed literals `display_title` → `title`
  (serial-parser actually writes "title"; the SPA already resolves "title"
  first).
- **SPA slice**: consume the served `display_name`; DELETE the 4 triplicated
  helpers (~60 lines); `episodeFacts` stays (the Next-up chip keeps
  rendering SxxEyy from raw facts); rename affordances unchanged.

No **BREAKING** changes: all wire additions are always-present fields
(empty string = unset, the title_override precedent); no
`DisallowUnknownFields` anywhere; progress/home-flow DTOs untouched.

Accepted cost (bounded, not optimized): each composing request pays
GetLibrary + one whole-library QuerySeries (~0.5 MB at 100 series) +
per-series override point-reads; worst ratio on getItem. Revisit on a real
signal; routes that render no names never build a namer.

## Capabilities

- **New Capabilities**: `display-naming` — composition precedence (items,
  series), namespace-agnostic episode facts, per-library naming options, the
  module-default template, and the node-free build gate.
- **Modified Capabilities**: `parser-display` — the serial seed's
  identity/display field literals corrected to `title` (MODIFIED
  requirement); `web-ui` — the home Continue/Next-up surfaces and the serial
  collection surface render the served `display_name` and retire the client
  chains (2 MODIFIED requirements).

## Impact

- `internal/store` — libraries columns (guarded ALTER) + `UpdateLibrary`
  params; value-agnostic.
- `internal/module` — serial seed v3 + guarded UPDATE, `Module.ItemName`,
  contract-comment amendments, seed literal fix.
- `internal/api` — new unexported `display.go` (namer), DTO threading,
  PATCH validation, `ModulePresentation.ItemName`; additive wire fields.
- `cmd/mellifera` — closure copies `ItemName` (+1 line).
- `web/src` — `Home.tsx`, `Collection.tsx`, `lib/api.ts` types + tests.
- `docs/architecture.md` — display block now modeled in Go; seed literals.
- OpenAPI annotations and the web dist are REGENERATED AT LANDING (the
  project lesson: box probes never rebuild dist) — never inside a box probe.

## Verification

- Per-box probes: `go test ./internal/{store,module,api}` field-scoped runs,
  `cd web && npx vitest run && npx tsc --noEmit`, and one joint itest
  (`TestDisplayNamingJointE2E`, real plugin subprocesses, `t.TempDir()`
  datadir).
- Gates: `make build check test lint` node-free.
- Landing: OpenAPI regen + web dist rebuild + docs source-map regen.
