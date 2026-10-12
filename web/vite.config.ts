// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Vite config for the Mellifera SPA.
//
// build.outDir redirects the bundle into the committed //go:embed target
// (internal/web/dist — `internal/web/web.go:20`'s `//go:embed all:dist`).
// Embed paths cannot escape the internal/web package, so the Vite build is
// emitted there directly; /web/dist/ is gitignored and unused.
//
// server.proxy forwards the API, media playback, and OpenAPI/Swagger paths to
// the Go server at :8080 in dev (same-origin SPA<->API; no CORS). Run with
// `MELLIFERA_WEB_DEV=true` on the Go side so its no-cache headers don't mask
// Vite hot-reload.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "../internal/web/dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8080",
      "/media": "http://127.0.0.1:8080",
      "/openapi.yaml": "http://127.0.0.1:8080",
      "/openapi.json": "http://127.0.0.1:8080",
      "/docs": "http://127.0.0.1:8080",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
});
