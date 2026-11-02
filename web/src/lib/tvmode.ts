// SPDX-License-Identifier: Apache-2.0

// tvmode (tv-mode 1.1 resolver + 1.2 boot apply) — the fixed storage key,
// the persisted override read, the detection ladder, the override law, and
// the single writer of the `tv` class. No React: detectTvEnvironment takes
// its measurements as arguments and readTvOverride is the only storage
// touch, guarded like lib/auth.ts so an unavailable or corrupt store floors
// to "auto" — the autodetect default — never a crash.
//
// The ladder (design D2): STRONG markers (the Smart-TV family — spaced,
// underscored, hyphenated, or compound, case-insensitive — plus BRAVIA,
// AFT\d, KFT, Silk, Leanback, or a model hint matching them) detect a TV
// decisively — no
// geometry needed. The generic "TV" token is WEAK: it detects a TV only when
// corroboration also holds (≥16:9 aspect AND innerHeight ≤ 600 CSS px AND
// maxTouchPoints === 0). Corroboration alone NEVER enables tv mode — an
// unmarked 16:9 zero-touch desktop stays desktop. The server-observed UA
// (fix-tv-server-ua, the mellifera-client-ua meta) joins the strong scan
// only — decisive, never a corroboration input. resolveTvMode applies the
// override law on top: a stored Вкл/Выкл beats detection on every load,
// "auto"/absent defers to it (spec: Autodetect sets the first-load default
// only / The manual «Режим ТВ» override always wins).

// INV-fixed-key: matches the tv-mode spec delta §The manual «Режим ТВ»
// override always wins and design I2 (the mellifera.theme idiom). Drift = bug.
export const TV_KEY = "mellifera.tv";

// TvOverride — the three stored control states («Режим ТВ»: Авто / Вкл /
// Выкл). Values are exactly what group 6's control persists under TV_KEY;
// anything else in storage is invalid and reads back as "auto".
export type TvOverride = "auto" | "on" | "off";

// TvEnvironment — the structural subset of navigator/window the ladder reads.
// The boot apply (1.2) passes the real browser inputs; tests pass plain
// objects — the ladder never touches the globals itself.
export interface TvEnvironment {
  /** The Chromium high-entropy model hint, when the probe resolved it. */
  model?: string;
  /**
   * The server-observed User-Agent (fix-tv-server-ua), injected by the Go
   * shell as the mellifera-client-ua meta. A DECISIVE-only source: a strong
   * marker here rules TV outright; it is never a weak-token or corroboration
   * input — the server UA cannot corroborate a TV shape.
   */
  serverUserAgent?: string;
  userAgent: string;
  innerWidth: number;
  innerHeight: number;
  maxTouchPoints: number;
}

// STRONG_MARKERS — decisive TV markers over the user agent AND the model
// hint (design D2). A single hit answers the ladder outright; corroboration
// is not consulted and cannot vote the decision away.
const STRONG_MARKERS: RegExp[] = [
  /smart[\s_-]*tv/i,
  /BRAVIA/,
  /AFT\d/,
  /KFT/,
  /Silk/,
  /Leanback/,
];

// WEAK_TV_TOKEN — the generic "TV" token: not decisive on its own, and never
// sufficient with corroboration either — it only upgrades corroboration into
// a TV ruling. Word-bounded, so the Smart-TV variants (already strong) are
// not doubly matched and "PortalTV"-style compounds do not fire.
const WEAK_TV_TOKEN = /\bTV\b/;

// corroboratesTvShape — the geometry half of the weak path: a wide (≥16:9,
// integer cross-multiplied so the exact-16:9 dpr shapes never meet a float
// edge), SHORT (≤600 CSS px tall) and touch-free window. Corroboration is
// the weak token's witness, never a standalone TV ruling.
function corroboratesTvShape(env: TvEnvironment): boolean {
  return (
    env.innerWidth * 9 >= env.innerHeight * 16 &&
    env.innerHeight <= 600 &&
    env.maxTouchPoints === 0
  );
}

// matchesStrongMarker — one value against the decisive marker table.
function matchesStrongMarker(value: string): boolean {
  return STRONG_MARKERS.some((marker) => marker.test(value));
}

// detectTvEnvironment — the settled ladder (design D2): a strong marker in
// the user agent, the model hint, or the server-observed UA → TV; else the
// weak "TV" token → TV only with a corroborating shape; no marker at all →
// desktop even when the shape corroborates. The server UA enters the strong
// scan ONLY (fix-tv-server-ua): it is never fed to the weak token or to
// corroboratesTvShape, so a truthful server UA alone can never corroborate.
export function detectTvEnvironment(env: TvEnvironment): boolean {
  const strong =
    matchesStrongMarker(env.userAgent) ||
    (env.model !== undefined && matchesStrongMarker(env.model)) ||
    (env.serverUserAgent !== undefined &&
      matchesStrongMarker(env.serverUserAgent));
  if (strong) {
    return true;
  }
  if (!WEAK_TV_TOKEN.test(env.userAgent)) {
    return false;
  }
  return corroboratesTvShape(env);
}

// resolveTvMode — the override law (spec: the override always wins):
// Вкл forces tv mode on, Выкл forces it off — each against every detection
// outcome — and "auto" or no stored ruling (null) defers to the ladder.
export function resolveTvMode(override: TvOverride | null, detected: boolean): boolean {
  if (override === "on") {
    return true;
  }
  if (override === "off") {
    return false;
  }
  return detected;
}

// readTvOverride — the stored «Режим ТВ» ruling, floored to "auto" when the
// value is absent, invalid, or the store itself is unreadable (private-mode
// quota etc. — the lib/auth.ts posture): the caller then defers to the
// autodetect default instead of crashing.
export function readTvOverride(): TvOverride {
  try {
    const raw = localStorage.getItem(TV_KEY);
    return raw === "on" || raw === "off" ? raw : "auto";
  } catch {
    return "auto";
  }
}

// UADataNav — the Chromium-only slice of navigator.userAgentData the async
// model probe reads. Absent on Safari/Firefox/jsdom (the probe then does
// nothing); TS's DOM lib does not type it, so it is declared here.
interface UADataNav {
  getHighEntropyValues(hints: string[]): Promise<{ model?: string }>;
}

// readServerUserAgent — the shell-injected UA from the mellifera-client-ua
// meta (fix-tv-server-ua), read defensively: an absent meta, an empty or
// whitespace-only content, or an unusable document all floor to undefined —
// the ladder then runs on the JS UA alone. No fetch, no boot delay.
function readServerUserAgent(): string | undefined {
  try {
    const content = document
      .querySelector('meta[name="mellifera-client-ua"]')
      ?.getAttribute("content");
    return typeof content === "string" && content.trim().length > 0
      ? content.trim()
      : undefined;
  } catch {
    return undefined;
  }
}

// readTvEnvironment — the real browser inputs the ladder consumes (design:
// the pure core never touches the globals; only this apply-side reader does).
function readTvEnvironment(): TvEnvironment {
  return {
    userAgent: navigator.userAgent,
    serverUserAgent: readServerUserAgent(),
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
  };
}

// writeTvMode — the single writer of the `tv` class AND the --tv-dpr
// physical-density var on <html> (tv-dpr-scaling 1.1): the class toggles
// exactly as before, and a TV ruling also publishes window.devicePixelRatio
// floored (the module's guarded posture — a non-number, non-finite, or
// non-positive reading floors to 1) so the CSS ladder can scale physical
// density; a desktop ruling removes the var entirely, leaving no residue
// from a previous TV state. Module-private: applyTvMode and probeTvModel
// are the only callers.
function writeTvMode(on: boolean): void {
  const root = document.documentElement;
  root.classList.toggle("tv", on);
  if (on) {
    const raw = window.devicePixelRatio;
    const dpr =
      typeof raw === "number" && Number.isFinite(raw) && raw > 0
        ? Math.floor(raw)
        : 1;
    root.style.setProperty("--tv-dpr", String(dpr));
  } else {
    root.style.removeProperty("--tv-dpr");
  }
}

// probeTvModel — the UPGRADE-ONLY async tail of the boot apply (design I1):
// Chromium's high-entropy model hint may confirm a TV the synchronous ladder
// could not see, so a resolving TV model ADDS the class — it never removes
// one. Guarded end to end: an unavailable API, a rejecting probe, or a
// throwing store degrades to whatever the synchronous ruling was, never a
// crash. Only the boot apply's auto-desktop path arms it, so a manual
// «Режим ТВ» ruling is never second-guessed (the override always wins).
async function probeTvModel(): Promise<void> {
  try {
    const uaData = (navigator as Navigator & { userAgentData?: UADataNav })
      .userAgentData;
    if (!uaData) {
      return;
    }
    const { model } = await uaData.getHighEntropyValues(["model"]);
    if (
      model !== undefined &&
      detectTvEnvironment({ ...readTvEnvironment(), model })
    ) {
      writeTvMode(true);
    }
  } catch {
    // unavailable API / rejecting probe: stay with the synchronous ruling
  }
}

// applyTvMode — the single writer of the `tv` class on <html> (design I1;
// the group-6 «Режим ТВ» toggle reuses this exact function, so the class is
// never set by two divergent code paths). The synchronous chain — stored
// override through resolveTvMode over detectTvEnvironment — toggles the
// class BEFORE any await, so a stored Вкл/Выкл lands with no async
// round-trip; the returned promise carries only the upgrade-only model
// probe (a no-op unless the auto ruling said desktop). Idempotent.
export function applyTvMode(): Promise<void> {
  const override = readTvOverride();
  const on = resolveTvMode(override, detectTvEnvironment(readTvEnvironment()));
  writeTvMode(on);
  // Only an auto-desktop ruling may be upgraded: "on" is already on, and
  // "off" is a manual ruling the probe must respect (the override law).
  if (on || override !== "auto") {
    return Promise.resolve();
  }
  return probeTvModel();
}

// Boot apply — module-evaluation side effect, run ONCE (the ThemeToggle.tsx
// idiom). main.tsx imports this module BEFORE App (design I6), so the mode
// class lands before any consumer mounts and before first themed paint, on
// every route. The upgrade-only model probe continues in the background.
void applyTvMode();
