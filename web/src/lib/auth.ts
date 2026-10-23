// SPDX-License-Identifier: Apache-2.0
import { useCallback, useState } from "react";

// SPA credential store for the admin bearer token.
//
// The token is persisted in localStorage under the fixed key below so the
// operator enters it once per browser (not sessionStorage; not a cookie —
// there is no Go login endpoint; the admin token is a static env var). XSS
// exposure is acknowledged + accepted for a 127.0.0.1-bound personal server
// (conventions §4; arch §11.5); revisit at D18 (multi-user auth).
//
// This module is the credential STORE only. The Go authMiddleware +
// requireRole (internal/api/middleware.go:32-75) are the sole authZ authority;
// a 401 from /api (handled by lib/api.ts) is the source of truth that clears
// the token.

// INV-fixed-key: matches contracts.md §Constants MELLIFERA_TOKEN_KEY. Drift = bug.
export const TOKEN_KEY = "mellifera.token";

// INV-fixed-key: the paired device's token slot beside the admin token
// (device-pairing D8). Same storage posture, same exceptions — a paired TV
// enters its token once via the pairing flow and keeps it per browser.
export const DEVICE_TOKEN_KEY = "mellifera.device_token";

// getToken reads the stored token (null when absent or localStorage throws).
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

// setToken persists the token verbatim (lossless round-trip).
export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // localStorage unavailable (private-mode quota etc.) — no fallback for the
    // 2a MVP; the SPA always runs in a normal browser context.
  }
}

// clearToken removes the stored token.
export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // see setToken
  }
}

// getDeviceToken reads the stored device token (null when absent or
// localStorage throws) — the device-side twin of getToken.
export function getDeviceToken(): string | null {
  try {
    return localStorage.getItem(DEVICE_TOKEN_KEY);
  } catch {
    return null;
  }
}

// setDeviceToken persists the device token verbatim (lossless round-trip) —
// written exactly once, by the pairing entry's approved poll.
export function setDeviceToken(token: string): void {
  try {
    localStorage.setItem(DEVICE_TOKEN_KEY, token);
  } catch {
    // see setToken
  }
}

// clearDeviceToken removes the stored device token — the 401 interceptor
// clears it alongside the admin token so a revoked device lands back on the
// pairing entry (lib/api.ts handle401).
export function clearDeviceToken(): void {
  try {
    localStorage.removeItem(DEVICE_TOKEN_KEY);
  } catch {
    // see setToken
  }
}

// getBearerToken — the ONE wire-credential selector every API channel
// attaches: the admin token when stored (the operator path, byte-identical
// to before), else the device token (the paired TV's RoleClient credential).
// Before this selector the channels read the admin token alone, so a
// device-only browser sent every shell call unauthenticated — the shell
// 401'd, handle401 cleared the just-minted token, and the device bounced
// back to a freshly minted pairing code: approved forever, never entered.
export function getBearerToken(): string | null {
  return getToken() ?? getDeviceToken();
}

// useToken — React hook over the store. Seeds state from getToken() so the
// first render reflects any persisted credential; setToken/clearToken write
// through to localStorage AND update local state so consumers re-render.
export function useToken(): {
  token: string | null;
  setToken: (t: string) => void;
  clearToken: () => void;
} {
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const set = useCallback((t: string) => {
    setToken(t);
    setTokenState(t);
  }, []);
  const clear = useCallback(() => {
    clearToken();
    setTokenState(null);
  }, []);
  return { token, setToken: set, clearToken: clear };
}
