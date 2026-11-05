// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation, useParams } from "react-router-dom";
import type { ReactElement } from "react";

import * as apiModule from "@/lib/api";
import type {
  ItemDTO,
  ProfileDTO,
  ProfilePrefs,
  SeriesDTO,
  WatchDefaultsDTO,
} from "@/lib/api";
import { DEVICE_TOKEN_KEY, TOKEN_KEY } from "@/lib/auth";
import { PROFILE_QUERY_KEY } from "@/components/Profile";
import AutoNext, { AUTO_NEXT_CANCELLED_KEY } from "@/components/playback/AutoNext";

// Box 8.4 suite — the auto-next card's per-user prefs (l6-accounts 8.4):
// the toggle reads the SERVED profile document through the SHARED
// ["profile"] cache (the same entry the sidebar gate and the identity block
// read — one fetch, consumers cannot disagree), the env watch-defaults
// answer when the document carries no auto_next key (the fallback law), and
// a flip writes PUT /profile/prefs with the WHOLE merged document (the
// server never merges — the read-merge-write is client-side; the body must
// carry the served keys AND the flipped one). No localStorage anywhere in
// the path — the preference is the user's, not the browser's. The kind law
// is the served user-backedness (profile.go): kind user — editable; kind
// admin (env admin token) — rendered but disabled (env config, not profile
// state); kind device — absent (no preference surface). A 409 on write
// surfaces the canonical code + message on the card and the toggle never
// silently moves.
//
// Mock seam idioms: the served queries ride a pre-seeded staleTime-Infinity
// client (AutoNext.test.tsx — the cache IS the seam), and the PUT rides the
// REAL lib/api putProfilePrefs() through apiRequestVoid against a mocked
// fetch (Profile.test.tsx).

// doc — the episode fixture document: the parsed series anchor plus the
// season/episode numbers (the same seams nextup.test.ts pins).
function episodeDoc(season: number, n: number): ItemDTO["document"] {
  return {
    parsed: { series_relative_path: "Show" },
    sources: { "tv-parser": { season, episode: n } },
  };
}

function episode(id: string, season: number, n: number, title?: string): ItemDTO {
  return {
    id,
    module_id: "serial",
    library_id: 1,
    file_id: `file-${id}`,
    relative_path: `Show/${id}.mkv`,
    media_type: "serial",
    schema_version: 1,
    status: "ready",
    document: episodeDoc(season, n),
    metadata: title !== undefined ? { episode: { title } } : undefined,
  };
}

const SERIES: SeriesDTO = {
  id: "ser_1_show",
  module_id: "serial",
  library_id: 1,
  relative_path: "Show",
  document: {},
  schema_version: 1,
  status: "ready",
  display_name: "Шоу",
};

const CURRENT = episode("itm_1_s1e1", 1, 1);
const NEXT = episode("itm_1_s1e2", 1, 2, "После");
const HARNESS_ID = "itm_1_s1e1"; // the id the harness route renders

// userProfile — the kind "user" principal (user-backedness = a writable
// preference document, profile.go's kind law).
function userProfile(prefs: ProfilePrefs): ProfileDTO {
  return {
    kind: "user",
    user_id: 3,
    name: "Alice",
    role: "user",
    groups: [{ id: 1, name: "household" }],
    prefs,
  };
}

const ADMIN_ENV: ProfileDTO = {
  kind: "admin",
  name: "admin",
  role: "admin",
  groups: [],
  prefs: {},
};

const DEVICE: ProfileDTO = {
  kind: "device",
  name: "device",
  role: "client",
  groups: [],
  prefs: null,
};

// seededClient — the warm watch-view cache: the item, its series row, the
// series' episode list, the served countdown shape, and (when given) the
// served profile document under the SHARED ["profile"] key.
function seededClient(overrides?: {
  defaults?: WatchDefaultsDTO;
  profile?: ProfileDTO;
}): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  client.setQueryData(["item", HARNESS_ID], { item: CURRENT });
  client.setQueryData(["series", 1], { items: [SERIES] });
  client.setQueryData(["series-episodes", SERIES.id], { items: [CURRENT, NEXT] });
  if (overrides?.defaults !== undefined) {
    client.setQueryData(["watch-defaults"], overrides.defaults);
  }
  if (overrides?.profile !== undefined) {
    client.setQueryData(PROFILE_QUERY_KEY, overrides.profile);
  }
  return client;
}

// LocationProbe — the navigation sink (AutoNext.test.tsx idiom).
function LocationProbe(): ReactElement {
  const location = useLocation();
  return <span data-testid="route">{location.pathname}</span>;
}

// WatchPage — the harness route body (AutoNext.test.tsx idiom).
function WatchPage(props: { ended: boolean }): ReactElement {
  const { id } = useParams<{ id: string }>();
  return (
    <>
      <AutoNext itemId={id ?? ""} ended={props.ended} />
      <LocationProbe />
    </>
  );
}

function harness(ended: boolean, client: QueryClient): ReactElement {
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/items/${HARNESS_ID}`]}>
        <Routes>
          <Route path="/items/:id" element={<WatchPage ended={ended} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderCard(ended: boolean, client: QueryClient) {
  return render(harness(ended, client));
}

function theToggle(): HTMLInputElement {
  return screen.getByTestId("auto-next-toggle") as HTMLInputElement;
}

function theRoute(): string {
  return screen.getByTestId("route").textContent ?? "";
}

// conflictResponse — the canonical 409 body profile.go putProfilePrefs
// serves a principal with no per-user document.
function conflictResponse(): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: "conflict",
        message: "this principal carries no per-user preference document",
        retryable: false,
      },
    }),
    { status: 409, headers: { "Content-Type": "application/json" } },
  );
}

beforeEach(() => {
  // Backstops for any unseeded read: a film answer keeps the card from
  // rendering on a bare id; the pending profile/defaults promises mean no
  // vector accidentally grows a toggle or a countdown from an unseeded key.
  vi.spyOn(apiModule, "getProfile").mockImplementation(
    () => new Promise<ProfileDTO>(() => {}),
  );
  vi.spyOn(apiModule, "fetchWatchDefaults").mockImplementation(
    () => new Promise<WatchDefaultsDTO>(() => {}),
  );
  vi.spyOn(apiModule, "getItem").mockResolvedValue({
    item: {
      id: "itm_1_none",
      module_id: "tv",
      library_id: 1,
      file_id: "file-none",
      relative_path: "Film.mkv",
      media_type: "tv",
      document: {},
      schema_version: 1,
      status: "ready",
    },
  });
  vi.spyOn(apiModule, "getSeries").mockResolvedValue({ items: [] });
  vi.spyOn(apiModule, "getSeriesEpisodes").mockResolvedValue({ items: [] });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  sessionStorage.clear();
  localStorage.clear();
});

describe("env_fallback_renders_when_the_document_lacks_the_key", () => {
  it("no auto_next key: the env countdown renders and the toggle shows the env posture (armed)", () => {
    vi.useFakeTimers();
    const client = seededClient({
      defaults: { auto_next_countdown_seconds: 3 },
      profile: userProfile({}),
    });
    renderCard(true, client);

    expect(screen.getByTestId("auto-next-card")).toBeDefined();
    expect(screen.getByTestId("auto-next-countdown").textContent).toContain("3");
    // The toggle reflects the EFFECTIVE value — the env default posture
    // (autoplay armed per the served countdown) — and it is editable: the
    // principal is user-backed.
    expect(theToggle().checked).toBe(true);
    expect(theToggle().disabled).toBe(false);
  });
});

describe("served_override_renders", () => {
  it("auto_next false: the durable opt-out floors the countdown — no autoplay, manual path only", () => {
    vi.useFakeTimers();
    const client = seededClient({
      defaults: { auto_next_countdown_seconds: 3 },
      profile: userProfile({ auto_next: false }),
    });
    renderCard(true, client);

    // The card renders (the toggle must stay reachable) but the override
    // floors the countdown: no countdown line, ever.
    expect(screen.getByTestId("auto-next-card")).toBeDefined();
    expect(screen.queryByTestId("auto-next-countdown")).toBeNull();
    expect(theToggle().checked).toBe(false);
    expect(theToggle().disabled).toBe(false);

    // Never autoplay: the countdown the env serves must not land anyway.
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(theRoute()).toBe(`/items/${HARNESS_ID}`);

    // The manual path stays.
    fireEvent.click(screen.getByRole("button", { name: "Смотреть" }));
    expect(theRoute()).toBe("/items/itm_1_s1e2");
  });

  it("auto_next true: the override arms the countdown explicitly", () => {
    vi.useFakeTimers();
    const client = seededClient({
      defaults: { auto_next_countdown_seconds: 3 },
      profile: userProfile({ auto_next: true }),
    });
    renderCard(true, client);

    expect(screen.getByTestId("auto-next-countdown").textContent).toContain("3");
    expect(theToggle().checked).toBe(true);
  });
});

describe("toggle_writes_the_whole_merged_document", () => {
  it("the PUT body carries the served keys AND the flipped key; the cache flips with it", async () => {
    const client = seededClient({
      defaults: { auto_next_countdown_seconds: 60 },
      profile: userProfile({ theme: "dark", auto_next: true }),
    });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));
    renderCard(true, client);

    fireEvent.click(theToggle());

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/v1/profile/prefs");
    expect(init.method).toBe("PUT");
    // The never-merge-server-side law pinned: the body is the WHOLE
    // document — the served `theme` rides, and `auto_next` is flipped.
    const body = JSON.parse(String(init.body)) as ProfilePrefs;
    expect(body.theme).toBe("dark");
    expect(body.auto_next).toBe(false);

    // The shared ["profile"] cache now holds the exact document the server
    // stores — every profile consumer re-renders from it.
    const cached = client.getQueryData<ProfileDTO>(PROFILE_QUERY_KEY);
    if (cached === undefined || cached.prefs === null) {
      throw new Error("the profile cache entry is missing after the PUT");
    }
    expect(cached.prefs.theme).toBe("dark");
    expect(cached.prefs.auto_next).toBe(false);

    // The toggle's position follows the cache, not a local optimistic flag.
    await waitFor(() => {
      expect(theToggle().checked).toBe(false);
    });
  });
});

describe("no_localStorage_anywhere_in_the_auto_next_path", () => {
  it("the toggle writes ride the profile PUT; the only storage write is the sessionStorage cancel key", async () => {
    const client = seededClient({
      defaults: { auto_next_countdown_seconds: 60 },
      profile: userProfile({}),
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    // jsdom Storage instances don't own their methods — the prototype spies
    // are the seam, and mock.contexts tells the two storages apart.
    const storageSet = vi.spyOn(Storage.prototype, "setItem");
    const storageRemove = vi.spyOn(Storage.prototype, "removeItem");
    const storageGet = vi.spyOn(Storage.prototype, "getItem");
    renderCard(true, client);

    // Flip the toggle (204) and cancel the card — the full interaction path.
    fireEvent.click(theToggle());
    await waitFor(() => {
      expect(theToggle().checked).toBe(false);
    });
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(screen.queryByTestId("auto-next-card")).toBeNull();

    // No localStorage WRITE ever: the preference lives on the server.
    const localWrites = storageSet.mock.calls.filter(
      (_args, i) => storageSet.mock.contexts[i] === localStorage,
    );
    expect(localWrites).toEqual([]);
    const localRemoves = storageRemove.mock.calls.filter(
      (_args, i) => storageRemove.mock.contexts[i] === localStorage,
    );
    expect(localRemoves).toEqual([]);
    // The sessionStorage write is the pre-existing cancel suppression key —
    // and nothing else.
    const sessionWrites = storageSet.mock.calls.filter(
      (_args, i) => storageSet.mock.contexts[i] === sessionStorage,
    );
    expect(sessionWrites).toEqual([[AUTO_NEXT_CANCELLED_KEY, "1"]]);
    // Every localStorage READ is the auth token seam (lib/auth's credential
    // keys) — no auto-next-shaped key is ever consulted.
    storageGet.mock.calls.forEach((args, i) => {
      if (storageGet.mock.contexts[i] === localStorage) {
        expect([TOKEN_KEY, DEVICE_TOKEN_KEY]).toContain(args[0]);
      }
    });
  });
});

describe("the_kind_law", () => {
  it("kind user: the toggle renders editable", () => {
    const client = seededClient({
      defaults: { auto_next_countdown_seconds: 60 },
      profile: userProfile({}),
    });
    renderCard(true, client);

    expect(screen.getByTestId("auto-next-toggle")).toBeDefined();
    expect(theToggle().disabled).toBe(false);
  });

  it("kind admin (env admin token): the toggle renders but is disabled — env config is not profile state", () => {
    const client = seededClient({
      defaults: { auto_next_countdown_seconds: 60 },
      profile: ADMIN_ENV,
    });
    renderCard(true, client);

    expect(screen.getByTestId("auto-next-toggle")).toBeDefined();
    expect(theToggle().disabled).toBe(true);
    // The position shows the env posture — the env watch-defaults' answer.
    expect(theToggle().checked).toBe(true);
  });

  it("kind device: no preference surface — the toggle is absent", () => {
    const client = seededClient({
      defaults: { auto_next_countdown_seconds: 60 },
      profile: DEVICE,
    });
    renderCard(true, client);

    expect(screen.getByTestId("auto-next-card")).toBeDefined();
    expect(screen.queryByTestId("auto-next-toggle")).toBeNull();
  });

  it("no served identity yet: no toggle (fail closed)", () => {
    const client = seededClient({
      defaults: { auto_next_countdown_seconds: 60 },
    });
    renderCard(true, client);

    expect(screen.getByTestId("auto-next-card")).toBeDefined();
    expect(screen.queryByTestId("auto-next-toggle")).toBeNull();
  });
});

describe("a_409_on_write_surfaces_honestly", () => {
  it("the canonical copy renders on the card and the toggle never silently moves", async () => {
    const client = seededClient({
      defaults: { auto_next_countdown_seconds: 60 },
      profile: userProfile({}),
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(conflictResponse());
    renderCard(true, client);

    // The served document lacks the key → the toggle shows the env posture.
    expect(theToggle().checked).toBe(true);

    fireEvent.click(theToggle());

    // The failure is surfaced with the canonical code + message — never
    // swallowed.
    const errorLine = await screen.findByTestId("auto-next-prefs-error");
    expect(errorLine.textContent).toContain("conflict");
    expect(errorLine.textContent).toContain(
      "this principal carries no per-user preference document",
    );

    // The write was attempted exactly once (retry:0) and failed.
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // No silent revert and no silent flip: the toggle holds the SERVED
    // position, and the cache still carries the served document.
    expect(theToggle().checked).toBe(true);
    const cached = client.getQueryData<ProfileDTO>(PROFILE_QUERY_KEY);
    if (cached === undefined || cached.prefs === null) {
      throw new Error("the served profile cache entry vanished");
    }
    expect(cached.prefs.auto_next).toBeUndefined();
  });
});
