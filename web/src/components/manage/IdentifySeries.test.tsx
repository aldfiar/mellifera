// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import * as apiModule from "@/lib/api";
import type { SearchCandidatesResponse } from "@/lib/api";
import { SeriesIdentify } from "@/components/manage/IdentifySeries";

// The identify view's layout contract (2026-10-27 fix), pinned at the DOM
// seam: the candidates list carries .identify-candidates (its own scroll
// region inside the capped panel — index.css, pinned byte-for-byte by
// lib/overlayContract.test.ts), long titles clamp so every row keeps a
// predictable height, and the served order renders VERBATIM (the search
// passthrough contract: no client re-scoring or re-sorting exists here).
// The honest none-state orientation line is covered on the way in.

const LONG_TITLE =
  "Mezametara Saikyou Soubi to Uchuusenmochi Datta node, Ikkodate Mezashite Youhei toshite Jiyuu ni Ikitai";

function candidates(): SearchCandidatesResponse {
  return {
    candidates: [
      {
        external_id: "60948",
        title: LONG_TITLE,
        kind: "tv",
        year: 2023,
        russian_title: "Проснувшись с сильнейшим снаряжением…",
      },
      {
        external_id: "14073",
        title: "Ebiten: Kouritsu Ebisugawa Koukou Tenmonbu",
        kind: "ona",
        russian_title: "Небеса: Астрономический клуб старшей школы Эбисугава",
      },
    ],
  };
}

function renderIdentify(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <SeriesIdentify
        libraryId={2}
        seriesId="ser_2_x"
        displayTitle="Небеса: Астрономический клуб старшей школы Эбисугава"
        sources={[{ id: "shikimori", enabled: true }]}
        onCollapse={() => {}}
        onBack={() => {}}
      />
    </QueryClientProvider>,
  );
}

describe("SeriesIdentify — layout + served-order contract", () => {
  it("renders candidates verbatim in served order inside the scroll-region list, titles clamped", async () => {
    const search = vi
      .spyOn(apiModule, "searchSource")
      .mockResolvedValue(candidates());
    renderIdentify();

    // The honest none-state: no served about block → no orientation facts.
    expect(screen.getByTestId("identify-current-match").textContent).toBe(
      "No current match.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    const rows = await screen.findAllByTestId("identify-candidate");
    expect(rows).toHaveLength(2);
    expect(search).toHaveBeenCalledWith("shikimori", "Небеса: Астрономический клуб старшей школы Эбисугава");

    // Served order is verbatim — fixture #0 (the correct match) renders first.
    expect(rows[0].textContent).toContain(LONG_TITLE);
    expect(rows[1].textContent).toContain("Ebiten");

    // The list is its own scroll region (.identify-candidates in index.css);
    // Back stays a sibling BELOW the list, never inside it.
    const list = screen.getByLabelText("Search candidates");
    expect(list.className).toContain("identify-candidates");
    expect(list.tagName).toBe("UL");
    expect(screen.getByRole("button", { name: "Back" }).closest("ul")).toBeNull();

    // Long titles clamp so one row can never grow unbounded.
    expect(rows[0].querySelector("span span")?.className).toContain("line-clamp-3");
  });
});
