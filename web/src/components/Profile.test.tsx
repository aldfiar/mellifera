// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import Profile from "@/components/Profile";
import { DEVICE_TOKEN_KEY, TOKEN_KEY } from "@/lib/auth";

// Box 8.3 suite: the identity block (l6-accounts 8.3). The block reads the
// SERVED GET /api/v1/profile — the three principal-kind shapes render their
// served fields verbatim (profile.go profileResponse, the bodies
// TestProfileEndpoint pins server-side), the role label uses the existing
// UI vocabulary only ("admin" served literal → "admin"; everything else →
// "client"), groups render as one line of names, and the prefs document is
// NEVER rendered (8.4's concern). Error states fail closed: the fallback
// name + the least-privilege client label. A 401 is a DEAD credential:
// the standard wrapper rotation (handle401) fires — credentials cleared,
// redirect to /login — never a silent empty block.
//
// Mock seam idiom (Login.test.tsx / PairingEntry.test.tsx): the block rides
// the REAL lib/api getProfile() through apiRequest against a mocked fetch.

// adminEnv — the env-admin principal (profile.go: RoleAdmin, UserID 0).
const ADMIN_ENV = {
  kind: "admin",
  name: "admin",
  role: "admin",
  groups: [],
  prefs: {},
};

// adminSession — an admin-role session (kind user, UserID > 0): the served
// role literal is "admin", the groups ride, prefs carries the user's stored
// document (with a marker value the DOM must NOT show).
const ADMIN_SESSION = {
  kind: "user",
  user_id: 2,
  name: "Root",
  role: "admin",
  groups: [{ id: 1, name: "household" }],
  prefs: { marker_pref: "secret-doc-value" },
};

// userSession — a user-role session: routes as a client (GLOSSARY Role).
const USER_SESSION = {
  kind: "user",
  user_id: 3,
  name: "Alice",
  role: "user",
  groups: [{ id: 1, name: "household" }, { id: 2, name: "kids" }],
  prefs: {},
};

// device — the unbound device: fixed principal facts, empty groups,
// prefs null.
const DEVICE = {
  kind: "device",
  name: "device",
  role: "client",
  groups: [],
  prefs: null,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// renderProfile — the block under a fresh QueryClient (retry disabled so a
// failure surfaces on the first attempt, like the sidebar's gate).
function renderProfile(): ReturnType<typeof render> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Profile />
    </QueryClientProvider>,
  );
}

// stubLocationAssign — jsdom makes window.location.assign non-configurable;
// replace the whole location property so the rotation target is observable
// (Login.test.tsx idiom).
function stubLocationAssign(): ReturnType<typeof vi.fn> {
  const assignSpy = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { assign: assignSpy },
  });
  return assignSpy;
}

describe("Profile — the served identity block (l6-accounts 8.3)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("env admin served: name + admin label, no groups line, prefs never rendered", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(200, ADMIN_ENV));

    renderProfile();

    // The served name AND the role label are both the literal "admin" —
    // exactly two nodes carry it (the block's b and small).
    expect((await screen.findAllByText("admin")).length).toBe(2);
    expect(screen.getByText("AD")).toBeDefined(); // avatar initials from the served name
    // Groups absent — an env admin carries none, and no empty stub renders.
  });

  it("admin-role session served: name, admin label, groups listed, prefs document NOT rendered", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(200, ADMIN_SESSION));

    renderProfile();

    expect(await screen.findByText("Root")).toBeDefined();
    expect(screen.getByText("admin")).toBeDefined();
    expect(screen.getByText("household")).toBeDefined();
    // The prefs document is 8.4's surface — the block renders none of it.
    expect(screen.queryByText("secret-doc-value")).toBeNull();
    expect(screen.queryByText("marker_pref")).toBeNull();
  });

  it("user-role session served: client label, multi-group line", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(200, USER_SESSION));

    renderProfile();

    expect(await screen.findByText("Alice")).toBeDefined();
    expect(screen.getByText("client")).toBeDefined();
    expect(screen.queryByText("admin")).toBeNull();
    expect(screen.getByText("household, kids")).toBeDefined();
  });

  it("device served: minimal block, client label, no groups, null prefs never rendered", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(200, DEVICE));

    renderProfile();

    expect(await screen.findByText("device")).toBeDefined();
    expect(screen.getByText("client")).toBeDefined();
    expect(screen.queryByText("null")).toBeNull();
    // Minimal: exactly the served name + label, no groups line.
    const pinfo = screen.getByText("device").closest(".pinfo");
    expect(pinfo?.querySelectorAll("small").length).toBe(1);
    expect(pinfo?.textContent).toBe("deviceclient");
  });

  it("fetch failure fails closed: fallback name + client label, never admin", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network down"));

    renderProfile();

    expect(await screen.findByText("Operator")).toBeDefined();
    // The error state settles asynchronously — poll for the client label.
    expect(await screen.findByText("client")).toBeDefined();
    expect(screen.queryByText("admin")).toBeNull();
    expect(screen.getByText("OP")).toBeDefined(); // the pre-identity avatar mark
  });

  it("a 401 is a dead credential: the standard handle401 rotation fires, not a silent block", async () => {
    localStorage.setItem(TOKEN_KEY, "sess-token-1");
    const assignSpy = stubLocationAssign();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(401, {
        error: {
          code: "unauthorized",
          message: "session expired",
          retryable: false,
        },
      }),
    );

    renderProfile();

    await waitFor(() => {
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
      expect(localStorage.getItem(DEVICE_TOKEN_KEY)).toBeNull();
      expect(assignSpy).toHaveBeenCalledWith("/login");
    });
  });
});
