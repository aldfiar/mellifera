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

// handlers.go updateLibraryRequest — the PATCH /api/v1/libraries/{id} body.
// Pointers carry presence on the Go side, so a field is sent ONLY when the
// caller wants it changed; root_path/module_id are NOT part of this shape (the
// server 400s an identity-field attempt — web-ui-phase-3 D2), and the TS type
// omits them so the client cannot even build an immutable-field PATCH.
export interface UpdateLibraryRequest {
  display_name?: string;
  description?: string;
  streams_enabled?: boolean;
  // parsers (element-pages 3.1, ui-management pass 3) — the ordered
  // parser-chain replacement: an absent field changes nothing; a PRESENT
  // list replaces the chain. An explicitly EMPTY list is a server 400 (the
  // chain edit is a reorder, never a clear) — the UI never sends one. The
  // Manage overlay's chain section sends this field ALONE: the Go PATCH
  // writes the row and the chain in two non-atomic store calls, so a section
  // save = one request, never one giant PATCH.
  parsers?: string[];
  // naming_group_style / naming_element_name (display-naming 3.2) — the two
  // display naming options; a non-nil "" resets the column to the module
  // default. The server validates both BEFORE any write (group style "" |
  // "clean" | "raw"; the template's {...} groups exactly {title}/{season}/
  // {episode}); refusals surface through the canonical inline-error path.
  naming_group_style?: string;
  naming_element_name?: string;
}

// handlers.go parserBinding — one entry of module.parsers (element-pages 3.4):
// the binding's plugin id plus its ordered display_fields (module seed config
// — config IS the footer render order). capability mirrors the binding's
// capability when the handler includes it; display_fields are additive.
export interface ParserBinding {
  id: string;
  capability?: string;
  display_fields: string[];
}

// handlers.go modulePresentation — the additive module block on libraryDTO
// (element-pages 3.4): the module's mandatory identity fields (the element
// page's identity badges) and the collection's ordered parser chain.
export interface ModulePresentation {
  identity_fields: string[];
  parsers: ParserBinding[];
}

// handlers.go libraryDTO — description is always present in responses (""
// when never set; web-ui-phase-3 group 1). streams_enabled is the
// packaged-playback packaging gate (always present; column default true).
// module is the additive presentation block (element-pages 3.4) — absent when
// the endpoint does not carry it.
export interface LibraryDTO {
  id: number; // int64
  module_id: string;
  root_path: string;
  display_name: string;
  description: string;
  streams_enabled: boolean;
  module?: ModulePresentation;
  // naming_group_style / naming_element_name — the library's two display
  // naming options (display-naming 3.2, flat strings on the wire; "" =
  // module default). Optional in TS like the other additive fields: an
  // absent field must mean unset, not a type hole.
  naming_group_style?: string;
  naming_element_name?: string;
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
  media_type: string; // "tv" | "image" | "serial" — the scanner stamps
  // req.GetModuleType(), so the literal "video" never occurs in stored data
  document: ItemDocument; // full §3.1 document — precision-preserved
  schema_version: number;
  status: string; // "new"|"pending"|"parsed"|"enriched"|"failed"|"ready"|"stale"
  // extra_parsers — the element-attached parser ids (element-pages 3.3,
  // additive; absent until a first attachment). The element page renders their
  // footer groups after the collection chain, pill-marked element-only.
  extra_parsers?: string[];
  // title_override — the stored manual display-title override
  // (serial-watch-flow 2.1, additive; "" when unset). Feeds the rename
  // dialog's initial value; the SERVED name itself travels as display_name.
  // Optional in TS (like extra_parsers): the server carries the field on
  // every read, but an absent field must mean unset, not a type hole.
  title_override?: string;
  // display_name — the SERVED display name (display-naming group 1, always
  // present on the wire): title_override > the composed name
  // (`{serial title} · SxxEyy` per the library/module naming template) >
  // `_view.title` > "". Optional in TS like title_override — an absent
  // field means unset, and the caller floors to its own honest fallback.
  display_name?: string;
}

// handlers.go itemsResponse — empty array, never null
export interface ItemsResponse {
  items: ItemDTO[];
}

// handlers.go playbackResponse — the ONE wire shape for GET
// /api/v1/items/{id}/playback (packaged-playback). mode is "direct" | "hls";
// state is the packaging state "none" | "partial" | "complete" | "failed";
// play_url is the token-carrying /media URL the player opens (the descriptor
// ALSO sets the cookie-primary media token — the query token in the URL is
// the cookie-less fallback); sections lists the chapter-kind projections.
export interface PlaybackSection {
  kind: string; // "chapter" in v1; "marker" reserved, never produced
  start: number;
  end?: number;
  title?: string;
}

export interface PlaybackDescriptor {
  mode: string; // "direct" | "hls"
  state: string; // "none" | "partial" | "complete" | "failed"
  play_url: string;
  sections: PlaybackSection[];
  // voiceovers — the additive voiceover projection (serial-watch-flow D-2,
  // playback.go Playback.Voiceovers): the episode document's AUDIO sidecars
  // as {index, label} in document order. `index` is the sidecar's DOCUMENT
  // index (the same n= space as itemSidecar); the packaged build maps
  // document order → audio rendition k+1 (0 = embedded audio), the mapping
  // the watch control's selection mirrors onto hls.audioTrack. Optional in
  // TS: an episode without audio sidecars (or a descriptor predating the
  // projection) omits the field — absence is an empty list, never an error.
  voiceovers?: VoiceoverDTO[];
}

// playback.go Playback.Voiceovers — one voiceover entry (serial-watch-flow
// D-2): the sidecar's document index plus its presentation label (stamped
// language, else containing folder, else file name). Field names match the
// JSON shape EXACTLY.
export interface VoiceoverDTO {
  index: number;
  label: string;
}

// handlers.go playResponse — the wire shape for POST /api/v1/items/{id}/play.
// queued reports whether a packaging (re-)enqueue actually happened.
export interface PlayResponse {
  queued: boolean;
}

// handlers.go seriesDTO — the ONE wire shape for a series, mirroring itemDTO:
// row identity fields + the FULL serial-level document carried opaque
// (json.RawMessage on the Go side, typed here via ItemDocument). Field names
// match the JSON tags EXACTLY. status is the series lifecycle: "pending" |
// "stale" | "ready" | "deleted".
export interface SeriesDTO {
  id: string; // "ser_<libraryID>_<sha16>" — opaque string id
  module_id: string;
  library_id: number; // int64
  relative_path: string;
  document: ItemDocument; // serial-level §3.1 document — precision-preserved
  schema_version: number;
  status: string; // "pending" | "stale" | "ready" | "deleted"
  // title_override — the stored manual display-title override
  // (serial-watch-flow 2.1, additive; "" when unset). Feeds the rename
  // dialog's initial value; the SERVED name itself travels as display_name.
  // Optional in TS (like extra_parsers): the server carries the field on
  // every read, but an absent field must mean unset, not a type hole.
  title_override?: string;
  // display_name — the SERVED display title (display-naming group 1, always
  // present on the wire): title_override > the composed chain > "". Optional
  // in TS like title_override — an absent field means unset, and the caller
  // floors to its own honest fallback.
  display_name?: string;
}

// handlers.go seriesListResponse — empty array, never null. GET /series is NOT
// paginated (the server takes only `library`); the list comes back whole.
export interface SeriesListResponse {
  items: SeriesDTO[];
}

// titles.go titleOverrideDTO — the stored override record, the PUT 200 body
// (serial-watch-flow 2.1): the entity id, the title exactly as stored, and the
// raw RFC3339Nano stamp. Field names match the JSON tags EXACTLY.
export interface TitleOverrideDTO {
  entity_id: string;
  title: string;
  updated_at: string;
}

// parsers.go itemParsersRequest / itemParsersResponse — the PUT
// /api/v1/items/{id}/parsers body and 200 body: the FULL replacement
// attachment list in attachment order (an empty array clears — the DELETE
// verb's equivalent write). Field names match the JSON tags EXACTLY.
export interface ItemParsersRequest {
  parsers: string[];
}

export interface ItemParsersResponse {
  parsers: string[];
}

// enrich_admin.go libraryRefreshRequest / ReenrichResult — the POST
// /libraries/{id}/refresh body and 202 body. plugin_id is required (exactly
// one parser per invocation); row_ids are the opaque row ids (items and
// series share the row space) and OPTIONAL (Go `row_ids,omitempty` —
// omitted/empty = the whole-library sweep, which the Manage overlay's
// Refresh metadata section sends; the per-item views scope to one row).
// Field names match the JSON tags EXACTLY.
export interface LibraryRefreshRequest {
  plugin_id: string;
  row_ids?: string[];
}

export interface LibraryRefreshResult {
  queued: number;
  stripped: number;
  deferred: number;
}

// enrich_admin.go EnrichPreview — the GET /libraries/{id}/enrich/preview
// 200 body: the per-plugin drift picture for one library (matches = rows
// carrying the plugin namespace, pending = derivable rows, cooling =
// ledger-held rows, versions = the `_provenance` plugin-version histogram).
// Computed on demand — never stored.
export interface EnrichPreview {
  plugin_id: string;
  matches: number;
  pending: number;
  cooling: number;
  versions: Record<string, number>;
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
// web-ui-phase-3 additions + the media-preview media route). GET
// /api/v1/items[/{id}[/media]] are the routes the item surfaces consume.
// MediaVariant — the variants GET /api/v1/items/{id}/media serves today
// (reviewer FLAG S2): "thumb" is the frame-grabber JPEG. A union (not string)
// makes an illegal variant unrepresentable at compile time — the server would
// 400 it, but the type keeps the mistake local.
export type MediaVariant = "thumb";

export const ENDPOINTS = {
  libraries: "/api/v1/libraries",
  library: (id: number): string => `/api/v1/libraries/${id}`,
  scan: (id: number): string => `/api/v1/libraries/${id}/scan`,
  // libraryRefresh — POST /api/v1/libraries/{id}/refresh (enrich_admin.go
  // libraryRefresh, ui-management pass 2): the per-plugin re-enrichment
  // kickoff; row_ids scopes the sweep to the given opaque row ids (the SPA
  // always sends exactly one — per-row refresh; omitted/empty = the
  // whole-library sweep, which the Manage overlay owns).
  libraryRefresh: (id: number): string => `/api/v1/libraries/${id}/refresh`,
  // enrichPreview — GET /libraries/{id}/enrich/preview?plugin_id=
  // (enrich_admin.go enrichPreview, ui-management pass 3): the per-plugin
  // drift preview the Manage overlay's Refresh metadata section shows
  // BEFORE enabling its trigger; `plugin_id` is a REQUIRED query parameter
  // (a missing one 400s).
  enrichPreview: (id: number): string =>
    `/api/v1/libraries/${id}/enrich/preview`,
  librarySummary: (id: number): string => `/api/v1/libraries/${id}/summary`,
  libraryFolders: (id: number): string => `/api/v1/libraries/${id}/folders`,
  adminStatus: "/api/v1/admin/status",
  items: "/api/v1/items",
  item: (id: string): string => `/api/v1/items/${id}`,
  // itemMedia — GET /api/v1/items/{id}/media (handlers.go itemMedia,
  // media-preview group 1; browse bearer gate). `variant` "thumb" requests the
  // frame-grabber JPEG — call it ONLY when hasFrameGrabberThumb(doc) is true,
  // because a thumb miss is a 404 (D6's strict contract). The bytes go through
  // fetchItemMediaObjectUrl, never an <img src> (an img channel cannot carry
  // the bearer header — D5).
  itemMedia: (id: string, variant?: MediaVariant): string =>
    variant === undefined
      ? `/api/v1/items/${id}/media`
      : `/api/v1/items/${id}/media?variant=${variant}`,
  // itemSidecar — GET /api/v1/items/{id}/media?variant=sidecar&n=<int>
  // (handlers.go mediaVariantSidecar, serial-watch-flow D-3/D-4): the
  // document-indexed sidecar file, served verbatim (same static-bytes
  // posture as thumb). `n` indexes parsed.sidecars — the FULL stored list,
  // audio sidecars included, the same index space the descriptor's
  // voiceovers resolve against. 400 for a missing/non-integer/negative n;
  // 404 for an out-of-range index, absent sidecar facts, or a missing file
  // (canonical, surfaced inline by the caller — never retried blindly).
  itemSidecar: (id: string, n: number): string =>
    `/api/v1/items/${id}/media?variant=sidecar&n=${String(n)}`,
  series: "/api/v1/series",
  seriesEpisodes: (id: string): string => `/api/v1/series/${id}/episodes`,
  // Title override verbs (serial-watch-flow 2.1, the admin rename routes):
  // PUT sets the override (200 with the stored record), DELETE clears it
  // (204, idempotent). 400 bad_request for a whitespace-only/non-string
  // title, 404 not_found for an unknown id — both canonical, surfaced
  // inline by the caller without auto-retry.
  seriesTitle: (id: string): string => `/api/v1/series/${id}/title`,
  itemTitle: (id: string): string => `/api/v1/items/${id}/title`,
  // itemParsers — PUT /api/v1/items/{id}/parsers (parsers.go putItemParsers,
  // ui-management pass 2): the FULL replacement attachment write — the body's
  // ordered parser id list becomes the stored extra_parsers verbatim, an
  // empty list clears.
  itemParsers: (id: string): string => `/api/v1/items/${id}/parsers`,
  progress: "/api/v1/progress",
  // Playback verbs (packaged-playback): the read-only descriptor and the
  // single playback mutation (POST /play with {retry:true} re-enqueues a
  // failed packaging run; from_seconds is reserved server-side).
  playback: (id: string): string => `/api/v1/items/${id}/playback`,
  play: (id: string): string => `/api/v1/items/${id}/play`,
  // progressItem — PUT /api/v1/progress/{item_id} (the player's position
  // reporting channel; same browse bearer posture as every other call).
  progressItem: (id: string): string => `/api/v1/progress/${id}`,
} as const;

// updateLibrary — PATCH /api/v1/libraries/{id} (handlers.go updateLibrary).
// Sends only the present fields (Go decodes pointers — an absent field leaves
// the column unchanged). 200 with the updated libraryDTO; 400 with the
// canonical bad_request body when root_path/module_id appear (immutable) or
// the body is non-canonical; 404 not_found for an unknown id. The caller
// surfaces those errors inline — no auto-retry (mutations are retry:0).
export async function updateLibrary(
  id: number,
  req: UpdateLibraryRequest,
): Promise<LibraryDTO> {
  return apiRequest<LibraryDTO>(ENDPOINTS.library(id), {
    method: "PATCH",
    // apiRequest JSON.stringifies non-string bodies and sets Content-Type;
    // the cast bridges RequestInit.body's narrower BodyInit type (same bridge
    // as useCreateLibrary).
    body: req as unknown as BodyInit,
  });
}

// getLibrary — GET /api/v1/libraries/{id} (handlers.go getLibrary,
// element-pages 3.4). The library row plus the additive module presentation
// block (`module`: identity_fields + the ordered parser bindings with
// display_fields) — the element page's chain/identity source. 404 with the
// canonical not_found body for an unknown library.
export async function getLibrary(id: number): Promise<LibraryDTO> {
  return apiRequest<LibraryDTO>(ENDPOINTS.library(id));
}

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

// getSeries — GET /api/v1/series?library={id} (handlers.go listSeries). The
// library param is REQUIRED (a non-integer library is a 400 bad_request);
// there are no limit/offset params — the server returns the library's series
// whole, relative_path-ordered. A series' episodes are a SEPARATE call
// (getSeriesEpisodes) and are never fetched eagerly per series.
export async function getSeries(libraryId: number): Promise<SeriesListResponse> {
  return apiRequest<SeriesListResponse>(
    `${ENDPOINTS.series}?library=${String(libraryId)}`,
  );
}

// getSeriesEpisodes — GET /api/v1/series/{id}/episodes (handlers.go
// seriesEpisodes). The id is the opaque ser_ string id, passed through
// verbatim; items come back in the SAME wire shape as GET /api/v1/items
// (itemsResponse). An unknown series id is a 404 with the canonical not_found
// body (surfaced as ApiError{code:"not_found"}).
export async function getSeriesEpisodes(seriesId: string): Promise<ItemsResponse> {
  return apiRequest<ItemsResponse>(ENDPOINTS.seriesEpisodes(seriesId));
}

// setSeriesTitle — PUT /api/v1/series/{id}/title (titles.go putSeriesTitle,
// serial-watch-flow 2.1). 200 with the stored override record; 400 with the
// canonical bad_request body for a whitespace-only/non-string title, 404
// not_found for an unknown id. The caller surfaces those errors inline —
// no auto-retry (mutations are non-idempotent).
export async function setSeriesTitle(
  id: string,
  title: string,
): Promise<TitleOverrideDTO> {
  return apiRequest<TitleOverrideDTO>(ENDPOINTS.seriesTitle(id), {
    method: "PUT",
    body: { title } as unknown as BodyInit,
  });
}

// setItemTitle — PUT /api/v1/items/{id}/title (titles.go putItemTitle): the
// item id space of setSeriesTitle, same wire contract.
export async function setItemTitle(
  id: string,
  title: string,
): Promise<TitleOverrideDTO> {
  return apiRequest<TitleOverrideDTO>(ENDPOINTS.itemTitle(id), {
    method: "PUT",
    body: { title } as unknown as BodyInit,
  });
}

// apiRequestVoid — the DELETE-side companion to apiRequest: the SAME bearer
// posture and canonical-error rejection, but no body parse — a 204 carries
// no body, and apiRequest's JSON.parse("") would throw on it.
export async function apiRequestVoid(
  path: string,
  init?: RequestInit,
): Promise<void> {
  const token = getToken();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res: Response = await fetch(path, { ...init, headers });
  if (res.status === 401) {
    handle401();
  }
  if (!res.ok) {
    throw new ApiError(res.status, await errorBody(res));
  }
}

// deleteSeriesTitle — DELETE /api/v1/series/{id}/title (titles.go deleteTitle).
// 204, idempotent by design: clearing an absent override is a no-op that still
// answers 204. The display returns to the chain value once the caller
// invalidates the read.
export async function deleteSeriesTitle(id: string): Promise<void> {
  await apiRequestVoid(ENDPOINTS.seriesTitle(id), { method: "DELETE" });
}

// deleteItemTitle — DELETE /api/v1/items/{id}/title: the item id space of
// deleteSeriesTitle, same idempotent 204 contract.
export async function deleteItemTitle(id: string): Promise<void> {
  await apiRequestVoid(ENDPOINTS.itemTitle(id), { method: "DELETE" });
}

// putItemParsers — PUT /api/v1/items/{id}/parsers (parsers.go putItemParsers,
// ui-management pass 2): FULL replacement of the item's element-only parser
// attachments — the stored list becomes exactly `parsers` in order; an empty
// list clears. 200 with the stored list; 400 bad_request for an unknown or
// capability-mismatched plugin id, 404 not_found for an unknown item — both
// canonical, surfaced inline by the caller (mutations are retry:0 — no
// auto-retry).
export async function putItemParsers(
  id: string,
  parsers: string[],
): Promise<ItemParsersResponse> {
  return apiRequest<ItemParsersResponse>(ENDPOINTS.itemParsers(id), {
    method: "PUT",
    body: { parsers } as unknown as BodyInit,
  });
}

// getPlayback — GET /api/v1/items/{id}/playback (handlers.go itemPlayback,
// packaged-playback). Read-only descriptor: mode/state/play_url/sections.
// The handler ALSO sets the cookie-primary media token on the response — the
// browser carries it to /media automatically; play_url's query token is the
// cookie-less fallback. An unknown item 404s with the canonical not_found
// body (surfaced as ApiError{code:"not_found"}).
export async function getPlayback(id: string): Promise<PlaybackDescriptor> {
  return apiRequest<PlaybackDescriptor>(ENDPOINTS.playback(id));
}

// playItem — POST /api/v1/items/{id}/play (handlers.go itemPlay, D-7: the
// ONLY playback mutation). A retry request ({retry:true}) re-enqueues a
// FAILED packaging run (202 {queued:true}; 400 "nothing_failed" when nothing
// failed); a plain play ({}) is an acknowledgement (200) that may still
// enqueue a pack-on-play packaging run (202 when it did). An unknown item
// 404s with the canonical not_found body. Callers surface errors inline —
// no auto-retry (mutations are non-idempotent).
export async function playItem(
  id: string,
  req: { retry?: boolean } = {},
): Promise<PlayResponse> {
  return apiRequest<PlayResponse>(ENDPOINTS.play(id), {
    method: "POST",
    body: req as unknown as BodyInit,
  });
}

// putProgress — PUT /api/v1/progress/{item_id} (handlers.go putProgress,
// web-ui-phase-3). The player's position-reporting channel: integer seconds,
// best-effort (a progress failure never interrupts playback). 404 for an
// unknown item; 400 for a missing/negative position.
export async function putProgress(
  itemId: string,
  positionSeconds: number,
): Promise<ProgressDTO> {
  return apiRequest<ProgressDTO>(ENDPOINTS.progressItem(itemId), {
    method: "PUT",
    body: { position_seconds: positionSeconds } as unknown as BodyInit,
  });
}

// postLibraryRefresh — POST /api/v1/libraries/{id}/refresh (enrich_admin.go
// libraryRefresh): the per-plugin re-enrichment kickoff. 202 with the sweep
// counts (queued/stripped/deferred); 409 refresh_in_flight for a concurrent
// whole-library sweep, 503 unavailable when the endpoint is unwired, 400
// unknown plugin, 404 unknown rows/library — all canonical, surfaced inline
// by the caller (mutations are retry:0 — no auto-retry).
export async function postLibraryRefresh(
  id: number,
  req: LibraryRefreshRequest,
): Promise<LibraryRefreshResult> {
  return apiRequest<LibraryRefreshResult>(ENDPOINTS.libraryRefresh(id), {
    method: "POST",
    body: req as unknown as BodyInit,
  });
}

// getEnrichPreview — GET /api/v1/libraries/{id}/enrich/preview?plugin_id=
// (enrich_admin.go enrichPreview): the per-plugin drift preview for one
// library. The composition is slow by design (a whole-library namespace
// scan), so the caller renders a loading line, never a spinner. 503
// "unavailable" when the preview endpoint is unwired, 400 without
// plugin_id, 404 unknown library — all canonical, surfaced by the caller.
export async function getEnrichPreview(
  id: number,
  pluginId: string,
): Promise<EnrichPreview> {
  const q = new URLSearchParams({ plugin_id: pluginId });
  return apiRequest<EnrichPreview>(
    `${ENDPOINTS.enrichPreview(id)}?${q.toString()}`,
  );
}

// getItem — GET /api/v1/items/{id} (handlers.go:266-278). The id is the item's
// string UUID, passed through verbatim. A missing item 404s with the canonical
// not_found body (surfaced as ApiError{code:"not_found"}).
export async function getItem(id: string): Promise<ItemResponse> {
  return apiRequest<ItemResponse>(ENDPOINTS.item(id));
}

// hasFrameGrabberThumb — media-preview D6 client-side pre-selection: the
// document carries the frame-grabber thumbnail fact
// (sources["frame-grabber"].thumbnail_path — the EXACT fact the Go handler's
// documentMediaPath reads). Only a TRUE answer may request ?variant=thumb: the
// endpoint answers a thumb miss with 404, so the SPA never asks for a thumb
// the document does not name. Exported pure for tests.
export function hasFrameGrabberThumb(doc: ItemDocument): boolean {
  const grabber = doc.sources?.["frame-grabber"];
  return (
    !!grabber &&
    typeof grabber === "object" &&
    typeof grabber.thumbnail_path === "string" &&
    grabber.thumbnail_path !== ""
  );
}

// hasOriginalFile — the document carries the scan-stamped original-path fact
// (parsed.absolute_path — the EXACT fact documentMediaPath resolves the
// original variant from), so GET /items/{id}/media without a variant can
// resolve. Exported pure for tests.
export function hasOriginalFile(doc: ItemDocument): boolean {
  const parsed = doc.parsed;
  if (!parsed || typeof parsed !== "object") {
    return false;
  }
  const absolute = (parsed as Record<string, unknown>).absolute_path;
  return typeof absolute === "string" && absolute !== "";
}

// isPhotoItem / isVideoItem — the image/non-image split, defined ONCE here:
// the stored media_type is the module type "tv" | "image" | "serial" (the
// scanner stamps req.GetModuleType(), never "video"), so non-image IS the
// playable side. Exported pure for tests.
export function isPhotoItem(item: ItemDTO): boolean {
  return item.media_type === "image";
}

export function isVideoItem(item: ItemDTO): boolean {
  return !isPhotoItem(item);
}

// fetchItemMediaObjectUrl — the authenticated media byte channel (media-preview
// D5): an <img src> request cannot carry the Authorization header and the media
// endpoint must stay bearer-gated, so the bytes are fetched through the same
// bearer posture as every other /api/v1 call and converted into ONE blob
// object URL. The caller owns revoking it (useItemMedia revokes on unmount /
// URL change). `path` is an itemMedia() URL — the parameter name also matches
// the wrapper-chokepoint idiom apiRequest uses. A 401 still rotates to /login
// (INV-401-source-of-truth); any other non-2xx rejects ApiError so consumers
// fall back to the placeholder (never a broken-image state).
export async function fetchItemMediaObjectUrl(
  path: string,
  signal?: AbortSignal,
): Promise<string> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res: Response = await fetch(path, { headers, signal });

  if (res.status === 401) {
    handle401();
  }
  if (!res.ok) {
    throw new ApiError(res.status, await errorBody(res));
  }
  return URL.createObjectURL(await res.blob());
}

// fetchSidecarText — the authenticated sidecar TEXT channel (serial-watch-flow
// 5.1): a <track src> cannot carry the Authorization header, so the sidecar
// bytes are fetched through the same bearer posture as every other /api/v1
// call and returned as text for the client-side conversion (lib/subtitles).
// `path` is an itemSidecar() URL. A 401 still rotates to /login
// (INV-401-source-of-truth); any other non-2xx rejects the canonical ApiError
// so the caller degrades the selection inline — never a crash.
export async function fetchSidecarText(
  path: string,
  signal?: AbortSignal,
): Promise<string> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res: Response = await fetch(path, { headers, signal });
  if (res.status === 401) {
    handle401();
  }
  if (!res.ok) {
    throw new ApiError(res.status, await errorBody(res));
  }
  return res.text();
}

// redirectToLogin — the 401 rotation. Factored so the redirect is a single
// chokepoint (and overridable in tests). INV-401-source-of-truth: a 401 is the
// SOLE signal that rotates the client to /login.
function redirectToLogin(): void {
  window.location.assign("/login");
}

// handle401 — the shared 401 rotation sequence (reviewer FLAG S1): clearToken +
// redirectToLogin + reject with the canonical session-expired ApiError. Both
// channels (apiRequest, fetchItemMediaObjectUrl) route their 401s here so the
// sequence exists exactly once and cannot drift.
function handle401(): never {
  clearToken();
  redirectToLogin();
  throw new ApiError(401, {
    code: "unauthorized",
    message: "session expired",
    retryable: false,
  });
}

// errorBody — the canonical {"error":{code,message,retryable}} parser shared by
// the JSON wrapper (apiRequest) and the media channel (fetchItemMediaObjectUrl)
// so both reject the SAME ApiError shape. A non-canonical or non-JSON body
// falls back to the HTTP status text (fail-fast, no silent success).
async function errorBody(res: Response): Promise<ApiErrorBody> {
  try {
    const obj = (await res.json()) as { error?: ApiErrorBody };
    if (
      obj &&
      typeof obj === "object" &&
      obj.error &&
      typeof obj.error.code === "string" &&
      typeof obj.error.message === "string" &&
      typeof obj.error.retryable === "boolean"
    ) {
      return obj.error;
    }
  } catch {
    // non-JSON body — fall through to the status-text error below.
  }
  return {
    code: "http_error",
    message: res.statusText || `request failed with status ${res.status}`,
    retryable: false,
  };
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
    handle401();
  }

  if (!res.ok) {
    throw new ApiError(res.status, await errorBody(res));
  }

  // 2xx — verbatim parse (INV-no-rounding).
  const raw = await res.text();
  return JSON.parse(raw) as T;
}
