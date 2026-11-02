// SPDX-License-Identifier: Apache-2.0
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";

// Boot apply (tv-mode): imported before App so the `tv` class lands on <html>
// before any consumer mounts (design I6; the ThemeToggle module-eval idiom).
import "@/lib/tvmode";
import App from "./App";
import TvDebugOverlay from "@/components/TvDebugOverlay";
import { queryClient } from "@/lib/queries";
import "@/styles/index.css";

// Composition root. Mounts the provider tree every page assumes:
//   <QueryClientProvider>  — TanStack Query cache + invalidation (T05 hooks)
//   <BrowserRouter>        — client-side routing (T06 route table)
//   <App/>                 — the routes (/login public, /admin/* RequireAuth)
// plus <TvDebugOverlay/> AFTER App (tv-debug-overlay 1.1): the ?tvdebug=1
// diagnostic floats above every surface; it renders null without the param,
// so the boot DOM is unchanged otherwise.
//
// StrictMode double-invokes effects in dev to surface side-effect bugs; it is
// a no-op in the production build (vite build). The container (#root) is
// created by index.html.
const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("root element #root not found");
}

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
    <TvDebugOverlay />
  </StrictMode>,
);
