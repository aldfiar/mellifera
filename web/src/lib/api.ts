// SPDX-License-Identifier: Apache-2.0
import { clearToken, getToken } from "@/lib/auth";

// TS mirrors of the Go wire DTOs (internal/api/handlers.go). Field names match
// the JSON tags EXACTLY (module_id, not moduleId) — these ARE the JSON shape;
// drift = bug (INV-verbatim-field-names; conventions §3).

// handlers.go:34-38 (createLibraryRequest)
export interface CreateLibraryRequest {
  module_id: string; // "tv" | "image"
  root_path: string; // absolute OS path — local OR NFS-mounted
  display_name: string;
}

// handlers.go:46-51 (libraryDTO)
export interface LibraryDTO {
  id: number; // int64
  module_id: string;
  root_path: string;
  display_name: string;
}

// handlers.go:54-56 (librariesResponse) — empty array, never null
export interface LibrariesResponse {
  items: LibraryDTO[];
}

// handlers.go:59-64 (scanResponse) — warnings omitted when empty (omitempty)
export interface ScanResponse {
  library_id: number;
  discovered: number;
  persisted: number;
  warnings?: string[];
}

// handlers.go:86-91 (PluginHealth) — checked_at is RFC3339, "" when zero
export interface PluginHealth {
  id: string;
  state: string; // "serving" | "degraded" | "not_serving" | "failed"
  restarts: number;
  checked_at: string;
}

// handlers.go:97-102 (EnrichStats)
export interface EnrichStats {
  pending: number;
  in_flight: number;
  done: number;
  failed: number;
}

// handlers.go:110-123 (AdminStatus — the /admin/status response body)
export interface AdminStatus {
  plugins: PluginHealth[];
  enrich: EnrichStats;
}

// Canonical error body inner object (handlers.go:364-385; arch §11.6).
export interface ApiErrorBody {
  code: string;
  message: string;
  retryable: boolean;
}

// ApiError — thrown for any non-2xx response carrying (or failing to carry) the
// canonical body. Carries the parsed {code,message,retryable} so the UI can
// surface code + message inline and offer a retry affordance when retryable.
export class ApiError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly status: number;

  constructor(
    status: number,
    body: ApiErrorBody,
  ) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code;
    this.retryable = body.retryable;
  }
}

// 2a endpoint path constants — ALL pre-existing (router.go:92,98-100; AC-7).
// Phase-2b adds GET /api/v1/items[/{id}] (unused in 2a — NOT listed here).
export const ENDPOINTS = {
  libraries: "/api/v1/libraries",
  scan: (id: number): string => `/api/v1/libraries/${id}/scan`,
  adminStatus: "/api/v1/admin/status",
} as const;

// redirectToLogin — the 401 rotation. Factored so the redirect is a single
// chokepoint (and overridable in tests). INV-401-source-of-truth: a 401 is the
// SOLE signal that rotates the client to /login.
function redirectToLogin(): void {
  window.location.assign("/login");
}

// apiRequest<T> — the Bearer fetch wrapper. Every /api/v1/* call funnels
// through here.
//
// - attaches Authorization: Bearer <getToken()> when a token exists
//   (INV-bearer-always); the Go authMiddleware (middleware.go:32-45) enforces
//   authZ — the wrapper never does.
// - sends Accept: application/json; sends Content-Type: application/json +
//   JSON.stringify(body) for requests with a body (POST).
// - on 2xx: JSON.parse(await res.text()) verbatim — NEVER rounds/averages/
//   collapses document values (INV-no-rounding; arch §3.4/§11.2).
// - on 401: clearToken() + redirectToLogin() + reject.
// - on other non-2xx: parse the canonical {"error":{code,message,retryable}}
//   body and reject ApiError; if the body is not canonical, reject ApiError
//   carrying the HTTP status text (fail-fast, no silent success).
export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let body: BodyInit | undefined;
  if (init?.body !== undefined && init.body !== null) {
    headers["Content-Type"] = "application/json";
    body = typeof init.body === "string" ? init.body : JSON.stringify(init.body);
  }

  let res: Response;
  try {
    res = await fetch(path, { ...init, headers, body });
  } catch (err) {
    // Network failure (fetch rejected): propagate as a rejected promise —
    // TanStack Query surfaces it as an error state.
    throw err;
  }

  if (res.status === 401) {
    clearToken();
    redirectToLogin();
    throw new ApiError(401, {
      code: "unauthorized",
      message: "session expired",
      retryable: false,
    });
  }

  if (!res.ok) {
    let parsed: ApiErrorBody | null = null;
    try {
      const text = await res.text();
      const obj = JSON.parse(text) as { error?: ApiErrorBody };
      if (
        obj &&
        typeof obj === "object" &&
        obj.error &&
        typeof obj.error.code === "string" &&
        typeof obj.error.message === "string" &&
        typeof obj.error.retryable === "boolean"
      ) {
        parsed = obj.error;
      }
    } catch {
      // non-JSON body — fall through to the status-text error below.
    }
    throw new ApiError(
      res.status,
      parsed ?? {
        code: "http_error",
        message: res.statusText || `request failed with status ${res.status}`,
        retryable: false,
      },
    );
  }

  // 2xx — verbatim parse (INV-no-rounding).
  const raw = await res.text();
  return JSON.parse(raw) as T;
}
