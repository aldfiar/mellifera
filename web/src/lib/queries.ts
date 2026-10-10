// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from "react";
import {
  QueryClient,
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import {
  apiRequest,
  fetchItemMediaObjectUrl,
  getItem,
  getLibrary,
  getLibraryFolders,
  getLibrarySummary,
  getSeries,
  getSeriesEpisodes,
  listItems,
  listProgress,
  updateLibrary,
  type AdminStatus,
  type ApiError,
  type CreateLibraryRequest,
  type ItemResponse,
  type ItemsResponse,
  type LibrariesResponse,
  type LibraryDTO,
  type LibraryFoldersResponse,
  type LibrarySummary,
  type ListItemsParams,
  type ProgressListResponse,
  type ScanResponse,
  type SeriesListResponse,
  type UpdateLibraryRequest,
} from "@/lib/api";

// TanStack Query hooks over the 4 pre-existing Go endpoints
// (router.go:92,98-100). Each hook is pure delegation to `apiRequest` (T04) —
// no direct `fetch`, no business logic, no authZ (INV-pure-delegation). Cache +
// invalidation + background refetch are exactly what TanStack Query is for
// (architecture_review §Complexity budget — hand-rolled fetch+useEffect
// rejected).
//
// Query keys are the exact strings in conventions §3 (INV-query-keys):
//   ["libraries"]           — GET /api/v1/libraries
//   ["library-summary", id] — GET /api/v1/libraries/{id}/summary
//   ["admin-status"]        — GET /api/v1/admin/status (polls)
//   ["library-scan", id]    — POST /api/v1/libraries/{id}/scan result
//   ["items", params]       — GET /api/v1/items (params = ListItemsParams, so
//                             limit/offset/status key pages independently)

// QueryClient for the app. GET queries keep the default retry; POST mutations
// (create/scan) are non-idempotent and MUST NOT be auto-retried
// (INV-no-mutation-retry) — the operator re-clicks on failure. Per-mutation
// retry:0 below is the load-bearing setting; the default here is a defensive
// backstop for any future mutation.
export const queryClient = new QueryClient({
  defaultOptions: {
    mutations: { retry: 0 },
  },
});

// useLibraries — GET /api/v1/libraries. Returns the {items} shape verbatim.
// AC-2.
export function useLibraries(): UseQueryResult<LibrariesResponse> {
  return useQuery({
    queryKey: ["libraries"],
    queryFn: () => apiRequest<LibrariesResponse>("/api/v1/libraries"),
  });
}

// useCreateLibrary — POST /api/v1/libraries. On success invalidates the
// ["libraries"] list so the new row re-fetches (AC-2). Non-idempotent →
// retry:0 (INV-no-mutation-retry).
export function useCreateLibrary(): UseMutationResult<
  LibraryDTO,
  ApiError,
  CreateLibraryRequest
> {
  return useMutation({
    mutationFn: (req: CreateLibraryRequest) =>
      apiRequest<LibraryDTO>("/api/v1/libraries", {
        method: "POST",
        // apiRequest JSON.stringifies non-string bodies and sets Content-Type
        // (T04); the cast bridges RequestInit.body's narrower BodyInit type to
        // the object shape the wrapper is designed to accept.
        body: req as unknown as BodyInit,
      }),
    retry: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["libraries"] });
    },
  });
}

// useScanLibrary — POST /api/v1/libraries/{id}/scan returning ScanResponse.
// Non-idempotent → retry:0 (INV-no-mutation-retry). A scan does not change the
// library row, so ["libraries"] is NOT invalidated here; T09 renders the scan
// result from the mutation's data. AC-3.
export function useScanLibrary(): UseMutationResult<
  ScanResponse,
  ApiError,
  number /* library id */
> {
  return useMutation({
    mutationFn: (id: number) =>
      apiRequest<ScanResponse>(`/api/v1/libraries/${id}/scan`, { method: "POST" }),
    retry: 0,
  });
}

// useUpdateLibrary — PATCH /api/v1/libraries/{id} via updateLibrary
// (web-ui-phase-3 group 6: the admin edit overlay). Non-idempotent in effect →
// retry:0 (INV-no-mutation-retry) — a 400/404 surfaces inline, no auto-retry.
// On success invalidates ["libraries"] so the table re-fetches the patched
// row (spec: "re-fetches the table"); summaries are NOT invalidated because a
// rename does not change item counts or updated_at.
export function useUpdateLibrary(): UseMutationResult<
  LibraryDTO,
  ApiError,
  { id: number; req: UpdateLibraryRequest }
> {
  return useMutation({
    mutationFn: ({ id, req }: { id: number; req: UpdateLibraryRequest }) =>
      updateLibrary(id, req),
    retry: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["libraries"] });
    },
  });
}

// useLibrary — GET /api/v1/libraries/{id} via getLibrary (element-pages 3.4
// consumer). Keyed ["library", id]: one cache entry per library, mirroring the
// summary/folders hooks' per-library keying. The element detail page consumes
// the additive module presentation block (identity_fields + the ordered parser
// chain); its failure is NON-fatal there — identity badges and chain footer
// degrade, the page itself never blocks. `enabled` guards a not-yet-parsed
// route id (NaN) like useLibrarySummary.
export function useLibrary(id: number): UseQueryResult<LibraryDTO> {
  return useQuery({
    queryKey: ["library", id],
    queryFn: () => getLibrary(id),
    enabled: Number.isFinite(id),
  });
}

// useLibrarySummary — GET /api/v1/libraries/{id}/summary via
// getLibrarySummary. Keyed ["library-summary", id]: one cache entry per
// library, so the sidebar list and the collection header share the count
// without extra round-trips (web-ui-phase-3 D1 accepts the N+1 at realistic
// collection counts). Callers that render many summaries (the sidebar) mount
// these lazily per open panel — the counts arrive asynchronously and never
// block the surface around them. `enabled` guards a not-yet-parsed route id
// (NaN) so the hook never fires a malformed request.
export function useLibrarySummary(id: number): UseQueryResult<LibrarySummary> {
  return useQuery({
    queryKey: ["library-summary", id],
    queryFn: () => getLibrarySummary(id),
    enabled: Number.isFinite(id),
  });
}

// useLibraryFolders — GET /api/v1/libraries/{id}/folders via getLibraryFolders
// (web-ui-phase-3 group 5). Keyed ["library-folders", id]: one cache entry per
// library, mirroring the summary hook's per-library keying. Wire shape
// mirrored verbatim (libraryFoldersResponse — depth-1 prefixes path-sorted;
// top-level files report path ""). `enabled` guards a not-yet-parsed route id
// (NaN) like useLibrarySummary.
export function useLibraryFolders(
  id: number,
): UseQueryResult<LibraryFoldersResponse> {
  return useQuery({
    queryKey: ["library-folders", id],
    queryFn: () => getLibraryFolders(id),
    enabled: Number.isFinite(id),
  });
}

// useAdminStatus — GET /api/v1/admin/status, polled on a refetch interval so
// the Status page (T10) reflects current plugin/enricher health (AC-4). GET
// queries keep the default retry; a 503 (status disabled) propagates as an
// error state — the hook does NOT special-case it (T10 renders the
// "unavailable" edge). The query key reserves a slot for the id-shape
// convention even though admin-status takes no arg.
export function useAdminStatus(): UseQueryResult<AdminStatus> {
  return useQuery({
    queryKey: ["admin-status"],
    queryFn: () => apiRequest<AdminStatus>("/api/v1/admin/status"),
    refetchInterval: 5000,
  });
}

// useItem — GET /api/v1/items/{id} via getItem. Keyed ["item", id]: one cache
// entry per item id, so deep links and navigations between items cache
// independently. Pure delegation — a missing item surfaces as ApiError
// code "not_found" for the page to render as a not-found state (T14); a 401
// still rotates to /login inside the wrapper (INV-401-source-of-truth).
export function useItem(id: string): UseQueryResult<ItemResponse> {
  return useQuery({
    queryKey: ["item", id],
    queryFn: () => getItem(id),
  });
}

// useProgressList — GET /api/v1/progress via listProgress. Keyed ["progress"]:
// the Home Continue/Next up rows share one cache entry, and the per-item
// documents they fan out into reuse the ["item", id] entries the detail page
// owns. Wire shape mirrored verbatim (progressListResponse — newest-first,
// positive positions only, server-side limit default 20 / max 100).
export function useProgressList(): UseQueryResult<ProgressListResponse> {
  return useQuery({
    queryKey: ["progress"],
    queryFn: () => listProgress(),
  });
}

// useItems — GET /api/v1/items via listItems. Keyed ["items", params]: the FULL
// params object (library + status + limit + offset) is the key, so pages and
// filter combinations cache independently instead of clobbering each other.
// Pure delegation, no pagination logic here — Browse owns offset paging.
export function useItems(
  params: ListItemsParams,
): UseQueryResult<ItemsResponse> {
  return useQuery({
    queryKey: ["items", params],
    queryFn: () => listItems(params),
  });
}

// useSeries — GET /api/v1/series?library={id} via getSeries
// (web-ui-phase-3 box 5.4). Keyed ["series", libraryId]: one cache entry per
// library, mirroring the summary/folders hooks' per-library keying. The list
// comes back whole (no limit/offset on the wire) — no pagination state here.
// `enabled` guards a not-yet-parsed route id (NaN) like useLibrarySummary.
export function useSeries(
  libraryId: number,
): UseQueryResult<SeriesListResponse> {
  return useQuery({
    queryKey: ["series", libraryId],
    queryFn: () => getSeries(libraryId),
    enabled: Number.isFinite(libraryId),
  });
}

// useSeriesEpisodes — GET /api/v1/series/{id}/episodes via getSeriesEpisodes.
// Keyed ["series-episodes", seriesId]: one cache entry per series, so
// navigating in and out of the episode flow reuses the fetched page. `enabled`
// guards the empty id (no series selected yet — the hook must not fire a
// malformed /series//episodes request).
export function useSeriesEpisodes(
  seriesId: string,
): UseQueryResult<ItemsResponse> {
  return useQuery({
    queryKey: ["series-episodes", seriesId],
    queryFn: () => getSeriesEpisodes(seriesId),
    enabled: seriesId !== "",
  });
}

// useItemMedia — the object-URL lifecycle for one media URL (media-preview D5):
// fetches `mediaUrl` (an itemMedia() URL) through the authenticated blob
// channel and hands back the object URL for an <img>. Deliberately NOT a
// TanStack hook: a cached object URL is revoked on unmount, so a query cache
// would keep handing out dead URLs — the lifecycle IS the state here.
//
// - `null` URL (the caller's pre-selection says no resolvable media fact) →
//   no request at all, always null.
// - ANY failure (404 thumb/original miss, network, abort) → null, so the
//   caller keeps its placeholder — never a broken-image state.
// - The object URL is revoked when the media URL changes and on unmount; a
//   fetch that resolves after unmount revokes its URL immediately.
export function useItemMedia(mediaUrl: string | null): string | null {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    setObjectUrl(null);
    if (mediaUrl === null) {
      return;
    }
    let disposed = false;
    let created: string | null = null;
    const controller = new AbortController();
    fetchItemMediaObjectUrl(mediaUrl, controller.signal)
      .then((url) => {
        if (disposed) {
          URL.revokeObjectURL(url); // resolved after unmount — revoke at once
          return;
        }
        created = url;
        setObjectUrl(url);
      })
      .catch(() => {
        if (!disposed) {
          setObjectUrl(null); // any media error → the placeholder fallback
        }
      });
    return () => {
      disposed = true;
      controller.abort();
      if (created !== null) {
        URL.revokeObjectURL(created);
      }
    };
  }, [mediaUrl]);

  return objectUrl;
}
