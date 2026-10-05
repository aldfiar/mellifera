// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from "react";
import { useState } from "react";

import type { ApiError, ItemDTO, ListItemsParams } from "@/lib/api";
import { useItems, useLibraries } from "@/lib/queries";
import type { ItemDocument } from "@/lib/document";
import { viewEntries } from "@/lib/document";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Browse — the operator's item list (Phase 2b group 1). Library selector
// (defaults to the first library), status filter (empty = all — the server
// INV), and offset pagination at the server's default page size of 50.
//
// INV-no-direct-fetch: only the queries hooks (useLibraries/useItems) touch
// the API. INV-no-rounding: the title comes straight out of `_view` via
// viewEntries and is rendered verbatim. Loading/error/empty states are the
// shared components from components/states.tsx (group 3).

const PAGE_SIZE = 50;

// Status filter options: empty = all, then the item statuses incl. the
// transient "parsed" (server state machine). "deleted" is intentionally
// absent.
const STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "all", label: "All" },
  { value: "new", label: "new" },
  { value: "pending", label: "pending" },
  { value: "parsed", label: "parsed" },
  { value: "enriched", label: "enriched" },
  { value: "failed", label: "failed" },
  { value: "ready", label: "ready" },
  { value: "stale", label: "stale" },
];

// viewTitle — the item's display title: `_view.title.value` verbatim (string
// or number passthrough; anything else → "—"). Found via viewEntries so the
// accessor contract, not inline record indexing, owns the shape.
function viewTitle(doc: ItemDocument): string {
  const title = viewEntries(doc).find((e) => e.fieldPath === "title");
  const value = title?.entry.value;
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value); // lossless primitive stringify (INV-no-rounding)
  }
  return "—";
}

export default function Browse(): ReactElement {
  const libraries = useLibraries();

  const [libraryId, setLibraryId] = useState<number | null>(null);
  const [status, setStatus] = useState<string>("all");
  const [offset, setOffset] = useState(0);

  // Default to the first library once the list loads (operator picks a
  // different one explicitly).
  const libs = libraries.data?.items ?? [];
  const effectiveLibraryId = libraryId ?? libs[0]?.id ?? null;

  function onLibraryChange(v: string): void {
    setLibraryId(Number(v));
    setOffset(0);
  }

  function onStatusChange(v: string): void {
    setStatus(v);
    setOffset(0);
  }

  if (libraries.isLoading) {
    return <LoadingState label="Loading libraries…" />;
  }
  if (libraries.error) {
    return (
      <ErrorState
        error={libraries.error as ApiError}
        onRetry={libraries.refetch}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-3 text-base font-semibold">Browse</h2>
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center">
            Library
            <Select
              value={effectiveLibraryId === null ? undefined : String(effectiveLibraryId)}
              onValueChange={onLibraryChange}
            >
              <SelectTrigger
                className="w-full sm:w-56"
                aria-label="Library"
              >
                <SelectValue placeholder="Select library" />
              </SelectTrigger>
              <SelectContent>
                {libs.map((lib) => (
                  <SelectItem key={lib.id} value={String(lib.id)}>
                    {lib.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center">
            Status
            <Select value={status} onValueChange={onStatusChange}>
              <SelectTrigger className="w-full sm:w-40" aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
      </section>

      {effectiveLibraryId !== null ? (
        <ItemsPanel
          libraryId={effectiveLibraryId}
          // Empty status string = all (server INV) — "all" is the UI-only value.
          status={status === "all" ? undefined : status}
          offset={offset}
          onPrev={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          onNext={() => setOffset(offset + PAGE_SIZE)}
        />
      ) : (
        <EmptyState message="No libraries yet" />
      )}
    </div>
  );
}

// ItemsPanel — the items table for one (library, status, offset) page. Mounted
// only when a library is selected, so useItems never fires with a sentinel
// library id.
//
// Responsive: the Path and Type columns drop out at narrow widths (hidden
// sm:/lg:table-cell) — Title and Status are the load-bearing columns — and
// the table primitive's overflow-auto wrapper keeps any residual width inside
// the page (no horizontal overflow).
function ItemsPanel(props: {
  libraryId: number;
  status: string | undefined;
  offset: number;
  onPrev: () => void;
  onNext: () => void;
}): ReactElement {
  const { libraryId, status, offset, onPrev, onNext } = props;

  const params: ListItemsParams = {
    library: libraryId,
    status,
    limit: PAGE_SIZE,
    offset,
  };
  const { data, isLoading, error, refetch } = useItems(params);

  if (isLoading) {
    return <LoadingState label="Loading items…" />;
  }
  if (error) {
    return <ErrorState error={error as ApiError} onRetry={refetch} />;
  }

  const items: ItemDTO[] = data?.items ?? [];
  const hasPrev = offset > 0;
  const hasNext = items.length === PAGE_SIZE;

  return (
    <section className="flex flex-col gap-3">
      {items.length === 0 ? (
        <EmptyState message="No items" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead className="hidden lg:table-cell">Path</TableHead>
              <TableHead className="hidden w-24 sm:table-cell">Type</TableHead>
              <TableHead className="w-28">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="break-words">
                  {viewTitle(item.document)}
                </TableCell>
                <TableCell className="hidden break-all font-mono lg:table-cell">
                  {item.relative_path}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {item.media_type}
                </TableCell>
                <TableCell>{item.status}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-md border px-3 py-1.5 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          onClick={onPrev}
          disabled={!hasPrev}
        >
          Previous
        </button>
        <button
          type="button"
          className="rounded-md border px-3 py-1.5 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          onClick={onNext}
          disabled={!hasNext}
        >
          Next
        </button>
        <span className="text-sm text-muted-foreground">
          items {items.length === 0 ? offset : offset + 1}–{offset + items.length}
        </span>
      </div>
    </section>
  );
}
