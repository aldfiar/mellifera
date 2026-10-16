// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";

import {
  composeItemName,
  episodeFacts,
  seriesName,
  type ElementTokens,
} from "@/lib/naming";
import type { ItemDocument } from "@/lib/document";

// Golden vectors for the Naming section's live preview: web/src/lib/naming.ts
// composeItemName MUST match internal/api/display.go composeItemName
// byte-for-byte (the mirror is test-pinned — a composer change in display.go
// without updating these vectors fails here). The vectors are the spec's
// required set — {episode} inside the title, 3-digit episodes in full, an
// absent token rendering as the empty string, the default template, Cyrillic
// verbatim — plus the free-text/no-separator-grammar rule and the preview
// facts readers (episodeFacts, seriesName).

const DEFAULT = "{title} · S{season}E{episode}";

function tokens(parts: Partial<ElementTokens>): ElementTokens {
  return { title: "", season: null, episode: null, ...parts };
}

describe("composeItemName — golden vectors (display.go mirror)", () => {
  it("the default template renders {title} · S{season}E{episode} with %02d padding", () => {
    expect(composeItemName(DEFAULT, tokens({ title: "Show", season: 1, episode: 2 }))).toBe(
      "Show · S01E02",
    );
    expect(composeItemName(DEFAULT, tokens({ title: "Show", season: 12, episode: 34 }))).toBe(
      "Show · S12E34",
    );
  });

  it("{episode} inside the title is NEVER re-scanned (one pass — injected values are not substituted)", () => {
    expect(
      composeItemName("{title}", tokens({ title: "Doom {episode} Patrol", episode: 5 })),
    ).toBe("Doom {episode} Patrol");
    // A template that literally repeats the token around an injected title
    // stays one-pass too.
    expect(
      composeItemName(
        "{title}E{episode}",
        tokens({ title: "Seq-{episode}", episode: 7 }),
      ),
    ).toBe("Seq-{episode}E07");
  });

  it("3-digit (and larger) episodes render in full — %02d is a minimum width", () => {
    expect(composeItemName(DEFAULT, tokens({ title: "Show", season: 2, episode: 142 }))).toBe(
      "Show · S02E142",
    );
    expect(composeItemName(DEFAULT, tokens({ title: "Show", season: 100, episode: 1234 }))).toBe(
      "Show · S100E1234",
    );
  });

  it("an absent token renders as the EMPTY string — never a placeholder, never the raw token", () => {
    expect(composeItemName(DEFAULT, tokens({ title: "Show", episode: 7 }))).toBe("Show · SE07");
    expect(composeItemName(DEFAULT, tokens({ title: "Show", season: 1 }))).toBe("Show · S01E");
    expect(composeItemName(DEFAULT, tokens({ title: "Show" }))).toBe("Show · SE");
    expect(composeItemName(DEFAULT, tokens({ season: 1, episode: 2 }))).toBe(" · S01E02");
  });

  it("Cyrillic — and any non-ASCII text — passes through verbatim (no normalization anywhere)", () => {
    expect(
      composeItemName(DEFAULT, tokens({ title: "Ход королевы", season: 1, episode: 5 })),
    ).toBe("Ход королевы · S01E05");
    // Cyrillic free text inside the template itself, byte-for-byte.
    expect(
      composeItemName("{title} — серия {episode}", tokens({ title: "Шерлок", episode: 3 })),
    ).toBe("Шерлок — серия 03");
  });

  it("free text copies through byte-for-byte; unknown/unclosed groups are free text (no separator grammar)", () => {
    expect(
      composeItemName("{title} {season}of{episode} ({unknown}) {", tokens({ title: "T", season: 1, episode: 2 })),
    ).toBe("T 01of02 ({unknown}) {");
  });
});

describe("episodeFacts — the sample row's (path, season, episode)", () => {
  it("reads the FIRST qualifying namespace in the fixed order (serial-parser, tv-parser, then sorted)", () => {
    const doc: ItemDocument = {
      parsed: { series_relative_path: "Show (2019)" },
      sources: {
        "tv-parser": { season: 9, episode: 9 },
        "serial-parser": { season: 1, episode: 2 },
      },
    };
    expect(episodeFacts(doc)).toEqual({ path: "Show (2019)", season: 1, episode: 2 });
  });

  it("falls through namespaces lacking BOTH integers; 2.0-quantified numbers qualify", () => {
    const doc: ItemDocument = {
      parsed: { series_relative_path: "Show" },
      sources: {
        "a-meta": { season: 1 }, // season only — skipped
        "z-other": { season: 2.0, episode: 4.0 }, // integer-valued — qualifies
      },
    };
    expect(episodeFacts(doc)).toEqual({ path: "Show", season: 2, episode: 4 });
  });

  it("null when the anchor or both integers are missing — never a guessed fact", () => {
    expect(episodeFacts({ sources: { "tv-parser": { season: 1, episode: 2 } } })).toBeNull();
    expect(episodeFacts({ parsed: { series_relative_path: "Show" } })).toBeNull();
    expect(episodeFacts({ parsed: {}, sources: {} })).toBeNull();
  });
});

describe("seriesName — the {title} token's feed (namer.seriesName mirror)", () => {
  const base = { relative_path: "Show (2019)", document: {} as ItemDocument };

  it("override > serial-parser clean title > dir_name_raw > last segment", () => {
    expect(seriesName({ ...base, title_override: "Mine" }, "clean")).toBe("Mine");
    expect(
      seriesName(
        { ...base, document: { sources: { "serial-parser": { title: "Clean" } } } },
        "clean",
      ),
    ).toBe("Clean");
    expect(seriesName({ ...base, document: { parsed: { dir_name_raw: "Show.2019" } } }, "clean")).toBe(
      "Show.2019",
    );
    expect(seriesName(base, "clean")).toBe("Show (2019)");
  });

  it('groupStyle "raw" skips the cleaned title tier', () => {
    const sr = {
      ...base,
      document: {
        sources: { "serial-parser": { title: "Clean" } },
        parsed: { dir_name_raw: "Show.2019" },
      },
    };
    expect(seriesName(sr, "raw")).toBe("Show.2019");
    expect(seriesName(sr, "")).toBe("Clean");
  });
});
