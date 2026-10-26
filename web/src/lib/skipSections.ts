// SPDX-License-Identifier: Apache-2.0
import type { PlaybackSection } from "@/lib/api";

// Skip-section classification (watch-flow-polish 3.1, design D2 — SPA-side,
// served data only): a descriptor section classifies as a skippable intro or
// credits range ONLY when it is a served chapter (`kind === "chapter"`), both
// `start` and `end` are present, and the served lowercase title matches the
// small intro/credits lexicon. Anything else — a marker section, an
// end-less chapter, an unknown title — classifies to nothing: the SPA never
// fabricates a skip range (honest absence). The lexicon is UI vocabulary —
// presentation copy classifying what to call the chip — never a new wire
// field; the served shape is consumed exactly as `internal/stream` projects
// it. Pure module — no React, no DOM; unit-tested in skipSections.test.ts and
// driven directly by task 4.1's committed golden fixture.

// SkipKind — the two presentation classes a chapter can carry.
export type SkipKind = "intro" | "credits";

// SkipSection — one classified range: the presentation kind plus the
// seconds range the chip may appear in.
export interface SkipSection {
  kind: SkipKind;
  start: number;
  end: number;
}

// The lexicons — exact matches on the served title, trimmed and lowercased
// (Cyrillic muxer titles included). Substring matching is deliberately NOT
// used: "ed" inside "Wedding" would fabricate a credits chip.
const INTRO_TITLES: ReadonlySet<string> = new Set(["intro", "опенинг", "opening"]);
const CREDITS_TITLES: ReadonlySet<string> = new Set(["credits", "титры", "ending", "outro", "ed"]);

// classifySkipSection — one served section → its classified range, or null
// when it does not qualify (non-chapter kind, missing start/end, unknown or
// absent title, degenerate range).
export function classifySkipSection(section: PlaybackSection): SkipSection | null {
  if (section.kind !== "chapter") {
    return null;
  }
  const { start, end } = section;
  if (typeof start !== "number" || typeof end !== "number" || end <= start) {
    return null;
  }
  const title = typeof section.title === "string" ? section.title.trim().toLowerCase() : "";
  if (INTRO_TITLES.has(title)) {
    return { kind: "intro", start, end };
  }
  if (CREDITS_TITLES.has(title)) {
    return { kind: "credits", start, end };
  }
  return null;
}

// skipSections — the descriptor's section list projected to its classified
// ranges, served order preserved (the Go projection orders by start).
export function skipSections(sections: PlaybackSection[]): SkipSection[] {
  const out: SkipSection[] = [];
  for (const section of sections) {
    const skip = classifySkipSection(section);
    if (skip) {
      out.push(skip);
    }
  }
  return out;
}

// skipSectionAt — the classified range containing `seconds`, or null when
// the playhead is outside every range (start inclusive, end exclusive —
// activation seeks past the end, which must leave the range).
export function skipSectionAt(sections: SkipSection[], seconds: number): SkipSection | null {
  for (const skip of sections) {
    if (seconds >= skip.start && seconds < skip.end) {
      return skip;
    }
  }
  return null;
}
