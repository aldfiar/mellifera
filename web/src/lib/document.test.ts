// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";

import {
  provenanceEntries,
  sourcesOf,
  stageEntries,
  viewEntries,
  type ItemDocument,
} from "@/lib/document";

// Unit tests for the pure §3.1 document model. The accessors are asserted
// against documents shaped like the ones the Go enricher commits (see
// internal/enrich/enrich_test.go) — including Cyrillic values and non-integer
// numbers, which must round-trip verbatim (INV-no-rounding; no collapsing).

describe("sourcesOf", () => {
  it("returns one entry per plugin namespace in insertion order, keyed by plugin_id", () => {
    const doc: ItemDocument = {
      sources: {
        "tv-parser": { title: "Breaking Bad", season: 1 },
        "tmdb-lookup": { overview: "…" },
      },
    };

    const out = sourcesOf(doc);

    expect(out.map((s) => s.pluginId)).toEqual(["tv-parser", "tmdb-lookup"]);
    expect(out[0]!.namespace).toEqual({ title: "Breaking Bad", season: 1 });
  });

  it("returns [] when sources is missing", () => {
    expect(sourcesOf({})).toEqual([]);
  });

  it("returns [] when sources is not an object (hostile JSON)", () => {
    expect(sourcesOf({ sources: 42 as unknown as ItemDocument["sources"] })).toEqual([]);
  });
});

describe("viewEntries", () => {
  it("returns entries in insertion order with values verbatim — no rounding, no collapsing", () => {
    const doc: ItemDocument = {
      _view: {
        title: { value: "Сериалы", source: "tv-parser", reason: "parsed filename" },
        rating: { value: 8.9, source: "tmdb-lookup", lang: "en", reason: "tmdb vote_average" },
      },
    };

    const out = viewEntries(doc);

    expect(out.map((e) => e.fieldPath)).toEqual(["title", "rating"]);
    expect(out[0]!.entry.value).toBe("Сериалы"); // Cyrillic passthrough untouched
    expect(out[1]!.entry.value).toBe(8.9); // not 9, not "8.90"
    expect(out[1]!.entry.lang).toBe("en");
  });

  it("returns [] when _view is missing", () => {
    expect(viewEntries({})).toEqual([]);
  });
});

describe("provenanceEntries", () => {
  it("returns entries in insertion order keyed by field_path", () => {
    const doc: ItemDocument = {
      _provenance: {
        title: { plugin_id: "tv-parser", plugin_version: "1.2.3", confidence: 0.95 },
        overview: { plugin_id: "tmdb-lookup", source_url: "https://example.test/x" },
      },
    };

    const out = provenanceEntries(doc);

    expect(out.map((e) => e.fieldPath)).toEqual(["title", "overview"]);
    expect(out[0]!.entry.plugin_id).toBe("tv-parser");
    expect(out[0]!.entry.confidence).toBe(0.95);
  });

  it("returns [] when _provenance is missing", () => {
    expect(provenanceEntries({})).toEqual([]);
  });
});

describe("stageEntries", () => {
  it("returns _stages in order incl. advanced_to and the optional error", () => {
    const stages: ItemDocument["_stages"] = [
      {
        stage: "metadata_source",
        plugin_id: "tv-parser",
        status: "ok",
        advanced_to: "parsed",
        started_at: "2026-01-01T00:00:00Z",
        finished_at: "2026-01-01T00:00:01Z",
      },
      {
        stage: "metadata_source",
        plugin_id: "tmdb-lookup",
        status: "failed",
        advanced_to: "failed",
        started_at: "2026-01-01T00:00:02Z",
        finished_at: "2026-01-01T00:00:03Z",
        error: "upstream 503",
      },
    ];

    const out = stageEntries({ _stages: stages });

    expect(out).toHaveLength(2);
    expect(out[0]!.advanced_to).toBe("parsed");
    expect(out[0]!.error).toBeUndefined();
    expect(out[1]!.error).toBe("upstream 503");
  });

  it("returns [] when _stages is missing or not an array", () => {
    expect(stageEntries({})).toEqual([]);
    expect(stageEntries({ _stages: "nope" as unknown as ItemDocument["_stages"] })).toEqual([]);
  });
});

describe("ItemDocument fidelity", () => {
  it("preserves unknown top-level keys (never collapse)", () => {
    const doc: ItemDocument = { ffprobe: { streams: [{ codec_type: "video" }] }, custom_key: { a: 1 } };

    expect(doc.custom_key).toEqual({ a: 1 });
    expect(doc.ffprobe).toEqual({ streams: [{ codec_type: "video" }] });
  });
});
