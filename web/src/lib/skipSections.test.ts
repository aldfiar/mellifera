// SPDX-License-Identifier: Apache-2.0
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
