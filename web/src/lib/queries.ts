// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from "react";
import {
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import {
  ApiError,
  approvePairing,
  addAdminGroupCollection,
  addAdminGroupMember,
  adoptLegacyUserProgress,
  apiRequest,
  bindAdminDeviceUser,
  createAdminGroup,
  createAdminUser,
  deleteAdminGroup,
  deleteAdminUser,
  deleteLibrary,
  denyPairing,
  fetchItemMediaObjectUrl,
  fetchWatchDefaults,
  getAdminDevices,
  getAdminGroupCollections,
  getAdminGroupMembers,
  getAdminGroups,
  getAdminPairings,
  getAdminSources,
  getAdminUsers,
  getVisibilityExplain,
  getItem,
  getLibrary,
  getLibraryFolders,
  getLibrarySummary,
  getSeries,
  getSeriesEpisodes,
  listItems,
  patchAdminUser,
  posterCandidates,
  listProgress,
  putAdminGroupDoc,
  putPoster,
  putProfilePrefs,
  removeAdminGroupCollection,
  removeAdminGroupMember,
  renameAdminGroup,
  resetAdminUserPassword,
  uploadPoster,
  deletePoster,
  revokeDevice,
  startPairing,
  updateLibrary,
  waitPairing,
  type AdminDevicesResponse,
  type AdminGroup,
  type AdminGroupCollectionsResponse,
  type AdminGroupsResponse,
  type AdminPairingsResponse,
  type AdminUserCreated,
  type AdminUser,
  type AdminUserCreateRequest,
  type AdminUserPatch,
  type AdminUsersResponse,
  type AdminVisibilityExplain,
  type CreateLibraryRequest,
  type ItemResponse,
  type ItemsResponse,
  type LibrariesResponse,
  type LibraryDTO,
  type LibraryFoldersResponse,
  type LibrarySummary,
  type ListItemsParams,
  type PairingActionResponse,
  type PosterCandidatesDTO,
  type PosterOverrideDTO,
  type ProfileDTO,
  type ProfilePrefs,
  type PairingRequest,
  type PairingWait,
  type ProgressListResponse,
  type ScanResponse,
  type SourcesResponse,
  type SeriesListResponse,
  type UpdateLibraryRequest,
  type WatchDefaultsDTO,
} from "@/lib/api";
import { PROFILE_QUERY_KEY } from "@/components/Profile";

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
// (web-ui-phase-3 group 6: the admin edit overlay; ui-management pass 3: the
// Manage overlay's section save boundaries). Non-idempotent in effect →
// retry:0 (INV-no-mutation-retry) — a 400/404 surfaces inline, no auto-retry.
//
// Save/invalidation contract (ui-management pass 3): success invalidates
// ["libraries"] (the admin table re-fetches the patched row) AND
// ["library", id] — the Manage overlay's chain re-reads from
// GET /libraries/{id}'s additive module block. THE TRAP, do not "simplify"
// this away: the chain must NEVER be re-read from the PATCH body/response —
// the PATCH response is a libraryDTO that never carries the module block
// (and the PATCH body is only the section's own fields), so any body-side
// re-read would silently keep the STALE chain while looking correct.
export function useUpdateLibrary(): UseMutationResult<
  LibraryDTO,
  ApiError,
  { id: number; req: UpdateLibraryRequest }
> {
  return useMutation({
    mutationFn: ({ id, req }: { id: number; req: UpdateLibraryRequest }) =>
      updateLibrary(id, req),
    retry: 0,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["libraries"] });
      queryClient.invalidateQueries({ queryKey: ["library", variables.id] });
    },
  });
}

// useDeleteLibrary — DELETE /api/v1/libraries/{id} via deleteLibrary. The
// server removes the library with every dependent row in one transaction;
// media files on disk are untouched. Non-idempotent → retry:0 — a 404 (row
// already gone) or 500 surfaces inline, no auto-retry.
//
// Invalidation contract: success invalidates ["libraries"] (the admin table
// re-fetches without the row) and REMOVES the per-library cache entries —
// ["library", id] and the summary/folders keys — because their rows are gone
// server-side; a stale cached entry could otherwise render against a deleted
// library until the next mount.
export function useDeleteLibrary(): UseMutationResult<
  void,
  ApiError,
  number /* library id */
> {
  return useMutation({
    mutationFn: (id: number) => deleteLibrary(id),
    retry: 0,
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["libraries"] });
      queryClient.removeQueries({ queryKey: ["library", id] });
      queryClient.removeQueries({ queryKey: ["library-summary", id] });
      queryClient.removeQueries({ queryKey: ["library-folders", id] });
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

// useProgressList — GET /api/v1/progress?include=watched via listProgress
// (watched-states 2.1). Keyed ["progress"]: the Home Continue/Next up rows
// share one cache entry, and the per-item documents they fan out into reuse
// the ["item", id] entries the detail page owns. The include rides THIS
// shared fetch — every consumer (Home's rails, ItemDetail's resume row)
// inherits the wider row set with one fetch: the default listing withdraws
// completed-watch rows, so without the param ItemDetail's resume row and
// Home's rail rows would silently differ per surface. Wire shape mirrored
// verbatim (progressListResponse — newest-first, positive positions only,
// server-side limit default 20 / max 100; restored rows carry watched: true).
export function useProgressList(): UseQueryResult<ProgressListResponse> {
  return useQuery({
    queryKey: ["progress"],
    queryFn: () => listProgress({ includeWatched: true }),
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

// useWatchDefaults — GET /api/v1/watch-defaults via fetchWatchDefaults
// (watch-flow-polish 3.3, D1/D5): the SERVED auto-next countdown seconds.
// Keyed ["watch-defaults"]: one app-wide entry — the shape is deployment
// config, identical for every view, so the always-mounted warm read (the
// contract's handoff note: the query warms on watch-view mount, long before
// an episode can end) shares one cache entry across navigations. D5: a
// pending or failed read is NOT a fallback — the auto-next card renders
// without a countdown and never autoplays; the SPA never bakes a value (Q5).
export function useWatchDefaults(): UseQueryResult<WatchDefaultsDTO> {
  return useQuery({
    queryKey: ["watch-defaults"],
    queryFn: () => fetchWatchDefaults(),
  });
}

// useUpdateProfilePrefs — PUT /api/v1/profile/prefs via putProfilePrefs
// (l6-accounts 8.4): the whole-document write behind the auto-next playback
// toggle. The server stores the document VERBATIM and never merges
// (profile.go putProfilePrefs), so the mutation receives the WHOLE merged
// document — served keys plus the flipped one — never a patch; the
// READ-MERGE-WRITE step belongs to the caller (the AutoNext card reads the
// SERVED prefs through the shared ["profile"] cache and spreads its key
// over them). On success the cache entry is set to the exact document the
// server now holds (identity stored the sent bytes — no refetch needed),
// keeping every profile consumer in agreement. Keyed on Profile.tsx's
// PROFILE_QUERY_KEY — the ONE identity cache entry the sidebar gate, the
// profile block, and this write share (INV-shared-identity). retry:0
// (INV-no-mutation-retry): a 409 conflict (the principal carries no
// per-user document — env admin, unbound device) surfaces to the caller's
// error state, never retried or swallowed.
export function useUpdateProfilePrefs(): UseMutationResult<
  void,
  ApiError,
  ProfilePrefs /* the WHOLE merged document */
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (prefs: ProfilePrefs) => putProfilePrefs(prefs),
    retry: 0,
    onSuccess: (_void, prefs) => {
      queryClient.setQueryData<ProfileDTO>(PROFILE_QUERY_KEY, (old) =>
        old === undefined ? old : { ...old, prefs },
      );
    },
  });
}

// usePairings — GET /api/v1/admin/pairings via getAdminPairings
// (device-pairing): the still-pending pairing requests, oldest first — the
// Pairing admin panel's review list. Keyed ["admin-pairings"] like the other
// admin surfaces; the approve/deny hooks invalidate it on success.
export function usePairings(): UseQueryResult<AdminPairingsResponse> {
  return useQuery({
    queryKey: ["admin-pairings"],
    queryFn: () => getAdminPairings(),
  });
}

// useApprovePairing — POST /api/v1/admin/pairings/{id}/approve via
// approvePairing (device-pairing). Non-idempotent adjudication → retry:0
// (INV-no-mutation-retry); success invalidates ["admin-pairings"] so the
// approved row leaves the pending list from a server re-read, never from the
// write's body.
export function useApprovePairing(): UseMutationResult<
  PairingActionResponse,
  ApiError,
  string /* pairing id */
> {
  return useMutation({
    mutationFn: (pairingId: string) => approvePairing(pairingId),
    retry: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-pairings"] });
    },
  });
}

// useDenyPairing — POST /api/v1/admin/pairings/{id}/deny via denyPairing:
// the deny side of useApprovePairing (terminal state, no token minted),
// same retry:0 + invalidation contract.
export function useDenyPairing(): UseMutationResult<
  void,
  ApiError,
  string /* pairing id */
> {
  return useMutation({
    mutationFn: (pairingId: string) => denyPairing(pairingId),
    retry: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-pairings"] });
    },
  });
}

// useDevices — GET /api/v1/admin/devices via getAdminDevices
// (device-pairing): the paired-device registry (hash-at-rest tokens are
// never rendered; the row carries the approval code). Keyed
// ["admin-devices"]; the revoke hook invalidates it on success.
export function useDevices(): UseQueryResult<AdminDevicesResponse> {
  return useQuery({
    queryKey: ["admin-devices"],
    queryFn: () => getAdminDevices(),
  });
}

// useRevokeDevice — DELETE /api/v1/admin/devices/{id} via revokeDevice:
// deletes the token row (later calls with that token 401). NOT idempotent
// (a twice-issued revoke is a 404) → retry:0; success invalidates
// ["admin-devices"] so the revoked row disappears from the server re-read.
export function useRevokeDevice(): UseMutationResult<
  void,
  ApiError,
  string /* device id */
> {
  return useMutation({
    mutationFn: (deviceId: string) => revokeDevice(deviceId),
    retry: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-devices"] });
    },
  });
}

// useStartPairing — POST /api/v1/pair via startPairing (device-pairing): the
// entry screen's mint. UNAUTHENTICATED by design (an unpaired device has no
// credential) and fire-once per pairing attempt — retry:0 so a 429
// rate_limited surfaces inline instead of hammering the per-IP window. No
// invalidation: the request is the device's own, no cached list carries it.
export function useStartPairing(): UseMutationResult<
  PairingRequest,
  ApiError,
  void
> {
  return useMutation({
    mutationFn: () => startPairing(),
    retry: 0,
  });
}

// usePairingWait — GET /api/v1/pair/{id}/wait via waitPairing: the device's
// approval poll, refetched on a ~2.5s interval until the admin adjudicates
// (device-pairing D8). Keyed ["pairing-wait", id]: one cache entry per
// pairing request. `enabled` guards the empty id (the start request has not
// landed yet — the hook must not fire a malformed /pair//wait request). GET
// keeps the default retry.
export function usePairingWait(pairingId: string): UseQueryResult<PairingWait> {
  return useQuery({
    queryKey: ["pairing-wait", pairingId],
    queryFn: () => waitPairing(pairingId),
    enabled: pairingId !== "",
    refetchInterval: 2500,
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
// ---- Artwork: the object-URL LRU + the poster hooks (artwork 3.1) ----------

// ART_LRU_LIMIT — the object-URL cache bound (~a grid page plus change
// room): entries evicted least-recently-used have their blob URLs revoked,
// so the cache never grows unbounded and never hands out a dead URL.
const ART_LRU_LIMIT = 64;

// artLru — the MODULE-SCOPE LRU of art object URLs (art URL → blob URL).
// The LRU OWNS revocation (artwork 3.1): consulted before any art fetch (a
// warm entry costs zero network), on EVICTION the least-recently-used blob
// is revoked, and storing a second blob under one URL revokes the first
// (the URL-change case — an invalidated read re-fetching the same art).
// Insurance for RFC 9111 §3.5's MAY on caching Authorization-bearing
// responses (TV webkits): the SPA refetches art bytes through its own
// bearer channel, never trusting a shared HTTP cache. consult/store/reset
// are exported PURE as the test seam (the naming.ts accessor posture); the
// hook below is the only production consumer.
const artLruMap = new Map<string, string>();

export const artLru = {
  consult(key: string): string | undefined {
    const url = artLruMap.get(key);
    if (url === undefined) {
      return undefined;
    }
    artLruMap.delete(key); // refresh recency
    artLruMap.set(key, url);
    return url;
  },
  store(key: string, objectUrl: string): void {
    const prior = artLruMap.get(key);
    if (prior !== undefined && prior !== objectUrl) {
      URL.revokeObjectURL(prior); // URL change — the LRU owns revocation
    }
    artLruMap.delete(key);
    artLruMap.set(key, objectUrl);
    while (artLruMap.size > ART_LRU_LIMIT) {
      const oldest = artLruMap.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      const evicted = artLruMap.get(oldest);
      artLruMap.delete(oldest);
      if (evicted !== undefined) {
        URL.revokeObjectURL(evicted); // eviction — the LRU owns revocation
      }
    }
  },
  // reset — the test seam's drain: revoke every cached blob and clear.
  reset(): void {
    for (const url of artLruMap.values()) {
      URL.revokeObjectURL(url);
    }
    artLruMap.clear();
  },
};

// artInFlight — one fetch per art URL while in flight (two grid cards and
// the flow header can ask for the same series art in one tick): the losers
// ride the winner's promise, so ONE blob is created per URL and the LRU
// never stores twice under one key.
const artInFlight = new Map<string, Promise<string>>();

function fetchArtObjectUrl(url: string, signal: AbortSignal): Promise<string> {
  const pending = artInFlight.get(url);
  if (pending !== undefined) {
    return pending;
  }
  const flight = fetchItemMediaObjectUrl(url, signal)
    .then((objectUrl) => {
      artLru.store(url, objectUrl);
      return objectUrl;
    })
    .finally(() => {
      artInFlight.delete(url);
    });
  artInFlight.set(url, flight);
  return flight;
}

// useArtworkObjectUrl — the authenticated art byte channel with the LRU in
// front (artwork 3.1): consult → a hit hands the cached blob URL (no
// fetch); a miss fetches through fetchItemMediaObjectUrl and parks the blob
// in the LRU. The hook NEVER revokes what it hands out — the LRU owns
// revocation (eviction + URL change) — so a consumer's URL stays alive
// while its entry is cached. Any failure (404 serve miss, network, abort) →
// null, so the surface keeps its generated fallback — never a
// broken-image state. The ONE exception is 401 (poster-backfill 3.1): that
// error is the session rotation (handle401 already cleared credentials and
// redirected), so the hook skips the fallback write and the previously
// rendered poster stays until navigation lands.
export function useArtworkObjectUrl(url: string | null): string | null {
  const [resolved, setResolved] = useState<string | null>(() =>
    url === null ? null : (artLru.consult(url) ?? null),
  );

  useEffect(() => {
    if (url === null) {
      setResolved(null);
      return;
    }
    const hit = artLru.consult(url);
    if (hit !== undefined) {
      setResolved(hit);
      return;
    }
    let disposed = false;
    const controller = new AbortController();
    fetchArtObjectUrl(url, controller.signal)
      .then((objectUrl) => {
        if (disposed) {
          return; // the LRU entry outlives this consumer by design
        }
        setResolved(objectUrl);
      })
      .catch((error: unknown) => {
        if (disposed) {
          return;
        }
        // A 401 is the session rotation, not an art miss (INV-401-source-of-truth):
        // the shared fetcher's handle401 has already cleared credentials and
        // redirected — writing the fallback here would mask the rotation with
        // the generated gradient, so the rendered poster stays until
        // navigation lands (D5). Every other failure (404 serve miss,
        // network, abort) still writes the fallback.
        if (error instanceof ApiError && error.status === 401) {
          return;
        }
        setResolved(null); // any other art error → the generated fallback
      });
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [url]);

  return resolved;
}

// usePosterCandidates — the poster overlay's read (GET …/posters, key
// ["posters", kind, id]). An empty id (a not-yet-resolved entity) disables
// the read — the conditional-query idiom the item page uses.
export function usePosterCandidates(
  kind: "series" | "item",
  entityId: string,
): UseQueryResult<PosterCandidatesDTO> {
  return useQuery({
    queryKey: ["posters", kind, entityId],
    queryFn: () => posterCandidates(kind, entityId),
    enabled: entityId !== "",
  });
}

// usePosterMutations — the poster write family for ONE entity (the
// useTitleOverride pattern): every mutation runs retry:0
// (INV-no-mutation-retry — a 400/404 surfaces inline, never auto-retried)
// and invalidates the family's own read on success. The CALLER owns the
// display-key invalidation policy: select defers it until the candidates
// read reports the flipped current (browse surfaces keep the previous
// artwork until the flip — no flash), upload/reset invalidate right away.
export function usePosterMutations(
  kind: "series" | "item",
  entityId: string,
): {
  put: UseMutationResult<PosterOverrideDTO, ApiError, string>;
  upload: UseMutationResult<PosterOverrideDTO, ApiError, File>;
  reset: UseMutationResult<void, ApiError, void>;
} {
  const qc = useQueryClient();
  const invalidateRead = (): void => {
    void qc.invalidateQueries({ queryKey: ["posters", kind, entityId] });
  };
  const put = useMutation<PosterOverrideDTO, ApiError, string>({
    mutationFn: (selection: string) => putPoster(kind, entityId, selection),
    retry: 0,
    onSuccess: invalidateRead,
  });
  const upload = useMutation<PosterOverrideDTO, ApiError, File>({
    mutationFn: (file: File) => uploadPoster(kind, entityId, file),
    retry: 0,
    onSuccess: invalidateRead,
  });
  const reset = useMutation<void, ApiError, void>({
    mutationFn: () => deletePoster(kind, entityId),
    retry: 0,
    onSuccess: invalidateRead,
  });
  return { put, upload, reset };
}

// adminAccountsQueryKeys — the accounts admin surfaces' cache keys (one
// declaration so hooks and tests cannot drift): the users registry, the
// groups registry, and the per-group member/collection axes keyed by group
// id.
export const ADMIN_USERS_QUERY_KEY = ["admin-users"] as const;
export const ADMIN_GROUPS_QUERY_KEY = ["admin-groups"] as const;
export const adminGroupMembersKey = (groupId: number): readonly unknown[] => [
  "admin-group-members",
  groupId,
];
export const adminGroupCollectionsKey = (groupId: number): readonly unknown[] => [
  "admin-group-collections",
  groupId,
];

// useAdminUsers — GET /api/v1/admin/users via getAdminUsers (l6-accounts
// 9.1): the hashless user registry behind the Accounts page's users panel
// AND the device bind affordance on the Pairing surface (both read the one
// cache entry — a bind and a user edit cannot disagree). Keyed
// ["admin-users"]; every users write invalidates it.
export function useAdminUsers(): UseQueryResult<AdminUsersResponse> {
  return useQuery({
    queryKey: ADMIN_USERS_QUERY_KEY,
    queryFn: () => getAdminUsers(),
  });
}

// useAdminSources — GET /api/v1/admin/sources via getAdminSources (no title
// counts — the mute toggle list needs only identity, the plugin ids that
// key the mute documents). Shared by the Sources surface's own inline query
// key ["admin-sources"].
export function useAdminSources(): UseQueryResult<SourcesResponse> {
  return useQuery({
    queryKey: ["admin-sources"],
    queryFn: () => getAdminSources(false),
  });
}

// useCreateAdminUser — POST /api/v1/admin/users via createAdminUser
// (l6-accounts 9.1): the create's response carries the FIRST-user one-way
// door notice verbatim — the CALLER renders it, so the mutation's result
// type is the full AdminUserCreated, never narrowed. Success invalidates
// ["admin-users"] (the row re-reads from the server, never the write's
// body). retry:0 (INV-no-mutation-retry).
export function useCreateAdminUser(): UseMutationResult<
  AdminUserCreated,
  ApiError,
  AdminUserCreateRequest
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: AdminUserCreateRequest) => createAdminUser(req),
    retry: 0,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY });
    },
  });
}

// usePatchAdminUser — PATCH /api/v1/admin/users/{id} via patchAdminUser:
// the partial write ({role} or {disabled} — the caller sends only the
// field changing, the pointer decode leaves the rest). Success invalidates
// ["admin-users"]. retry:0.
export function usePatchAdminUser(): UseMutationResult<
  AdminUser,
  ApiError,
  { id: number; patch: AdminUserPatch }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: AdminUserPatch }) =>
      patchAdminUser(id, patch),
    retry: 0,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY });
    },
  });
}

// useResetAdminUserPassword — PUT /api/v1/admin/users/{id}/password via
// resetAdminUserPassword: 204, and that user's sessions die server-side
// (the password cascade). Success invalidates ["admin-users"] (updated_at
// moves). retry:0.
export function useResetAdminUserPassword(): UseMutationResult<
  void,
  ApiError,
  { id: number; password: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) =>
      resetAdminUserPassword(id, password),
    retry: 0,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY });
    },
  });
}

// useDeleteAdminUser — DELETE /api/v1/admin/users/{id} via deleteAdminUser:
// the cascade delete. The LAST-USER GUARD is mirrored client-side (the
// panel disables the action while one user remains) but the server's 409
// stays authoritative — it surfaces here on any forced race. Success
// invalidates ["admin-users"]. retry:0.
export function useDeleteAdminUser(): UseMutationResult<
  void,
  ApiError,
  number /* user id */
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteAdminUser(id),
    retry: 0,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY });
    },
  });
}

// useAdoptLegacyUserProgress — POST /api/v1/admin/users/{id}/adopt-legacy
// via adoptLegacyUserProgress (l6-accounts 9.3): the one-shot newer-wins
// merge of the user_id=0 ledger slot into the user's slots. Bare 204 — no
// counts exist on the wire, none surface. The server is idempotent (a
// second call is a no-op); no cache carries ledger rows, so nothing to
// invalidate. retry:0.
export function useAdoptLegacyUserProgress(): UseMutationResult<
  void,
  ApiError,
  number /* user id */
> {
  return useMutation({
    mutationFn: (id: number) => adoptLegacyUserProgress(id),
    retry: 0,
  });
}

// useAdminGroups — GET /api/v1/admin/groups via getAdminGroups
// (l6-accounts 9.2): the group registry (rows carry the served mute
// documents). Keyed ["admin-groups"]; every group write invalidates it.
export function useAdminGroups(): UseQueryResult<AdminGroupsResponse> {
  return useQuery({
    queryKey: ADMIN_GROUPS_QUERY_KEY,
    queryFn: () => getAdminGroups(),
  });
}

// useCreateAdminGroup — POST /api/v1/admin/groups via createAdminGroup:
// 201 with the created row. 409 conflict when the name is taken — surfaced
// inline. Success invalidates ["admin-groups"]. retry:0.
export function useCreateAdminGroup(): UseMutationResult<
  AdminGroup,
  ApiError,
  string /* name */
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createAdminGroup(name),
    retry: 0,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ADMIN_GROUPS_QUERY_KEY });
    },
  });
}

// useRenameAdminGroup — PATCH /api/v1/admin/groups/{id} via renameAdminGroup:
// the name is the only mutable field; id addressing makes renames
// re-key-free. Success invalidates ["admin-groups"]. retry:0.
export function useRenameAdminGroup(): UseMutationResult<
  AdminGroup,
  ApiError,
  { id: number; name: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      renameAdminGroup(id, name),
    retry: 0,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ADMIN_GROUPS_QUERY_KEY });
    },
  });
}

// useDeleteAdminGroup — DELETE /api/v1/admin/groups/{id} via
// deleteAdminGroup: membership and Collection grants cascade server-side.
// Success invalidates the registry AND the deleted group's axes (belt and
// braces — the axes die with the group). retry:0.
export function useDeleteAdminGroup(): UseMutationResult<
  void,
  ApiError,
  number /* group id */
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteAdminGroup(id),
    retry: 0,
    onSuccess: (_void, id) => {
      void qc.invalidateQueries({ queryKey: ADMIN_GROUPS_QUERY_KEY });
      void qc.invalidateQueries({ queryKey: adminGroupMembersKey(id) });
      void qc.invalidateQueries({ queryKey: adminGroupCollectionsKey(id) });
    },
  });
}

// useAdminGroupMembers — GET /api/v1/admin/groups/{id}/users via
// getAdminGroupMembers: the member users of ONE group, keyed per group.
export function useAdminGroupMembers(
  groupId: number,
): UseQueryResult<AdminUsersResponse> {
  return useQuery({
    queryKey: adminGroupMembersKey(groupId),
    queryFn: () => getAdminGroupMembers(groupId),
  });
}

// useAddAdminGroupMember — POST /api/v1/admin/groups/{id}/users via
// addAdminGroupMember: add by USERNAME. Success invalidates that group's
// member axis. retry:0.
export function useAddAdminGroupMember(): UseMutationResult<
  void,
  ApiError,
  { groupId: number; username: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, username }: { groupId: number; username: string }) =>
      addAdminGroupMember(groupId, username),
    retry: 0,
    onSuccess: (_void, { groupId }) => {
      void qc.invalidateQueries({ queryKey: adminGroupMembersKey(groupId) });
    },
  });
}

// useRemoveAdminGroupMember — DELETE /api/v1/admin/groups/{id}/users/{username}
// via removeAdminGroupMember (idempotent server-side). Success invalidates
// that group's member axis. retry:0.
export function useRemoveAdminGroupMember(): UseMutationResult<
  void,
  ApiError,
  { groupId: number; username: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, username }: { groupId: number; username: string }) =>
      removeAdminGroupMember(groupId, username),
    retry: 0,
    onSuccess: (_void, { groupId }) => {
      void qc.invalidateQueries({ queryKey: adminGroupMembersKey(groupId) });
    },
  });
}

// useAdminGroupCollections — GET /api/v1/admin/groups/{id}/collections via
// getAdminGroupCollections: the member Collections, position-ordered as
// served, keyed per group.
export function useAdminGroupCollections(
  groupId: number,
): UseQueryResult<AdminGroupCollectionsResponse> {
  return useQuery({
    queryKey: adminGroupCollectionsKey(groupId),
    queryFn: () => getAdminGroupCollections(groupId),
  });
}

// useAddAdminGroupCollection — POST /api/v1/admin/groups/{id}/collections
// via addAdminGroupCollection: {library_id, position} — the position law
// (same-group re-add REPLACES) is the server's. Success invalidates that
// group's collection axis. retry:0.
export function useAddAdminGroupCollection(): UseMutationResult<
  void,
  ApiError,
  { groupId: number; libraryId: number; position: number }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      groupId,
      libraryId,
      position,
    }: { groupId: number; libraryId: number; position: number }) =>
      addAdminGroupCollection(groupId, libraryId, position),
    retry: 0,
    onSuccess: (_void, { groupId }) => {
      void qc.invalidateQueries({ queryKey: adminGroupCollectionsKey(groupId) });
    },
  });
}

// useRemoveAdminGroupCollection — DELETE
// /api/v1/admin/groups/{id}/collections/{library_id} via
// removeAdminGroupCollection (idempotent server-side). Success invalidates
// that group's collection axis. retry:0.
export function useRemoveAdminGroupCollection(): UseMutationResult<
  void,
  ApiError,
  { groupId: number; libraryId: number }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      groupId,
      libraryId,
    }: { groupId: number; libraryId: number }) =>
      removeAdminGroupCollection(groupId, libraryId),
    retry: 0,
    onSuccess: (_void, { groupId }) => {
      void qc.invalidateQueries({ queryKey: adminGroupCollectionsKey(groupId) });
    },
  });
}

// usePutAdminGroupDoc — PUT /api/v1/admin/groups/{id}/doc via
// putAdminGroupDoc: the WHOLE mute-document replacement (the server never
// merges; shape-only validation). The mutation receives the WHOLE merged
// document — the READ-MERGE-WRITE belongs to the caller: spread the served
// doc (AdminGroup.doc), flip the mutes key, PUT the whole — operator keys
// survive verbatim (the autoNextPrefs 8.4 law for whole-replace documents).
// Success invalidates ["admin-groups"] (the served doc re-reads). retry:0.
export function usePutAdminGroupDoc(): UseMutationResult<
  void,
  ApiError,
  { groupId: number; doc: Record<string, unknown> }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, doc }: { groupId: number; doc: Record<string, unknown> }) =>
      putAdminGroupDoc(groupId, doc),
    retry: 0,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ADMIN_GROUPS_QUERY_KEY });
    },
  });
}

// useBindAdminDeviceUser — PUT /api/v1/admin/devices/{id}/user via
// bindAdminDeviceUser (l6-accounts 9.3): {user_id: number} binds,
// {user_id: null} unbinds to the legacy viewer. Success invalidates
// ["admin-devices"] (the posture column re-reads from the server).
// retry:0.
export function useBindAdminDeviceUser(): UseMutationResult<
  void,
  ApiError,
  { deviceId: string; userId: number | null }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ deviceId, userId }: { deviceId: string; userId: number | null }) =>
      bindAdminDeviceUser(deviceId, userId),
    retry: 0,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-devices"] });
    },
  });
}

// useVisibilityExplain — GET /api/v1/admin/visibility-explain via
// getVisibilityExplain (l6-accounts 9.3): the resolved grant for one
// (user, collection) pair. `enabled` guards the un-asked state — the
// ExplainViewer fires the query only once the operator has picked the pair
// and pressed Explain (requested !== null). GET keeps the default retry.
// An unknown library is NOT a 404: the answer is visible:false with empty
// granting_groups (the orphan law mirrored).
export function useVisibilityExplain(
  requested: { userId: number; libraryId: number } | null,
): UseQueryResult<AdminVisibilityExplain> {
  return useQuery({
    queryKey: [
      "visibility-explain",
      requested?.userId,
      requested?.libraryId,
    ],
    queryFn: () => {
      if (requested === null) {
        // Unreachable while enabled guards — keeps the fetch honest.
        return Promise.reject(new Error("no explain pair requested"));
      }
      return getVisibilityExplain(requested.userId, requested.libraryId);
    },
    enabled: requested !== null,
  });
}
