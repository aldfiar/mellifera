// SPDX-License-Identifier: Apache-2.0

// TS mirror of the §3.1 item document (docs/architecture.md §3.1; shapes fixed
// in docs/web-ui-phase-2/contracts.md). The document is the source of truth for
// item state and is rendered VERBATIM by the SPA: a namespace or field is never
// collapsed, a value is never rounded/averaged/reformatted (INV-no-rounding,
// arch §3.4/§11.2). `ffprobe` and the index signature keep dynamic JSON honest
// instead of inventing fields.
//
// Pure module — no React imports. The accessors below normalize the record
// shapes to arrays (insertion order preserved) so components never hand-roll
// optional-chaining chains; nothing here mutates the document.

// SourceNamespace — one plugin's contribution under `sources.<plugin_id>`
// (Tier 2, lossless). Fields are plugin-defined; rendered as a card.
export interface SourceNamespace {
  [field: string]: unknown;
}

// ViewEntry — one computed display value under `_view.<field_path>` (Tier 3).
export interface ViewEntry {
  value: unknown;
  source: string;
  lang?: string;
  reason: string;
}

// ProvenanceEntry — the per-field audit trail under `_provenance.<field_path>`.
export interface ProvenanceEntry {
  plugin_id: string;
  plugin_version?: string;
  fetched_at?: string;
  confidence?: number;
  source_url?: string;
}

// StageEntry — one per-source progress record in `_stages`, transcribed from
// internal/enrich/enrich.go:137-149 (appendStage). `error` is present only on
// failure; `advanced_to` is the item status after this source ran.
export interface StageEntry {
  stage: string; // "metadata_source"
  plugin_id: string;
  status: string; // stageStatus: "ok" | "failed" | …
  advanced_to: string;
  started_at: string; // RFC3339
  finished_at: string; // RFC3339
  error?: string;
}

// ItemDocument — the full §3.1 document as stored (json.RawMessage on the Go
// side — opaque there, typed here). Unknown top-level keys are preserved, never
// collapsed.
export interface ItemDocument {
  identifiers?: Record<string, string | number>; // Tier 1 (tmdb_id, imdb_id, …)
  sources?: Record<string, SourceNamespace>; // Tier 2: sources.<plugin_id>
  _view?: Record<string, ViewEntry>; // Tier 3: computed display
  _provenance?: Record<string, ProvenanceEntry>; // per field_path audit trail
  _stages?: StageEntry[]; // pipeline progress
  ffprobe?: unknown; // raw scanner blob
  [k: string]: unknown; // dynamic JSON — never collapse
}

// Keyed entry shapes — the accessors return the record's key alongside each
// entry (insertion order), so consumers keep the namespace/field identity
// (SourceCard needs the plugin_id; the provenance badge needs the field_path).
export interface SourceNamespaceEntry {
  pluginId: string;
  namespace: SourceNamespace;
}

export interface ViewFieldEntry {
  fieldPath: string;
  entry: ViewEntry;
}

export interface ProvenanceFieldEntry {
  fieldPath: string;
  entry: ProvenanceEntry;
}

// sourcesOf — `sources` record → array of { pluginId, namespace }, insertion
// order. Missing/empty record → [].
export function sourcesOf(doc: ItemDocument): SourceNamespaceEntry[] {
  const sources = doc.sources;
  if (!sources || typeof sources !== "object") {
    return [];
  }
  return Object.entries(sources).map(([pluginId, namespace]) => ({
    pluginId,
    namespace: (namespace ?? {}) as SourceNamespace,
  }));
}

// viewEntries — `_view` record → array of { fieldPath, entry }, insertion
// order. The value is passed through verbatim (string, number, structured —
// never rounded or stringified here).
export function viewEntries(doc: ItemDocument): ViewFieldEntry[] {
  const view = doc._view;
  if (!view || typeof view !== "object") {
    return [];
  }
  return Object.entries(view).map(([fieldPath, entry]) => ({
    fieldPath,
    entry,
  }));
}

// provenanceEntries — `_provenance` record → array of { fieldPath, entry },
// insertion order.
export function provenanceEntries(doc: ItemDocument): ProvenanceFieldEntry[] {
  const provenance = doc._provenance;
  if (!provenance || typeof provenance !== "object") {
    return [];
  }
  return Object.entries(provenance).map(([fieldPath, entry]) => ({
    fieldPath,
    entry,
  }));
}

// stageEntries — `_stages` array → array, order preserved (the pipeline
// appends; order IS the progress). Missing/non-array → [].
export function stageEntries(doc: ItemDocument): StageEntry[] {
  return Array.isArray(doc._stages) ? doc._stages : [];
}
