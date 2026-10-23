// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import * as apiModule from "@/lib/api";
import { DEVICE_TOKEN_KEY, setDeviceToken, setToken, TOKEN_KEY } from "@/lib/auth";
import PairingEntry from "@/pages/pair/PairingEntry";

// Box 3.4 suite: the unauthenticated pairing entry screen (device-pairing
// D8). Consumer joint: PairingEntry.tsx -> useStartPairing / usePairingWait
// (queries.ts) -> POST /api/v1/pair + GET /api/v1/pair/{id}/wait (pairing.go).
// Mock seam idiom (Pairing.test.tsx): the api.ts fetchers are spied at the
// module export; the 401 path rides the REAL apiRequest against a mocked
// fetch so the handle401 rotation sequence is asserted, not assumed —
// storage clearing AND the credential-aware navigation target (F1).
// The router maps "/" to a marker element so the post-approval navigate is
// observable without mounting the whole app shell.

function freshClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderEntry(client: QueryClient): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={["/pair"]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/pair" element={<PairingEntry />} />
          <Route path="/" element={<div>app-shell</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

// unauthorized401 — the canonical 401 body the Go authMiddleware writes.
function unauthorized401(): Response {
  return new Response(
    JSON.stringify({
      error: { code: "unauthorized", message: "session expired", retryable: false },
    }),
    { status: 401, headers: { "Content-Type": "application/json" } },
  );
}

// stubLocationAssign — jsdom makes window.location.assign non-configurable;
// replace the whole location property with a stub so the rotation TARGET is
// observable. This stubs navigation to see it, never to suppress the assert.
function stubLocationAssign(): ReturnType<typeof vi.fn> {
  const assignSpy = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { assign: assignSpy },
  });
  return assignSpy;
}

describe("PairingEntry — device pairing entry (device-pairing 3.4)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders with no stored credential: mints one pairing request and shows the code prominently", async () => {
    const startSpy = vi.spyOn(apiModule, "startPairing").mockResolvedValue({
      pairing_id: "p1",
      code: "ABCD-2345",
    });
    vi.spyOn(apiModule, "waitPairing").mockResolvedValue({ status: "pending" });

    renderEntry(freshClient());

    const code = await screen.findByTestId("pairing-code");
    expect(code.textContent).toBe("ABCD-2345");
    // Fire-once: the mint is a rate-limited POST, never a render loop.
    await waitFor(() => expect(startSpy).toHaveBeenCalledTimes(1));
  });

  it("an approved poll stores the device token and routes to the library main screen", async () => {
    vi.spyOn(apiModule, "startPairing").mockResolvedValue({
      pairing_id: "p1",
      code: "ABCD-2345",
    });
    vi.spyOn(apiModule, "waitPairing").mockResolvedValue({
      status: "approved",
      device_token: "dev-token-1",
    });

    renderEntry(freshClient());

    // The navigate lands on "/" — the app shell route in this harness.
    expect(await screen.findByText("app-shell")).toBeDefined();
    expect(localStorage.getItem(DEVICE_TOKEN_KEY)).toBe("dev-token-1");
  });

  it("offers the operator a discoverable login: the entry links to /login", async () => {
    vi.spyOn(apiModule, "startPairing").mockResolvedValue({
      pairing_id: "p1",
      code: "ABCD-2345",
    });
    vi.spyOn(apiModule, "waitPairing").mockResolvedValue({ status: "pending" });

    renderEntry(freshClient());

    // The no-credential main screen is the TV surface — the operator path
    // must never depend on typing URLs.
    const link = await screen.findByTestId("operator-login");
    expect(link.getAttribute("href")).toBe("/login");
  });

  // F1 (gate 2): the 401 rotation is credential-aware. A device-only browser
  // (device token stored, NO admin token) must rotate to "/" — a full-page
  // /login would bypass the ROOT route and strand the revoked device on the
  // admin token prompt; RootGate re-mounts the pairing entry there instead.
  // jsdom cannot truly navigate, so window.location is stubbed to OBSERVE the
  // assign — the assertion is the navigation TARGET, never "the entry stayed".
  it("a 401 under a device-only credential clears it and rotates to the pairing entry ('/')", async () => {
    setDeviceToken("stale-device-token");
    vi.spyOn(apiModule, "startPairing").mockResolvedValue({
      pairing_id: "p1",
      code: "ABCD-2345",
    });
    // waitPairing rides the REAL apiRequest so handle401 runs for real.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(unauthorized401());
    const assignSpy = stubLocationAssign();

    renderEntry(freshClient());

    // The canonical 401 error surfaced, the revoked device holds nothing,…
    expect(await screen.findByText("unauthorized")).toBeDefined();
    expect(localStorage.getItem(DEVICE_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    // …and the rotation is the ROOT route, not the admin login.
    expect(assignSpy).toHaveBeenCalledWith("/");
    expect(assignSpy).not.toHaveBeenCalledWith("/login");
  });

  it("a 401 under a stored admin token clears both credentials and rotates to the operator login ('/login')", async () => {
    setToken("t1");
    setDeviceToken("stale-device-token");
    vi.spyOn(apiModule, "startPairing").mockResolvedValue({
      pairing_id: "p1",
      code: "ABCD-2345",
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(unauthorized401());
    const assignSpy = stubLocationAssign();

    renderEntry(freshClient());

    expect(await screen.findByText("unauthorized")).toBeDefined();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(DEVICE_TOKEN_KEY)).toBeNull();
    // The admin rotation is unchanged (INV-401-source-of-truth).
    expect(assignSpy).toHaveBeenCalledWith("/login");
  });
});
