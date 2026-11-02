// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  TV_KEY,
  applyTvMode,
  detectTvEnvironment,
  readTvOverride,
  resolveTvMode,
  type TvEnvironment,
  type TvOverride,
} from "@/lib/tvmode";

// tv-mode 1.1 — table-driven vectors over the settled detection ladder
// (design D2) and the override law. Every ladder row has a vector: each
// strong marker under HOSTILE geometry (wide, tall, touchy — decisiveness
// needs no corroboration), the widened Smart-TV family variants — spaced /
// hyphenated / underscored / uppercased, plus a spaced model hint, against
// a lookalike desktop negative (fix-autodetect 1.1) — the weak "TV" token
// with and without each corroboration leg, corroboration alone on an
// unmarked user agent, and the override beating detection both ways. The
// dpr shapes of design D3 are pinned at their reported viewports: the dpr-2
// 1080p panel (960×540) sits inside corroboration; the dpr-1 4K panel
// (3840×2160) passes the exact-16:9 aspect leg but is too tall for the
// short leg, so the WEAK path cannot claim it — the strong markers still
// do, geometry-free.

// DESKTOP_UA — no TV token of any kind: the corroboration-alone baseline.
const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// WEAK_TV_UA — carries ONLY the generic word-bounded "TV" token and no
// Smart-TV variant of any separator: after fix-autodetect 1.1 the widened
// strong marker (/smart[\s_-]*tv/i) admits even the spaced "Smart TV"
// string, so the weak-path vectors need a bare TV-token fixture.
const WEAK_TV_UA =
  "Mozilla/5.0 (Linux; Android 9; TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.0.0 Safari/537.36";

// env — the ladder input builder. The defaults are a HOSTILE desktop shape
// (wide, tall, touchy): any detection a vector reads off these defaults is
// the markers' doing, never the geometry's.
function env(overrides: Partial<TvEnvironment> = {}): TvEnvironment {
  return {
    userAgent: DESKTOP_UA,
    innerWidth: 1280,
    innerHeight: 800,
    maxTouchPoints: 5,
    ...overrides,
  };
}

describe("detectTvEnvironment — the strong markers are decisive (D2)", () => {
  it.each([
    {
      name: "SmartTV (LG WebOS)",
      ua: "Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    {
      name: "BRAVIA (Sony)",
      ua: "Mozilla/5.0 (Linux; BRAVIA 4K GB) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
    },
    {
      name: "AFT\\d (Amazon Fire TV box)",
      ua: "Mozilla/5.0 (Linux; Android 11; AFT9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    {
      name: "KFT (Kindle Fire TV)",
      ua: "Mozilla/5.0 (Linux; Android 9; KFT) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.0.0 Safari/537.36",
    },
    {
      name: "Silk (Amazon Silk)",
      ua: "Mozilla/5.0 (Linux; Android 9; KFMAWI) AppleWebKit/537.36 (KHTML, like Gecko) Silk/120.1.1 Safari/537.36",
    },
    {
      name: "Leanback (Android TV)",
      ua: "Mozilla/5.0 (Linux; Android 12; Leanback) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    {
      name: "model hint BRAVIA on a desktop user agent",
      model: "BRAVIA 4K GB",
    },
    {
      name: "model hint AFT\\d on a desktop user agent",
      model: "AFT7",
    },
  ])("detect_strong_markers_decisive: $name", ({ ua, model }) => {
    expect(detectTvEnvironment(env({ userAgent: ua, model }))).toBe(true);
  });

  it.each([
    { model: "MacBookPro18,1", name: "a desktop model hint is not a TV marker" },
    { model: "iPad14,1", name: "a touch-device model hint is not a TV marker" },
  ])("detect_strong_markers_decisive: $name — even with corroboration", ({
    model,
  }) => {
    // Corroboration alone must not conjure a TV out of an unmarked model.
    expect(
      detectTvEnvironment(
        env({ model, innerWidth: 960, innerHeight: 540, maxTouchPoints: 0 }),
      ),
    ).toBe(false);
  });
});

// fix-autodetect 1.1 — the widened Smart-TV marker (/smart[\s_-]*tv/i)
// across its separator and case variants, and the widening stays narrow: a
// lookalike desktop UA at a full-HD zero-touch shape is still desktop.
describe("detectTvEnvironment — the Smart-TV family variants (fix-autodetect 1.1)", () => {
  it.each([
    {
      name: 'uppercase "SMART TV"',
      ua: "Mozilla/5.0 (Linux; SMART TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.0.0 Safari/537.36",
    },
    {
      name: 'hyphen "Smart-TV"',
      ua: "Mozilla/5.0 (Linux; Smart-TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.0.0 Safari/537.36",
    },
    {
      name: 'underscore "Smart_TV"',
      ua: "Mozilla/5.0 (Linux; Smart_TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.0.0 Safari/537.36",
    },
    {
      name: 'spaced "Smart TV Pro" as the model hint on a desktop UA — the async probe path',
      model: "Smart TV Pro",
    },
  ])("family_variant_detects_decisively: $name", ({ ua, model }) => {
    // Hostile geometry: the family hit alone must rule TV.
    expect(detectTvEnvironment(env({ userAgent: ua, model }))).toBe(true);
  });

  it("family_widening_stays_narrow: a plain desktop UA at full-HD zero touch stays desktop", () => {
    expect(
      detectTvEnvironment(
        env({ userAgent: DESKTOP_UA, innerWidth: 1920, innerHeight: 1080, maxTouchPoints: 0 }),
      ),
    ).toBe(false);
  });
});

describe("detectTvEnvironment — the weak TV token needs corroboration (D2)", () => {
  it.each([
    {
      name: "weak token + full corroboration (960×540, zero touch)",
      innerWidth: 960,
      innerHeight: 540,
      maxTouchPoints: 0,
      want: true,
    },
    {
      name: "weak token + wrong aspect (1280×800 is 16:10)",
      innerWidth: 1280,
      innerHeight: 800,
      maxTouchPoints: 0,
      want: false,
    },
    {
      name: "weak token + too tall (1280×720 is 16:9 but not short)",
      innerWidth: 1280,
      innerHeight: 720,
      maxTouchPoints: 0,
      want: false,
    },
    {
      name: "weak token + touch points (960×540 with touch)",
      innerWidth: 960,
      innerHeight: 540,
      maxTouchPoints: 3,
      want: false,
    },
    {
      name: "no token at all, even corroborated",
      ua: DESKTOP_UA,
      innerWidth: 960,
      innerHeight: 540,
      maxTouchPoints: 0,
      want: false,
    },
  ])("detect_weak_tv_token_needs_corroboration: $name", ({
    innerWidth,
    innerHeight,
    maxTouchPoints,
    ua = WEAK_TV_UA,
    want,
  }) => {
    expect(
      detectTvEnvironment(env({ userAgent: ua, innerWidth, innerHeight, maxTouchPoints })),
    ).toBe(want);
  });
});

describe("detectTvEnvironment — corroboration alone stays desktop (D2)", () => {
  it.each([
    {
      name: "960×540, zero touch, unmarked UA",
      innerWidth: 960,
      innerHeight: 540,
    },
    {
      name: "1920×1080, zero touch, unmarked UA",
      innerWidth: 1920,
      innerHeight: 1080,
    },
    {
      name: "3840×2160 (dpr-1 4K), zero touch, unmarked UA",
      innerWidth: 3840,
      innerHeight: 2160,
    },
  ])("corroboration_alone_stays_desktop: $name", ({ innerWidth, innerHeight }) => {
    expect(
      detectTvEnvironment(env({ innerWidth, innerHeight, maxTouchPoints: 0 })),
    ).toBe(false);
  });
});

describe("detectTvEnvironment — the dpr shapes (D3)", () => {
  it.each([
    {
      name: "dpr-2 1080p panel reports 960×540: exact 16:9, short, zero touch — corroborates",
      innerWidth: 960,
      innerHeight: 540,
      want: true,
    },
    {
      name: "dpr-1 4K panel reports 3840×2160: exact 16:9 but tall — the weak path cannot claim it",
      innerWidth: 3840,
      innerHeight: 2160,
      want: false,
    },
    {
      name: "a real dpr-1 4K TV carries strong markers — decisive with no geometry",
      innerWidth: 3840,
      innerHeight: 2160,
      ua: "Mozilla/5.0 (Linux; Android 12; Leanback) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      want: true,
    },
  ])("dpr_shapes ($name)", ({ ua, innerWidth, innerHeight, want }) => {
    expect(
      detectTvEnvironment(
        env({ userAgent: ua ?? WEAK_TV_UA, innerWidth, innerHeight, maxTouchPoints: 0 }),
      ),
    ).toBe(want);
  });
});

// REAL_TV_UA — the operator's actual TV box (server access log, 2 Nov): an
// Android WebView Yandex Browser TV "lite". Its device string is "Smart TV
// Pro" — SPACED. The original /SmartTV/ compound marker never hit it, the
// ladder fell to the weak path and died on the short leg at the dpr-1
// 1080p shape (~1080px CSS height > 600); the async probe shared the same
// blind spot over the model hint. fix-autodetect 1.1 widened the marker to
// /smart[\s_-]*tv/i, so the spaced family — in the UA and in the model
// hint alike — now resolves decisively, geometry-free. These rows are the
// fix's regression anchors: expectations unchanged, all green.
const REAL_TV_UA =
  "Mozilla/5.0 (Linux; Android 14; Smart TV Pro Build/UTT2.250416.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/156.0.8078.47 YaBrowser/26.8.1.703 (lite) TV Safari/537.36";

describe("detectTvEnvironment — the REAL device (Smart TV Pro / YaBrowser TV lite)", () => {
  it.each([
    {
      name: "REAL UA, dpr-1 1080p shape (1920×1080, zero touch) — a TV must resolve TV",
      innerWidth: 1920,
      innerHeight: 1080,
      want: true,
    },
    {
      name: "REAL UA, dpr-2 1080p shape (960×540, zero touch) — corroboration holds",
      innerWidth: 960,
      innerHeight: 540,
      want: true,
    },
    {
      name: "REAL model hint 'Smart TV Pro' (spaced) on the 1080p shape — the probe path",
      model: "Smart TV Pro",
      innerWidth: 1920,
      innerHeight: 1080,
      want: true,
    },
  ])("real_device: $name", ({ model, innerWidth, innerHeight, want }) => {
    expect(
      detectTvEnvironment(
        env({
          userAgent: REAL_TV_UA,
          model,
          innerWidth,
          innerHeight,
          maxTouchPoints: 0,
        }),
      ),
    ).toBe(want);
  });
});

describe("resolveTvMode — the override always wins (D9)", () => {
  it.each([
    { override: "on" as TvOverride, detected: true },
    { override: "on" as TvOverride, detected: false },
  ])("resolve_override_on_wins: Вкл forces tv mode over detected=$detected", ({
    override,
    detected,
  }) => {
    expect(resolveTvMode(override, detected)).toBe(true);
  });

  it.each([
    { override: "off" as TvOverride, detected: true },
    { override: "off" as TvOverride, detected: false },
  ])("resolve_override_off_wins: Выкл forces desktop over detected=$detected", ({
    override,
    detected,
  }) => {
    expect(resolveTvMode(override, detected)).toBe(false);
  });

  it.each([
    { override: "auto" as TvOverride, detected: true, want: true },
    { override: "auto" as TvOverride, detected: false, want: false },
    { override: null, detected: true, want: true },
    { override: null, detected: false, want: false },
  ])("resolve_auto_defers_to_detection: $override -> $want", ({
    override,
    detected,
    want,
  }) => {
    expect(resolveTvMode(override, detected)).toBe(want);
  });
});

describe("readTvOverride — the guarded store (the lib/auth.ts posture)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem(TV_KEY);
  });

  it.each(["on", "off"])("valid_value_round_trips: %s", (stored) => {
    localStorage.setItem(TV_KEY, stored);
    expect(readTvOverride()).toBe(stored);
  });

  it.each(["lights", "On", "OFF", "", "tv", "true", "0", "null"])(
    "invalid_stored_value_floors_to_auto: %s",
    (stored) => {
      localStorage.setItem(TV_KEY, stored);
      expect(readTvOverride()).toBe("auto");
    },
  );

  it("absent_value_floors_to_auto", () => {
    localStorage.removeItem(TV_KEY);
    expect(readTvOverride()).toBe("auto");
  });

  it("throwing_store_floors_to_auto", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(readTvOverride()).toBe("auto");
  });

  it.each([
    { stored: "off" as TvOverride, detected: true, want: false },
    { stored: "on" as TvOverride, detected: false, want: true },
    { stored: "lights" as string, detected: true, want: true },
    { stored: "lights" as string, detected: false, want: false },
  ])("the stored ruling drives resolveTvMode through the real read ($stored)", ({
    stored,
    detected,
    want,
  }) => {
    localStorage.setItem(TV_KEY, stored);
    // The invalid value floors to auto, and auto defers to the ladder —
    // the full first-load chain: read -> resolve -> detect's verdict.
    expect(resolveTvMode(readTvOverride(), detected)).toBe(want);
  });
});

// tv-mode 1.2 — the boot apply over the real (jsdom) navigator/window. The
// jsdom user agent carries no TV token, so the synchronous ladder here rules
// desktop unless the stored override says otherwise — which makes the async
// model probe's upgrade-only contract directly observable: stub a resolving
// TV model hint, watch the class get ADDED after the sync ruling; stub a
// non-TV hint or a rejecting probe, watch the ruling stand.

// stubUserAgentData — plant the Chromium-only navigator.userAgentData slice
// with a mock getHighEntropyValues; returns the mock for call assertions.
function stubUserAgentData(values: { model?: string }): ReturnType<typeof vi.fn> {
  const getHighEntropyValues = vi.fn().mockReturnValue(Promise.resolve(values));
  Object.defineProperty(navigator, "userAgentData", {
    configurable: true,
    value: { getHighEntropyValues },
  });
  return getHighEntropyValues;
}

describe("applyTvMode — the boot apply (the ThemeToggle.tsx idiom)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, "userAgentData");
    localStorage.removeItem(TV_KEY);
    document.documentElement.classList.remove("tv");
  });

  it("boot_applies_tv_class_from_stored_on", async () => {
    localStorage.setItem(TV_KEY, "on");
    const probe = stubUserAgentData({ model: "AFT7" });
    const applied = applyTvMode();
    // Synchronous: the class landed before any await, and a manual «Вкл»
    // ruling needs no probe round-trip at all.
    expect(document.documentElement.classList.contains("tv")).toBe(true);
    expect(probe).not.toHaveBeenCalled();
    await applied;
    expect(probe).not.toHaveBeenCalled();
    expect(document.documentElement.classList.contains("tv")).toBe(true);
  });

  it("boot_stored_off_keeps_desktop_synchronously", async () => {
    localStorage.setItem(TV_KEY, "off");
    const probe = stubUserAgentData({ model: "AFT7" });
    const applied = applyTvMode();
    expect(document.documentElement.classList.contains("tv")).toBe(false);
    expect(probe).not.toHaveBeenCalled();
    await applied;
    // A resolving TV hint never second-guesses a manual «Выкл» ruling.
    expect(document.documentElement.classList.contains("tv")).toBe(false);
  });

  it("boot_upgrade_only_async_model", async () => {
    // Sync desktop ruling: no class yet, probe armed.
    const probe = stubUserAgentData({ model: "AFT7" });
    const applied = applyTvMode();
    expect(document.documentElement.classList.contains("tv")).toBe(false);
    expect(probe).toHaveBeenCalledWith(["model"]);
    // The resolving TV model hint ADDS the class — the upgrade.
    await applied;
    expect(document.documentElement.classList.contains("tv")).toBe(true);

    // Upgrade-ONLY, part 1: a non-TV hint on a desktop boot adds nothing —
    // the sync ruling re-applies (class off) and the probe leaves it off.
    stubUserAgentData({ model: "MacBookPro18,1" });
    await applyTvMode();
    expect(document.documentElement.classList.contains("tv")).toBe(false);

    // Upgrade-ONLY, part 2: an already-on class is never removed — an
    // auto-desktop ruling is the only state the probe is armed in, so a
    // manual «Вкл» boot with a non-TV hint stays on untouched.
    localStorage.setItem(TV_KEY, "on");
    await applyTvMode();
    expect(document.documentElement.classList.contains("tv")).toBe(true);
  });

  it("boot_guarded_store_degrades_desktop", async () => {
    // A throwing storage layer: readTvOverride floors to auto, the apply
    // stays desktop, and neither the sync path nor the probe tail throws.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const applied = applyTvMode();
    expect(document.documentElement.classList.contains("tv")).toBe(false);
    await expect(applied).resolves.toBeUndefined();
    expect(document.documentElement.classList.contains("tv")).toBe(false);

    // An available-but-rejecting probe API degrades the same way.
    Reflect.deleteProperty(navigator, "userAgentData");
    vi.restoreAllMocks();
    Object.defineProperty(navigator, "userAgentData", {
      configurable: true,
      value: {
        getHighEntropyValues: vi
          .fn()
          .mockReturnValue(Promise.reject(new Error("no entropy"))),
      },
    });
    await expect(applyTvMode()).resolves.toBeUndefined();
    expect(document.documentElement.classList.contains("tv")).toBe(false);
  });
});
