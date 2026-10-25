# Proposal

## Why

The watch surface plays video but leaves the viewer context-blind and click-bound: the episode page shows identity facts only, intro/credits boundaries render as seek buttons yet cannot be skipped in-flow, finishing an episode dead-ends, and every transport gesture needs the mouse. This is UI roadmap Layer 3 — watch-flow polish (authoritative draft: `.tmp/ui-improvement-proposal.md`, mockup `mockup-player.html`). The layer is pure SPA except one served shape: the auto-next countdown default reaches the SPA through a served wire form (decision Q5, 2026-10-23) — never baked or derived client-side.

## What Changes

- **Watch-view info column** — the episode watch view composes the playing surface left and a watch info column right: episode heading (SxxEyy eyebrow + the served episode `title`), «Серия» block (the served episode `description`), «В ролях» row (the served `cast[]` {name, role?, photo_url?}), and the already-shipped series About panel as standing context. All blocks read the served convention projection (media-data-convention); a field absent → block absent; the SPA never fabricates and never hard-codes a source.
- **Skip intro/credits chip** — while playback is inside a descriptor chapter section classified as intro or credits, a soft chip bottom-right («Пропустить вступление» / «Пропустить титры») offers the jump past the section's end; chip renders only inside the range, fades after 4 s, returns on seek.
- **Auto-next card** — on `ended` of an episode: «Следующая серия» card with the next episode's identity, [Смотреть] / [Отмена], and a visible countdown that starts the next episode at zero. The countdown length comes from the served shape (Q5); the next-episode pick reuses the existing pure next-up core, moved verbatim into one shared lib home. Cancel persists per session (Q6 — the durable per-user opt-out is deferred to Layer 6; the localStorage variant is rejected).
- **Player keyboard control** — Space play/pause · ←/→ ±10 s · ↑/↓ volume · F fullscreen · N/P next/prev item · 0-9 seek percent, with a legend row under the player on desktop, hidden on touch.
- **One served shape** — `GET /api/v1/watch-defaults` returning `{auto_next_countdown_seconds}` from the `MELLIFERA_AUTO_NEXT_COUNTDOWN_SECONDS` environment knob (default 10), pure delegation.
- **Regen committed artifacts** — OpenAPI (swag) + embedded SPA dist (vite) rebuilt inside the change via `make web-build`.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `web-ui`: six ADDED requirements — Watch-view info column; Skip intro/credits chip; Auto-next card with served countdown; Player keyboard control and legend; Watch defaults endpoint; Embedded build carries the watch-flow surface. Existing requirements (Video playback in the SPA, Episode watch-page track controls, Continue and Next up surfaces) are untouched — all additions are new concerns.

## Impact

- `web/src`: `pages/browse/ItemDetail.tsx` (info column mount, keyboard listener + legend, auto-next mount), `components/playback/Player.tsx` (skip chip mount), new `components/watch/InfoColumn.tsx`, new `components/playback/{SkipChip,AutoNext,PlayerLegend}.tsx`, new `lib/{skipSections,nextup,playerShortcuts}.ts` (`nextup.ts` = the pure next-up core moved verbatim out of `pages/home/Home.tsx`, which keeps re-exporting it), `lib/queries.ts` + `lib/api.ts` (watch defaults client).
- `internal/api`: `GET /api/v1/watch-defaults` handler + one `Deps` field (pure delegation; no new imports) and its golden producer test.
- `internal/stream`: a golden producer test only — the chapters projection itself is unchanged.
- `cmd/mellifera`: environment knob wiring (`envInt` pattern).
- `internal/web/api` + `internal/web/dist`: regenerated and committed (qa-closeout group).
- No store, plugin, or existing-endpoint changes; the playback descriptor's section shape is consumed as-is.
