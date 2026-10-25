// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  classifySkipSection,
  skipSectionAt,
  skipSections,
  type SkipSection,
} from "@/lib/skipSections";
import type { PlaybackSection } from "@/lib/api";

// watch-flow-polish 3.1 — the pure classification floor behind the skip
// chip: a served section classifies ONLY when it is a chapter carrying both
// start and end whose lowercase title is in the small lexicon (intro:
// intro/опенинг/opening; credits: credits/титры/ending/outro/ed). Everything
// else — marker kinds, end-less chapters, unknown titles, substring look-
// alikes — classifies to nothing: the SPA never fabricates a skip range.

function section(overrides: Partial<PlaybackSection>): PlaybackSection {
  return { kind: "chapter", start: 0, ...overrides };
}

describe("classifies_intro_and_credits_chapters", () => {
  it("classifies lexicon titles into intro and credits ranges", () => {
    const intro = section({ start: 0, end: 90, title: "Intro" });
    const opening = section({ start: 0, end: 95, title: "Opening" });
    const openingRu = section({ start: 0, end: 95, title: "ОПЕНИНГ" });
    const credits = section({ start: 1300, end: 1400, title: "Credits" });
    const ending = section({ start: 1300, end: 1400, title: "Ending" });
    const outro = section({ start: 1300, end: 1400, title: "Outro" });
    const ed = section({ start: 1300, end: 1400, title: "ED" });
    const titry = section({ start: 1300, end: 1400, title: "Титры" });

    expect(classifySkipSection(intro)).toEqual({ kind: "intro", start: 0, end: 90 });
    expect(classifySkipSection(opening)?.kind).toBe("intro");
    expect(classifySkipSection(openingRu)?.kind).toBe("intro");
    expect(classifySkipSection(credits)).toEqual({ kind: "credits", start: 1300, end: 1400 });
    expect(classifySkipSection(ending)?.kind).toBe("credits");
    expect(classifySkipSection(outro)?.kind).toBe("credits");
    expect(classifySkipSection(ed)?.kind).toBe("credits");
    expect(classifySkipSection(titry)?.kind).toBe("credits");
  });

  it("matches the title case-insensitively after trimming", () => {
    expect(classifySkipSection(section({ end: 90, title: "  iNtRo " }))?.kind).toBe("intro");
    expect(classifySkipSection(section({ end: 90, title: "титры" }))?.kind).toBe("credits");
  });

  it("classifies non-chapter sections to nothing", () => {
    expect(classifySkipSection(section({ kind: "marker", end: 90, title: "Intro" }))).toBeNull();
    expect(classifySkipSection(section({ kind: "intro", end: 90, title: "Intro" }))).toBeNull();
  });

  it("classifies chapters missing start or end to nothing", () => {
    expect(classifySkipSection(section({ start: 90, title: "Intro" }))).toBeNull();
    expect(
      classifySkipSection({ kind: "chapter", end: 90, title: "Intro" } as PlaybackSection),
    ).toBeNull();
  });

  it("classifies unknown, absent and look-alike titles to nothing", () => {
    expect(classifySkipSection(section({ end: 300, title: "Cold open" }))).toBeNull();
    expect(classifySkipSection(section({ end: 300, title: "Эпизод 1" }))).toBeNull();
    // Substring matching would fabricate a credits chip out of "ed".
    expect(classifySkipSection(section({ end: 300, title: "Wedding" }))).toBeNull();
    expect(classifySkipSection(section({ end: 300 }))).toBeNull();
  });

  it("skipSections keeps only classified ranges in served order", () => {
    const sections: PlaybackSection[] = [
      section({ start: 0, end: 90, title: "Intro" }),
      section({ start: 90, end: 300, title: "Cold open" }),
      section({ start: 3661, title: "Глава 2" }), // no end → nothing
      section({ start: 4000, end: 4100, title: "Титры" }),
    ];
    expect(skipSections(sections)).toEqual([
      { kind: "intro", start: 0, end: 90 },
      { kind: "credits", start: 4000, end: 4100 },
    ]);
    expect(skipSections([])).toEqual([]);
  });

  it("skipSectionAt answers the range containing the playhead (start inclusive, end exclusive)", () => {
    const ranges: SkipSection[] = [
      { kind: "intro", start: 0, end: 90 },
      { kind: "credits", start: 4000, end: 4100 },
    ];
    expect(skipSectionAt(ranges, 0)).toEqual(ranges[0]);
    expect(skipSectionAt(ranges, 89.5)).toEqual(ranges[0]);
    expect(skipSectionAt(ranges, 90)).toBeNull();
    expect(skipSectionAt(ranges, 4050)).toEqual(ranges[1]);
    expect(skipSectionAt(ranges, 4100)).toBeNull();
    expect(skipSectionAt([], 10)).toBeNull();
  });
});

// ---- the golden classification joint (watch-flow-polish 4.1) ------------------
// ONE committed fixture — internal/stream/testdata/golden/sections_chapters.json
// — pins BOTH halves of the chapters→chip contract. The Go half is
// TestSectionsGolden (internal/stream/sections_golden_test.go): the REAL
// projector must emit each vector's expected_sections from its verbatim ffprobe
// blob. This block is the SPA half: the REAL classifier consumes those SAME
// expected_sections — shape-identical to what the descriptor serves — and must
// reproduce the fixture's expected_skip per section (intro | credits | null),
// plus skipSections' served-order compaction of them. A one-sided change — the
// projection reshapes or reorders, the lexicon or kind-guard drifts, the
// fixture edited for one suite alone — fails the other side's suite by
// construction. (Fixture loaded via the naming.test.ts relative-path idiom.)

interface SectionsGoldenVector {
  name: string;
  note?: string;
  expected_sections: PlaybackSection[];
  expected_skip: ("intro" | "credits" | null)[];
}

const goldenModuleDir = path.dirname(
  import.meta.url.startsWith("file:") ? fileURLToPath(import.meta.url) : import.meta.url,
);
const SECTIONS_GOLDEN_PATH = path.resolve(
  goldenModuleDir,
  "../../../internal/stream/testdata/golden/sections_chapters.json",
);
const sectionsGolden = JSON.parse(readFileSync(SECTIONS_GOLDEN_PATH, "utf8")) as {
  vectors: SectionsGoldenVector[];
  web_defensive: {
    note?: string;
    sections: PlaybackSection[];
    expected_skip: ("intro" | "credits" | null)[];
  };
};

describe("sections_projection_golden", () => {
  it("classifies every golden section to the fixture's expected_skip and compacts in served order", () => {
    expect(sectionsGolden.vectors).toHaveLength(7);
    for (const vector of sectionsGolden.vectors) {
      expect(vector.expected_skip, `vector ${vector.name}`).toHaveLength(
        vector.expected_sections.length,
      );
      for (let i = 0; i < vector.expected_sections.length; i++) {
        const section = vector.expected_sections[i]!;
        const want = vector.expected_skip[i]!;
        const got = classifySkipSection(section);
        if (want === null) {
          expect(got, `vector ${vector.name} section ${i}`).toBeNull();
        } else {
          expect(got, `vector ${vector.name} section ${i}`).toEqual({
            kind: want,
            start: section.start,
            end: section.end,
          });
        }
      }
      // skipSections — the compacted, served-order list the chip lane drives.
      const wantRanges = vector.expected_sections
        .map((section, i) => ({ section, want: vector.expected_skip[i] }))
        .filter(
          (entry): entry is { section: PlaybackSection; want: "intro" | "credits" } =>
            entry.want === "intro" || entry.want === "credits",
        )
        .map(({ section, want }) => ({
          kind: want,
          start: section.start,
          end: section.end as number,
        }));
      expect(skipSections(vector.expected_sections), `vector ${vector.name}`).toEqual(wantRanges);
    }
  });

  it("the kind-guard refuses the non-chapter shapes the projection never produces", () => {
    const defensive = sectionsGolden.web_defensive;
    expect(defensive.sections).toHaveLength(defensive.expected_skip.length);
    defensive.sections.forEach((section, i) => {
      expect(classifySkipSection(section), `defensive section ${i}`).toBeNull();
    });
  });
});
