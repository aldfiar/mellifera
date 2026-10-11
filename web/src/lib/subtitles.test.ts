// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";

import {
  convertToVtt,
  isRenderableSubtitle,
  sidecarLabel,
  subtitleSidecars,
} from "@/lib/subtitles";
import type { ItemDocument } from "@/lib/document";

// serial-watch-flow boxes 5.1/5.2 — the pure converter floor: document-indexed
// subtitle sidecar selection facts (kind filter + language-then-folder-then-
// file labels + renderability), the .vtt passthrough, the .srt → WebVTT text
// transform, and the .ass/.ssa dialogue extraction (timing + text, styling
// dropped). A .sub is NEVER converted — null from the converter and
// renderable:false in the selection facts (box 5.2's not-renderable state).

function docWithSidecars(sidecars: unknown): ItemDocument {
  return { parsed: { sidecars } };
}

describe("subtitleSidecars — kind filter, document indices, labels, renderability", () => {
  it("keeps only subtitle sidecars at their DOCUMENT indices (audio interleaved)", () => {
    const entries = subtitleSidecars(
      docWithSidecars([
        { relative_path: "s01e01.ass", kind: "subtitle", language: "" },
        { relative_path: "Rus sound/s01e01.mka", kind: "audio", language: "Русская" },
        { relative_path: "Rus subs/s01e01.srt", kind: "subtitle", language: "Русская" },
      ]),
    );
    expect(entries.map((e) => e.index)).toEqual([0, 2]);
    expect(entries.map((e) => e.label)).toEqual(["s01e01.ass", "Русская"]);
    expect(entries.every((e) => e.renderable)).toBe(true);
  });

  it("marks .sub not renderable and labels it by its folder", () => {
    const entries = subtitleSidecars(
      docWithSidecars([
        { relative_path: "Rus subs/s01e01.sub", kind: "subtitle", language: "" },
      ]),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].renderable).toBe(false);
    expect(entries[0].label).toBe("Rus subs");
  });

  it("yields [] for a document without sidecar facts", () => {
    expect(subtitleSidecars({ sources: {} })).toEqual([]);
    expect(subtitleSidecars({ parsed: {} })).toEqual([]);
  });
});

describe("sidecarLabel — language-then-folder-then-file", () => {
  it("prefers the stamped language", () => {
    expect(sidecarLabel("Rus subs/s01e01.srt", "Русская")).toBe("Русская");
  });

  it("falls back to the containing folder, then the bare file name", () => {
    expect(sidecarLabel("Rus subs/s01e01.srt", "")).toBe("Rus subs");
    expect(sidecarLabel("s01e01.ass", "")).toBe("s01e01.ass");
  });
});

describe("isRenderableSubtitle", () => {
  it("accepts the four renderable formats and rejects .sub and unknown", () => {
    expect(isRenderableSubtitle("a/b.srt")).toBe(true);
    expect(isRenderableSubtitle("a/b.vtt")).toBe(true);
    expect(isRenderableSubtitle("a/b.ass")).toBe(true);
    expect(isRenderableSubtitle("a/b.SSA")).toBe(true);
    expect(isRenderableSubtitle("a/b.sub")).toBe(false);
    expect(isRenderableSubtitle("a/b.txt")).toBe(false);
    expect(isRenderableSubtitle("noext")).toBe(false);
  });
});

describe("convertToVtt — .vtt passthrough", () => {
  it("returns WebVTT content verbatim", () => {
    const vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nПривет";
    expect(convertToVtt("subs.vtt", vtt)).toBe(vtt);
  });
});

describe("convertToVtt — .srt → WebVTT", () => {
  it("prepends the header and turns comma millis into dots, text untouched", () => {
    const srt = [
      "1",
      "00:00:01,500 --> 00:00:04,000",
      "Привет, мир",
      "",
      "2",
      "00:01:02,250 --> 00:01:05,000",
      "Second line, with comma",
    ].join("\n");
    expect(convertToVtt("s01e01.srt", srt)).toBe(
      [
        "WEBVTT",
        "",
        "1",
        "00:00:01.500 --> 00:00:04.000",
        "Привет, мир",
        "",
        "2",
        "00:01:02.250 --> 00:01:05.000",
        "Second line, with comma",
      ].join("\n"),
    );
  });

  it("strips the UTF-8 BOM and handles CRLF", () => {
    const srt = "﻿1\r\n00:00:00,000 --> 00:00:01,000\r\nHi";
    const vtt = convertToVtt("s.srt", srt) ?? "";
    expect(vtt.startsWith("WEBVTT\n\n1\n00:00:00.000")).toBe(true);
    expect(vtt).toContain("Hi");
  });
});

describe("convertToVtt — .ass/.ssa dialogue extraction", () => {
  const ass = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    "Dialogue: 0,0:00:01.10,0:00:03.50,Default,,0,0,0,,Привет {\\i1}styled{\\i0} мир",
    "Dialogue: 0,0:00:05.00,0:01:00.00,Default,,0,0,0,,Line one\\NLine two",
    "Dialogue: 0,0:01:02.00,0:01:04.00,Default,,0,0,0,,Text, with commas, survives",
  ].join("\n");

  it.each([".ass", ".ssa"])(
    "extracts dialogue timing and text from %s, dropping styling",
    (ext) => {
      const vtt = convertToVtt(`s01e01${ext}`, ass) ?? "";
      expect(vtt.startsWith("WEBVTT\n\n")).toBe(true);
      expect(vtt).toContain("00:00:01.100 --> 00:00:03.500\nПривет styled мир");
      expect(vtt).toContain("00:00:05.000 --> 00:01:00.000\nLine one\nLine two");
      // Non-dialogue script sections and override blocks never leak through —
      // the TAGS are dropped, the words between them stay.
      expect(vtt).not.toContain("ScriptType");
      expect(vtt).not.toContain("{\\i1}");
    },
  );

  it("keeps commas inside the trailing Text field (Format-order split)", () => {
    const vtt = convertToVtt("s01e01.ass", ass) ?? "";
    expect(vtt).toContain("00:01:02.000 --> 00:01:04.000\nText, with commas, survives");
  });

  it("drops a dialogue line with unparseable timing instead of breaking the rest", () => {
    const broken = [
      "[Events]",
      "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
      "Dialogue: 0,not-a-time,0:00:03.50,Default,,0,0,0,,lost",
      "Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,kept",
    ].join("\n");
    const vtt = convertToVtt("s.ass", broken) ?? "";
    expect(vtt).not.toContain("lost");
    expect(vtt).toContain("00:00:01.000 --> 00:00:02.000\nkept");
  });
});

describe("convertToVtt — not-renderable formats", () => {
  it("returns null for .sub (MicroDVD) and unknown extensions — never converted garbage", () => {
    const microdvd = "{120}{180}Привет";
    expect(convertToVtt("s01e01.sub", microdvd)).toBeNull();
    expect(convertToVtt("s01e01.txt", microdvd)).toBeNull();
  });
});
