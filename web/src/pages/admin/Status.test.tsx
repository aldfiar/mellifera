// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import * as apiModule from "@/lib/api";
import Status from "@/pages/admin/Status";

// S5 consumer joint: Status.tsx -> useAdminStatus ->
// Go /api/v1/admin/status (T10 contract_test_scope). Asserts: plugin table +
// enrich stats render from the DTO; checked_at "" -> "—"; 503 -> "Status
// unavailable" (no throw). End-to-end is QA1.

function withClient(client: QueryClient): ({ children }: { children: ReactNode }) => ReactNode {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function freshClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

describe("Status — S5 joint (T10 -> Go /api/v1/admin/status)", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("renders plugin-health rows + enrich stats from the DTO; checked_at \"\" -> placeholder", async () => {
    vi.spyOn(apiModule, "apiRequest").mockResolvedValue({
      plugins: [
        {
          id: "base-scanner",
          state: "serving",
          restarts: 0,
          checked_at: "2026-08-05T10:00:00Z",
        },
        { id: "tv-parser", state: "degraded", restarts: 9, checked_at: "" },
      ],
      enrich: { pending: 2, in_flight: 1, done: 5, failed: 0 },
    });

    render(<Status />, { wrapper: withClient(freshClient()) });

    expect(await screen.findByText("base-scanner")).toBeDefined();
    expect(screen.getByText("serving")).toBeDefined();
    expect(screen.getByText("degraded")).toBeDefined();
    expect(screen.getByText("9", { exact: true })).toBeDefined(); // restarts for tv-parser (unique)
    expect(screen.getByText("2026-08-05T10:00:00Z")).toBeDefined();
    // checked_at "" renders as the placeholder, not an empty cell (B6).
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);

    // Enrich counters render verbatim (INV-no-rounding).
    expect(screen.getByText("Pending")).toBeDefined();
    expect(screen.getByText("Done")).toBeDefined();
    expect(screen.getByText("In flight")).toBeDefined();
    expect(screen.getByText("Failed")).toBeDefined();
  });

  it("renders a 'Status unavailable' state on 503 — no throw (INV-503-not-crash)", async () => {
    vi.spyOn(apiModule, "apiRequest").mockRejectedValue(
      new apiModule.ApiError(503, {
        code: "unavailable",
        message: "status disabled",
        retryable: false,
      }),
    );

    render(<Status />, { wrapper: withClient(freshClient()) });

    expect(await screen.findByText("Status unavailable")).toBeDefined();
    // No crash: the plugin table header is absent.
    expect(screen.queryByText("base-scanner")).toBeNull();
  });
});
