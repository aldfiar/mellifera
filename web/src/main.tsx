// SPDX-License-Identifier: Apache-2.0
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";

import App from "./App";
import { queryClient } from "@/lib/queries";
import "@/styles/index.css";

// Composition root. Mounts the provider tree every page assumes:
//   <QueryClientProvider>  — TanStack Query cache + invalidation (T05 hooks)
//   <BrowserRouter>        — client-side routing (T06 route table)
//   <App/>                 — the routes (/login public, /admin/* RequireAuth)
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
  </StrictMode>,
);
