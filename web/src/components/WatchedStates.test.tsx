// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import Collection from "@/pages/collections/Collection";
import ItemDetail from "@/pages/browse/ItemDetail";
import {
  InProgressBar,
  isWatchedElement,
  watchedPercent,
  WatchedToggle,
} from "@/components/WatchedStates";
import * as apiModule from "@/lib/api";
import type { ItemDTO, ItemResponse, LibraryDTO, SeriesDTO } from "@/lib/api";
import type { ItemDocument } from "@/lib/document";

// Task 2.3 (watched-states, as amended by collections-ux 2.3): the element
// states on the browsable surfaces — episode rows (EpisodesView), series
// cards (SeriesGrid), item-grid cards (ItemGrid — the film/tv grid under the
// html.tv CSS layer too), and the element page heading. The tri-state law is
// asserted AT the real components through the same seams the pages' own
// suites use (Collection.test.tsx's fetchWith idiom, ItemDetail.test.tsx's
// api-seam spies): a watched element renders the ✓ + dimmed title + NO
// progress bar even when a served position exists; an in-progress sibling
// keeps today's bar; a new element renders clean; wire absence (the
// omitempty field gone) behaves as not-watched. On the three mounted toggle
// surfaces (episode rows, item-grid cards, heading) the slot is the
// WatchedToggle BUTTON — the always-visible `watched` text chip — series
// cards keep the passive ✓ mark (the bulk toggle is v1.1). The mark's
// layout/cost is CSS's contract (index.css, outside the
// tv shell block, so the state survives the html.tv layer unchanged;
// tvCssContract pins that block by text).

// fetchWith — a URL-dispatched fetch mock (verbatim from Collection.test.tsx):
// handlers maps a URL substring to the response factory; earlier entries win.
// Anything unmatched REJECTS — an off-contract call fails the test loudly.
function fetchWith(handlers: Record<string, () => Promise<Response>>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = String(input);
    for (const [fragment, respond] of Object.entries(handlers)) {
      if (url.includes(fragment)) {
        return respond();
      }
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function freshClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

// The shared header seam every Collection mount needs: the library list +
// the library's summary (verbatim from Collection.test.tsx).
function headerSeam(
  moduleId: string,
  summaryItems: number,
): Record<string, () => Promise<Response>> {
  return {
    "/api/v1/libraries/1/summary": () =>
      Promise.resolve(
        jsonResponse(200, { library_id: 1, items: summaryItems, updated_at: "" }),
      ),
    "/api/v1/libraries": () =>
      Promise.resolve(
        jsonResponse(200, { items: [lib(1, moduleId, "shelf")] }),
      ),
  };
}

function lib(id: number, moduleId: string, name: string): LibraryDTO {
  return {
    id,
    module_id: moduleId,
    display_name: name,
    description: "",
  } as LibraryDTO;
}

function doc(parts: { title?: string; duration?: number }): ItemDocument {
  const d: ItemDocument = {};
  if (parts.title !== undefined) {
    d.sources = { "serial-parser": { title: parts.title } };
    d._view = {
      title: { value: parts.title, source: "serial-parser", reason: "priority" },
    };
  }
  if (parts.duration !== undefined) {
    d.ffprobe = { format: { duration: String(parts.duration) } };
  }
  return d;
}

function item(
  id: string,
  parts: {
    title?: string;
    duration?: number;
    watched?: boolean;
    moduleId?: string;
  },
): ItemDTO {
  return {
    id,
    module_id: parts.moduleId ?? "audio",
    library_id: 1,
    file_id: `file-${id}`,
    relative_path: `Shelf/${id}.m4a`,
    media_type: parts.moduleId ?? "audio",
    document: doc(parts),
    schema_version: 1,
    status: "ready",
    ...(parts.title !== undefined ? { display_name: parts.title } : {}),
    ...(parts.watched !== undefined ? { watched: parts.watched } : {}),
  };
}

function srow(parts: { id: string; name: string; watched?: boolean }): SeriesDTO {
  return {
    id: parts.id,
    module_id: "serial",
    library_id: 1,
    relative_path: parts.id,
    document: {},
    schema_version: 1,
    status: "ready",
    display_name: parts.name,
    ...(parts.watched !== undefined ? { watched: parts.watched } : {}),
  };
}

function progressRow(itemId: string, position: number, watched?: boolean) {
  return {
    item_id: itemId,
    position_seconds: position,
    updated_at: "",
    ...(watched !== undefined ? { watched } : {}),
  };
}

function renderCollection(at: string): void {
  render(
    <QueryClientProvider client={freshClient()}>
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route path="/collections/:id" element={<Collection />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// cardOf — the <li> hosting the card whose title text is rendered (the grid
// children are li > card, both for SeriesGrid and the item/episode grids).
function cardOf(title: string): HTMLElement {
  return screen.getByText(title).closest("li") as HTMLElement;
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("WatchedStates — pure leaves", () => {
  it("isWatchedElement reads the SERVED flag true-only — absence is not-watched, never a type hole", () => {
    expect(isWatchedElement(true)).toBe(true);
    expect(isWatchedElement(false)).toBe(false);
    expect(isWatchedElement(undefined)).toBe(false);
  });

  it("watchedPercent — today's rail math: rounded, clamped, null on unknown durations (never a guessed percent)", () => {
    expect(watchedPercent(200, 600)).toBe(33);
    expect(watchedPercent(600, 600)).toBe(100);
    expect(watchedPercent(900, 600)).toBe(100);
    expect(watchedPercent(1, null)).toBeNull();
    expect(watchedPercent(1, 0)).toBeNull();
  });
});

// ---- WatchedToggle (collections-ux 2.2, reworked by watched-toggle-label 1.1)
// The watched slot as a real <button> on the three mounted surfaces: a quiet
// `watched` text chip, TOP-RIGHT (inline right:40px, no left override — one
// stylesheet gutter past the ⋯ trigger's own slot), ALWAYS visible. jsdom
// sees no media queries and no layout, so the control's contract is asserted
// at its two observable seams: (a) the button composes the class carrier
// (cardact-trigger) and the state split rides the inline style — BOTH states
// pin opacity 1 (the disclosure law is retired for this control) and the
// chip's auto width/height + padding beat the fixed 28px/40px trigger sizes;
// (b) the ⋯ trigger's own law — base reveal + coarse-pointer and html.tv
// persistence — is pinned by text (the clampCssContract readFileSync idiom)
// so the stylesheet composition can't silently lose it.

// ruleBody — the declaration body of the rule introduced by the given
// selector text (the clampCssContract.test.ts helper, inlined: this suite
// pins only the disclosure-law rules the toggle composes).
function ruleBody(css: string, selector: string): string {
  const at = css.indexOf(selector);
  expect(at, `selector ${selector} missing from index.css`).toBeGreaterThanOrEqual(0);
  const open = css.indexOf("{", at);
  const close = css.indexOf("}", open);
  expect(close, `rule ${selector} never closes`).toBeGreaterThan(open);
  return css.slice(open + 1, close);
}

// mockStateWrite — the PUT /items/{id}/state capture: records every fetch
// call and answers the itemStateDTO echo (collections-ux 1.2's shape).
function mockStateWrite(itemId: string) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(() =>
    Promise.resolve(
      jsonResponse(200, {
        item_id: itemId,
        state: "watched",
        position_seconds: 0,
      }),
    ),
  );
}

// renderToggle — WatchedToggle inside a clickable cardact-host div (the law
// needs a hover/focus host; the div's onClick plays the card navigation the
// toggle must never trigger). Returns the client's invalidateQueries spy so
// a click's invalidation sweep is asserted on the real mutation.
function renderToggle(watched: boolean, onCardClick?: () => void) {
  const client = freshClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <div className="cardact-host" onClick={onCardClick}>
        <WatchedToggle itemId="itm_1" watched={watched} />
      </div>
    </QueryClientProvider>,
  );
  return { invalidate };
}

describe("WatchedToggle — the three-state renders", () => {
  it("watched: the accent text chip at rest — a pressed button pinned visible inline, top-right slot past the ⋯ trigger", () => {
    renderToggle(true);

    const toggle = screen.getByRole("button", { name: "Watched" });
    expect(toggle.textContent).toBe("watched");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    // The class carrier — the composition, no new CSS.
    expect(toggle.classList.contains("cardact-trigger")).toBe(true);
    // Always visible: the disclosure law is retired for this control — the
    // inline opacity beats the base opacity 0 AND the hover/focus reveal
    // rules (visible without hover on fine pointers too).
    expect((toggle as HTMLElement).style.opacity).toBe("1");
    // The chip sizing: inline auto width/height + chip padding beat the
    // base 28px box and the coarse-pointer/html.tv 40px twins.
    expect((toggle as HTMLElement).style.width).toBe("auto");
    expect((toggle as HTMLElement).style.height).toBe("auto");
    expect((toggle as HTMLElement).style.padding).toBe("2px 8px");
    // Top-right slot, one stylesheet gutter past the ⋯ trigger's 28px box
    // (right:40px clears its 34px left edge) — and NO left override.
    expect((toggle as HTMLElement).style.right).toBe("40px");
    expect((toggle as HTMLElement).style.left).toBe("");
    // Filled accent text (jsdom normalizes the hex — #a4c8f4); no inline
    // ring — the class carrier's own border:none holds (pinned in the
    // stylesheet sweep below).
    expect((toggle as HTMLElement).style.color).toBe("rgb(164, 200, 244)");
    expect((toggle as HTMLElement).style.border).toBe("");
  });

  it("unwatched: the quiet ghost chip with the 1px border ring — aria-pressed false, pinned visible inline like the watched state", () => {
    renderToggle(false);

    const toggle = screen.getByRole("button", { name: "Unwatched" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.textContent).toBe("watched");
    // The outline ring + the muted ghost text (the accent is watched-only).
    expect((toggle as HTMLElement).style.border).toContain("solid");
    expect((toggle as HTMLElement).style.color).toBe(
      "hsl(var(--muted-foreground))",
    );
    // The disclosure law is retired for this control too — always visible,
    // same corner slot and chip sizing as the watched state.
    expect((toggle as HTMLElement).style.opacity).toBe("1");
    expect((toggle as HTMLElement).style.right).toBe("40px");
    expect((toggle as HTMLElement).style.left).toBe("");
    expect((toggle as HTMLElement).style.width).toBe("auto");
  });

  it("in-progress: the bar stays with the outline toggle beside it", () => {
    render(
      <QueryClientProvider client={freshClient()}>
        <div className="cardact-host">
          <InProgressBar percent={33} />
          <WatchedToggle itemId="itm_s" watched={false} />
        </div>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("img", { name: "33% watched" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Unwatched" })).toBeDefined();
  });
});

describe("WatchedToggle — the click contract", () => {
  it("watched click writes {state: unwatched}; unwatched click writes {state: watched} — the target picked from the SERVED flag", async () => {
    const put = mockStateWrite("itm_1");

    const { unmount } = render(
      <QueryClientProvider client={freshClient()}>
        <div className="cardact-host">
          <WatchedToggle itemId="itm_1" watched={true} />
        </div>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Watched" }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    const [url, init] = put.mock.calls[0];
    expect(String(url)).toContain("/api/v1/items/itm_1/state");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({ state: "unwatched" });

    // The unwatched sibling flips the other way.
    unmount();
    const put2 = mockStateWrite("itm_2");
    render(
      <QueryClientProvider client={freshClient()}>
        <div className="cardact-host">
          <WatchedToggle itemId="itm_2" watched={false} />
        </div>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Unwatched" }));
    await waitFor(() => expect(put2).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(put2.mock.calls[0][1]?.body))).toEqual({
      state: "watched",
    });
  });

  it("the click never navigates the card — stopPropagation keeps the host handler silent", () => {
    mockStateWrite("itm_1");
    let navigated = false;
    renderToggle(false, () => {
      navigated = true;
    });

    fireEvent.click(screen.getByRole("button", { name: "Unwatched" }));
    expect(navigated).toBe(false);
  });

  it("the write invalidates the watched-flag readers — the five-family sweep on the real mutation", async () => {
    mockStateWrite("itm_1");
    const { invalidate } = renderToggle(false);

    fireEvent.click(screen.getByRole("button", { name: "Unwatched" }));
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["items"] }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["series"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["series-episodes"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["item"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["progress"] });
  });
});

describe("WatchedToggle — the cardact stylesheet pin", () => {
  // The ⋯ trigger's half of the composition: the cardact rules the chip rides
  // (its class carrier, its 8px radius, its border:none) must stay put in
  // index.css — base reveal + the coarse-pointer and html.tv persistence
  // twins, untouched by the toggle's inline retirement of the law for itself
  // (readFileSync, the clampCssContract idiom — jsdom evaluates no media
  // queries).
  const css = readFileSync(resolve(process.cwd(), "src/styles/index.css"), "utf8");

  it("the base law: opacity 0 at rest, revealed on host hover/focus-within", () => {
    const base = ruleBody(css, ".cardact-trigger {");
    expect(base).toContain("opacity: 0");
    // The filled accent chip reads as filled because the class carrier has
    // no ring (the unwatched ring is inline-only).
    expect(base).toContain("border: none");
    const reveal = [
      ".cardact-host:hover .cardact-trigger",
      ".cardact-host:focus-within .cardact-trigger",
    ];
    for (const selector of reveal) {
      expect(css).toContain(selector);
    }
    expect(ruleBody(css, ".cardact-host:hover .cardact-trigger,")).toContain("opacity: 1");
  });

  it("the persistence twins: pointer coarse AND html.tv keep the trigger visible at rest", () => {
    const coarse = css.slice(css.indexOf("@media (pointer: coarse)"));
    expect(ruleBody(coarse, ".cardact-trigger {")).toContain("opacity: 1");
    expect(ruleBody(css, "html.tv .cardact-trigger {")).toContain("opacity: 1");
  });
});

describe("WatchedStates — episode rows (EpisodesView)", () => {
  it("a watched episode renders the mark + dimmed title + NO bar even with a served position; the in-progress sibling keeps its bar; a new sibling renders clean", async () => {
    fetchWith({
      ...headerSeam("serial", 3),
      "/api/v1/series?library=1": () =>
        Promise.resolve(
          jsonResponse(200, { items: [srow({ id: "sr_1", name: "Hot Show" })] }),
        ),
      "/api/v1/series/sr_1/episodes": () =>
        Promise.resolve(
          jsonResponse(200, {
            items: [
              item("ep_w", { title: "Pilot", duration: 600, watched: true }),
              item("ep_s", { title: "Second Wind", duration: 600 }),
              item("ep_n", { title: "Cold Open", duration: 600 }),
            ],
          }),
        ),
      // include=watched (the shared query 2.1 wired) — the watched row is
      // served, and the watched CARD must still render NO bar off it.
      "/api/v1/progress": () =>
        Promise.resolve(
          jsonResponse(200, {
            items: [
              progressRow("ep_w", 600, true),
              progressRow("ep_s", 200),
            ],
          }),
        ),
    });

    renderCollection("/collections/1?series=sr_1");
    await screen.findByText("Pilot");

    // Watched: the `watched` chip TOGGLE (a real button, corner placement)…
    const pilot = cardOf("Pilot");
    const toggle = within(pilot).getByRole("button", { name: "Watched" });
    expect(toggle.textContent).toBe("watched");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Pilot").classList.contains("watched-dim")).toBe(
      true,
    );
    // …and NO progress bar, even though the served list carries its row
    // (600/600 would announce "100% watched" — the tri-state suppresses it).
    // The in-progress sibling's bar is awaited FIRST so the shared
    // ["progress"] cache has landed before any absence is asserted.
    const second = cardOf("Second Wind");
    await within(second).findByRole("img", { name: "33% watched" });
    expect(screen.queryByRole("img", { name: "100% watched" })).toBeNull();
    expect(
      screen.getByText("Second Wind").classList.contains("watched-dim"),
    ).toBe(false);
    expect(within(second).queryByRole("img", { name: "Watched" })).toBeNull();
    // The bar stays WITH the outline toggle beside it (the unwatched write
    // path is live on an in-progress card too).
    expect(within(second).getByRole("button", { name: "Unwatched" })).toBeDefined();

    // New sibling: clean — no bar, no dim, outline toggle only.
    const cold = cardOf("Cold Open");
    expect(within(cold).queryByRole("img")).toBeNull();
    expect(
      screen.getByText("Cold Open").classList.contains("watched-dim"),
    ).toBe(false);
    expect(within(cold).getByRole("button", { name: "Unwatched" })).toBeDefined();
  });
});

describe("WatchedStates — series cards (SeriesGrid)", () => {
  it("an all-watched series renders the mark + dimmed title; an unwatched sibling renders clean", async () => {
    fetchWith({
      ...headerSeam("serial", 2),
      "/api/v1/series?library=1": () =>
        Promise.resolve(
          jsonResponse(200, {
            items: [
              srow({ id: "sr_done", name: "Long Show", watched: true }),
              srow({ id: "sr_fresh", name: "Fresh Show" }),
            ],
          }),
        ),
    });

    renderCollection("/collections/1");
    await screen.findByText("Long Show");

    const done = cardOf("Long Show");
    expect(within(done).getByRole("img", { name: "Watched" }).textContent).toBe(
      "✓",
    );
    expect(
      screen.getByText("Long Show").classList.contains("watched-dim"),
    ).toBe(true);
    // No series-level position is served — a series card never renders a bar.
    expect(screen.queryByRole("img", { name: /% watched/ })).toBeNull();

    // Wire absence (the omitempty field gone) behaves as not-watched.
    const fresh = cardOf("Fresh Show");
    expect(within(fresh).queryByRole("img", { name: "Watched" })).toBeNull();
    expect(
      screen.getByText("Fresh Show").classList.contains("watched-dim"),
    ).toBe(false);
  });
});

describe("WatchedStates — item-grid cards (ItemGrid, the film/tv grid)", () => {
  it("watched card: mark + dimmed title + NO bar; in-progress sibling keeps today's bar; wire-absence renders clean", async () => {
    fetchWith({
      ...headerSeam("audio", 3),
      "/api/v1/items?library=1": () =>
        Promise.resolve(
          jsonResponse(200, {
            items: [
              item("itm_w", { title: "Done Film", duration: 600, watched: true }),
              item("itm_s", { title: "Started Film", duration: 600 }),
              item("itm_n", { title: "New Film", duration: 600 }),
            ],
          }),
        ),
      "/api/v1/progress": () =>
        Promise.resolve(
          jsonResponse(200, {
            items: [
              progressRow("itm_w", 600, true),
              progressRow("itm_s", 200),
            ],
          }),
        ),
    });

    renderCollection("/collections/1");
    await screen.findByText("Done Film");

    const done = cardOf("Done Film");
    // The toggle surface: the watched ✓ is the button, corner placement.
    const watchedToggle = within(done).getByRole("button", { name: "Watched" });
    expect(watchedToggle.getAttribute("aria-pressed")).toBe("true");
    expect(
      screen.getByText("Done Film").classList.contains("watched-dim"),
    ).toBe(true);

    // The in-progress sibling's bar awaited first (shared cache landed),
    // then the watched card's bar absence is meaningful.
    const started = cardOf("Started Film");
    await within(started).findByRole("img", { name: "33% watched" });
    expect(screen.queryByRole("img", { name: "100% watched" })).toBeNull();
    expect(
      screen.getByText("Started Film").classList.contains("watched-dim"),
    ).toBe(false);

    const fresh = cardOf("New Film");
    expect(within(fresh).queryByRole("img")).toBeNull();
    expect(
      screen.getByText("New Film").classList.contains("watched-dim"),
    ).toBe(false);
    // Both unwatched cards carry the outline toggle (the write path).
    expect(within(started).getByRole("button", { name: "Unwatched" })).toBeDefined();
    expect(within(fresh).getByRole("button", { name: "Unwatched" })).toBeDefined();
  });
});

describe("WatchedStates — the element page heading", () => {
  function detailSeam(itemBody: ItemDTO): void {
    const response: ItemResponse = { item: itemBody };
    vi.spyOn(apiModule, "getItem").mockResolvedValue(response);
    vi.spyOn(apiModule, "getLibrary").mockResolvedValue(
      lib(1, "serial", "serials"),
    );
    vi.spyOn(apiModule, "listProgress").mockResolvedValue({ items: [] });
  }

  function detailItem(watched?: boolean): ItemDTO {
    return {
      id: "itm_9",
      module_id: "serial",
      library_id: 1,
      file_id: "9",
      relative_path: "shows/Hot Show/s01e01.mkv",
      media_type: "serial",
      schema_version: 1,
      status: "ready",
      display_name: "Hot Show S01E01",
      document: doc({ title: "Pilot", duration: 600 }),
      ...(watched !== undefined ? { watched } : {}),
    };
  }

  function renderDetail(): void {
    render(
      <QueryClientProvider client={freshClient()}>
        <MemoryRouter initialEntries={["/items/itm_9"]}>
          <Routes>
            <Route path="/items/:id" element={<ItemDetail />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("a watched element's heading gains the `watched` chip toggle beside the served display name", async () => {
    detailSeam(detailItem(true));
    renderDetail();

    const h1 = await screen.findByRole("heading", { level: 1 });
    await waitFor(() =>
      expect(
        within(h1.parentElement as HTMLElement).getByRole("button", {
          name: "Watched",
        }).textContent,
      ).toBe("watched"),
    );
    // The toggle is the law's inline variant (always visible — the heading
    // is no hover-card) and it sits OUTSIDE the h1, so the heading's
    // accessible name stays the display name alone.
    const toggle = within(h1.parentElement as HTMLElement).getByRole("button", {
      name: "Watched",
    });
    expect(toggle.classList.contains("cardact-trigger--inline")).toBe(true);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(h1.textContent).toBe("Hot Show S01E01");
    // The served display name is dimmed; the fill carries the accent.
    expect(
      within(h1).getByText("Hot Show S01E01").classList.contains("watched-dim"),
    ).toBe(true);
  });

  it("wire absence (no served watched flag): the heading renders clean, with the outline toggle beside it", async () => {
    detailSeam(detailItem());
    renderDetail();

    const h1 = await screen.findByRole("heading", { level: 1 });
    await waitFor(() => expect(within(h1).getByText("Hot Show S01E01")).toBeDefined());
    expect(
      within(h1).getByText("Hot Show S01E01").classList.contains("watched-dim"),
    ).toBe(false);
    // The toggle surface is ALWAYS mounted — an unwatched element renders
    // the quiet ghost chip (the unwatched write path), inline placement.
    const toggle = within(h1.parentElement as HTMLElement).getByRole("button", {
      name: "Unwatched",
    });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.classList.contains("cardact-trigger--inline")).toBe(true);
  });
});
