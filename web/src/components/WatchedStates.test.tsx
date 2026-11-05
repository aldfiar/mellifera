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
// WatchedToggle BUTTON — the single ✓ glyph (no word ever renders; the
// state rides the aria pair + the wtoggle class) — series
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

// ---- WatchedToggle (collections-ux 2.2, reworked to the glyph law by
// watched-signal-refinement 1.1)
// The watched slot as a real <button> on the three mounted surfaces: ONE
// ✓ glyph (never a word — the aria pair "Watched"/"Unwatched" carries the
// state), one carrier form on every mount — `cardact-trigger
// cardact-trigger--inline` — with the state split CLASS-driven
// (`wtoggle--watched`/`wtoggle--unwatched`) and zero inline styles: no
// opacity/size/position/color/border overrides (D5: no pill, badge, or
// ring chrome in either state; the visibility law is context-scoped in
// CSS, task 3.1). jsdom sees no media queries and no layout, so the
// control's contract is asserted at its two observable seams: (a) the
// button composes the carrier + state class and pins the INLINE-STYLE
// ABSENCE — every style property the old chip pinned must stay ""
// (the chip idiom must not creep back); (b) the ⋯ trigger's own law —
// base reveal + coarse-pointer and html.tv persistence — is pinned by
// text (the clampCssContract readFileSync idiom) so the stylesheet
// composition can't silently lose it.

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

// rulesOf — EVERY (selector, body) pair in the stylesheet, comments
// stripped (the clampCssContract idiom again). @media wrappers never match —
// their inner rules surface with their own selector text — so the negative
// pins below sweep the WHOLE file: a stray hide outside the 3.1 block
// cannot hide behind a block slice.
function rulesOf(css: string): Array<{ selector: string; body: string }> {
  const sansComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return Array.from(sansComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)).map((m) => ({
    selector: m[1].trim(),
    body: m[2],
  }));
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
  it("watched: the single ✓ glyph — a pressed button on the carrier form, state class `wtoggle--watched`, ZERO inline styles", () => {
    renderToggle(true);

    const toggle = screen.getByRole("button", { name: "Watched" });
    expect(toggle.textContent).toBe("✓");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    // One carrier form on every mount — the class carrier + the inline
    // variant + the state class (the media-query twins need classes to
    // target; the state split is class-driven, not inline).
    expect(toggle.classList.contains("cardact-trigger")).toBe(true);
    expect(toggle.classList.contains("cardact-trigger--inline")).toBe(true);
    expect(toggle.classList.contains("wtoggle--watched")).toBe(true);
    expect(toggle.classList.contains("wtoggle--unwatched")).toBe(false);
    // The inline-style ABSENCE pin (the chip idiom must not creep back —
    // this is the twins-restoration pin): no opacity/size/position
    // overrides, no inline ring. Sizing, slot, colors, and the visibility
    // law all ride CSS (task 3.1).
    expect((toggle as HTMLElement).style.opacity).toBe("");
    expect((toggle as HTMLElement).style.width).toBe("");
    expect((toggle as HTMLElement).style.height).toBe("");
    expect((toggle as HTMLElement).style.padding).toBe("");
    expect((toggle as HTMLElement).style.right).toBe("");
    expect((toggle as HTMLElement).style.left).toBe("");
    expect((toggle as HTMLElement).style.border).toBe("");
  });

  it("unwatched: the ghost ✓ — aria-pressed false, state class `wtoggle--unwatched`, ZERO inline styles like the watched state", () => {
    renderToggle(false);

    const toggle = screen.getByRole("button", { name: "Unwatched" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.textContent).toBe("✓");
    // Same carrier form, opposite state class.
    expect(toggle.classList.contains("cardact-trigger")).toBe(true);
    expect(toggle.classList.contains("cardact-trigger--inline")).toBe(true);
    expect(toggle.classList.contains("wtoggle--unwatched")).toBe(true);
    expect(toggle.classList.contains("wtoggle--watched")).toBe(false);
    // The same inline-style absence — no ring chrome (D5: retired in BOTH
    // states), no visibility/size/position overrides.
    expect((toggle as HTMLElement).style.opacity).toBe("");
    expect((toggle as HTMLElement).style.width).toBe("");
    expect((toggle as HTMLElement).style.height).toBe("");
    expect((toggle as HTMLElement).style.padding).toBe("");
    expect((toggle as HTMLElement).style.right).toBe("");
    expect((toggle as HTMLElement).style.left).toBe("");
    expect((toggle as HTMLElement).style.border).toBe("");
  });

  it("in-progress: the bar stays with the ghost toggle beside it", () => {
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

  // ---- watched-signal-refinement 3.1: the D4 block + the visibility law.
  // The toggle's own stylesheet composition is pinned by text (jsdom
  // evaluates no stylesheets): the block's presence and location, the D1
  // scoping, the D9 state split, the restore shapes, the reveals, and the
  // row rule.

  // The 3.1 block opens with this header; slicing from it scopes the
  // coarse-restore pin to THIS block's media rule (the ⋯ trigger's own
  // coarse block lives earlier in the file and must never satisfy it).
  const D4_BLOCK_START =
    "/* ---- Watched toggle + card meta row (watched-signal-refinement 3.1)";
  const HIDE_SELECTOR =
    ".card-meta-row .cardact-trigger.wtoggle--unwatched {";

  it("the D4 block: present, AFTER the cardact section, BEFORE the tv shell block", () => {
    const at = css.indexOf(D4_BLOCK_START);
    expect(at, "the 3.1 block header missing from index.css").toBeGreaterThanOrEqual(0);
    expect(at).toBeGreaterThan(css.indexOf(".cardact-trigger {"));
    expect(at).toBeLessThan(css.indexOf("/* ---- TV mode shell (tv-mode 5.1)"));
  });

  it("the row rule: flex meta row, right-aligned toggle child, meta-line glyph scale", () => {
    const row = ruleBody(css, ".card-meta-row {");
    expect(row).toContain("display: flex");
    expect(row).toContain("align-items: center");
    expect(row).toContain("gap: 8px");
    expect(row).toContain("padding: 0 12px 12px");
    expect(ruleBody(css, ".card-meta-row > .cardact-trigger {")).toContain(
      "margin-left: auto",
    );
    // The ✓ at the meta-line scale via the `.watched-mark` em idiom
    // (0.85em ≈ 12px) — never the ⋯ trigger's 16px.
    expect(ruleBody(css, ".card-meta-row .cardact-trigger {")).toContain(
      "font-size: 0.85em",
    );
  });

  it("the state colors: watched accent / unwatched muted ghost, no border chrome in either (D5)", () => {
    const watched = ruleBody(css, ".wtoggle--watched {");
    expect(watched).toContain("color: #a4c8f4");
    expect(watched).not.toContain("border");
    const unwatched = ruleBody(css, ".wtoggle--unwatched {");
    expect(unwatched).toContain("color: hsl(var(--muted-foreground))");
    expect(unwatched).not.toContain("border");
  });

  it("the D3 hover pair: accent hue held on watched, background-only clear on unwatched — AFTER the base hover", () => {
    expect(ruleBody(css, ".wtoggle--watched:hover {")).toContain(
      "background: transparent",
    );
    expect(ruleBody(css, ".wtoggle--watched:hover {")).toContain("color: #a4c8f4");
    expect(ruleBody(css, ".wtoggle--unwatched:hover {")).toContain(
      "background: transparent",
    );
    // Equal specificity with `.cardact-trigger:hover` — source order
    // decides, so both overrides must sit after it.
    const baseHoverAt = css.indexOf(".cardact-trigger:hover {");
    expect(css.indexOf(".wtoggle--watched:hover {")).toBeGreaterThan(baseHoverAt);
    expect(css.indexOf(".wtoggle--unwatched:hover {")).toBeGreaterThan(baseHoverAt);
  });

  it("D1 scoping: the hide is .card-meta-row-scoped — no GLOBAL .cardact-trigger--inline hide exists", () => {
    const hide = ruleBody(css, HIDE_SELECTOR);
    expect(hide).toContain("opacity: 0");
    expect(hide).toContain("pointer-events: none");
    // The heading keeps `--inline`'s always-visible: every rule naming the
    // inline carrier must leave the at-rest opacity at 1.
    for (const rule of rulesOf(css)) {
      if (rule.selector.includes("cardact-trigger--inline")) {
        expect(
          rule.body,
          `global --inline hide leaked: ${rule.selector}`,
        ).not.toContain("opacity: 0");
      }
    }
  });

  it("D9: the watched ✓ carries NO hide-at-rest rule — the hide names wtoggle--unwatched only", () => {
    for (const rule of rulesOf(css)) {
      if (rule.selector.includes("wtoggle--watched")) {
        expect(
          rule.body,
          `watched hide leaked: ${rule.selector}`,
        ).not.toContain("opacity: 0");
        expect(rule.body).not.toContain("pointer-events: none");
      }
    }
    // Guard the guard: the unwatched hide IS in the file, so the sweep
    // above is not vacuously green.
    expect(
      rulesOf(css).some(
        (r) =>
          r.selector.includes("wtoggle--unwatched") &&
          r.body.includes("opacity: 0"),
      ),
    ).toBe(true);
  });

  it("each restore carries the hide's state-scoped shape and sets BOTH opacity: 1 AND pointer-events: auto", () => {
    // A bare `.cardact-trigger` restore would silently lose to the 0,3,0
    // hide, and an opacity-only restore would pass every presence pin while
    // leaving the unwatched toggle visible-but-untappable at rest.
    const d4 = css.slice(css.indexOf(D4_BLOCK_START));
    // Coarse: THIS block's media rule (sliced from the block start — the ⋯
    // trigger's own coarse block earlier in the file is a bare 0,1,0 that
    // loses to the hide regardless of media queries), equal specificity
    // with the hide, later in the block (tie-and-later).
    const coarseAt = d4.indexOf("@media (pointer: coarse)");
    expect(coarseAt, "the block carries no coarse restore").toBeGreaterThan(0);
    const coarseRestore = ruleBody(d4.slice(coarseAt), HIDE_SELECTOR);
    expect(coarseRestore).toContain("opacity: 1");
    expect(coarseRestore).toContain("pointer-events: auto");
    // TV: the same state-scoped shape under the html.tv prefix — TV Chrome
    // reports pointer: fine, so this restore (0,4,1, beats outright) is the
    // operative one there; the clamp sizes ride the untouched existing twin.
    const tvRestore = ruleBody(
      css,
      `html.tv ${HIDE_SELECTOR}`,
    );
    expect(tvRestore).toContain("opacity: 1");
    expect(tvRestore).toContain("pointer-events: auto");
    // Both restores sit after the hide in source.
    const hideAt = css.indexOf(HIDE_SELECTOR);
    expect(css.indexOf(D4_BLOCK_START) + coarseAt).toBeGreaterThan(hideAt);
    expect(css.indexOf(`html.tv ${HIDE_SELECTOR}`)).toBeGreaterThan(hideAt);
  });

  it("the own reveals: host hover/focus-within + own :focus-visible restore BOTH opacity and pointer-events (>=0,4,0)", () => {
    // The base reveal sets opacity only — never pointer-events — so a
    // hover-revealed toggle would stay visible but unclickable without
    // these; each restores BOTH.
    const host = ruleBody(
      css,
      ".cardact-host:hover .cardact-trigger.wtoggle--unwatched,",
    );
    expect(host).toContain("opacity: 1");
    expect(host).toContain("pointer-events: auto");
    expect(css).toContain(
      ".cardact-host:focus-within .cardact-trigger.wtoggle--unwatched",
    );
    // The keyboard path (tab reaches the hidden button): own :focus-visible,
    // state-scoped — 0,4,0 with the row prefix, never a bare 0,3,0 placed
    // before the hide.
    const focus = ruleBody(
      css,
      ".card-meta-row .cardact-trigger.wtoggle--unwatched:focus-visible {",
    );
    expect(focus).toContain("opacity: 1");
    expect(focus).toContain("pointer-events: auto");
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

    // Watched: the ✓ glyph TOGGLE (a real button on the carrier form)…
    const pilot = cardOf("Pilot");
    const toggle = within(pilot).getByRole("button", { name: "Watched" });
    expect(toggle.textContent).toBe("✓");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Pilot").classList.contains("watched-dim")).toBe(
      true,
    );
    // The meta-row contract (watched-signal-refinement 2.2): the toggle's
    // parent is the card-meta-row, the meta line span is its sibling, and the
    // row sits OUTSIDE the Link inside the card border box — the border/
    // rounded/hover chrome now lives on the host (D2), the Link is chrome-free.
    const metaRow = toggle.parentElement as HTMLElement;
    expect(metaRow.classList.contains("card-meta-row")).toBe(true);
    const metaSpan = metaRow.querySelector("span.text-muted-foreground");
    expect(metaSpan).not.toBeNull();
    expect(metaSpan).not.toBe(toggle);
    expect(toggle.closest("a")).toBeNull();
    expect(metaRow.closest("a")).toBeNull();
    const host = metaRow.parentElement as HTMLElement;
    expect(host.classList.contains("cardact-host")).toBe(true);
    expect(host.classList.contains("border")).toBe(true);
    const cardLink = within(pilot).getByRole("link");
    expect(cardLink.classList.contains("border")).toBe(false);
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
    // The bar stays WITH the ghost toggle beside it (the unwatched write
    // path is live on an in-progress card too) — both moved into the same
    // card-meta-row (2.2; the bar's markup itself untouched).
    const secondToggle = within(second).getByRole("button", {
      name: "Unwatched",
    });
    const secondRow = secondToggle.parentElement as HTMLElement;
    expect(secondRow.classList.contains("card-meta-row")).toBe(true);
    expect(
      within(secondRow).getByRole("img", { name: "33% watched" }).parentElement,
    ).toBe(secondRow);

    // New sibling: clean — no bar, no dim, ghost toggle only.
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
    // The toggle surface: the watched ✓ is the button, one carrier form.
    const watchedToggle = within(done).getByRole("button", { name: "Watched" });
    expect(watchedToggle.getAttribute("aria-pressed")).toBe("true");
    expect(
      screen.getByText("Done Film").classList.contains("watched-dim"),
    ).toBe(true);
    // The meta-row contract (watched-signal-refinement 2.2): no meta line on
    // this grid — the row carries the bar (when served) + the toggle, sits
    // OUTSIDE the Link inside the border box (the li itself hosts the
    // cardact-host chrome, D2), and the Link is chrome-free.
    const gridRow = watchedToggle.parentElement as HTMLElement;
    expect(gridRow.classList.contains("card-meta-row")).toBe(true);
    expect(watchedToggle.closest("a")).toBeNull();
    expect(gridRow.closest("a")).toBeNull();
    expect(gridRow.parentElement).toBe(done);
    expect(done.classList.contains("border")).toBe(true);
    const gridLink = within(done).getByRole("link");
    expect(gridLink.classList.contains("border")).toBe(false);

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
    // Both unwatched cards carry the ghost toggle (the write path) in the
    // card-meta-row — the in-progress card's bar rides the same row.
    const startedToggle = within(started).getByRole("button", {
      name: "Unwatched",
    });
    expect(
      (startedToggle.parentElement as HTMLElement).classList.contains(
        "card-meta-row",
      ),
    ).toBe(true);
    expect(
      within(startedToggle.parentElement as HTMLElement).getByRole("img", {
        name: "33% watched",
      }).parentElement,
    ).toBe(startedToggle.parentElement);
    expect(
      (within(fresh).getByRole("button", { name: "Unwatched" }).parentElement as HTMLElement).classList.contains(
        "card-meta-row",
      ),
    ).toBe(true);
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

  it("a watched element's heading gains the ✓ glyph toggle beside the served display name", async () => {
    detailSeam(detailItem(true));
    renderDetail();

    const h1 = await screen.findByRole("heading", { level: 1 });
    await waitFor(() =>
      expect(
        within(h1.parentElement as HTMLElement).getByRole("button", {
          name: "Watched",
        }).textContent,
      ).toBe("✓"),
    );
    // The toggle is the law's inline variant (visible at rest — the heading
    // is exempt from the meta-row hide per D1: it never sits in a
    // `.card-meta-row`) and it sits OUTSIDE the h1, so the heading's
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

  it("wire absence (no served watched flag): the heading renders clean, with the ghost toggle beside it", async () => {
    detailSeam(detailItem());
    renderDetail();

    const h1 = await screen.findByRole("heading", { level: 1 });
    await waitFor(() => expect(within(h1).getByText("Hot Show S01E01")).toBeDefined());
    expect(
      within(h1).getByText("Hot Show S01E01").classList.contains("watched-dim"),
    ).toBe(false);
    // The toggle surface is ALWAYS mounted — an unwatched element renders
    // the ghost ✓ (the unwatched write path), visible at rest per D1.
    const toggle = within(h1.parentElement as HTMLElement).getByRole("button", {
      name: "Unwatched",
    });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.classList.contains("cardact-trigger--inline")).toBe(true);
  });
});
