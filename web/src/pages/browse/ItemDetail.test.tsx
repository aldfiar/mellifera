// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import * as apiModule from "@/lib/api";
import type { ItemResponse } from "@/lib/api";
import ItemDetail from "@/pages/browse/ItemDetail";

// Group-2 slice: ItemDetail → useItem → getItem (the S5-style consumer joint
// for /api/v1/items/{id}). getItem is mocked at the api seam, so the page's
// document rendering (verbatim values, one card per namespace) and its error
// edges (404 → not-found state, not a crash; other errors → code + message
// inline) are asserted independently of the network. End-to-end is QA1.

const ITEM_RESPONSE: ItemResponse = {
  item: {
    id: "itm_1_9",
    module_id: "tv",
    library_id: 1,
    file_id: "9",
    relative_path: "shows/Оська/s01e01.mkv",
    media_type: "video",
    schema_version: 1,
    status: "parsed",
    document: {
      identifiers: { tmdb_id: 42, imdb_id: "tt0000042" },
      sources: {
        "tv-parser": { title: "Оська", fps: 23.976023976023978 },
        "second-plugin": { title: "Oska" },
      },
      _view: {
        title: { value: "Оська", source: "tv-parser", lang: "ru", reason: "first" },
      },
      _provenance: {
        title: { plugin_id: "tv-parser", confidence: 0.98 },
      },
      _stages: [
        {
          stage: "metadata_source",
          plugin_id: "tv-parser",
          status: "failed",
          advanced_to: "failed",
          started_at: "2026-08-05T10:00:00Z",
          finished_at: "2026-08-05T10:00:01Z",
          error: "upstream 503",
        },
      ],
    },
  },
};

function renderAtId(id: string, client: QueryClient): void {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/items/${id}`]}>
        <Routes>
          <Route path="/items/:id" element={<ItemDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function freshClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

describe("ItemDetail — happy path (GET /api/v1/items/{id})", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("renders identifiers, one card per source namespace, view, provenance, and stages", async () => {
    vi.spyOn(apiModule, "getItem").mockResolvedValue(ITEM_RESPONSE);

    renderAtId("itm_1_9", freshClient());

    // Core-managed fields.
    expect(await screen.findByText("itm_1_9")).toBeDefined();
    expect(screen.getByText("shows/Оська/s01e01.mkv")).toBeDefined();
    expect(screen.getByText("parsed")).toBeDefined();

    // Tier-1 identifiers, verbatim.
    expect(screen.getByText("tmdb_id")).toBeDefined();
    expect(screen.getByText("42")).toBeDefined();
    expect(screen.getByText("tt0000042")).toBeDefined();

    // One SourceCard per namespace, same-named fields NOT merged, numbers
    // render at full precision. ("tv-parser" recurs across card title,
    // provenance, and stages.)
    expect(screen.getAllByText("tv-parser").length).toBeGreaterThan(0);
    expect(screen.getByText("second-plugin")).toBeDefined();
    expect(screen.getAllByText("Оська").length).toBeGreaterThan(0);
    expect(screen.getByText("Oska")).toBeDefined();
    expect(screen.getByText("23.976023976023978")).toBeDefined();

    // _view, _provenance, _stages (incl. the failed stage's error).
    expect(screen.getByText("tv-parser (ru) — first")).toBeDefined();
    expect(screen.getByText("0.98")).toBeDefined();
    expect(screen.getByText("upstream 503")).toBeDefined();
  });
});

describe("ItemDetail — error edges", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("renders a clear not-found state on 404 not_found — no crash, no data", async () => {
    vi.spyOn(apiModule, "getItem").mockRejectedValue(
      new apiModule.ApiError(404, {
        code: "not_found",
        message: "item not found",
        retryable: false,
      }),
    );

    renderAtId("itm_missing", freshClient());

    expect(await screen.findByText(/Item not found/)).toBeDefined();
    expect(screen.getByText(/itm_missing/)).toBeDefined();
    // No crash: no source namespace and no destructive alert leaked through.
    expect(screen.queryByText("tv-parser")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("surfaces the canonical error inline (code + message) for other failures", async () => {
    vi.spyOn(apiModule, "getItem").mockRejectedValue(
      new apiModule.ApiError(503, {
        code: "unavailable",
        message: "storage busy",
        retryable: true,
      }),
    );

    renderAtId("itm_1_9", freshClient());

    expect(await screen.findByText("unavailable")).toBeDefined();
    expect(screen.getByText("storage busy")).toBeDefined();
    // The not-found state did NOT swallow a non-404 error.
    expect(screen.queryByText(/Item not found/)).toBeNull();
  });
});
