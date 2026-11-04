// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { apiRequest } from "@/lib/api";
import { DEVICE_TOKEN_KEY, TOKEN_KEY } from "@/lib/auth";
import Login from "@/pages/Login";

// Box 8.2 suite: the unified /login (l6-accounts, web-ui "Unified login
// surface"). Three flows pinned: (1) the username+password PRIMARY flow —
// POST /api/v1/auth/login (auth.go login) whose minted session token lands
// under the ONE credential slot (mellifera.token) every wrapper channel
// reads; (2) the admin-token paste PRESERVED — local store + same redirect,
// no network; (3) the pairing link — the ROOT-route deep link ("/") where
// the credential-less RootGate mounts the pairing entry, pinning unchanged.
// The uniform auth failure and the 429 are asserted through the served
// canonical message — the SPA adds no distinction the server did not make.
//
// Mock seam idiom (PairingEntry.test.tsx): the login rides the REAL
// lib/api login() against a mocked fetch; the 401-rotation reuse is
// asserted through the REAL handle401 seam — a wrapper channel (apiRequest)
// 401ing with the SESSION token in the slot clears the credentials and
// rotates to /login exactly like the admin token always has.

// ok200 — the minted-session answer the Go login handler writes
// (auth.go loginResponse: the RAW token, once).
function ok200(token: string): Response {
  return new Response(JSON.stringify({ token }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// canonicalError — the canonical error body shape (handlers.go writeError).
function canonicalError(
  status: number,
  code: string,
  message: string,
): Response {
  return new Response(
    JSON.stringify({ error: { code, message, retryable: false } }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

// unauthorized401 — the login endpoint's UNIFORM auth failure
// (auth.go: wrong password / unknown user / disabled user are byte-identical).
function unauthorized401(): Response {
  return canonicalError(401, "unauthenticated", "invalid credentials");
}

// rateLimited429 — the fixed-window excess answer (auth.go loginLimiter).
function rateLimited429(): Response {
  return canonicalError(
    429,
    "rate_limited",
    "too many login attempts for this account; retry later",
  );
}

// stubLocationAssign — jsdom makes window.location.assign non-configurable;
// replace the whole location property with a stub so the rotation TARGET is
// observable (PairingEntry.test.tsx idiom).
function stubLocationAssign(): ReturnType<typeof vi.fn> {
  const assignSpy = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { assign: assignSpy },
  });
  return assignSpy;
}

// renderLogin — /login plus an /admin marker route: both flows' post-login
// destination (from-state fallback "/admin") is observable without mounting
// the whole app shell.
function renderLogin(): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<div>app-shell</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function submitPassword(username: string, password: string): Promise<void> {
  fireEvent.change(await screen.findByLabelText("Username"), {
    target: { value: username },
  });
  fireEvent.change(await screen.findByLabelText("Password"), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("Login — the unified credential entry (l6-accounts 8.2)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("the password flow mints a session: posts the credentials and stores the token under the credential slot", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(ok200("sess-token-1"));

    renderLogin();
    await submitPassword("alice", "hunter2");

    // Same authenticated shell both flows land in (the from fallback).
    expect(await screen.findByText("app-shell")).toBeDefined();

    // The minted session token is the credential — stored under the EXISTING
    // key the api client's Authorization assembly reads (getBearerToken).
    expect(localStorage.getItem(TOKEN_KEY)).toBe("sess-token-1");

    // The wire shape: the unauthenticated bootstrap verb, credentials in the body.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [path, init] = fetchSpy.mock.calls[0];
    expect(path).toBe("/api/v1/auth/login");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      username: "alice",
      password: "hunter2",
    });
  });

  it("a 401 renders the UNIFORM failure and never rotates: wrong password, unknown user, and disabled are the same answer", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(unauthorized401());
    const assignSpy = stubLocationAssign();

    renderLogin();
    await submitPassword("alice", "wrong");

    // The served canonical message, verbatim — the SPA adds no distinction.
    expect(await screen.findByText("invalid credentials")).toBeDefined();
    // Nothing stored, and the expected 401 is NOT a rotation trigger: the
    // visitor stays on /login (handle401 would bounce them to the pairing
    // entry — the login verb is exempt from the wrapper's rotation).
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(assignSpy).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("a 429 renders the rate-limited message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(rateLimited429());

    renderLogin();
    await submitPassword("alice", "hunter2");

    expect(
      await screen.findByText(
        "too many login attempts for this account; retry later",
      ),
    ).toBeDefined();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("the admin-token paste is preserved: local store, same destination, no network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    renderLogin();
    fireEvent.change(await screen.findByLabelText("Admin token"), {
      target: { value: "  admin-token-9  " },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Use admin token" }),
    );

    expect(await screen.findByText("app-shell")).toBeDefined();
    // Stored under the SAME credential slot, paste semantics byte-identical
    // to the MVP surface: trimmed, stored as-is after the trim.
    expect(localStorage.getItem(TOKEN_KEY)).toBe("admin-token-9");
    // The paste flow is purely local — it never calls the API.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("links the TV pairing entry: the ROOT-route deep link, pinning unchanged", async () => {
    renderLogin();

    const link = await screen.findByTestId("pairing-link");
    expect(link.getAttribute("href")).toBe("/");
  });

  it("401-rotation reuse: a session token in the slot rotates through the EXISTING handle401 seam exactly like the admin token", async () => {
    // Sign in for real first — the session token lands in the credential slot.
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(ok200("sess-token-1"))
      .mockResolvedValueOnce(unauthorized401());
    const assignSpy = stubLocationAssign();

    renderLogin();
    await submitPassword("alice", "hunter2");
    expect(await screen.findByText("app-shell")).toBeDefined();
    expect(localStorage.getItem(TOKEN_KEY)).toBe("sess-token-1");

    // A later API call dies with 401 — through the REAL wrapper (apiRequest),
    // the ONE rotation chokepoint every channel shares. The session token
    // rides the admin path (it IS the stored credential getBearerToken
    // returns), so the pre-existing sequence fires: both credentials
    // cleared, rotate to /login. No second rotation mechanism was built.
    await apiRequest("/api/v1/libraries").catch(() => undefined);

    await waitFor(() => {
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
      expect(localStorage.getItem(DEVICE_TOKEN_KEY)).toBeNull();
      expect(assignSpy).toHaveBeenCalledWith("/login");
    });
  });
});
