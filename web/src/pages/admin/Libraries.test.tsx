// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import * as apiModule from "@/lib/api";
import { queryClient as sharedQueryClient } from "@/lib/queries";
import Libraries from "@/pages/admin/Libraries";

// S5 consumer joint: Libraries.tsx -> useLibraries/useCreateLibrary ->
// Go /api/v1/libraries (T08 contract_test_scope). apiRequest is the seam's
// producer boundary; mocking it asserts the verbatim POST body + list
// invalidation contract independently of the network. End-to-end is QA1.
//
// We avoid user-event (not a dep) and exercise the form via fireEvent; the
// module_id Select defaults to "tv" (component state), so the POST body
// carries module_id:"tv" without needing to drive Radix pointer events.

function withClient(client: QueryClient): ({ children }: { children: ReactNode }) => ReactNode {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function activeClient(): QueryClient {
  // useCreateLibrary's onSuccess invalidates the module-level singleton
  // (queries.ts), so the provider MUST wrap that same client for the
  // invalidation to reach the rendered list. Clear it per test to isolate
  // cache state, and disable retries for deterministic assertions.
  sharedQueryClient.clear();
  sharedQueryClient.setDefaultOptions({
    queries: { retry: false },
    mutations: { retry: false },
  });
  return sharedQueryClient;
}

function fillInput(placeholder: string, value: string): void {
  const el = screen.getByPlaceholderText(placeholder) as HTMLInputElement;
  fireEvent.change(el, { target: { value } });
}

describe("Libraries — S5 joint (T08 list + add form -> Go endpoints)", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("renders library rows from GET /api/v1/libraries", async () => {
    const spy = vi.spyOn(apiModule, "apiRequest").mockResolvedValue({
      items: [
        { id: 1, module_id: "tv", root_path: "/media/tv", display_name: "TV" },
      ],
    });
    render(<Libraries />, { wrapper: withClient(activeClient()) });

    expect(await screen.findByText("/media/tv")).toBeDefined();
    expect(screen.getByText("TV")).toBeDefined();
    expect(spy).toHaveBeenCalledWith("/api/v1/libraries");
  });

  it("POSTs the verbatim {module_id,root_path,display_name} on submit and refetches on 201", async () => {
    let listCalls = 0;
    const spy = vi.spyOn(apiModule, "apiRequest").mockImplementation(
      (async (path: string, init?: RequestInit) => {
        if (path === "/api/v1/libraries" && init?.method === "POST") {
          return {
            id: 7,
            module_id: "tv",
            root_path: "/media/tv2",
            display_name: "TV2",
          };
        }
        listCalls += 1;
        return {
          items:
            listCalls === 1
              ? []
              : [
                  {
                    id: 7,
                    module_id: "tv",
                    root_path: "/media/tv2",
                    display_name: "TV2",
                  },
                ],
        };
      }) as typeof apiModule.apiRequest,
    );

    render(<Libraries />, { wrapper: withClient(activeClient()) });
    expect(await screen.findByText("No libraries yet")).toBeDefined();

    fillInput("/media/tv", "/media/tv2");
    fillInput("TV", "TV2");
    fireEvent.click(screen.getByRole("button", { name: /add library/i }));

    expect(await screen.findByText("TV2")).toBeDefined();

    // The single POST must have carried the verbatim snake_case body —
    // INV-verbatim-payload (no camelCase, no extra fields).
    const postCall = spy.mock.calls.find(
      ([p, i]) => p === "/api/v1/libraries" && i?.method === "POST",
    );
    expect(postCall).toBeDefined();
    expect(postCall?.[1]?.body).toEqual({
      module_id: "tv",
      root_path: "/media/tv2",
      display_name: "TV2",
    });
  });

  it("renders the canonical error inline when create returns 400", async () => {
    vi.spyOn(apiModule, "apiRequest").mockImplementation(
      (async (_path: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          throw new apiModule.ApiError(400, {
            code: "bad_request",
            message: "root_path must be absolute",
            retryable: false,
          });
        }
        return { items: [] };
      }) as typeof apiModule.apiRequest,
    );

    render(<Libraries />, { wrapper: withClient(activeClient()) });
    await screen.findByText("No libraries yet");

    fillInput("/media/tv", "/media/tv");
    fillInput("TV", "TV");
    fireEvent.click(screen.getByRole("button", { name: /add library/i }));

    expect(await screen.findByText("bad_request")).toBeDefined();
    expect(screen.getByText("root_path must be absolute")).toBeDefined();
  });
});
