---
name: mellifera-ui
description: How to build and maintain the Mellifera SPA (web/) — Vite + React 18 + TS strict + TanStack Query + Tailwind/shadcn. Load before editing anything under web/src, adding a page or overlay, touching SPA tests, or rebuilding the embedded dist. Enforces the field-driven rendering contract, the overlay-edit and color idioms, and the exact gate sequence.
---

# Mellifera UI (web/)

The SPA is a thin client over the Go API: it RENDERS served data, never
re-derives it. Composes with `mellifera-build` (the Go side) — that skill owns
the backend; this one owns everything under `web/`.

## Locked UI conventions (user-approved; do not relitigate)

- **Field-driven, source-agnostic.** No plugin ids, no media-type literals in
  the SPA. Walk namespaces by FIELD NAME (`title`, `description`, `genres`,
  `cast`, `poster`…). A new metadata source must render with ZERO UI changes.
- **Served names only.** Display names come from the server
  (`display_name`, override-aware). The SPA never recomposes names.
- **Slot notes, never blanks.** A missing mandatory field renders
  "X — not identified" + its cure (management-ui E). Never fabricate, never
  zero. Never render an empty panel — absent data → absent block.
- **Overlay edits.** All management actions live in the ⋯ `CardActions` menu
  (Rename / Rename series / Identify / Refresh metadata). Never inline forms
  on browse surfaces. Menu hidden by default; on full pages the trigger uses
  `.cardact-trigger--inline` (always visible).
- **Overlay height contract.** Every overlay panel rendering variable-length
  content carries `max-height: min(90vh, 640px); overflow-y: auto`
  (`.cardact-panel` and `.overlay-card`); a long list inside such a panel is
  its OWN scroll region (`.identify-candidates`, `max-height: 46vh`) so the
  actions below it stay pinned. Without the cap, the backdrop's
  flex-centering clips the panel's TOP rows off-screen (2026-10-27: the
  identify panel grew to 1615px at a 633px viewport and the correct
  candidate #0 rendered at top −475px — read as a "search quality" failure).
  Pinned by `lib/overlayContract.test.ts` + `manage/IdentifySeries.test.tsx`.
- **Color = state.** Green ok (`emerald-600` text / `emerald-500` dot) /
  red fail (`destructive`) / gray off (`muted-foreground`). Selection is a
  background/border change, never pills. Soft pastel overall.
- **No paths on user screens** (the element page's mono line is the one
  exception). Admin surfaces may show raw values (verbatim JSON behind
  disclosures).
- **Copy:** Russian on user-facing surfaces, concrete and action-first
  («Пропустить вступление», «Заменить совпадение»), quiet states without
  spinners («Ищем…» as a plain line).

## Component map (reuse before writing new)

| Need | Use |
|---|---|
| ⋯ management menu + views | `components/manage/ManageActions` — `CardActions` (view machine: menu/rename/rename-series/identify/refresh), `RenameTitle`, `IdentifyView`, `RefreshView`, `useTitleOverride` |
| Dialog chrome | `components/DialogShell` (focus, Esc-to-menu, pending guard) |
| Synopsis / About panel | `components/metadata/Synopsis` (+ `plainText` BBCode strip, `synopsisOf` pure core) |
| Footer groups / slots | `components/metadata/ParserFooter` (`SlotNote` w/ optional `action`, `humanizeField`) |
| Empty/Error/Loading | `components/states` |
| Admin status cell | see `pages/admin/Plugins.tsx` `StatusCell` — the green/red/gray contract, `data-status` attr |

## Data idioms

- Query keys: `["item", id]`, `["items", params]`, `["series", libraryId]`,
  `["series-episodes", seriesId]`, `["library", id]`, `["admin-plugins"]`.
  Mutations invalidate the live surface's key (prefix invalidation for lists).
- `retry: 0` on every read AND mutation (no auto-retry; canonical errors
  surface inline). Admin pages are read-only (INV-no-writes).
- Series resolution for an episode: match `parsed.series_relative_path` BY
  PATH against `useSeries(libraryId)` — never by title (episodes carry none).
- `display_fields`/`options` on the wire are `unknown` (raw JSON): narrow
  with `Array.isArray` + element checks before joining; otherwise render the
  pretty-printed JSON verbatim behind a `<details>`.
- Descriptions may carry BBCode — pass through `plainText()` (inner text
  kept, tags stripped).
- Hooks are unconditional; gate fetches with `enabled:`.

## Test idioms (vitest + testing-library)

- Mock seam: `vi.spyOn(apiModule, "<fetcher>")` on the `lib/api.ts` exports.
  Fixtures mirror wire shapes EXACTLY (field names = JSON tags); optional
  fields stay absent, not faked.
- Assert on roles/regions (`findByRole("region", { name: "About" })`) and
  served text; use `data-*` anchors (e.g. `[data-status]`, `data-plugin-id`)
  for structural checks.
- Shared overlay machinery is covered once through its hosts (Collection +
  ItemDetail); keep DOM-level assertions so refactors don't break tests.

## Gates (in order, all must pass)

```
cd web
npx tsc --noEmit          # strict; unused imports fail the build
npx vitest run            # whole suite, never single-file only
npx eslint src/…          # touched files
cd ..
PATH="$HOME/go/bin:$PATH" make web-build   # swag lives in ~/go/bin; regenerates
                                            # the COMMITTED internal/web/dist
go build ./...            # embed gate
```

The committed `internal/web/dist` must be rebuilt in the same commit as any
`web/src` change.

## Live verification (when a dev server is up)

- Vite dev on `:5173`, proxies to Go on `:8080` (`/media`, `/api`).
- Login: the admin token's default literal lives in `scripts/dev.sh`
  (`TOKEN="${MELLIFERA_ADMIN_TOKEN:-…}"`). Read it AT RUNTIME — never paste
  token literals into tool calls/scripts (transit filters mangle them).
- For localhost HTTP from scripts: set `NO_PROXY=localhost,127.0.0.1,::1`
  (system proxy intercepts otherwise).
- Verify by driving the real page (navigate → act → assert served state),
  not by code-reading alone.

## Where the deeper plans live

- `.tmp/ui-improvement-proposal.md` + `mockup-*.html` — the approved UI
  roadmap (Layer 0 media-data convention, Identify, posters, watch view,
  search). Read before planning new UI work.
- `openspec/changes/` — active change folders; `docs/project_structure.md`
  is the authoritative state digest.
