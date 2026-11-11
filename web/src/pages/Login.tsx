// SPDX-License-Identifier: Apache-2.0
import type { FormEvent, ReactElement } from "react";
import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { ApiError, login } from "@/lib/api";
import { useToken } from "@/lib/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import ApkDownload from "@/components/ApkDownload";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Login — the UNIFIED credential entry (l6-accounts 8.2, web-ui "Unified
// login surface"). Three flows, one page:
//
// 1. PRIMARY — username + password → POST /api/v1/auth/login (lib/api
//    login()); the minted session token is stored under the SAME credential
//    slot every wrapper channel reads (mellifera.token via lib/auth
//    setToken) — sessions, admin tokens, and device tokens share the slot,
//    and a stored credential's 401s rotate through the ONE existing
//    handle401 seam (lib/api.ts) exactly as before. The login call's OWN
//    401 is the server's UNIFORM authentication failure (wrong password /
//    unknown user / disabled user are byte-identical on the wire) and is
//    rendered verbatim — this page never differentiates those cases and
//    never rotates on it.
// 2. PRESERVED — the admin-token paste (the pre-accounts MVP flow,
//    web-ui arch §11.5): same acceptance behavior as today — paste, stored
//    via setToken, same redirect. The Go authMiddleware remains the sole
//    authZ authority; a wrong token simply 401s on the next /api call.
// 3. TVs — a link to "/" where the ROOT gate (App.tsx RootGate) mounts the
//    pairing entry for a credential-less browser: the device-pairing
//    deep-link surface is untouched, /login only links to it.
//
// INV-from-redirect: after a successful store (either flow), navigate to
// `from` (preserving the original deep link set by <RequireAuth>) — not
// unconditionally /admin. Already-authenticated visitors (a token in the
// slot) skip straight to the app.
export default function Login(): ReactElement {
  const { setToken, token } = useToken();
  const navigate = useNavigate();
  const location = useLocation();

  // location.state.from is set by <RequireAuth> (T03) when it bounces an
  // unauthenticated request to /login. Fall back to /admin.
  const from =
    (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ||
    "/admin";

  // Primary flow state.
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginPending, setLoginPending] = useState(false);
  const [loginErr, setLoginErr] = useState<string | null>(null);

  // Paste flow state — kept as-is from the MVP surface.
  const [value, setValue] = useState("");
  const [err, setErr] = useState<string | null>(null);

  // Already signed in (e.g. operator navigates to /login with a token in
  // localStorage) — send them on to the app instead of showing the form.
  if (token) {
    return <Navigate to={from} replace />;
  }

  async function onPasswordSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const name = username.trim();
    if (!name || !password) {
      setLoginErr("Username and password are required.");
      return;
    }
    setLoginErr(null);
    setLoginPending(true);
    try {
      const res = await login({ username: name, password });
      setToken(res.token);
      navigate(from, { replace: true });
    } catch (e2: unknown) {
      // The uniform failure (401), the rate limit (429), anything else —
      // the served canonical message is rendered verbatim; the SPA adds no
      // distinction the server did not make.
      setLoginErr(
        e2 instanceof ApiError
          ? e2.message
          : "Sign-in failed. Try again.",
      );
    } finally {
      setLoginPending(false);
    }
  }

  function onPasteSubmit(e: FormEvent<HTMLFormElement>): void {
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
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Enter your username and password.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form className="flex flex-col gap-4" onSubmit={onPasswordSubmit}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                name="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {loginErr ? (
              <Alert variant="destructive" data-testid="login-error">
                <AlertDescription>{loginErr}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" disabled={loginPending}>
              {loginPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>

          <form className="flex flex-col gap-2" onSubmit={onPasteSubmit}>
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
            {err ? (
              <Alert variant="destructive">
                <AlertDescription>{err}</AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit" variant="outline">
              Use admin token
            </Button>
            <p className="text-xs text-muted-foreground">
              The token is the server&apos;s{" "}
              <code className="font-mono">MELLIFERA_ADMIN_TOKEN</code> value. It
              is stored locally in this browser only.
            </p>
          </form>

          <Link
            to="/"
            data-testid="pairing-link"
            className="text-xs text-muted-foreground hover:underline"
          >
            Pair this device (TV)
          </Link>

          {/* android-tv-app 6.2: the login-footer placement — ungated, the
              probe renders nothing on an APK-less build. */}
          <div className="border-t pt-3">
            <ApkDownload />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
