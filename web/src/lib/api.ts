// SPDX-License-Identifier: Apache-2.0
import type { ItemDocument } from "@/lib/document";
import { clearToken, getToken } from "@/lib/auth";

// TS mirrors of the Go wire DTOs (internal/api/handlers.go). Field names match
// the JSON tags EXACTLY (module_id, not moduleId) — these ARE the JSON shape;
// drift = bug (INV-verbatim-field-names; conventions §3).

// handlers.go createLibraryRequest — description is optional; an omitted field
// persists as "" (web-ui-phase-3 group 1).
export interface CreateLibraryRequest {
  module_id: string; // "tv" | "image" | "serial" | …
  root_path: string; // absolute OS path — local OR NFS-mounted
  display_name: string;
  description?: string;
}

// handlers.go libraryDTO — description is always present in responses (""
// when never set; web-ui-phase-3 group 1).
export interface LibraryDTO {
  id: number; // int64
  module_id: string;
  root_path: string;
  display_name: string;
  description: string;
}

// handlers.go librarySummaryResponse — the constant-time count + last-update
// aggregate (GET /api/v1/libraries/{id}/summary, group 1). updated_at is the
// raw RFC3339 TEXT from the store ("" when the library has no items).
export interface LibrarySummary {
  library_id: number; // int64
  items: number; // int64
  updated_at: string;
}

// handlers.go folderDTO — one depth-1 folder prefix + its item count (GET
// /api/v1/libraries/{id}/folders, web-ui-phase-3 group 1). Top-level files
// report path "".
export interface LibraryFolderDTO {
  path: string;
  items: number; // int64
}

// handlers.go libraryFoldersResponse — depth-1 prefixes, path-sorted; empty
// array, never null
export interface LibraryFoldersResponse {
  folders: LibraryFolderDTO[];
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

// handlers.go progressDTO — the ONE wire shape for a stored playback position
// (web-ui-phase-3 group 2). updated_at is the raw RFC3339 stamp as persisted.
export interface ProgressDTO {
  item_id: string;
  position_seconds: number; // int64, > 0 in list responses
  updated_at: string;
}

// handlers.go progressListResponse — newest-first, positive positions only
// (server INV); limit defaults to 20, max 100.
export interface ProgressListResponse {
  items: ProgressDTO[];
}

// handlers.go:129-139 (itemDTO) — the §3.1 document travels as json.RawMessage
// on the Go side (opaque there) and is typed here via ItemDocument. Field names
// match the JSON tags EXACTLY.
export interface ItemDTO {
  id: string; // "itm_<libraryID>_<fileID>" — string UUID form
  module_id: string;
  library_id: number; // int64
  file_id: string;
  relative_path: string;
  media_type: string; // "video" | "image"
  document: ItemDocument; // full §3.1 document — precision-preserved
  schema_version: number;
  status: string; // "new"|"pending"|"parsed"|"enriched"|"failed"|"ready"|"stale"
}

// handlers.go itemsResponse — empty array, never null
export interface ItemsResponse {
  items: ItemDTO[];
}

// handlers.go itemResponse
export interface ItemResponse {
  item: ItemDTO;
}

// listItems query params — `library` is REQUIRED (Go listItems 400s without an
// integer `library`; handlers.go:216-230). `status` empty = all (server INV).
export interface ListItemsParams {
  library: number;
  status?: string;
  limit?: number;
  offset?: number;
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

// Endpoint path constants — ALL pre-existing (router.go:92-94,98-100 + the
// web-ui-phase-3 additions). GET /api/v1/items[/{id}] are the Phase-2b routes
// the item surfaces consume.
export const ENDPOINTS = {
  libraries: "/api/v1/libraries",
  scan: (id: number): string => `/api/v1/libraries/${id}/scan`,
  librarySummary: (id: number): string => `/api/v1/libraries/${id}/summary`,
  libraryFolders: (id: number): string => `/api/v1/libraries/${id}/folders`,
  adminStatus: "/api/v1/admin/status",
  items: "/api/v1/items",
  item: (id: string): string => `/api/v1/items/${id}`,
  progress: "/api/v1/progress",
} as const;

// getLibrarySummary — GET /api/v1/libraries/{id}/summary (handlers.go
// librarySummary). Constant-time aggregate on the server; 404 with the
// canonical not_found body for an unknown library.
export async function getLibrarySummary(id: number): Promise<LibrarySummary> {
  return apiRequest<LibrarySummary>(ENDPOINTS.librarySummary(id));
}

// getLibraryFolders — GET /api/v1/libraries/{id}/folders (handlers.go
// libraryFolders). Depth-1 subfolder prefixes + item counts, path-sorted; 404
// with the canonical not_found body for an unknown library.
export async function getLibraryFolders(
  id: number,
): Promise<LibraryFoldersResponse> {
  return apiRequest<LibraryFoldersResponse>(ENDPOINTS.libraryFolders(id));
}

// listItems — GET /api/v1/items?library=&status=&limit=&offset= (handlers.go:
// 216-230). `library` is required (server INV); `status` is sent only when set
// (empty = all); limit/offset are sent only when provided (server default
// limit 50). Builds the query string here so callers pass typed params.
export async function listItems(params: ListItemsParams): Promise<ItemsResponse> {
  const qs = new URLSearchParams();
  qs.set("library", String(params.library));
  if (params.status) {
    qs.set("status", params.status);
  }
  if (params.limit !== undefined) {
    qs.set("limit", String(params.limit));
  }
  if (params.offset !== undefined) {
    qs.set("offset", String(params.offset));
  }
  return apiRequest<ItemsResponse>(`${ENDPOINTS.items}?${qs.toString()}`);
}

// listProgress — GET /api/v1/progress[?limit=] (handlers.go listProgress).
// Newest-first, positive positions only (server INV); the limit is sent only
// when provided (server default 20, clamped to max 100; a PRESENT
// non-integer limit is a 400 — omit it unless the caller really wants a
// specific page size).
export async function listProgress(limit?: number): Promise<ProgressListResponse> {
  const path =
    limit !== undefined
      ? `${ENDPOINTS.progress}?limit=${String(limit)}`
      : ENDPOINTS.progress;
  return apiRequest<ProgressListResponse>(path);
}

// getItem — GET /api/v1/items/{id} (handlers.go:266-278). The id is the item's
// string UUID, passed through verbatim. A missing item 404s with the canonical
// not_found body (surfaced as ApiError{code:"not_found"}).
export async function getItem(id: string): Promise<ItemResponse> {
  return apiRequest<ItemResponse>(ENDPOINTS.item(id));
}

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

  // A rejected fetch (network failure) propagates as a rejected promise —
  // TanStack Query surfaces it as an error state.
  const res: Response = await fetch(path, { ...init, headers, body });

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
