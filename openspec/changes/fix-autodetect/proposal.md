# Proposal

## Why

The operator's real TV box — an Android 14 WebView Yandex Browser TV "lite" whose device string is the SPACED "Smart TV Pro" — boots the desktop layout: the strong-marker table only knows the compound /SmartTV/, so the ladder falls to the weak path and corroboration's ≤600 CSS px short leg fails at the device's dpr-1 full-HD viewport (~1080px). wf-debugger diagnosed this root-cause-certain (handoffs/wf-debugger.md) with repro rows already red in the working tree (web/src/lib/tvmode.test.ts, 2 failed | 50 passed) — the fix is a one-row vocabulary widening, and the fix's first verify anchor is already authored.

## What Changes

- Widen one `STRONG_MARKERS` row in `web/src/lib/tvmode.ts`: `/SmartTV/` → `/smart[\s_-]*tv/i` — the spaced / underscore / hyphen / compound Smart-TV family, case-insensitive. The table's one-marker-per-row shape and the module's 7 exports are unchanged.
- The async model-hint probe inherits the widening for free: it re-enters `detectTvEnvironment`, whose strong scan runs `matchesStrongMarker` over the same table (verified in source: tvmode.ts:44-51, :72-74, :80-91, :144-161) — no second fix site exists.
- Corroboration legs, the weak `\bTV\b` token, and the override law are untouched — laptop and desktop lookalikes stay desktop.
- Test coverage in `web/src/lib/tvmode.test.ts`: the 3 debugger repro rows go green (expectations unchanged); new rows pin the family variants (uppercase, hyphen, underscore), a spaced-variant model-hint row, and a lookalike-desktop negative proving the widened marker cannot catch a plain desktop UA. The `WEAK_TV_UA` fixture is re-homed to a genuinely weak UA (a bare word-bounded TV token) — after the widening the spaced "Smart TV" string is STRONG, and leaving the fixture as-is would silently flip three weak-path row expectations.
- Embedded dist regenerated for the redeploy (`make web-build`, the archived tv-mode 7.1 shape) — still zero Go source edits.
- Explicitly out of scope: a dedicated YaBrowser family marker (debugger ruled it optional belt-and-suspenders — the real UA already matches via its spaced device string).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `tv-mode`: ADDS one requirement under the living spec's autodetect section — "Spaced Smart-TV variants detect decisively" — pinning the widened vocabulary's decisive precedence in both the UA scan and the model-hint probe, with a lookalike-desktop negative. The existing "Autodetect sets the first-load default only" requirement (corroboration never sufficient alone) and "The manual «Режим ТВ» override always wins" requirement are NOT modified.

## Impact

- Lands ON feature/tv-mode — the deployed branch (PR #24 open); this is a bug fix to the tv-mode slice that branch ships.
- `web/src/lib/tvmode.ts` (one marker row) and `web/src/lib/tvmode.test.ts` (family rows + fixture re-home + stale-comment refresh); no Go source edits.
- `internal/web/dist` embedded bundle and `internal/web/api` swag annotations regenerate via `make web-build` (GOPATH/bin on PATH for swag); a fresh rebuild leaves both trees clean and `go build ./...` green.
- Runtime effect: dpr-1 full-HD Android TV WebViews (the RU-region YaBrowser lite family) autodetect TV on first load; every previously detected device and every desktop behaves exactly as before — the widening is strictly additive to the strong table.
