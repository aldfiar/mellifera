// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { RequireAuth } from "@/components/RequireAuth";
import Login from "@/pages/Login";
import Admin from "@/pages/admin/Admin";
import Browse from "@/pages/browse/Browse";
import ItemDetail from "@/pages/browse/ItemDetail";

// Client-side route table. Routing is purely client-side (INV-no-server-route-
// config): the Go NotFound SPA fallback (internal/web/web.go:54-63) serves
// index.html for any non-/api, non-/openapi, non-/docs, non-/assets path, so
// deep links like /admin and /login resolve without server config (AC-5).
//
// INV-public-login-only: /login is the ONLY unauthenticated SPA route; every
// other route is wrapped in <RequireAuth> (or redirects into one that is).
//
// INV-root-redirect-2b: / and * redirect to /browse (the 2a → /admin default
// flipped in Phase 2b — browse is the operator's landing surface).

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
      <Route
        path="/browse"
        element={
          <RequireAuth>
            <Browse />
          </RequireAuth>
        }
      />
      <Route
        path="/items/:id"
        element={
          <RequireAuth>
            <ItemDetail />
          </RequireAuth>
        }
      />
      <Route path="/" element={<Navigate to="/browse" replace />} />
      <Route path="*" element={<Navigate to="/browse" replace />} />
    </Routes>
  );
}
