// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";

import ApkDownload from "@/components/ApkDownload";

// The TWO-LAYER law (android-tv-app 6.2): both pins live in this ONE file.
//
// Layer 1 — fs-read source pins: the probe law (the /apk literal, HEAD,
// cache:"no-store") and the TV gate (the tvmode ladder's `tv` class — the
// settled output of the injected mellifera-client-ua meta + the ladder +
// the «Режим ТВ» override) are pinned against the SOURCE, plus the three
// placements' wiring (Player banner / login footer / settings foot).
// Layer 2 — DOM pins: the rendered affordance, mocked at the fetch seam
// (the vi.spyOn(globalThis, "fetch") idiom the neighboring suites use).

const here = dirname(fileURLToPath(import.meta.url));

function readSource(rel: string): string {
  return readFileSync(join(here, rel), "utf8");
}

describe("ApkDownload — layer 1: the fs-read source pins", () => {
  it("probes /apk with HEAD and a no-store cache bypass (default redirect-follow)", () => {
    const source = readSource("ApkDownload.tsx");
    expect(source).toContain('fetch("/apk"');
    expect(source).toContain('method: "HEAD"');
    expect(source).toContain('cache: "no-store"');
  });

  it("gates the banner on the tvmode ladder's `tv` class (injected meta + ladder + override)", () => {
    const source = readSource("ApkDownload.tsx");
    expect(source).toContain('classList.contains("tv")');
  });

  it("parses the version label from the redirect target's filename", () => {
    const source = readSource("ApkDownload.tsx");
    expect(source).toContain("mellifera-tv-(.+)\\.apk$");
    expect(source).toContain("new URL(res.url).pathname");
  });

  it("wires all three placements: the Player banner (tvGate), the login footer, the settings foot", () => {
    const player = readSource("playback/Player.tsx");
    expect(player).toContain("ApkDownload");
    expect(player).toContain("tvGate");
    expect(readSource("../pages/Login.tsx")).toContain("ApkDownload");
    expect(readSource("Sidebar.tsx")).toContain("ApkDownload");
  });
});

// apkResponse — a HEAD /apk answer shaped like the real one: `ok`/`status`
// for the render law, `url` the FINAL (redirect-followed) URL the version
// label parses. A plain object: the probe reads only these three fields.
function apkResponse(status: number, finalUrl = ""): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    url: finalUrl,
  } as Response;
}

// settleProbe — flush the probe's promise chain (fetch resolution →
// setProbe) inside act, so the post-probe render has landed before the
// assertion runs. Deterministic: the probe's continuation is pure
// microtask work after the mock resolves.
async function settleProbe(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("ApkDownload — layer 2: the rendered affordance", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("tv");
  });
  afterEach(() => {
    cleanup();
    document.documentElement.classList.remove("tv");
    vi.restoreAllMocks();
  });

  it("404 renders nothing (the APK-less build hides the affordance everywhere)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(apkResponse(404));
    render(<ApkDownload />);
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
    await settleProbe();
    expect(screen.queryByTestId("apk-download")).toBeNull();
    expect(screen.queryByTestId("apk-download-link")).toBeNull();
  });

  it("a transport failure floors to absent, like the 404", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    render(<ApkDownload />);
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
    await settleProbe();
    expect(screen.queryByTestId("apk-download")).toBeNull();
  });

  it("200 with a parseable filename labels the version and shows the Downloader address", async () => {
    // Default redirect-follow: the SPA sees the FINAL answer — a 200 from
    // the /assets target, whose URL carries the versioned filename.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      apkResponse(200, "http://mellifera.lan/assets/mellifera-tv-1.2.3.apk"),
    );
    render(<ApkDownload />);
    expect(await screen.findByTestId("apk-download")).toBeDefined();
    expect(screen.getByTestId("apk-download-version").textContent).toBe(
      "версия 1.2.3",
    );
    expect(screen.getByTestId("apk-download-link").getAttribute("href")).toBe(
      "/apk",
    );
    expect(screen.getByTestId("apk-download-downloader").textContent).toBe(
      `Адрес для Downloader: ${location.origin}/apk`,
    );
  });

  it("200 with an unparseable filename degrades to the button without a label", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      apkResponse(200, "http://mellifera.lan/assets/something-else.apk"),
    );
    render(<ApkDownload />);
    expect(await screen.findByTestId("apk-download")).toBeDefined();
    expect(screen.queryByTestId("apk-download-version")).toBeNull();
    expect(screen.getByTestId("apk-download-link")).toBeDefined();
  });

  it("the banner placement renders only under the tv gate (the codec-failure moment is TV-only)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      apkResponse(200, "http://mellifera.lan/assets/mellifera-tv-9.9.9.apk"),
    );

    // Desktop (no `tv` class): the gated mount renders nothing at all.
    const desktop = render(<ApkDownload tvGate />);
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
    await settleProbe();
    expect(screen.queryByTestId("apk-download")).toBeNull();
    desktop.unmount();

    // The same mount under the ladder's ruling: the full banner copy.
    document.documentElement.classList.add("tv");
    render(<ApkDownload tvGate />);
    expect(await screen.findByTestId("apk-download")).toBeDefined();
    expect(screen.getByText("Доступно приложение для Android TV")).toBeDefined();
    expect(
      screen.getByText("Лучше воспроизведение: аппаратные кодеки и поддержка MKV"),
    ).toBeDefined();
    expect(screen.getByTestId("apk-download-version").textContent).toBe(
      "версия 9.9.9",
    );
  });
});
