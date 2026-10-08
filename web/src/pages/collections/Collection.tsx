// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from "react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import type { ApiError, ItemDTO, LibraryDTO, ListItemsParams } from "@/lib/api";
import { useItems, useLibraries, useLibrarySummary } from "@/lib/queries";
import type { ItemDocument } from "@/lib/document";
import { viewEntries } from "@/lib/document";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";

// Collection — the per-collection page at /collections/:id (web-ui-phase-3
// group 3, minimal-but-real). The header comes from GET /api/v1/libraries +
// GET /api/v1/libraries/{id}/summary: name, pastel type badge, description,
// item count, updated stamp — never a root path, never a lifecycle pill (D5).
//
// The body is keyed by the library's module_id (D6). Group 5 replaces the
// shared body with the per-type layouts (tv → parsed movie file cards,
// image → masonry + subfolder chips from the folders endpoint, serial →
// series grid from the series endpoint); group 3 ships ONE real body for
// every type — a chip-tagged, paginated item grid over
// GET /api/v1/items?library={id} with limit/offset — so the route is honest
// end-to-end today.
//
// INV-no-rounding: the title comes out of `_view` verbatim via viewEntries;
// the filename is the relative_path's last segment rendered verbatim.

const PAGE_SIZE = 50;

// viewTitle — the item's display title: `_view.title.value` verbatim (string
// or number passthrough; anything else → "—"), found via viewEntries so the
// accessor contract owns the shape.
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

// fileName — the raw file name: the relative_path's final segment, verbatim.
function fileName(relativePath: string): string {
  const parts = relativePath.split("/");
  return parts[parts.length - 1] ?? relativePath;
}

// dotClass — mirrors the sidebar's pastel type dots (same module_id keys;
// same rationale as Home's local copy).
function dotClass(moduleId: string): string {
  switch (moduleId) {
    case "serial":
      return "dot dot-serial";
    case "tv":
      return "dot dot-tv";
    case "image":
      return "dot dot-image";
    default:
      return "dot dot-audio";
  }
}

export default function Collection(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const libraryId = Number(id);

  const libraries = useLibraries();
  const summary = useLibrarySummary(libraryId);

  const lib: LibraryDTO | undefined = Number.isFinite(libraryId)
    ? libraries.data?.items.find((l) => l.id === libraryId)
    : undefined;

  if (libraries.isLoading) {
    return <LoadingState label="Loading collections…" />;
  }
  if (libraries.error) {
    return (
      <ErrorState error={libraries.error as ApiError} onRetry={libraries.refetch} />
    );
  }
  if (!lib) {
    return (
      <EmptyState
        message={`Collection not found: no library with id ${id ?? "(missing)"}.`}
      />
    );
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <CollectionHeader lib={lib} />
      <CollectionBody module_id={lib.module_id} libraryId={lib.id} summaryLoaded={!summary.isLoading} itemCount={summary.data?.items} />
    </main>
  );
}

// CollectionHeader — name, pastel type badge (module_id), description, item
// count and updated stamp from the summary. The count shows once the summary
// lands; the header itself never waits on it.
function CollectionHeader(props: { lib: LibraryDTO }): ReactElement {
  const { lib } = props;

  return (
    <header className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span className={dotClass(lib.module_id)} aria-hidden="true" />
        <h1 className="text-xl font-semibold">{lib.display_name}</h1>
        <span className="chip">{lib.module_id}</span>
      </div>
      {lib.description ? (
        <p className="text-sm text-muted-foreground">{lib.description}</p>
      ) : null}
    </header>
  );
}

// CollectionBody — the module_id-keyed arm. Group 5 fills the per-type
// layouts; every type currently shares ItemGrid.
function CollectionBody(props: {
  module_id: string;
  libraryId: number;
  summaryLoaded: boolean;
  itemCount: number | undefined;
}): ReactElement {
  // The zero-item "not scanned yet" state is summary-driven and type-
  // independent (the explicit empty card state from the spec).
  if (props.summaryLoaded && props.itemCount === 0) {
    return <EmptyState message="Not scanned yet — run a scan from Admin." />;
  }
  return <ItemGrid libraryId={props.libraryId} />;
}

// ItemGrid — the shared paginated body: one card per item with its title
// (verbatim from `_view`), type/status chips, and the raw filename, deep-
// linking into the item detail. Offset paging at the server's default page
// size ceiling (limit) exactly like the old browse table did.
function ItemGrid(props: { libraryId: number }): ReactElement {
  const { libraryId } = props;
  const [offset, setOffset] = useState(0);

  const params: ListItemsParams = {
    library: libraryId,
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

  if (items.length === 0 && offset === 0) {
    return <EmptyState message="No items in this collection." />;
  }

  return (
    <section className="flex flex-col gap-3">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              to={`/items/${item.id}`}
              className="flex h-full flex-col gap-2 rounded-md border p-3 hover:bg-accent"
            >
              <span className="text-sm font-medium">{viewTitle(item.document)}</span>
              <span className="flex gap-1">
                <span className="chip">{item.media_type}</span>
                <span className="chip">{item.status}</span>
              </span>
              <span className="break-all font-mono text-xs text-muted-foreground">
                {fileName(item.relative_path)}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-md border px-3 py-1.5 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          disabled={!hasPrev}
        >
          Previous
        </button>
        <button
          type="button"
          className="rounded-md border px-3 py-1.5 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          onClick={() => setOffset(offset + PAGE_SIZE)}
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
