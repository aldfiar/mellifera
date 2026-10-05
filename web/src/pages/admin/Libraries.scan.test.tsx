// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import * as apiModule from "@/lib/api";
import { queryClient as sharedQueryClient } from "@/lib/queries";
import Libraries from "@/pages/admin/Libraries";

// S5 consumer joint: Libraries.tsx scan trigger -> useScanLibrary ->
// Go /api/v1/libraries/{id}/scan (T09 contract_test_scope). Asserts: POST
// fires per-row; 200 -> inline {library_id,discovered,persisted,warnings?};
// optional warnings render only when present; failure -> inline ApiError;
// disabled while pending (no double-submit). End-to-end is QA1.

function withClient(client: QueryClient): ({ children }: { children: ReactNode }) => ReactNode {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function freshClient(): QueryClient {
  sharedQueryClient.clear();
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

describe("Libraries — S5 joint (T09 scan trigger -> Go scan endpoint)", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("POSTs /api/v1/libraries/{id}/scan and renders discovered/persisted + optional warnings inline", async () => {
    const spy = vi.spyOn(apiModule, "apiRequest").mockImplementation(
      (async (path: string, init?: RequestInit) => {
        if (path === "/api/v1/libraries/1/scan" && init?.method === "POST") {
          return {
            library_id: 1,
            discovered: 5,
            persisted: 5,
            warnings: ["skipped one unreadable file"],
          };
        }
        return {
          items: [
            { id: 1, module_id: "tv", root_path: "/media/tv", display_name: "TV" },
          ],
        };
      }) as typeof apiModule.apiRequest,
    );

    render(<Libraries />, { wrapper: withClient(freshClient()) });
    await screen.findByText("/media/tv");

    fireEvent.click(screen.getByRole("button", { name: /^Scan$/i }));

    expect(await screen.findByText(/discovered 5/)).toBeDefined();
    expect(screen.getByText(/persisted 5/)).toBeDefined();
    expect(screen.getByText("skipped one unreadable file")).toBeDefined();
    expect(
      spy.mock.calls.some(
        ([p, i]) => p === "/api/v1/libraries/1/scan" && i?.method === "POST",
      ),
    ).toBe(true);
  });

  it("does NOT render a warnings list when warnings is absent (B3)", async () => {
    vi.spyOn(apiModule, "apiRequest").mockImplementation(
      (async (path: string, init?: RequestInit) => {
        if (init?.method === "POST" && path.endsWith("/scan")) {
          return { library_id: 1, discovered: 3, persisted: 3 };
        }
        return {
          items: [
            { id: 1, module_id: "tv", root_path: "/media/tv", display_name: "TV" },
          ],
        };
      }) as typeof apiModule.apiRequest,
    );

    render(<Libraries />, { wrapper: withClient(freshClient()) });
    await screen.findByText("/media/tv");
    fireEvent.click(screen.getByRole("button", { name: /^Scan$/i }));

    await screen.findByText(/discovered 3/);
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("renders the canonical ApiError inline on a 500 (B4); disables the button while pending (B5)", async () => {
    let resolvePost: (() => void) | undefined;
    const postHeld = new Promise<void>((resolve) => {
      resolvePost = resolve;
    });
    vi.spyOn(apiModule, "apiRequest").mockImplementation(
      (async (path: string, init?: RequestInit) => {
        if (init?.method === "POST" && path.endsWith("/scan")) {
          await postHeld;
          throw new apiModule.ApiError(500, {
            code: "internal",
            message: "boom",
            retryable: false,
          });
        }
        return {
          items: [
            { id: 1, module_id: "tv", root_path: "/media/tv", display_name: "TV" },
          ],
        };
      }) as typeof apiModule.apiRequest,
    );

    render(<Libraries />, { wrapper: withClient(freshClient()) });
    await screen.findByText("/media/tv");

    const scanBtn = screen.getByRole("button", { name: /^Scan$/i });
    fireEvent.click(scanBtn);

    // While pending the button is disabled (B5 — no double-submit).
    await waitFor(() => expect(scanBtn).toHaveProperty("disabled", true));

    resolvePost?.(); // unblock the held POST -> 500
    expect(await screen.findByText("internal")).toBeDefined();
    expect(screen.getByText("boom")).toBeDefined();
  });
});
