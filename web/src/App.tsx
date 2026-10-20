// SPDX-License-Identifier: Apache-2.0
import type { ReactElement, ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { RequireAuth } from "@/components/RequireAuth";
import Sidebar from "@/components/Sidebar";
import Login from "@/pages/Login";
import Home from "@/pages/home/Home";
import Collection from "@/pages/collections/Collection";
import Collections from "@/pages/admin/Collections";
import Sources from "@/pages/admin/Sources";
import ItemDetail from "@/pages/browse/ItemDetail";

// Client-side route table (web-ui-phase-3 group 3). Routing is purely
// client-side (INV-no-server-route-config): the Go NotFound SPA fallback
// (internal/web/web.go:54-63) serves index.html for any non-/api, non-/openapi,
// non-/docs, non-/assets path, so deep links like /admin and /login resolve
// without server config (AC-5).
//
// INV-public-login-only: /login is the ONLY unauthenticated SPA route; every
// other route is wrapped in <RequireAuth> (or redirects into one that is).
//
// The top navigation header is GONE (sidebar shell): every authed route
// renders inside <Shell>, which mounts the hidden-by-default Sidebar and the
// .app-content area the shell's CSS offsets. /browse is not redirected — Home
// replaces it as the landing surface (design.md §Compatibility).

// Shell — the sidebar frame around every authenticated route. The Sidebar
// renders the floating menu button + slide-in panel; .app-content is the
// area index.css shifts right of the 224px panel while it is open.
function Shell({ children }: { children: ReactNode }): ReactElement {
  return (
    <>
      <Sidebar />
      <div className="app-content">{children}</div>
    </>
  );
}

export default function App(): ReactElement {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Shell>
              <Home />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/collections/:id"
        element={
          <RequireAuth>
            <Shell>
              <Collection />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/items/:id"
        element={
          <RequireAuth>
            <Shell>
              <ItemDetail />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/admin/sources"
        element={
          <RequireAuth>
            <Shell>
              <Sources />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/admin/*"
        element={
          <RequireAuth>
            <Shell>
              <Collections />
            </Shell>
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
