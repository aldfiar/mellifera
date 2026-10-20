// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  composeItemName,
  episodeFacts,
  itemName,
  seriesName,
  type ElementTokens,
  type NamerContext,
  type SeriesNameSource,
  type TitleSourcePair,
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

  it("the title walk runs above the parser title when SERVED pairs are given — and is skipped without them", () => {
    const sr: SeriesNameSource = {
      ...base,
      document: {
        sources: {
          shikimori: { title: { russian: "Атланта", romaji: "Atlanta romaji" } },
          "serial-parser": { title: "Clean" },
        },
      },
    };
    const pairs: TitleSourcePair[] = [{ id: "shikimori", enabled: true }];
    expect(seriesName(sr, "clean", pairs, ["ru", "en"])).toBe("Атланта");
    expect(seriesName(sr, "clean", pairs, ["en"])).toBe("Atlanta romaji");
    // No bindings served → the walk is skipped, chain byte-identical to pre-walk.
    expect(seriesName(sr, "clean")).toBe("Clean");
  });
});

// ---- the shared composer–SPA golden fixture ----------------------------------
// ONE committed file — internal/api/testdata/golden/title_vectors.json — pins
// BOTH composers (spec scenario 341a94e9c2975995): the Go half is
// TestGoldenTitleVectors (internal/api/golden_title_vectors_test.go), this is
// the SPA half. The vectors carry SERVED inputs only (title_sources pairs —
// the EFFECTIVE gate resolution — language_preference, the row documents);
// this mirror never resolves gates. A vector changed on either side alone
// fails that side's suite.

interface GoldenSourcePair {
  id: string;
  enabled: boolean;
}

interface GoldenRow {
  relative_path: string;
  title_override?: string;
  status?: string;
  document: ItemDocument;
}

interface GoldenVector {
  name: string;
  kind: "series" | "item";
  note?: string;
  group_style?: string;
  element_template?: string;
  title_sources?: GoldenSourcePair[];
  language_preference?: string[];
  series?: GoldenRow;
  library_series?: GoldenRow[];
  item?: GoldenRow;
  expected: string;
}

// Resolved from THIS file's location (web/src/lib/) — the fixture lives in the
// Go package's testdata convention. vitest's jsdom transform hands
// import.meta.url over as a plain filesystem path (no file: scheme), so both
// shapes are handled.
const moduleDir = path.dirname(
  import.meta.url.startsWith("file:") ? fileURLToPath(import.meta.url) : import.meta.url,
);
const GOLDEN_FIXTURE_PATH = path.resolve(
  moduleDir,
  "../../../internal/api/testdata/golden/title_vectors.json",
);

const goldenFixture = JSON.parse(readFileSync(GOLDEN_FIXTURE_PATH, "utf8")) as {
  vectors: GoldenVector[];
};

function goldenNamer(v: GoldenVector): NamerContext {
  return {
    groupStyle: v.group_style ?? "",
    elementTemplate: v.element_template ?? "",
    seriesByPath: (v.library_series ?? []).map((row) => ({
      relative_path: row.relative_path,
      title_override: row.title_override,
      status: row.status,
      document: row.document,
    })),
    seriesOverride: "",
    titleSources: v.title_sources ?? [],
    languagePreference: v.language_preference ?? [],
  };
}

describe("golden fixture — composer–SPA parity (title_vectors.json)", () => {
  it("the mirror composes every vector's expected name from the served inputs", () => {
    expect(goldenFixture.vectors).toHaveLength(11);
    for (const v of goldenFixture.vectors) {
      const n = goldenNamer(v);
      let got: string;
      if (v.kind === "series") {
        got = seriesName(
          {
            relative_path: v.series!.relative_path,
            title_override: v.series!.title_override,
            document: v.series!.document,
          },
          n.groupStyle,
          n.titleSources,
          n.languagePreference,
        );
      } else {
        // Point-read the resolved series' stored override (display.go
        // withSeriesOverride) from the fixture rows — no store behind it.
        const anchor = episodeFacts(v.item!.document);
        n.seriesOverride = anchor
          ? (n.seriesByPath.find((s) => s.relative_path === anchor.path)?.title_override ?? "")
          : "";
        got = itemName(v.item!.title_override ?? "", v.item!.document, n);
      }
      expect(got, `vector ${v.name}`).toBe(v.expected);
    }
  });
});
