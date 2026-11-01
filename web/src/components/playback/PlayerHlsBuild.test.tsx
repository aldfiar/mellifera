// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import HlsFull, { AudioTrackController } from "hls.js";
import HlsLight from "hls.js/light";

import * as apiModule from "@/lib/api";
import type { ItemDTO, PlaybackDescriptor } from "@/lib/api";
import Player from "@/components/playback/Player";

// Player — hls build capability (fix-hls-light-audio): the axis the
// Player.test.tsx seam mock structurally cannot see. That suite's FakeHls
// fabricates audioTracks ["embedded", "dub", "rus"], but the REAL module
// behind Player's import decides the product: the "hls.js/light" dist
// stubs the audio-track machinery — its defaultConfig injects
// `audioTrackController: undefined` (dist/hls.light.mjs), createController
// answers null (dist/hls.js — `if (ControllerClass) … return null`), and
// the instance property stays null — so hls.audioTracks never
// populate, the master playlist's EXT-X-MEDIA renditions are never
// fetched, and every rendition-layout pack plays silent video-only on MSE
// devices (the voiceover switch riding hls.audioTrack is equally dead)
// while the mocked suite stays green. This file loads the REAL dists
// behind pass-through capture mocks bound to the SAME specifiers the
// Player can import — the mocks subclass the actual module and record
// every constructed instance — then asserts the audio-track controller on
// the instance the PLAYER built, not on a hand-picked build. The one-line
// import swap in Player.tsx (hls.js/light → hls.js) turns the main vector
// green without touching this file; reverting the swap re-reddens it.

// CapturedHls — the structural slice the assertions read, deliberately
// NOT the library types: audioTrackController exists at runtime but is
// absent from hls.js's public surface (the getters delegate to it).
interface CapturedHls {
  audioTrackController?: unknown;
}

// captured — one bucket per specifier, so a failure names the module the
// Player actually loaded (vi.hoisted: the mock factories below are
// hoisted above the imports).
const captured = vi.hoisted(() => ({
  full: [] as CapturedHls[],
  light: [] as CapturedHls[],
}));

// captureSpy — a subclass of the REAL class that records each instance and
// otherwise inherits everything: the isSupported gate, loadSource,
// attachMedia, the Events emitter — the whole lane runs for real.
function captureSpy(Base: unknown, bucket: CapturedHls[]): unknown {
  class SpyHls extends (Base as new (...args: unknown[]) => object) {
    constructor(...args: unknown[]) {
      super(...args);
      bucket.push(this as unknown as CapturedHls);
    }
  }
  return SpyHls;
}

// The factories spread the actual module (named exports — Events,
// ErrorTypes, the AudioTrackController class the assertions below
// instanceof against — stay real) and swap ONLY the default for the spy.
vi.mock("hls.js", async () => {
  const actual = await vi.importActual<typeof import("hls.js")>("hls.js");
  return { ...actual, default: captureSpy(actual.default, captured.full) };
});
vi.mock("hls.js/light", async () => {
  const actual = await vi.importActual<typeof import("hls.js/light")>("hls.js/light");
  return { ...actual, default: captureSpy(actual.default, captured.light) };
});

// StubMediaSource — the jsdom floor has no MSE; both the Player's
// Hls.isSupported() gate and the real loader's attach need one to take the
// hls lane at all. Minimal inert stand-in: the static isTypeSupported
// answers hls.js's capability probe (isSupported() .some()s real codec
// strings against it), the instance listeners absorb assignMediaSource's
// sourceopen/sourceended/sourceclose wiring, and nothing deeper is ever
// reached — no segment ever loads in these vectors.
class StubMediaSource {
  static isTypeSupported = (): boolean => true;
  readyState = "closed";
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
}

// InertXhr — hls.js's XhrLoader would otherwise fire real network requests
// at a playlist server that does not exist in jsdom; nothing in these
// vectors reads a response, so the transport rides an inert seam.
class InertXhr {
  readyState = 0;
  status = 0;
  response: unknown = null;
  responseText = "";
  responseType = "";
  timeout = 0;
  withCredentials = false;
  onabort: unknown = null;
  onerror: unknown = null;
  onload: unknown = null;
  onprogress: unknown = null;
  ontimeout: unknown = null;
  onreadystatechange: unknown = null;
  open = vi.fn();
  send = vi.fn();
  abort = vi.fn();
  setRequestHeader = vi.fn();
  getAllResponseHeaders = vi.fn(() => "");
  overrideMimeType = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
}

// jsdom's createObjectURL/revokeObjectURL reject non-Blob arguments — the
// loader's BufferController hands them the stub MediaSource — so the pair
// rides string stubs. Saved here, swapped per test, restored in afterEach
// (vi.unstubAllGlobals does not cover direct window properties).
const originalCreateObjectURL = window.URL.createObjectURL;
const originalRevokeObjectURL = window.URL.revokeObjectURL;

const HLS_DESCRIPTOR: PlaybackDescriptor = {
  mode: "hls",
  state: "complete",
  play_url: "/media/itm_1_9/abc123/index.m3u8?token=tok",
  sections: [],
};

// FILM_ITEM — the benign AutoNext read answer (watch-flow-polish 3.3): a
// film-shaped item carries no episode facts, so the auto-next card never
// renders in these vectors, whatever the ended edge does.
const FILM_ITEM: ItemDTO = {
  id: "itm_1_9",
  module_id: "tv",
  library_id: 1,
  file_id: "file-9",
  relative_path: "Film.mkv",
  media_type: "tv",
  document: {},
  schema_version: 1,
  status: "ready",
};

// wrap — the harness every render rides: AutoNext (mounted inside the
// Player overlay) needs a QueryClient and a Router context; the queries
// are answered by the api spies in beforeEach, never by the network.
function wrap(ui: ReactElement): ReactElement {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/items/itm_1_9"]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

function renderPlayer(): void {
  render(wrap(<Player itemId="itm_1_9" descriptor={HLS_DESCRIPTOR} />));
}

beforeEach(() => {
  captured.full.length = 0;
  captured.light.length = 0;
  // The loader's destroy path detaches through media.load() — jsdom
  // "not implemented" noise, nothing these vectors read. Restored by the
  // afterEach restoreAllMocks like the api spies.
  vi.spyOn(window.HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.stubGlobal("MediaSource", StubMediaSource);
  vi.stubGlobal("XMLHttpRequest", InertXhr);
  window.URL.createObjectURL = () => "blob:hls-build-probe";
  window.URL.revokeObjectURL = () => undefined;
  // The Player's api seams (mirrors Player.test.tsx): progress, beacon,
  // and the AutoNext overlay reads — all resolved in-process.
  vi.spyOn(apiModule, "putProgress").mockResolvedValue({
    item_id: "itm_1_9",
    position_seconds: 0,
    updated_at: "",
  });
  vi.spyOn(apiModule, "sendPlaybackEvent").mockResolvedValue(undefined);
  vi.spyOn(apiModule, "getItem").mockResolvedValue({ item: FILM_ITEM });
  vi.spyOn(apiModule, "getSeries").mockResolvedValue({ items: [] });
  vi.spyOn(apiModule, "getSeriesEpisodes").mockResolvedValue({ items: [] });
  vi.spyOn(apiModule, "fetchWatchDefaults").mockResolvedValue({
    auto_next_countdown_seconds: 10,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.URL.createObjectURL = originalCreateObjectURL;
  window.URL.revokeObjectURL = originalRevokeObjectURL;
});

describe("Player — hls build capability (fix-hls-light-audio)", () => {
  it("attaches through a loader that carries the audio-track controller", () => {
    renderPlayer();

    // Exactly one specifier is Player's import; whichever it is, the
    // constructed loader must carry the audio-track machinery.
    const constructed = [...captured.full, ...captured.light];
    expect(
      constructed.length,
      "Player built no hls loader — Hls.isSupported() returned false in this environment",
    ).toBeGreaterThan(0);
    for (const hls of constructed) {
      // THE discriminator: the full build's defaultConfig injects the real
      // AudioTrackController class (dist/hls.js — `audioTrackController:
      // AudioTrackController`), the light dist injects undefined, and
      // createController answers null — so the instance property stays
      // null and hls.audioTracks can never populate — the silent
      // video-only symptom. Before the import swap this reads null (RED);
      // after it, a real controller instance (GREEN). An instanceof
      // against the imported class, not toBeDefined — null is defined.
      expect(hls.audioTrackController).toBeInstanceOf(AudioTrackController);
    }
  });
});

// The discriminator's own witness — pins the differential to THIS hls.js
// version (1.7.3) so the main vector can never silently lose its meaning
// on a dependency bump: if a future hls.js changes either dist's wiring,
// these go red first and the assertion above gets re-derived, not trusted.
describe("hls.js dist differential (the discriminator's witness)", () => {
  it("the full build constructs the audio-track controller", () => {
    expect((new HlsFull() as unknown as CapturedHls).audioTrackController).toBeInstanceOf(
      AudioTrackController,
    );
  });

  it("the light build leaves it null — the bug's dist fact", () => {
    expect((new HlsLight() as unknown as CapturedHls).audioTrackController).toBeNull();
  });
});
