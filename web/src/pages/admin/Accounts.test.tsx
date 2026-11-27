// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";

import type {
  AdminDevice,
  AdminGroup,
  AdminUser,
  LibraryDTO,
} from "@/lib/api";
import Pairing from "@/pages/admin/Pairing";
import Accounts from "@/pages/admin/Accounts";

// Box 9.4 suite — the admin accounts SPA (l6-accounts 9.4) over the live
// 9.1/9.2/9.3 wire. Pinned law per panel:
//  USERS  — the registry renders HASHLESS display facts; create POSTs
//           {username, password} and renders the FIRST-user one-way-door
//           notice VERBATIM (backend wording, absent on a second create);
//           role select PATCHes {role} PARTIAL, disable PATCHes {disabled};
//           password reset PUTs {password} through the inline confirm; the
//           LAST USER's delete is disabled client-side (the 409 mirror) and
//           a forced server 409 surfaces honestly; adopt POSTs and shows NO
//           counts (bare 204 — the server answers none, none are invented).
//  GROUPS — create/rename/delete wires; members add by USERNAME; Collections
//           add {library_id, position} and render position-ordered AS
//           SERVED; the mute toggle READ-MERGE-WRITEs the WHOLE document —
//           the served doc's non-mutes keys ride the PUT (the server never
//           merges).
//  DEVICES — the bind affordance lives on the devices list (Pairing
//           surface): the posture column renders the served user_id both
//           ways, bind PUTs {user_id: id}, unbind PUTs {user_id: null}.
//  EXPLAIN — the input pair + Explain button wires
//           ?user_id=&library_id= and renders the answer verbatim; the
//           unknown-collection orphan renders visible:false with empty
//           grants, plainly (NOT an error).
//
// Mock seam idiom (autoNextPrefs.test.tsx + Pairing.test.tsx): the reads
// and writes ride the REAL lib/api functions against a mocked global fetch
// — a URL+method router that mutates module fixtures like the server would,
// so every wire assertion reads the ACTUAL outgoing request (and the rows'
// re-renders come from the invalidation refetch, never the write's body).
//
// Selects are NATIVE <select> elements (fireEvent.change-able): the repo's
// radix Select has no jsdom interaction precedent and the duty pins WIRE
// assertions, not widget chrome.

// ---- fixtures -------------------------------------------------------------

function user(id: number, username: string, overrides?: Partial<AdminUser>): AdminUser {
  return {
    id,
    username,
    display_name: username,
    role: "user",
    disabled: false,
    created_at: "2026-11-04T00:00:00Z",
    updated_at: "2026-11-04T00:00:00Z",
    ...overrides,
  };
}

function group(id: number, name: string, doc?: Record<string, unknown>): AdminGroup {
  return {
    id,
    name,
    ...(doc === undefined ? {} : { doc }),
    schema_version: 1,
    created_at: "2026-11-04T00:00:00Z",
    updated_at: "2026-11-04T00:00:00Z",
  };
}

const LIBRARY: LibraryDTO = {
  id: 7,
  module_id: "tv",
  root_path: "/media/films",
  display_name: "Films",
  description: "",
  streams_enabled: false,
};

// db — the mutable server stand-in. Every test that needs a different
// initial world reassigns the fields it cares about after resetDb.
const db: {
  users: AdminUser[];
  groups: AdminGroup[];
  devices: AdminDevice[];
} = {
  users: [],
  groups: [],
  devices: [],
};

function resetDb(): void {
  db.users = [
    user(1, "operator", { role: "admin", display_name: "Operator" }),
    user(2, "alice"),
  ];
  db.groups = [
    group(5, "household", { theme: "dark", mutes: { tvdb: false } }),
  ];
  db.devices = [
    { device_id: "dev1", code: "AAAA", user_id: 0, created_at: "2026-11-04T00:00:00Z", debug: false },
    { device_id: "dev2", code: "BBBB", user_id: 2, created_at: "2026-11-04T00:00:00Z", debug: false },
  ];
}

// ---- the fetch router -------------------------------------------------------

interface RecordedCall {
  url: string;
  method: string;
  body: unknown;
}

// json — a 200 JSON response; created — a 201; void204 — a bare 204;
// conflict — the canonical 409 body the last-user guard answers.
function json(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
function created(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}
function void204(): Response {
  return new Response(null, { status: 204 });
}
function conflict(message: string): Response {
  return new Response(
    JSON.stringify({
      error: { code: "conflict", message, retryable: false },
    }),
    { status: 409, headers: { "Content-Type": "application/json" } },
  );
}

// installRouter — the mocked global fetch. Reads answer from the current db
// fixtures; writes MUTATE the fixtures (invalidation refetches see the
// post-write world from the "server", never the body) and answer per the
// pinned wire law. `deleteOverride` lets a test force the server's 409 even
// while the client-side guard would allow the click; `orphanExplain` makes
// the explain GET answer the orphan shape.
const calls: RecordedCall[] = [];
let deleteOverride: (() => Response) | null = null;
let orphanExplain = false;

function installRouter(): void {
  calls.length = 0;
  deleteOverride = null;
  orphanExplain = false;
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : (input as Request).url;
      const method = init?.method ?? "GET";
      const rawBody = typeof init?.body === "string" ? init.body : undefined;
      const body: unknown =
        rawBody === undefined ? undefined : (JSON.parse(rawBody) as unknown);
      calls.push({ url, method, body });

      // ---- reads ----
      if (method === "GET" && url === "/api/v1/admin/users") {
        return json({ users: db.users });
      }
      if (method === "GET" && url === "/api/v1/admin/groups") {
        return json({ groups: db.groups });
      }
      if (method === "GET" && /^\/api\/v1\/admin\/groups\/\d+\/users$/.test(url)) {
        // Every fixture group carries alice as its sole member.
        return json({ users: db.users.filter((u) => u.username === "alice") });
      }
      if (method === "GET" && /^\/api\/v1\/admin\/groups\/\d+\/collections$/.test(url)) {
        // Position-ordered AS SERVED — the panel never re-sorts.
        return json({
          collections: [
            { library_id: 9, position: 1 },
            { library_id: 7, position: 2 },
          ],
        });
      }
      if (method === "GET" && url === "/api/v1/admin/sources") {
        return json({
          sources: [
            {
              plugin_id: "tvdb",
              name: "TheTVDB",
              description: "",
              capabilities: [],
              chains: [],
              effective: { modules: {}, libraries: {} },
            },
          ],
        });
      }
      if (method === "GET" && url === "/api/v1/libraries") {
        return json({ items: [LIBRARY] });
      }
      if (method === "GET" && url.startsWith("/api/v1/admin/visibility-explain?")) {
        return json(orphanExplain ? orphanAnswer(url) : explainAnswer(url));
      }
      if (method === "GET" && url === "/api/v1/admin/devices") {
        return json({ devices: db.devices });
      }
      if (method === "GET" && url === "/api/v1/admin/pairings") {
        return json({ pairings: [] });
      }

      // ---- writes (users) ----
      if (method === "POST" && url === "/api/v1/admin/users") {
        const req = body as { username: string; password: string };
        const isFirst = db.users.length === 0;
        const row = user(db.users.length + 1, req.username);
        db.users = [...db.users, row];
        return created(isFirst ? { ...row, notice: FIRST_USER_NOTICE } : row);
      }
      if (method === "PATCH" && /^\/api\/v1\/admin\/users\/\d+$/.test(url)) {
        const id = Number(url.split("/").pop());
        const req = body as { role?: string; disabled?: boolean };
        db.users = db.users.map((u) =>
          u.id === id
            ? {
                ...u,
                role: req.role ?? u.role,
                disabled: req.disabled ?? u.disabled,
              }
            : u,
        );
        return json(db.users.find((u) => u.id === id));
      }
      if (method === "PUT" && /\/password$/.test(url)) {
        return void204();
      }
      if (method === "POST" && /\/adopt-legacy$/.test(url)) {
        return void204();
      }
      if (method === "DELETE" && /^\/api\/v1\/admin\/users\/\d+$/.test(url)) {
        if (deleteOverride !== null) {
          return deleteOverride();
        }
        db.users = db.users.filter((u) => u.id !== Number(url.split("/").pop()));
        return void204();
      }

      // ---- writes (groups) ----
      if (method === "POST" && url === "/api/v1/admin/groups") {
        const req = body as { name: string };
        const row = group(db.groups.length + 5, req.name);
        db.groups = [...db.groups, row];
        return created(row);
      }
      if (method === "PATCH" && /^\/api\/v1\/admin\/groups\/\d+$/.test(url)) {
        const id = Number(url.split("/").pop());
        const req = body as { name: string };
        db.groups = db.groups.map((g) =>
          g.id === id ? { ...g, name: req.name } : g,
        );
        return json(db.groups.find((g) => g.id === id));
      }
      if (method === "DELETE" && /^\/api\/v1\/admin\/groups\/\d+$/.test(url)) {
        const id = Number(url.split("/").pop());
        db.groups = db.groups.filter((g) => g.id !== id);
        return void204();
      }
      if (method === "POST" && /^\/api\/v1\/admin\/groups\/\d+\/users$/.test(url)) {
        return void204();
      }
      if (
        method === "DELETE" &&
        /^\/api\/v1\/admin\/groups\/\d+\/users\/[^/]+$/.test(url)
      ) {
        return void204();
      }
      if (
        method === "POST" &&
        /^\/api\/v1\/admin\/groups\/\d+\/collections$/.test(url)
      ) {
        return void204();
      }
      if (method === "PUT" && /\/admin\/groups\/\d+\/doc$/.test(url)) {
        const id = Number(url.split("/")[5]);
        const req = body as { doc: Record<string, unknown> };
        db.groups = db.groups.map((g) =>
          g.id === id ? { ...g, doc: req.doc } : g,
        );
        return void204();
      }

      // ---- writes (devices) ----
      if (method === "PUT" && /^\/api\/v1\/admin\/devices\/[^/]+\/user$/.test(url)) {
        const id = url.split("/")[5];
        const req = body as { user_id: number | null };
        db.devices = db.devices.map((d) =>
          d.device_id === id
            ? { ...d, user_id: req.user_id === null ? 0 : (req.user_id as number) }
            : d,
        );
        return void204();
      }

      throw new Error(`unrouted ${method} ${url}`);
    },
  );
}

// explainAnswer — the canned carried-grant payload.
function explainAnswer(url: string): unknown {
  const params = new URLSearchParams(url.split("?")[1] ?? "");
  return {
    user_id: Number(params.get("user_id")),
    library_id: Number(params.get("library_id")),
    visible: true,
    granting_groups: [{ group_id: 5, group_name: "household", position: 3 }],
    visible_library_ids: [7, 9],
    chain_mutes: { tvdb: true },
  };
}

// orphanAnswer — the unknown-collection answer: visible:false with empty
// granting_groups (NOT a 404 — the orphan law mirrored server-side).
function orphanAnswer(url: string): unknown {
  const params = new URLSearchParams(url.split("?")[1] ?? "");
  return {
    user_id: Number(params.get("user_id")),
    library_id: Number(params.get("library_id")),
    visible: false,
    granting_groups: [],
    visible_library_ids: [7],
    chain_mutes: {},
  };
}

// ---- harness ----------------------------------------------------------------

const FIRST_USER_NOTICE =
  "You have created the first user — the legacy see-all door is now closed.";

function freshClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderWith(client: QueryClient, el: ReactElement): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={["/admin/accounts"]}>
      <QueryClientProvider client={client}>{el}</QueryClientProvider>
    </MemoryRouter>,
  );
}

// userRow — the registry row for one user id (scoped: usernames repeat in
// the group members list, so text queries are ambiguous).
function userRow(container: HTMLElement, id: number): HTMLElement {
  const el = container.querySelector(`tr[data-user-id="${id}"]`);
  if (!el) {
    throw new Error(`user row ${id} not rendered`);
  }
  return el as HTMLElement;
}

async function waitForRow(container: HTMLElement, id: number): Promise<HTMLElement> {
  await waitFor(() =>
    expect(container.querySelector(`tr[data-user-id="${id}"]`)).not.toBeNull(),
  );
  return userRow(container, id);
}

// waitCall — the recorded wire call hitting `method url`, waited for (the
// mutation's fetch fires through react-query's microtask queue — never
// asserted synchronously after the click).
async function waitCall(method: string, url: string): Promise<RecordedCall> {
  await waitFor(() =>
    expect(
      calls.some((c) => c.method === method && c.url === url),
    ).toBe(true),
  );
  const hit = calls.find((c) => c.method === method && c.url === url);
  if (hit === undefined) {
    throw new Error(`no recorded ${method} ${url}`);
  }
  return hit;
}

beforeEach(() => {
  resetDb();
  installRouter();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---- users panel ------------------------------------------------------------

describe("users panel", () => {
  it("renders the registry HASHLESS — display facts only", async () => {
    const { container } = renderWith(freshClient(), <Accounts />);

    const alice = await waitForRow(container, 2);
    expect(alice.textContent).toContain("alice");
    const operator = userRow(container, 1);
    expect(operator.textContent).toContain("operator");
    // No hash material anywhere in the users table (the wire never carries
    // one — the pin is the rendered consequence).
    const table = screen.getByRole("table");
    expect(table.textContent).not.toContain("argon2");
    expect(table.textContent).not.toContain("password_hash");
  });

  it("create POSTs {username, password} and renders the first-user notice VERBATIM", async () => {
    db.users = [];
    renderWith(freshClient(), <Accounts />);

    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "bob" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "s3cret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create user" }));

    const call = await waitCall("POST", "/api/v1/admin/users");
    expect(call.body).toEqual({ username: "bob", password: "s3cret" });

    // The served wording, verbatim — never paraphrased client-side.
    const notice = await screen.findByTestId("create-notice");
    expect(notice.textContent).toContain(FIRST_USER_NOTICE);
  });

  it("create against a non-empty registry answers NO notice", async () => {
    const { container } = renderWith(freshClient(), <Accounts />);
    await waitForRow(container, 2);

    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "bob" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "s3cret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create user" }));

    await waitCall("POST", "/api/v1/admin/users");
    // The 201 body carried no notice field — nothing renders.
    expect(screen.queryByTestId("create-notice")).toBeNull();
  });

  it("role select PATCHes {role} PARTIAL — no disabled field on the wire", async () => {
    const { container } = renderWith(freshClient(), <Accounts />);
    const alice = await waitForRow(container, 2);

    fireEvent.change(within(alice).getByRole("combobox", { name: "Role for alice" }), {
      target: { value: "admin" },
    });

    const call = await waitCall("PATCH", "/api/v1/admin/users/2");
    expect(call.body).toEqual({ role: "admin" });
  });

  it("disable PATCHes {disabled} partial", async () => {
    const { container } = renderWith(freshClient(), <Accounts />);
    const alice = await waitForRow(container, 2);

    fireEvent.click(within(alice).getByRole("button", { name: "Disable" }));

    const call = await waitCall("PATCH", "/api/v1/admin/users/2");
    expect(call.body).toEqual({ disabled: true });
  });

  it("enable sends the flipped {disabled: false} partial", async () => {
    db.users = [user(2, "alice", { disabled: true })];
    const { container } = renderWith(freshClient(), <Accounts />);
    const alice = await waitForRow(container, 2);

    fireEvent.click(within(alice).getByRole("button", { name: "Enable" }));

    const call = await waitCall("PATCH", "/api/v1/admin/users/2");
    expect(call.body).toEqual({ disabled: false });
  });

  it("password reset flows through the inline confirm and PUTs {password}", async () => {
    const { container } = renderWith(freshClient(), <Accounts />);
    const alice = await waitForRow(container, 2);

    fireEvent.click(within(alice).getByRole("button", { name: "Reset password" }));

    // The confirm flow: the new-password input appears; the PUT fires only
    // on Confirm.
    const input = within(alice).getByLabelText("New password for alice");
    fireEvent.change(input, { target: { value: "fresh-pw" } });
    fireEvent.click(within(alice).getByRole("button", { name: "Confirm" }));

    const call = await waitCall("PUT", "/api/v1/admin/users/2/password");
    expect(call.body).toEqual({ password: "fresh-pw" });
  });

  it("the LAST user's delete is disabled (the client-side 409 mirror)", async () => {
    db.users = [user(1, "operator", { role: "admin" })];
    const { container } = renderWith(freshClient(), <Accounts />);
    const operator = await waitForRow(container, 1);

    const button = within(operator).getByTestId(
      "delete-button-1",
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("delete on a non-last user is enabled: confirm copy names the cascade, DELETE rides", async () => {
    const { container } = renderWith(freshClient(), <Accounts />);
    const alice = await waitForRow(container, 2);

    const button = within(alice).getByTestId("delete-button-2") as HTMLButtonElement;
    expect(button.disabled).toBe(false);

    // Two-step: the cascade consequence renders before the destructive tap.
    fireEvent.click(button);
    expect(
      within(alice).getByText(
        "Deleting removes the user's sessions, progress and watched history.",
      ),
    ).toBeDefined();
    fireEvent.click(within(alice).getByTestId("delete-confirm-2"));

    await waitCall("DELETE", "/api/v1/admin/users/2");
    // The row leaves through the invalidated re-read.
    await waitFor(() =>
      expect(container.querySelector('tr[data-user-id="2"]')).toBeNull(),
    );
  });

  it("a forced server 409 (the last-user guard) surfaces honestly", async () => {
    const { container } = renderWith(freshClient(), <Accounts />);
    const alice = await waitForRow(container, 2);

    // Force the race: the client guard passed (two users), the server
    // refuses — the canonical body surfaces inline, never swallowed.
    deleteOverride = () => conflict("cannot delete the last user");
    fireEvent.click(within(alice).getByTestId("delete-button-2"));
    fireEvent.click(within(alice).getByTestId("delete-confirm-2"));

    expect(await screen.findByText("conflict")).toBeDefined();
    expect(screen.getByText("cannot delete the last user")).toBeDefined();
    // Alice is still served — the delete did not land.
    expect(container.querySelector('tr[data-user-id="2"]')).not.toBeNull();
  });

  it("adopt POSTs to the one-shot endpoint and invents NO counts (bare 204)", async () => {
    const { container } = renderWith(freshClient(), <Accounts />);
    const alice = await waitForRow(container, 2);

    fireEvent.click(
      within(alice).getByRole("button", { name: "Adopt legacy progress" }),
    );

    const call = await waitCall("POST", "/api/v1/admin/users/2/adopt-legacy");
    expect(call.body).toBeUndefined(); // bare — no payload, no counts

    // Honest completion: the button returns to its resting label and the
    // row carries NO invented numbers.
    await waitFor(() =>
      expect(
        within(alice).getByRole("button", { name: "Adopt legacy progress" }),
      ).toBeDefined(),
    );
    expect(alice.textContent).not.toMatch(/merged \d+/);
    expect(alice.textContent).not.toMatch(/\d+ rows?/);
  });
});

// ---- groups panel -----------------------------------------------------------

describe("groups panel", () => {
  it("create POSTs {name}; the group renders", async () => {
    renderWith(freshClient(), <Accounts />);
    await screen.findByTestId("group-card-5");

    fireEvent.change(screen.getByLabelText("Group name"), {
      target: { value: "kids" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));

    const call = await waitCall("POST", "/api/v1/admin/groups");
    expect(call.body).toEqual({ name: "kids" });
  });

  it("rename PATCHes {name} by group id — the id address never moves", async () => {
    renderWith(freshClient(), <Accounts />);
    const card = await screen.findByTestId("group-card-5");

    fireEvent.click(within(card).getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("New name for household"), {
      target: { value: "family" },
    });
    fireEvent.click(within(card).getByRole("button", { name: "Save" }));

    const call = await waitCall("PATCH", "/api/v1/admin/groups/5");
    expect(call.body).toEqual({ name: "family" });
  });

  it("delete DELETEs the group id", async () => {
    renderWith(freshClient(), <Accounts />);
    const card = await screen.findByTestId("group-card-5");

    fireEvent.click(within(card).getByRole("button", { name: "Delete" }));

    const call = await waitCall("DELETE", "/api/v1/admin/groups/5");
    expect(call.body).toBeUndefined();
  });

  it("member add rides the USERNAME wire", async () => {
    renderWith(freshClient(), <Accounts />);
    await screen.findByTestId("group-card-5");

    fireEvent.change(screen.getByTestId("member-add-input-5"), {
      target: { value: "bob" },
    });
    fireEvent.click(
      within(screen.getByTestId("group-members-5")).getByRole("button", {
        name: "Add",
      }),
    );

    const call = await waitCall("POST", "/api/v1/admin/groups/5/users");
    expect(call.body).toEqual({ username: "bob" });
  });

  it("collections render position-ordered AS SERVED and add rides {library_id, position}", async () => {
    renderWith(freshClient(), <Accounts />);
    await screen.findByTestId("group-card-5");

    // The served order (9@1, then 7@2) renders verbatim — no client re-sort.
    const list = await screen.findByTestId("group-collections-5");
    await waitFor(() =>
      expect(list.textContent).toContain("collection 9"),
    );
    expect(list.textContent.indexOf("collection 9")).toBeLessThan(
      list.textContent.indexOf("collection 7"),
    );
    expect(list.textContent).toContain("position 1");
    expect(list.textContent).toContain("position 2");

    fireEvent.change(screen.getByTestId("collection-add-select-5"), {
      target: { value: "7" },
    });
    fireEvent.change(screen.getByTestId("collection-add-position-5"), {
      target: { value: "3" },
    });
    fireEvent.click(
      within(list).getByRole("button", { name: "Add" }),
    );

    const call = await waitCall("POST", "/api/v1/admin/groups/5/collections");
    expect(call.body).toEqual({ library_id: 7, position: 3 });
  });

  it("mute toggle READ-MERGE-WRITES the WHOLE doc — non-mutes keys ride the PUT", async () => {
    renderWith(freshClient(), <Accounts />);
    await screen.findByTestId("group-card-5");

    // Served posture: tvdb unmuted (mutes.tvdb === false). The toggle
    // renders once the sources list lands.
    const toggle = (await screen.findByTestId(
      "mute-toggle-5-tvdb",
    )) as HTMLInputElement;
    expect(toggle.checked).toBe(false);

    fireEvent.click(toggle);

    // The PUT body is the WHOLE document: the served `theme` key rides
    // verbatim AND the flipped mutes key — the server replaces, never merges.
    const call = await waitCall("PUT", "/api/v1/admin/groups/5/doc");
    expect(call.body).toEqual({
      doc: { theme: "dark", mutes: { tvdb: true } },
    });
  });
});

// ---- device bind affordance (the devices list on the Pairing surface) -------

describe("device bind affordance", () => {
  function renderPairing(client: QueryClient): ReturnType<typeof render> {
    return render(
      <MemoryRouter initialEntries={["/admin/pairing"]}>
        <QueryClientProvider client={client}>
          <Pairing />
        </QueryClientProvider>
      </MemoryRouter>,
    );
  }

  it("the posture column renders the served user_id BOTH ways", async () => {
    renderPairing(freshClient());

    await waitFor(() =>
      expect(screen.getByTestId("device-posture-dev1")).toBeDefined(),
    );
    const unbound = screen.getByTestId(
      "device-bind-select-dev1",
    ) as HTMLSelectElement;
    expect(unbound.value).toBe(""); // user_id 0 → the legacy viewer posture
    const bound = screen.getByTestId(
      "device-bind-select-dev2",
    ) as HTMLSelectElement;
    expect(bound.value).toBe("2"); // bound to alice
  });

  it("bind PUTs {user_id: id}; unbind PUTs {user_id: null}", async () => {
    renderPairing(freshClient());
    await waitFor(() =>
      expect(screen.getByTestId("device-bind-select-dev1")).toBeDefined(),
    );

    fireEvent.change(screen.getByTestId("device-bind-select-dev1"), {
      target: { value: "2" },
    });
    const bindCall = await waitCall(
      "PUT",
      "/api/v1/admin/devices/dev1/user",
    );
    expect(bindCall.body).toEqual({ user_id: 2 });

    // The invalidation re-read carries the new posture.
    await waitFor(() => {
      const sel = screen.getByTestId(
        "device-bind-select-dev1",
      ) as HTMLSelectElement;
      expect(sel.value).toBe("2");
    });

    fireEvent.click(
      within(screen.getByTestId("device-posture-dev2")).getByRole("button", {
        name: "Unbind",
      }),
    );
    const unbindCall = await waitCall(
      "PUT",
      "/api/v1/admin/devices/dev2/user",
    );
    expect(unbindCall.body).toEqual({ user_id: null });
    await waitFor(() => {
      const sel = screen.getByTestId(
        "device-bind-select-dev2",
      ) as HTMLSelectElement;
      expect(sel.value).toBe("");
    });
  });
});

// ---- explain viewer ---------------------------------------------------------

describe("explain viewer", () => {
  it("Explain wires ?user_id=&library_id= and renders the answer VERBATIM", async () => {
    renderWith(freshClient(), <Accounts />);
    await screen.findByTestId("explain-user-select");
    // The selects populate from the served registries.
    await waitFor(() => {
      const sel = screen.getByTestId("explain-user-select") as HTMLSelectElement;
      expect(sel.options.length).toBeGreaterThan(1);
    });

    fireEvent.change(screen.getByTestId("explain-user-select"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByTestId("explain-library-select"), {
      target: { value: "7" },
    });
    fireEvent.click(screen.getByTestId("explain-button"));

    const call = await waitFor(() => {
      const hit = calls.find(
        (c) =>
          c.method === "GET" &&
          c.url.startsWith("/api/v1/admin/visibility-explain?"),
      );
      if (hit === undefined) throw new Error("explain GET never fired");
      return hit;
    });
    const params = new URLSearchParams(call.url.split("?")[1]);
    expect(params.get("user_id")).toBe("2");
    expect(params.get("library_id")).toBe("7");

    // The result card renders every served field verbatim.
    const card = await screen.findByTestId("explain-card");
    expect(card.getAttribute("data-visible")).toBe("true");
    expect(card.textContent).toContain("YES");
    expect(card.textContent).toContain("household (position 3)");
    expect(card.textContent).toContain("Visible collections: 2");
    expect(card.textContent).toContain("Muted sources: tvdb");
  });

  it("the unknown-collection orphan renders visible:false with empty grants, plainly", async () => {
    // The race: the collection row vanished server-side between the select
    // render and the Explain click — the answer is the ORPHAN shape, never
    // a 404. The panel renders it plainly.
    orphanExplain = true;
    renderWith(freshClient(), <Accounts />);
    await screen.findByTestId("explain-user-select");
    await waitFor(() => {
      const sel = screen.getByTestId("explain-user-select") as HTMLSelectElement;
      expect(sel.options.length).toBeGreaterThan(1);
    });

    fireEvent.change(screen.getByTestId("explain-user-select"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByTestId("explain-library-select"), {
      target: { value: "7" },
    });
    fireEvent.click(screen.getByTestId("explain-button"));

    const card = await screen.findByTestId("explain-card");
    expect(card.getAttribute("data-visible")).toBe("false");
    expect(card.textContent).toContain("NO");
    // The empty-grants truth is stated plainly — NOT an error, NOT hidden.
    expect(screen.getByTestId("explain-empty-grants")).toBeDefined();
    expect(screen.queryByText("not_found")).toBeNull();
  });
});
