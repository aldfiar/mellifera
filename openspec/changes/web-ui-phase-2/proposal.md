# Proposal: web-ui Phase 2b+2c — client browse, item detail, metadata rendering, polish

## Why

Phase 2a (already built on `feature/web-ui-phase-2`, reviewer verdict PROCEED) shipped the SPA shell, auth, and the admin library-management panel — the operator can scan libraries and watch the enrich queue, but cannot SEE the results. The product's core value — precision-preserved, per-source item metadata — is invisible: there is no browse surface and no item-detail view. Phase 2b delivers the client-facing browse + detail surfaces over the already-existing read-only API; Phase 2c adds the polish layer (states, responsive layout, dark mode, keyboard accessibility).

## What Changes

- **Browse panel (2b):** a new `/browse` route (`<RequireAuth>`-guarded) — an item table scoped to a selected library (the wire requires an integer `library`), with a status filter over the enrich lifecycle statuses and limit/offset pagination, over the pre-existing `GET /api/v1/items` (browse role group, admin+client).
- **Item detail (2b):** a new `/items/:id` route rendering the full §3.1 document from the pre-existing `GET /api/v1/items/{id}` — Tier-1 `identifiers`, per-source `sources.<plugin>` cards, `_view` display fields, `_provenance` badges, `_stages` pipeline progress — via a reusable metadata component tree and a pure `web/src/lib/document.ts` document model.
- **Navigation (2b):** `/` (and the SPA wildcard) redirect flips from `/admin` to `/browse`; a shared app nav links the admin and browse panels.
- **Fidelity invariants (2b):** document values render verbatim (no rounding/averaging/locale reformatting), per-source namespaces never collapse, all document content renders as text/structured children (never `dangerouslySetInnerHTML`), UTF-8/Cyrillic passes through unmodified (arch §3.4/§11.1/§11.2).
- **Polish (2c):** shared empty/loading/error states surfacing the canonical `{error:{code,message,retryable}}` inline; responsive layouts for admin + browse; a persisted dark-mode toggle; a keyboard-accessibility pass.
- **Delivery:** `internal/web/dist/` regenerated (dev-time `make web-build`) and committed so the served SPA carries the new routes. The Go side stays byte-identical — zero new endpoints, zero new symbols, `go.mod` untouched; the SPA remains a same-origin pure HTTP client.

No breaking changes: every endpoint consumed pre-exists (Phase 1, `internal/api/router.go:92-95` browse group + `router.go:98-102` admin group).

## Capabilities

### Modified Capabilities

- **`web-ui`** — the SPA gains client-facing browse/detail surfaces and the polish layer. The delta at `specs/web-ui/spec.md` carries:
  - **ADDED requirements:** Client browse panel; Item detail view; Metadata rendering fidelity; Responsive UI states and theming; Embedded build carries the phase UI.
  - **MODIFIED requirement:** *SPA consumes only pre-existing endpoints* — the enumerated route list widens from the 4 routes used in 2a to the 6 pre-existing routes the SPA now calls (the two items routes join the set); still zero new endpoints and a byte-identical Go side.

- New capabilities: none — this change extends the existing `web-ui` capability.

## Impact

- **Affected code:** `web/src/**` only — new `pages/browse/{Browse,ItemDetail}.tsx`, `components/metadata/{SourceCard,JsonValue,ProvenanceBadge,ViewFields,StagesProgress}.tsx`, `components/{AppNav,states,ThemeToggle}.tsx`, `lib/document.ts`; extended `lib/api.ts` (items DTO mirrors + fetchers), `lib/queries.ts` (`useItems`, `useItem`), `App.tsx` (routes + redirect flip). Plus the regenerated, committed `internal/web/dist/*` bytes.
- **Not affected:** all Go source (`internal/api`, `internal/web`, `internal/{scan,enrich,store,module,plugin}`, `cmd/mellifera`), `go.mod`/`go.sum`, `proto/`, `pkg/sdk` — byte-identical. The consumed endpoints pre-exist and are already role-gated (browse = admin+client read-only, arch §11.5).
- **Dependencies:** no new npm packages beyond the 2a set (router, TanStack Query, shadcn primitives already present); no new Go modules.
- **Systems:** none — same-origin SPA over the existing API; the public static surface is unchanged; only the embedded bytes change.
