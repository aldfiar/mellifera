// SPDX-License-Identifier: Apache-2.0
import type { ReactElement, ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { RequireAuth } from "@/components/RequireAuth";
import Sidebar from "@/components/Sidebar";
import { getDeviceToken, getToken } from "@/lib/auth";
import { useRelayWorker } from "@/lib/relayWorker";
import Login from "@/pages/Login";
import PairingEntry from "@/pages/pair/PairingEntry";
import Home from "@/pages/home/Home";
import Collection from "@/pages/collections/Collection";
import Collections from "@/pages/admin/Collections";
import Sources from "@/pages/admin/Sources";
import Plugins from "@/pages/admin/Plugins";
import PluginFailures from "@/pages/admin/PluginFailures";
import Pairing from "@/pages/admin/Pairing";
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
  // The relay loop's ONE mount (client-relayed-fetch 6.2): every component
  // inside the authenticated shell — admin token or paired device alike —
  // serves the relay queue, while /login and the unauthenticated RootGate
  // branch (the pairing entry) never render Shell and never start it.
  useRelayWorker();
  return (
    <>
      <Sidebar />
      <div className="app-content">{children}</div>
    </>
  );
}

// RootGate — the ROOT route's three-state credential gate (device-pairing
// D8): no stored credential (neither the admin token nor a device token) →
// the pairing entry screen; either credential → the app shell exactly as
// today. ROOT ROUTE ONLY — every other protected route keeps <RequireAuth>'s
// redirect to /login (web-ui "SPA token authentication" untouched there);
// /login stays reachable for operator deep links. Presence-only, like
// RequireAuth: the Go authMiddleware remains the sole authZ authority.
function RootGate({ children }: { children: ReactNode }): ReactElement {
  if (!getToken() && !getDeviceToken()) {
    return <PairingEntry />;
  }
  return <>{children}</>;
}

export default function App(): ReactElement {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RootGate>
            <Shell>
              <Home />
            </Shell>
          </RootGate>
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
        path="/admin/plugins"
        element={
          <RequireAuth>
            <Shell>
              <Plugins />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/admin/plugins/:pluginId/failures"
        element={
          <RequireAuth>
            <Shell>
              <PluginFailures />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/admin/pairing"
        element={
          <RequireAuth>
            <Shell>
              <Pairing />
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
