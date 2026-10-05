// SPDX-License-Identifier: Apache-2.0
import {
  QueryClient,
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import {
  apiRequest,
  getItem,
  listItems,
  type AdminStatus,
  type ApiError,
  type CreateLibraryRequest,
  type ItemResponse,
  type ItemsResponse,
  type LibrariesResponse,
  type LibraryDTO,
  type ListItemsParams,
  type ScanResponse,
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
