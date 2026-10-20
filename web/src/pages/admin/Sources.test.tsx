// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import * as apiModule from "@/lib/api";
import type { LibraryDTO, SourceAdminSource } from "@/lib/api";
import Sources from "@/pages/admin/Sources";

// Box 6.2 suite: the Sources admin surface. Consumer joint:
// Sources.tsx -> getAdminSources / patchAdminSource / putLibrarySource /
// deleteLibrarySource / postSourcePreview -> Go /api/v1/admin/sources* and
// /api/v1/libraries/{id}/sources/{plugin_id} (source_admin.go). Mock seam
// idiom (Collections.test.tsx): the page-level fetchers are spied at the
// api.ts export; the useLibraries hook (queries.ts -> apiRequest DIRECTLY)
// is spied at apiRequest. The toggles' verdicts come back through the
// invalidated ["admin-sources"] refetch, so the fixtures are mutable module
// state — the mocked writes mutate them like the server would.

const LIB: LibraryDTO = {
  id: 1,
  module_id: "serial",
  root_path: "/media/tv",
  display_name: "TV library",
  description: "",
  streams_enabled: true,
};

function fakeSource(moduleEnabled: boolean, libEnabled: boolean): SourceAdminSource {
  return {
    plugin_id: "shikimori",
    name: "Shikimori",
    description: "Anime metadata",
    health: {
      id: "shikimori",
      state: "serving",
      restarts: 0,
      checked_at: "2026-10-19T00:00:00Z",
    },
    capabilities: ["metadata"],
    chains: [{ module_id: "serial", position: 1 }],
    effective: { modules: { serial: moduleEnabled }, libraries: { "1": libEnabled } },
    title_counts: { items: 4, series: 1 },
  };
}

// mockLibraries — the useLibraries seam (queries.ts calls apiRequest
// directly, so the spy sits on apiRequest; only /api/v1/libraries is served).
function mockLibraries(): void {
  vi.spyOn(apiModule, "apiRequest").mockResolvedValue({ items: [LIB] });
}

function freshClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderSources(client: QueryClient): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={["/admin/sources"]}>
      <QueryClientProvider client={client}>
        <Sources />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

// ROW_SEL — the plugin row anchor (mirrors the row's data-plugin-id).
const ROW_SEL = 'tr[data-plugin-id="shikimori"]';

function sourceRow(container: HTMLElement): HTMLElement {
  const row = container.querySelector(ROW_SEL);
  if (!row) {
    throw new Error("source row not rendered");
  }
  return row as HTMLElement;
}

const MODULE_TOGGLE = "module serial shikimori";
const LIB_TOGGLE = "library 1 shikimori";

describe("Sources — admin surface (plugin-title-enrichment 6.2)", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("renders the served presentation verbatim: health chip, chain position, title tally", async () => {
    vi.spyOn(apiModule, "getAdminSources").mockResolvedValue({
      sources: [fakeSource(true, true)],
    });
    mockLibraries();

    const { container } = renderSources(freshClient());
    await waitFor(() =>
      expect(container.querySelector(ROW_SEL)).not.toBeNull(),
    );
    const row = sourceRow(container);
    expect(within(row).getByText("serving")).toBeDefined();
    expect(within(row).getByText("serial · #1")).toBeDefined();
    expect(within(row).getByText("4 items · 1 series titled")).toBeDefined();
    expect(within(row).getByText("Anime metadata")).toBeDefined();
  });

  it("module toggle: disable renders queued 0 with no wake notice, enable renders the queued count inline", async () => {
    // The scenario probe 28499782454703ae: disable → queued 0 without a wake
    // notice; re-enable → the queued count renders inline.
    let moduleEnabled = true;
    const getSpy = vi.spyOn(apiModule, "getAdminSources").mockImplementation(
      async () => ({ sources: [fakeSource(moduleEnabled, true)] }),
    );
    const patchSpy = vi.spyOn(apiModule, "patchAdminSource").mockImplementation(
      async (_pluginId: string, enabled: boolean) => {
        moduleEnabled = enabled; // the write landed; the refetch sees it
        return { queued: enabled ? 3 : 0 };
      },
    );
    mockLibraries();

    const { container } = renderSources(freshClient());
    await waitFor(() =>
      expect(container.querySelector(ROW_SEL)).not.toBeNull(),
    );
    const row = sourceRow(container);

    // Disable module-wide.
    fireEvent.click(within(row).getByRole("button", { name: MODULE_TOGGLE }));
    await waitFor(() => expect(patchSpy).toHaveBeenCalledWith("shikimori", false));
    // The verdict re-reads from the server (invalidation), flipping the toggle.
    await waitFor(() =>
      expect(within(row).getByRole("button", { name: MODULE_TOGGLE }).textContent).toBe(
        "Enable",
      ),
    );
    // queued 0 → no wake notice anywhere.
    expect(screen.queryByText(/re-enriching/i)).toBeNull();
    expect(getSpy).toHaveBeenCalledTimes(2);

    // Re-enable.
    fireEvent.click(within(row).getByRole("button", { name: MODULE_TOGGLE }));
    expect(await screen.findByText("re-enriching 3 items")).toBeDefined();
    expect(patchSpy).toHaveBeenLastCalledWith("shikimori", true);
  });

  it("a refused toggle surfaces the canonical error inline without auto-retry", async () => {
    vi.spyOn(apiModule, "getAdminSources").mockResolvedValue({
      sources: [fakeSource(true, true)],
    });
    const patchSpy = vi.spyOn(apiModule, "patchAdminSource").mockRejectedValue(
      new apiModule.ApiError(400, {
        code: "bad_request",
        message: 'unknown plugin "shikimori"',
        retryable: false,
      }),
    );
    mockLibraries();

    const { container } = renderSources(freshClient());
    await waitFor(() =>
      expect(container.querySelector(ROW_SEL)).not.toBeNull(),
    );
    const row = sourceRow(container);

    fireEvent.click(within(row).getByRole("button", { name: MODULE_TOGGLE }));

    // Canonical error inline (code + message)…
    expect(await screen.findByText("bad_request")).toBeDefined();
    expect(screen.getByText('unknown plugin "shikimori"')).toBeDefined();
    // …and exactly ONE attempt: retry:0, no auto-retry.
    await waitFor(() => expect(patchSpy).toHaveBeenCalledTimes(1));
    expect(patchSpy).toHaveBeenCalledTimes(1);
  });

  it("collection toggle: enable PUTs the gate row, disable DELETEs it (clear-to-inherit)", async () => {
    let libEnabled = true;
    vi.spyOn(apiModule, "getAdminSources").mockImplementation(async () => ({
      sources: [fakeSource(true, libEnabled)],
    }));
    const putSpy = vi.spyOn(apiModule, "putLibrarySource").mockImplementation(
      async (_libraryId: number, _pluginId: string) => {
        libEnabled = true;
      },
    );
    const delSpy = vi.spyOn(apiModule, "deleteLibrarySource").mockImplementation(
      async (_libraryId: number, _pluginId: string) => {
        libEnabled = false;
      },
    );
    mockLibraries();

    const { container } = renderSources(freshClient());
    await waitFor(() =>
      expect(container.querySelector(ROW_SEL)).not.toBeNull(),
    );
    const row = sourceRow(container);

    // ON → OFF is the clear-to-inherit DELETE.
    fireEvent.click(within(row).getByRole("button", { name: LIB_TOGGLE }));
    await waitFor(() => expect(delSpy).toHaveBeenCalledWith(1, "shikimori"));
    await waitFor(() =>
      expect(within(row).getByRole("button", { name: LIB_TOGGLE }).textContent).toBe(
        "Enable",
      ),
    );
    expect(putSpy).not.toHaveBeenCalled();

    // OFF → ON is the explicit PUT {enabled:true}.
    fireEvent.click(within(row).getByRole("button", { name: LIB_TOGGLE }));
    await waitFor(() => expect(putSpy).toHaveBeenCalledWith(1, "shikimori", true));
    await waitFor(() =>
      expect(within(row).getByRole("button", { name: LIB_TOGGLE }).textContent).toBe(
        "Disable",
      ),
    );
  });

  it("preview renders before/after symmetrically with no_data rows marked and sends no gate write", async () => {
    // The scenario probe 68706750c7ddedd3: the response renders each row's
    // before and after names side by side with no_data rows marked, and the
    // surface sends no gate write in doing so.
    vi.spyOn(apiModule, "getAdminSources").mockResolvedValue({
      sources: [fakeSource(true, true)],
    });
    const patchSpy = vi.spyOn(apiModule, "patchAdminSource");
    const putSpy = vi.spyOn(apiModule, "putLibrarySource");
    const delSpy = vi.spyOn(apiModule, "deleteLibrarySource");
    const previewSpy = vi.spyOn(apiModule, "postSourcePreview").mockResolvedValue({
      before: [
        { item_id: "ser_1_abc", name: "Frieren", no_data: false },
        { item_id: "itm_9", name: "Frieren · S01E01", no_data: false },
      ],
      after: [
        { item_id: "ser_1_abc", name: "Frieren", no_data: false },
        { item_id: "itm_9", name: "", no_data: true },
      ],
    });
    mockLibraries();

    const { container } = renderSources(freshClient());
    await waitFor(() =>
      expect(container.querySelector(ROW_SEL)).not.toBeNull(),
    );

    // Defaults: collection 1, source shikimori, hypothetical DISABLE.
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(await screen.findByText("Frieren · S01E01")).toBeDefined();
    expect(previewSpy).toHaveBeenCalledWith({
      library_id: 1,
      gates: { shikimori: false },
    });

    // Side by side: the series name renders in BOTH passes' cells.
    expect(screen.getAllByText("Frieren")).toHaveLength(2);
    // The emptied after pass wears the marker; the before pass does not.
    expect(screen.getAllByText("no data")).toHaveLength(1);

    // The preview is a pure read — no gate write left the surface.
    expect(patchSpy).not.toHaveBeenCalled();
    expect(putSpy).not.toHaveBeenCalled();
    expect(delSpy).not.toHaveBeenCalled();
  });
});
