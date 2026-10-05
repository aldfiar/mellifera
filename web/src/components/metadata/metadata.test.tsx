// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { JsonValue } from "@/components/metadata/JsonValue";
import { ProvenanceBadge } from "@/components/metadata/ProvenanceBadge";
import { SourceCard } from "@/components/metadata/SourceCard";
import { StagesProgress } from "@/components/metadata/StagesProgress";
import { ViewFields } from "@/components/metadata/ViewFields";
import type {
  ItemDocument,
  ProvenanceEntry,
  StageEntry,
  ViewEntry,
} from "@/lib/document";
import {
  provenanceEntries,
  sourcesOf,
  stageEntries,
  viewEntries,
} from "@/lib/document";

// Group-2 slice: the metadata components + the document accessors they consume
// (the consumer joint). Fidelity invariants are the point — values render
// VERBATIM (full-precision numbers, Cyrillic passthrough, JSON literals),
// namespaces stay separate, and stage errors surface. No network, no mocks:
// everything is parsed-data-in → markup-out.

describe("JsonValue — lossless recursion", () => {
  it("renders a full-precision number verbatim (no rounding/reformatting)", () => {
    render(<JsonValue value={0.30000000000000004} />);
    expect(screen.getByText("0.30000000000000004")).toBeDefined();
  });

  it("renders an integer and a boolean as their exact literals", () => {
    render(
      <div>
        <JsonValue value={42} />
        <JsonValue value={false} />
      </div>,
    );
    expect(screen.getByText("42")).toBeDefined();
    expect(screen.getByText("false")).toBeDefined();
  });

  it("renders null as the JSON literal and passes Cyrillic strings through untouched", () => {
    render(
      <div>
        <JsonValue value={null} />
        <JsonValue value={"Привет мир — сериал «Оська»"} />
      </div>,
    );
    expect(screen.getByText("null")).toBeDefined();
    expect(screen.getByText("Привет мир — сериал «Оська»")).toBeDefined();
  });

  it("recurses into nested objects and arrays without dropping any key or value", () => {
    render(
      <JsonValue
        value={{
          stream: { codec: "h264", rate: 23.976023976023978 },
          tags: ["кино", 7, null, { deep: true }],
        }}
      />,
    );
    // Every key…
    expect(screen.getByText("stream")).toBeDefined();
    expect(screen.getByText("codec")).toBeDefined();
    expect(screen.getByText("tags")).toBeDefined();
    expect(screen.getByText("deep")).toBeDefined();
    // …and every value, including the nested full-precision number.
    expect(screen.getByText("h264")).toBeDefined();
    expect(screen.getByText("23.976023976023978")).toBeDefined();
    expect(screen.getByText("кино")).toBeDefined();
    expect(screen.getByText("7")).toBeDefined();
    expect(screen.getByText("null")).toBeDefined();
    expect(screen.getByText("true")).toBeDefined();
  });
});

describe("SourceCard — one namespace, never merged", () => {
  it("renders the pluginId as the card title and its fields verbatim", () => {
    render(
      <SourceCard
        pluginId="tv-parser"
        namespace={{ title: "Твин Пикс", year: 1990, rating: 8.700000000000001 }}
      />,
    );
    expect(screen.getByText("tv-parser")).toBeDefined();
    expect(screen.getByText("title")).toBeDefined();
    expect(screen.getByText("Твин Пикс")).toBeDefined();
    expect(screen.getByText("1990")).toBeDefined();
    expect(screen.getByText("8.700000000000001")).toBeDefined();
  });

  it("keeps two plugins' same-named fields separate when mounted side by side", () => {
    render(
      <div>
        <SourceCard pluginId="plugin-a" namespace={{ duration: 3600 }} />
        <SourceCard pluginId="plugin-b" namespace={{ duration: 59.95 }} />
      </div>,
    );
    expect(screen.getByText("plugin-a")).toBeDefined();
    expect(screen.getByText("plugin-b")).toBeDefined();
    expect(screen.getByText("3600")).toBeDefined();
    expect(screen.getByText("59.95")).toBeDefined();
  });
});

describe("ViewFields — Tier-3 values verbatim with their context", () => {
  it("renders each field path, its raw value, and the source/lang/reason line", () => {
    const entries: Record<string, ViewEntry> = {
      title: {
        value: "Ось",
        source: "tv-parser",
        lang: "ru",
        reason: "first non-empty title",
      },
      duration_s: {
        value: 3600.5,
        source: "ffprobe",
        reason: "container duration",
      },
    };
    render(<ViewFields entries={entries} />);
    expect(screen.getByText("title")).toBeDefined();
    expect(screen.getByText("Ось")).toBeDefined();
    expect(screen.getByText("duration_s")).toBeDefined();
    expect(screen.getByText("3600.5")).toBeDefined();
    expect(screen.getByText("tv-parser (ru) — first non-empty title")).toBeDefined();
    expect(screen.getByText("ffprobe — container duration")).toBeDefined();
  });

  it("renders the empty state for an empty record", () => {
    render(<ViewFields entries={{}} />);
    expect(screen.getByText("No computed fields")).toBeDefined();
  });
});

describe("ProvenanceBadge — the audit trail entry", () => {
  it("renders the field path, plugin, and an unrounded confidence", () => {
    const entry: ProvenanceEntry = {
      plugin_id: "tv-parser",
      plugin_version: "1.2.3",
      fetched_at: "2026-08-05T10:00:00Z",
      confidence: 0.925,
      source_url: "https://example.com/item/42",
    };
    render(
      <ul>
        <ProvenanceBadge fieldPath="title" entry={entry} />
      </ul>,
    );
    expect(screen.getByText("title")).toBeDefined();
    expect(screen.getByText("tv-parser")).toBeDefined();
    expect(screen.getByText("1.2.3")).toBeDefined();
    expect(screen.getByText("2026-08-05T10:00:00Z")).toBeDefined();
    expect(screen.getByText("0.925")).toBeDefined();
    expect(screen.getByText("https://example.com/item/42")).toBeDefined();
  });

  it("omits optional fields that are absent", () => {
    render(
      <ul>
        <ProvenanceBadge fieldPath="year" entry={{ plugin_id: "p" }} />
      </ul>,
    );
    expect(screen.getByText("year")).toBeDefined();
    expect(screen.queryByText("1.2.3")).toBeNull();
  });
});

describe("StagesProgress — the pipeline trail", () => {
  const stages: StageEntry[] = [
    {
      stage: "metadata_source",
      plugin_id: "tv-parser",
      status: "ok",
      advanced_to: "parsed",
      started_at: "2026-08-05T10:00:00Z",
      finished_at: "2026-08-05T10:00:01Z",
    },
    {
      stage: "metadata_source",
      plugin_id: "image-enricher",
      status: "failed",
      advanced_to: "failed",
      started_at: "2026-08-05T10:00:02Z",
      finished_at: "2026-08-05T10:00:03Z",
      error: "upstream timeout",
    },
  ];

  it("renders each stage in order with its fields verbatim", () => {
    render(<StagesProgress stages={stages} />);
    expect(screen.getByText("tv-parser")).toBeDefined();
    expect(screen.getByText("image-enricher")).toBeDefined();
    expect(screen.getByText("ok")).toBeDefined();
    expect(screen.getByText("failed")).toBeDefined();
    expect(screen.getByText("→ parsed")).toBeDefined();
    expect(screen.getByText("2026-08-05T10:00:00Z — 2026-08-05T10:00:01Z")).toBeDefined();
  });

  it("renders a failed stage's error text", () => {
    render(<StagesProgress stages={stages} />);
    expect(screen.getByText("upstream timeout")).toBeDefined();
  });

  it("renders the empty state when no stages are recorded", () => {
    render(<StagesProgress stages={[]} />);
    expect(screen.getByText("No pipeline stages recorded")).toBeDefined();
  });
});

describe("document accessors → components joint", () => {
  it("feeds ItemDetail's pieces straight from the accessors (insertion order)", () => {
    const doc: ItemDocument = {
      identifiers: { tmdb_id: 123, imdb_id: "tt0000123" },
      sources: {
        "plugin-first": { title: "Первый" },
        "plugin-second": { title: "Second" },
      },
      _view: { title: { value: "Первый", source: "plugin-first", reason: "r" } },
      _provenance: {
        title: { plugin_id: "plugin-first", confidence: 0.5 },
      },
      _stages: [
        {
          stage: "metadata_source",
          plugin_id: "plugin-first",
          status: "ok",
          advanced_to: "parsed",
          started_at: "2026-08-05T10:00:00Z",
          finished_at: "2026-08-05T10:00:01Z",
        },
      ],
    };

    const sources = sourcesOf(doc);
    expect(sources.map((s) => s.pluginId)).toEqual(["plugin-first", "plugin-second"]);

    const view = viewEntries(doc);
    expect(view).toHaveLength(1);
    render(
      <div>
        <ViewFields entries={Object.fromEntries(view.map((e) => [e.fieldPath, e.entry]))} />
        <ul>
          {provenanceEntries(doc).map((prov) => (
            <ProvenanceBadge
              key={prov.fieldPath}
              fieldPath={prov.fieldPath}
              entry={prov.entry}
            />
          ))}
        </ul>
        <StagesProgress stages={stageEntries(doc)} />
      </div>,
    );
    expect(screen.getByText("Первый")).toBeDefined();
    // "title" and "plugin-first" each appear in more than one component here.
    expect(screen.getAllByText("title").length).toBeGreaterThan(0);
    expect(screen.getAllByText("plugin-first").length).toBeGreaterThan(0);
  });
});
