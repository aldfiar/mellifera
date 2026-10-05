// SPDX-License-Identifier: Apache-2.0
import type { ReactElement, ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { getToken } from "@/lib/auth";

// <RequireAuth> — route guard. Renders children iff a token is present in
// localStorage; otherwise redirects to /login, preserving the attempted
// location in router state (so Login can send the operator back on success).
//
// INV-presence-only-authN: this checks ONLY presence-of-token. It never
// validates the token, never reads claims, never enforces authZ. The Go
// authMiddleware + requireRole (internal/api/middleware.go:32-75) are the sole
// authZ authority; a 401 from /api (handled by lib/api.ts) is the source of
// truth that clears the token and rotates the client back to /login.
//
// Must be rendered inside <BrowserRouter> (uses useLocation).
export function RequireAuth({ children }: { children: ReactNode }): ReactElement {
  const token = getToken();
  const location = useLocation();
  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}
