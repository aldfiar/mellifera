// SPDX-License-Identifier: Apache-2.0
// @vitest-environment node
// (node env: the SUT is the dev-server config module — importing it pulls
// vite/esbuild's node-side API, which jsdom's TextEncoder stub breaks.
// Lives beside its SUT at the web root: the root tsconfig program covers
// src/ only, and this composite-project module must not enter it.)

// Dev same-origin contract (fix-episode-playback-start repro). The SPA runs on
// the Vite dev server (:5173) while the Go backend serves at :8080; in the
// embedded topology the same origin carries both. Every origin-relative URL
// the backend hands to the browser MUST therefore be proxied by the dev
// server — an unproxied prefix never reaches Go: Vite serves the SPA fallback
// (index.html, 200 text/html) instead of the real bytes.
//
// The playback surface is exactly such a URL: the stream service mounts the
// token-gated media surface at /media (internal/stream's mediaPrefix), the
// descriptor's play_url is root-relative under it (lib/api.ts), and Player.tsx
// attaches it verbatim to <video src> / hls.loadSource. With /media missing
// from this table the video element receives HTML — playback can never start
// on the episode page in dev (the reported bug: both lanes, direct and hls).

import { describe, expect, it } from "vitest";

import config from "./vite.config";

const proxy = (config.server?.proxy ?? {}) as Record<string, unknown>;

function expectProxied(prefix: string): void {
  const target = proxy[prefix];
  expect(
    target,
    `dev proxy is missing "${prefix}" — the SPA opens it same-origin and gets the Vite HTML fallback instead of the backend's bytes`,
  ).toBeTruthy();
  expect(
    typeof target === "string" ? target : undefined,
    `dev proxy entry "${prefix}" must point at the Go origin`,
  ).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
}

describe("vite dev proxy — SPA same-origin surfaces", () => {
  it("proxies /api (the JSON API: items, descriptor, progress)", () => {
    expectProxied("/api");
  });

  it("proxies /media (the playback mount — descriptor play_url target)", () => {
    expectProxied("/media");
  });
});
