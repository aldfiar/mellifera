// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import * as apiModule from "@/lib/api";
import type { PluginAdminPlugin } from "@/lib/api";
import Plugins from "@/pages/admin/Plugins";

// Group-3 suite: the Plugins admin surface. Consumer joint:
// Plugins.tsx -> getAdminPlugins / getAdminPluginLogs -> Go
// /api/v1/admin/plugins[/{plugin_id}/logs] (plugin_admin.go). Mock seam idiom
// (Sources.test.tsx): the page-level fetchers are spied at the api.ts export.
// The surface is read-only outside the binding options editor — the page's
// ONE sanctioned write (plugin-options-ui 2.3, design D1) — so the write
// fetchers are spied too, to prove nothing ever leaves the page outside the
// editor flow.

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
        <LocationProbe />
        <Plugins />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

// LocationProbe — the routing-memory seam (the AutoNext.test.tsx idiom):
// the click-through targets the 6.4 drill-down route, which may not render
// a page yet — what this suite pins is WHERE the router landed, rendered
// into the DOM so waitFor can observe the navigation.
function LocationProbe(): ReactElement {
  const location = useLocation();
  return <span data-testid="route">{location.pathname}</span>;
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

  it("renders status and config per plugin in human words and issues no write outside the editor flow", async () => {
    // The scenario probe 85b1963591d79139: each loaded plugin renders its
    // name, the colored status (the served health state + served module
    // verdicts — never resolved client-side), capability chips, and its
    // config bindings in words with the options JSON verbatim behind a
    // disclosure — and the page issues no write outside the editor flow
    // (the write-spy law, plugin-options-ui 2.3).
    vi.spyOn(apiModule, "getAdminPlugins").mockResolvedValue({
      plugins: [SERVING, FAILED],
    });
    const patchSpy = vi.spyOn(apiModule, "patchAdminSource");
    const putSpy = vi.spyOn(apiModule, "putLibrarySource");
    const putOptionsSpy = vi.spyOn(apiModule, "putAdminModuleSourceOptions");
    const delSpy = vi.spyOn(apiModule, "deleteLibrarySource");
    const logsSpy = vi.spyOn(apiModule, "getAdminPluginLogs");

    const { container } = renderPlugins(freshClient());
    await waitFor(() =>
      expect(container.querySelector(ROW_SEL)).not.toBeNull(),
    );
    const row = container.querySelector(ROW_SEL) as HTMLElement;

    // The operator color contract (user-locked 2026-10-21): the served
    // health says serving, but the only served module verdict mutes the
    // plugin → gray Disabled, never green. The muted verdict also owns the
    // binding's enablement word (the resolved gate beats the config flag).
    expect(within(row).getAllByText("Disabled").length).toBeGreaterThan(0);
    expect(row.querySelector('[data-status="off"]')).not.toBeNull();
    expect(within(row).queryByText("Working")).toBeNull();
    // Capabilities render as words.
    expect(within(row).getByText("Metadata")).toBeDefined();
    // The config binding, read-only and in words; NONE auth stays hidden.
    expect(within(row).getByText("serial")).toBeDefined();
    expect(within(row).getByText("Metadata source")).toBeDefined();
    expect(within(row).getByText("#1")).toBeDefined();
    expect(within(row).getAllByText("Disabled").length).toBeGreaterThan(1);
    expect(within(row).queryByText(/auth:/)).toBeNull();
    expect(within(row).getByText("fields: title, year")).toBeDefined();
    // The raw options JSON stays verbatim, folded behind the disclosure.
    expect(
      within(row).getByText(/"base_url": "https:\/\/shikimori\.one"/),
    ).toBeDefined();

    // The Edit affordance rides METADATA bindings only (design D5) — the
    // serial metadata binding carries one; the click-through lives in the
    // editor-flow case below.
    expect(
      within(row).getByRole("button", { name: "options serial" }),
    ).toBeDefined();

    // The failed plugin: red Failed with the served message inline.
    const failedRow = container.querySelector(
      'tr[data-plugin-id="frame-grabber"]',
    ) as HTMLElement;
    expect(within(failedRow).getByText("Failed")).toBeDefined();
    expect(failedRow.querySelector('[data-status="fail"]')).not.toBeNull();
    expect(within(failedRow).getByText("exit status 1")).toBeDefined();
    // No verdicts served → no enablement word; no bindings → the empty state.
    expect(within(failedRow).getByText("No bindings")).toBeDefined();

    // No write left the page outside the editor flow, and logs were not
    // fetched eagerly.
    expect(patchSpy).not.toHaveBeenCalled();
    expect(putSpy).not.toHaveBeenCalled();
    expect(putOptionsSpy).not.toHaveBeenCalled();
    expect(delSpy).not.toHaveBeenCalled();
    expect(logsSpy).not.toHaveBeenCalled();
  });

  it("maps the health+verdict pairs onto the green/red/gray trio", async () => {
    // The color contract, one row per tone:
    //   green — serving AND enabled somewhere (a served verdict is true);
    //   red   — failed at startup (failed/not_serving/degraded);
    //   gray  — no health report served.
    const WORKING = fakePlugin({
      plugin_id: "tv-parser",
      name: "TV parser",
      effective: { modules: { tv: true } },
      config: [
        {
          module_id: "tv",
          kind: "metadata",
          priority: 1,
          enabled: true,
          auth_mode: "NONE",
        },
      ],
    });
    const SILENT = fakePlugin({
      plugin_id: "silent",
      name: "Silent",
      health: undefined,
    });
    vi.spyOn(apiModule, "getAdminPlugins").mockResolvedValue({
      plugins: [WORKING, FAILED, SILENT],
    });

    const { container } = renderPlugins(freshClient());
    await waitFor(() =>
      expect(
        container.querySelector('tr[data-plugin-id="tv-parser"]'),
      ).not.toBeNull(),
    );

    const ok = container.querySelector(
      'tr[data-plugin-id="tv-parser"]',
    ) as HTMLElement;
    expect(within(ok).getByText("Working")).toBeDefined();
    expect(ok.querySelector('[data-status="ok"]')).not.toBeNull();
    // The enabled verdict greens the binding word too.
    expect(within(ok).getByText("Enabled")).toBeDefined();

    const fail = container.querySelector(
      'tr[data-plugin-id="frame-grabber"]',
    ) as HTMLElement;
    expect(within(fail).getByText("Failed")).toBeDefined();
    expect(fail.querySelector('[data-status="fail"]')).not.toBeNull();

    const off = container.querySelector(
      'tr[data-plugin-id="silent"]',
    ) as HTMLElement;
    expect(within(off).getByText("Not reporting")).toBeDefined();
    expect(off.querySelector('[data-status="off"]')).not.toBeNull();
  });

  it("renders the «Требует настройки» badge on a metadata binding with an unprovided secret", async () => {
    // plugin-options-ui 2.1: the needs-config badge reads the SERVED
    // per-binding required_secrets verdicts — one provided:false secret on a
    // metadata binding badges that binding and only that binding.
    vi.spyOn(apiModule, "getAdminPlugins").mockResolvedValue({
      plugins: [
        fakePlugin({
          plugin_id: "tmdb",
          name: "TMDB",
          effective: { modules: { films: true } },
          config: [
            {
              module_id: "films",
              kind: "metadata",
              priority: 1,
              enabled: true,
              auth_mode: "NONE",
              options: { language: "ru" },
              required_secrets: { api_key: false },
            },
            {
              module_id: "serials",
              kind: "metadata",
              priority: 2,
              enabled: true,
              auth_mode: "NONE",
              options: { language: "ru" },
              required_secrets: { api_key: true },
            },
          ],
        }),
      ],
    });

    const { container } = renderPlugins(freshClient());
    await waitFor(() =>
      expect(container.querySelector('tr[data-plugin-id="tmdb"]')).not.toBeNull(),
    );
    const row = container.querySelector('tr[data-plugin-id="tmdb"]') as HTMLElement;

    // The badge renders — the destructive variant, once for the unprovided
    // binding and never for the all-provided sibling.
    const badges = within(row).getAllByText("Требует настройки");
    expect(badges).toHaveLength(1);
    expect(badges[0].className).toContain("bg-destructive");
  });

  it("renders no badge when every verdict is provided or the field is absent", async () => {
    // All-provided verdicts badge nothing; absence (no declarations —
    // scanner rows never carry the field) badges nothing either.
    vi.spyOn(apiModule, "getAdminPlugins").mockResolvedValue({
      plugins: [
        SERVING, // binding without required_secrets — the absent-field case
        fakePlugin({
          plugin_id: "tmdb",
          name: "TMDB",
          effective: { modules: { films: true } },
          config: [
            {
              module_id: "films",
              kind: "metadata",
              priority: 1,
              enabled: true,
              auth_mode: "NONE",
              required_secrets: { api_key: true, language: true },
            },
          ],
        }),
      ],
    });

    const { container } = renderPlugins(freshClient());
    await waitFor(() =>
      expect(container.querySelector(ROW_SEL)).not.toBeNull(),
    );

    expect(
      within(container as HTMLElement).queryByText("Требует настройки"),
    ).toBeNull();
  });

  it("renders known option keys as words with served values on a metadata binding", async () => {
    // The words layer (plugin-options-ui D4): the recognized `language` key
    // presents inline with the served value verbatim; non-string values
    // (the live include_image_types array) and unknown keys stay untouched
    // behind the raw-JSON disclosure.
    vi.spyOn(apiModule, "getAdminPlugins").mockResolvedValue({
      plugins: [
        fakePlugin({
          config: [
            {
              module_id: "serial",
              kind: "metadata",
              priority: 1,
              enabled: true,
              auth_mode: "NONE",
              options: {
                language: "ru",
                include_image_types: ["poster", "still"],
                base_url: "https://shikimori.one",
              },
            },
          ],
        }),
      ],
    });

    const { container } = renderPlugins(freshClient());
    await waitFor(() =>
      expect(container.querySelector(ROW_SEL)).not.toBeNull(),
    );
    const row = container.querySelector(ROW_SEL) as HTMLElement;

    // The words line, served value verbatim.
    expect(within(row).getByText(/Язык: ru/)).toBeDefined();
    // INV-verbatim-payload: the array and the unknown key stay behind the
    // raw disclosure, pretty-printed exactly as served.
    const optionsDetails = row.querySelector("details");
    expect(optionsDetails).not.toBeNull();
    const pre = optionsDetails?.querySelector("pre")?.textContent ?? "";
    expect(pre).toContain('"include_image_types": [');
    expect(pre).toContain('"poster"');
    expect(pre).toContain('"base_url": "https://shikimori.one"');
  });

  it("keeps vocabulary-unknown option keys disclosure-only", async () => {
    // A key outside the presentation vocabulary renders no words line — the
    // raw disclosure stays the only render.
    vi.spyOn(apiModule, "getAdminPlugins").mockResolvedValue({
      plugins: [SERVING], // options: { base_url, lang } — both unknown keys
    });

    const { container } = renderPlugins(freshClient());
    await waitFor(() =>
      expect(container.querySelector(ROW_SEL)).not.toBeNull(),
    );
    const row = container.querySelector(ROW_SEL) as HTMLElement;

    expect(within(row).queryByText(/Язык/)).toBeNull();
    expect(row.querySelector("details")).not.toBeNull();
    const pre = row.querySelector("details pre")?.textContent ?? "";
    expect(pre).toContain('"base_url": "https://shikimori.one"');
  });

  it("keeps a scanner binding's options disclosure-only", async () => {
    // Scanner rows never carry verdicts and never enter the words layer —
    // even a recognized key stays behind the disclosure (the surveyor's Q2
    // fold).
    vi.spyOn(apiModule, "getAdminPlugins").mockResolvedValue({
      plugins: [
        fakePlugin({
          plugin_id: "tv-parser",
          name: "TV parser",
          health: undefined,
          effective: undefined,
          config: [
            {
              module_id: "tv",
              kind: "scanner",
              enabled: true,
              auth_mode: "NONE",
              options: { language: "ru" },
            },
          ],
        }),
      ],
    });

    const { container } = renderPlugins(freshClient());
    await waitFor(() =>
      expect(
        container.querySelector('tr[data-plugin-id="tv-parser"]'),
      ).not.toBeNull(),
    );
    const row = container.querySelector(
      'tr[data-plugin-id="tv-parser"]',
    ) as HTMLElement;

    expect(within(row).queryByText(/Язык/)).toBeNull();
    // D5: scanner bindings carry no edit affordance at all — the endpoint
    // refuses them, so no Edit button exists on the row.
    expect(within(row).queryByRole("button", { name: "options tv" })).toBeNull();
    expect(row.querySelector("details")).not.toBeNull();
    const pre = row.querySelector("details pre")?.textContent ?? "";
    expect(pre).toContain('"language": "ru"');
  });

  it("the editor flow: saving writes the composed body, closes the dialog, and re-reads the aggregate", async () => {
    // plugin-options-ui 2.3's click-through: Edit opens the
    // BindingOptionsEditor (the page's ONE sanctioned write); saving calls
    // putAdminModuleSourceOptions once with the composed body, closes the
    // dialog, and the ["admin-plugins"] invalidation re-reads the aggregate
    // so the badge updates from the SERVER (the Sources GateToggle law) —
    // never from the write's body.
    const options = {
      language: "ru",
      include_image_types: ["poster", "still"],
    };
    const binding = {
      module_id: "films",
      kind: "metadata",
      priority: 1,
      enabled: true,
      auth_mode: "NONE",
      options,
    };
    const before = fakePlugin({
      plugin_id: "tmdb",
      name: "TMDB",
      effective: { modules: { films: true } },
      config: [{ ...binding, required_secrets: { api_key: false } }],
    });
    const after = fakePlugin({
      plugin_id: "tmdb",
      name: "TMDB",
      effective: { modules: { films: true } },
      config: [{ ...binding, required_secrets: { api_key: true } }],
    });
    const pluginsSpy = vi
      .spyOn(apiModule, "getAdminPlugins")
      .mockResolvedValueOnce({ plugins: [before] })
      .mockResolvedValue({ plugins: [after] });
    const putSpy = vi
      .spyOn(apiModule, "putAdminModuleSourceOptions")
      .mockResolvedValue(undefined);

    const { container } = renderPlugins(freshClient());
    await waitFor(() =>
      expect(
        container.querySelector('tr[data-plugin-id="tmdb"]'),
      ).not.toBeNull(),
    );

    // Pre-save: the unprovided verdict owns the badge.
    let row = container.querySelector(
      'tr[data-plugin-id="tmdb"]',
    ) as HTMLElement;
    expect(within(row).getByText("Требует настройки")).toBeDefined();

    // Edit opens the editor in its DialogShell.
    fireEvent.click(within(row).getByRole("button", { name: "options films" }));
    expect(await screen.findByRole("dialog")).toBeDefined();

    // Edit the recognized option, enter the missing secret.
    fireEvent.change(screen.getByLabelText("Язык"), {
      target: { value: "en" },
    });
    fireEvent.change(screen.getByLabelText("api_key"), {
      target: { value: "sk-typed" },
    });
    fireEvent.click(screen.getByText("Сохранить"));

    // Exactly ONE write, with the composed body: the edited entry as
    // entered, untouched keys carried verbatim, only the non-empty secret
    // input.
    await waitFor(() => expect(putSpy).toHaveBeenCalledTimes(1));
    const [moduleId, pluginId, body] = putSpy.mock.calls[0];
    expect(moduleId).toBe("films");
    expect(pluginId).toBe("tmdb");
    expect(body).toEqual({
      language: "en",
      include_image_types: ["poster", "still"],
      api_key: "sk-typed",
    });

    // The 204 closes the dialog (dialog REMOVAL through the parent-owned
    // overlay state) and the aggregate re-reads from the server — the badge
    // clears from the SERVED verdicts, never from the write's body.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(pluginsSpy).toHaveBeenCalledTimes(2));
    row = container.querySelector(
      'tr[data-plugin-id="tmdb"]',
    ) as HTMLElement;
    await waitFor(() =>
      expect(within(row).queryByText("Требует настройки")).toBeNull(),
    );
  });

  it("the «Ошибки» column reads the served count — 0 muted and unlinked, positive a click-through", async () => {
    // The scenario (client-relayed-fetch D10, web-ui "Plugin failures column
    // and drill-down"): the aggregate's per-plugin failures count renders
    // VERBATIM; 0 is muted with no link (an empty ledger is the normal
    // state, not an error); any positive count is a click-through to the
    // plugin's failures page. The drill-down page itself is task 6.4's — so
    // the navigation is pinned as a routing-memory fact, never a
    // rendered-page assertion.
    const failuresSpy = vi.spyOn(apiModule, "listEnrichFailures");
    vi.spyOn(apiModule, "getAdminPlugins").mockResolvedValue({
      plugins: [
        SERVING, // no failures key — the absent-field floor
        fakePlugin({
          plugin_id: "tv-parser",
          name: "TV parser",
          health: undefined,
          effective: undefined,
          failures: 0,
        }),
        fakePlugin({
          plugin_id: "frame-grabber",
          name: "Frame grabber",
          description: "Thumbnail extraction",
          health: undefined,
          effective: undefined,
          failures: 3,
        }),
      ],
    });

    const { container } = renderPlugins(freshClient());
    await waitFor(() =>
      expect(container.querySelector(ROW_SEL)).not.toBeNull(),
    );

    expect(screen.getByText("Ошибки")).toBeDefined();

    // 0 (explicitly served) and the absent-field floor both render muted,
    // as plain text — no link anchor anywhere in the cell.
    for (const rowSel of [ROW_SEL, 'tr[data-plugin-id="tv-parser"]']) {
      const row = container.querySelector(rowSel) as HTMLElement;
      const zero = within(row).getByText("0");
      expect(zero.closest("a")).toBeNull();
      expect(zero.className).toContain("text-muted-foreground");
    }

    // The positive count is the SERVED number as the link text, targeting
    // the plugin's failures page.
    const failRow = container.querySelector(
      'tr[data-plugin-id="frame-grabber"]',
    ) as HTMLElement;
    const link = within(failRow).getByRole("link", { name: "3" });
    expect(link.getAttribute("href")).toBe(
      "/admin/plugins/frame-grabber/failures",
    );

    // The column reads ONLY the aggregate — the scoped failures listing is
    // never fetched eagerly from the table.
    expect(failuresSpy).not.toHaveBeenCalled();

    // The click-through lands on the drill-down route (6.4's page may 404
    // until it lands; the router memory is the contract here).
    fireEvent.click(link);
    await waitFor(() =>
      expect(screen.getByTestId("route").textContent).toBe(
        "/admin/plugins/frame-grabber/failures",
      ),
    );
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
