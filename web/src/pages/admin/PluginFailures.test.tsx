// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import * as apiModule from "@/lib/api";
import type { EnrichFailure } from "@/lib/api";
import PluginFailures from "@/pages/admin/PluginFailures";

// Task 6.4 suite: the per-plugin failures drill-down
// (/admin/plugins/:pluginId/failures). Consumer joint:
// PluginFailures.tsx -> listEnrichFailures -> Go
// /api/v1/enrich/failures?plugin_id=… (enrich_admin.go). Mock seam idiom
// (Plugins.test.tsx): the fetcher is spied at the api.ts export. The route
// renders under a matching Route so useParams serves :pluginId — the same
// extraction the mounted App.tsx route relies on.

const PLUGIN = "frame-grabber";

function failureRow(overrides: Partial<EnrichFailure>): EnrichFailure {
  return {
    row_id: "row-1",
    row_kind: "item",
    title: "Ковбой Бибоп",
    plugin_id: PLUGIN,
    status: "relayed",
    reason: "download failed (REDACTED)",
    attempts: 3,
    failed_at: "2026-10-21T18:04:05Z",
    next_eligible_at: "2026-10-21T19:04:05Z",
    ...overrides,
  };
}

// The FULL default window (enrich_admin.go: absent limit → the store's
// default 50) — the only served window shape that still offers load-more.
const FULL_WINDOW: EnrichFailure[] = Array.from({ length: 50 }, (_, i) =>
  failureRow({ row_id: `row-${i}`, title: `Сбой ${i}` }),
);

function freshClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderFailures(client: QueryClient): ReturnType<typeof render> {
  return render(
    <MemoryRouter
      initialEntries={[`/admin/plugins/${PLUGIN}/failures`]}
    >
      <QueryClientProvider client={client}>
        <Routes>
          <Route
            path="/admin/plugins/:pluginId/failures"
            element={<PluginFailures />}
          />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("PluginFailures — per-plugin drill-down (client-relayed-fetch 6.4)", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("renders_limited_list_from_served_dto", async () => {
    // The served window renders the DTO fields verbatim — row_kind, title,
    // status (the ledger's closed vocabulary, never renamed), reason,
    // attempts, and the RFC3339 failed_at exactly as served. The fetch is
    // scoped to the route's plugin_id at the server's DEFAULT limit (no
    // limit param on the wire). Two rows served = a short window = the
    // honest end of the ledger: no load-more.
    const spy = vi
      .spyOn(apiModule, "listEnrichFailures")
      .mockResolvedValue({
        failures: [
          failureRow({}),
          failureRow({
            row_id: "row-2",
            row_kind: "gone",
            title: "Удалённый путь",
            status: "no_data",
            reason: "REDACTED",
            attempts: 1,
            failed_at: "2026-10-22T09:30:00Z",
            next_eligible_at: "2026-10-22T10:30:00Z",
          }),
        ],
      });

    const { container } = renderFailures(freshClient());
    await screen.findByText("Ковбой Бибоп");

    // Scoped fetch, default limit — exactly one param on the wire.
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ plugin_id: PLUGIN });

    // The admin chrome is present…
    expect(screen.getByRole("link", { name: "Plugins" })).toBeDefined();
    expect(screen.getByText("Ошибки")).toBeDefined();

    // …and each served row renders its DTO verbatim.
    const rows = container.querySelectorAll("tr[data-row-id]");
    expect(rows.length).toBe(2);

    const first = container.querySelector(
      'tr[data-row-id="row-1"]',
    ) as HTMLElement;
    expect(within(first).getByText("item")).toBeDefined();
    expect(within(first).getByText("Ковбой Бибоп")).toBeDefined();
    expect(within(first).getByText("relayed")).toBeDefined();
    expect(within(first).getByText("download failed (REDACTED)")).toBeDefined();
    expect(within(first).getByText("3")).toBeDefined();
    expect(within(first).getByText("2026-10-21T18:04:05Z")).toBeDefined();

    const second = container.querySelector(
      'tr[data-row-id="row-2"]',
    ) as HTMLElement;
    expect(within(second).getByText("gone")).toBeDefined();
    expect(within(second).getByText("no_data")).toBeDefined();
    expect(within(second).getByText("2026-10-22T09:30:00Z")).toBeDefined();

    // Short window (2 < the default 50): no load-more control.
    expect(
      screen.queryByRole("button", { name: "Показать ещё" }),
    ).toBeNull();
  });

  it("load_more_appends_next_window", async () => {
    // «Показать ещё» advances the offset by the served window length
    // (50 → offset 50) and APPENDS the next window. A short second window
    // (20 < 50) is the honest end-of-list: the control disappears.
    const spy = vi
      .spyOn(apiModule, "listEnrichFailures")
      .mockResolvedValueOnce({ failures: FULL_WINDOW })
      .mockResolvedValueOnce({
        failures: Array.from({ length: 20 }, (_, i) =>
          failureRow({ row_id: `row-${50 + i}`, title: `Сбой ${50 + i}` }),
        ),
      });

    const { container } = renderFailures(freshClient());
    await screen.findByText("Сбой 0");
    expect(container.querySelectorAll("tr[data-row-id]").length).toBe(50);

    const more = screen.getByRole("button", { name: "Показать ещё" });
    fireEvent.click(more);

    await screen.findByText("Сбой 50");
    // The offset advanced past the served window; the next window appended.
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith({ plugin_id: PLUGIN, offset: 50 });
    expect(container.querySelectorAll("tr[data-row-id]").length).toBe(70);
    expect(screen.getByText("Сбой 69")).toBeDefined();

    // The short second window ends the ledger — the control is gone.
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Показать ещё" }),
      ).toBeNull(),
    );
  });

  it("empty_state_on_zero_rows", async () => {
    // Zero served rows is the NORMAL state (an empty ledger is healthy):
    // «Ошибок нет» as plain muted text, never an error banner, no
    // load-more.
    const spy = vi
      .spyOn(apiModule, "listEnrichFailures")
      .mockResolvedValue({ failures: [] });

    const { container } = renderFailures(freshClient());

    expect(await screen.findByText("Ошибок нет")).toBeDefined();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ plugin_id: PLUGIN });
    expect(container.querySelectorAll("tr[data-row-id]").length).toBe(0);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Показать ещё" }),
    ).toBeNull();
  });
});
