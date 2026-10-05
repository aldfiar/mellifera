// SPDX-License-Identifier: Apache-2.0
import type { FormEvent, ReactElement } from "react";
import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { useToken } from "@/lib/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Login — token-entry form (MVP auth surface; arch §11.5). The admin token is
// a static server env var (MELLIFERA_ADMIN_TOKEN); there is no Go login
// endpoint, so the operator pastes the token once per browser. On submit the
// token is stored via `setToken` (T03 → localStorage under mellifera.token)
// and the operator is sent back to the route they originally requested.
//
// INV-presence-only: this page stores exactly what the operator pastes; it
// does NOT validate format/claims. The Go authMiddleware (middleware.go:32-45)
// is the sole authZ authority — a wrong token simply 401s on the next /api
// call, which rotates back here (T04).
//
// INV-from-redirect: after a successful set, navigate to `from` (preserving
// the original deep link set by <RequireAuth>) — not unconditionally /admin.
export default function Login(): ReactElement {
  const { setToken, token } = useToken();
  const navigate = useNavigate();
  const location = useLocation();

  // location.state.from is set by <RequireAuth> (T03) when it bounces an
  // unauthenticated request to /login. Fall back to /admin.
  const from =
    (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ||
    "/admin";

  const [value, setValue] = useState("");
  const [err, setErr] = useState<string | null>(null);

  // Already signed in (e.g. operator navigates to /login with a token in
  // localStorage) — send them on to the app instead of showing the form.
  if (token) {
    return <Navigate to={from} replace />;
  }

  function onSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setErr("Token is required.");
      return;
    }
    setErr(null);
    setToken(trimmed);
    navigate(from, { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Admin sign in</CardTitle>
          <CardDescription>
            Enter the server admin token to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="admin-token">Admin token</Label>
              <Input
                id="admin-token"
                name="admin-token"
                type="password"
                autoComplete="off"
                placeholder="paste admin token"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>

            {err ? (
              <Alert variant="destructive">
                <AlertDescription>{err}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit">Sign in</Button>

            <p className="text-xs text-muted-foreground">
              The token is the server&apos;s{" "}
              <code className="font-mono">MELLIFERA_ADMIN_TOKEN</code> value. It
              is stored locally in this browser only.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
