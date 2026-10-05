// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { RequireAuth } from "@/components/RequireAuth";
import Login from "@/pages/Login";
import Admin from "@/pages/admin/Admin";

// Client-side route table. Routing is purely client-side (INV-no-server-route-
// config): the Go NotFound SPA fallback (internal/web/web.go:54-63) serves
// index.html for any non-/api, non-/openapi, non-/docs, non-/assets path, so
// deep links like /admin and /login resolve without server config (AC-5).
//
// INV-public-login-only: /login is the ONLY unauthenticated SPA route; every
// other route is wrapped in <RequireAuth> (or redirects into one that is).
//
// INV-root-redirect-2a: / -> /admin in 2a (Phase 2b flips this to /browse).
export default function App(): ReactElement {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/admin/*"
        element={
          <RequireAuth>
            <Admin />
          </RequireAuth>
        }
      />
      <Route path="/" element={<Navigate to="/admin" replace />} />
      {/* 2b: / -> /browse */}
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
