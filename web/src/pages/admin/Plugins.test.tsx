// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import * as apiModule from "@/lib/api";
import type { PluginAdminPlugin } from "@/lib/api";
import Plugins from "@/pages/admin/Plugins";

// Group-3 suite: the Plugins admin surface. Consumer joint:
// Plugins.tsx -> getAdminPlugins / getAdminPluginLogs -> Go
// /api/v1/admin/plugins[/{plugin_id}/logs] (plugin_admin.go). Mock seam idiom
// (Sources.test.tsx): the page-level fetchers are spied at the api.ts export.
// The surface is READ-ONLY, so the write fetchers are spied too — to prove
// nothing ever leaves the page.

function fakePlugin(overrides: Partial<PluginAdminPlugin>): PluginAdminPlugin {
  return {
    plugin_id: "shikimori",
    name: "Shikimori",
    description: "Anime metadata",
    capabilities: ["metadata"],
    health: {
      id: "shikimori",
      state: "serving",
      restarts: 0,
      checked_at: "2026-10-19T00:00:00Z",
    },
    effective: { modules: { serial: true } },
    config: [],
    ...overrides,
  };
}

function freshClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderPlugins(client: QueryClient): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={["/admin/plugins"]}>
      <QueryClientProvider client={client}>
        <Plugins />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

// ROW_SEL — the plugin row anchor (mirrors the row's data-plugin-id).
const ROW_SEL = 'tr[data-plugin-id="shikimori"]';

const SERVING = fakePlugin({
  effective: { modules: { serial: false } },
  config: [
    {
      module_id: "serial",
      kind: "metadata",
      priority: 1,
      enabled: true,
      auth_mode: "NONE",
      display_fields: ["title", "year"],
      options: { base_url: "https://shikimori.one", lang: "ru" },
    },
  ],
});

const FAILED = fakePlugin({
  plugin_id: "frame-grabber",
  name: "Frame grabber",
  description: "Thumbnail extraction",
  health: {
    id: "frame-grabber",
    state: "failed",
    restarts: 2,
    checked_at: "2026-10-19T00:00:00Z",
    message: "exit status 1",
  },
  effective: undefined,
  config: [],
});

describe("Plugins — admin surface (plugin-admin-surfaces)", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("renders state and config per plugin verbatim and issues no write", async () => {
    // The scenario probe 85b1963591d79139: each loaded plugin renders its
    // name, state chips (served health state; a disabled chip per served
    // module verdict muting it), capability chips, and its config bindings
    // with the options JSON verbatim — and the page issues no write.
    vi.spyOn(apiModule, "getAdminPlugins").mockResolvedValue({
      plugins: [SERVING, FAILED],
    });
    const patchSpy = vi.spyOn(apiModule, "patchAdminSource");
    const putSpy = vi.spyOn(apiModule, "putLibrarySource");
    const delSpy = vi.spyOn(apiModule, "deleteLibrarySource");
    const logsSpy = vi.spyOn(apiModule, "getAdminPluginLogs");

    const { container } = renderPlugins(freshClient());
    await waitFor(() =>
      expect(container.querySelector(ROW_SEL)).not.toBeNull(),
    );
    const row = container.querySelector(ROW_SEL) as HTMLElement;

    // The served health state through the D5 presentation: serving → working;
    // the muted module verdict wears the disabled chip.
    expect(within(row).getByText("working")).toBeDefined();
    expect(within(row).getByText("serial · disabled")).toBeDefined();
    expect(within(row).getByText("metadata")).toBeDefined();
    // The config binding, read-only, options verbatim.
    expect(within(row).getByText("serial")).toBeDefined();
    expect(within(row).getByText("metadata · #1 · enabled · NONE")).toBeDefined();
    expect(
      within(row).getByText(/"base_url": "https:\/\/shikimori\.one"/),
    ).toBeDefined();
    expect(within(row).getByText(/"title"/)).toBeDefined();

    // The failed plugin: errored chip with the served message inline.
    const failedRow = container.querySelector(
      'tr[data-plugin-id="frame-grabber"]',
    ) as HTMLElement;
    expect(within(failedRow).getByText("errored")).toBeDefined();
    expect(within(failedRow).getByText("exit status 1")).toBeDefined();
    // No verdicts served → no disabled chip; no bindings → the empty state.
    expect(within(failedRow).queryByText(/· disabled/)).toBeNull();
    expect(within(failedRow).getByText("No bindings")).toBeDefined();

    // READ-ONLY: no write left the surface, and logs were not fetched eagerly.
    expect(patchSpy).not.toHaveBeenCalled();
    expect(putSpy).not.toHaveBeenCalled();
    expect(delSpy).not.toHaveBeenCalled();
    expect(logsSpy).not.toHaveBeenCalled();
  });

  it("last logs render on demand, oldest first", async () => {
    // The scenario probe 254e34ec3a058ca6: opening a plugin's last-logs view
    // fetches that plugin's tail and renders the lines oldest-first.
    vi.spyOn(apiModule, "getAdminPlugins").mockResolvedValue({
      plugins: [SERVING],
    });
    const logsSpy = vi.spyOn(apiModule, "getAdminPluginLogs").mockResolvedValue({
      plugin_id: "shikimori",
      lines: ["first line", "second line"],
    });

    const { container } = renderPlugins(freshClient());
    await waitFor(() =>
      expect(container.querySelector(ROW_SEL)).not.toBeNull(),
    );

    // On demand: nothing fetched until the operator opens the view.
    expect(logsSpy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "last logs shikimori" }));

    const panel = await screen.findByText(/first line/);
    const body = panel.closest("div[data-logs-for]") as HTMLElement;
    expect(within(body).getByText(/second line/)).toBeDefined();
    // Oldest first: the served order renders unchanged.
    const rendered = body.querySelector("pre")?.textContent ?? "";
    expect(rendered.indexOf("first line")).toBeLessThan(
      rendered.indexOf("second line"),
    );
    expect(logsSpy).toHaveBeenCalledTimes(1);
    expect(logsSpy).toHaveBeenCalledWith("shikimori");
  });

  it("a refused logs fetch surfaces the canonical error inline without auto-retry", async () => {
    vi.spyOn(apiModule, "getAdminPlugins").mockResolvedValue({
      plugins: [SERVING],
    });
    const logsSpy = vi.spyOn(apiModule, "getAdminPluginLogs").mockRejectedValue(
      new apiModule.ApiError(503, {
        code: "unavailable",
        message: "plugin logs endpoint disabled",
        retryable: false,
      }),
    );

    const { container } = renderPlugins(freshClient());
    await waitFor(() =>
      expect(container.querySelector(ROW_SEL)).not.toBeNull(),
    );

    fireEvent.click(screen.getByRole("button", { name: "last logs shikimori" }));

    // Canonical error inline (code + message)…
    expect(await screen.findByText("unavailable")).toBeDefined();
    expect(screen.getByText("plugin logs endpoint disabled")).toBeDefined();
    // …and exactly ONE attempt: retry:0, no auto-retry.
    expect(logsSpy).toHaveBeenCalledTimes(1);
  });
});
