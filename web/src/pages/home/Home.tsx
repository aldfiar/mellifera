// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from "react";
import { Link } from "react-router-dom";

import type { ApiError, LibraryDTO } from "@/lib/api";
import { useLibraries, useLibrarySummary } from "@/lib/queries";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";

// Home — the root route's collections landing (web-ui-phase-3 group 3,
// interim). The FULL collections-first surface — one card per collection with
// type filter chips, description/updated metadata, and the Continue/Next up
// rows — is group 4; until it lands this page renders the libraries from
// GET /api/v1/libraries as simple navigational rows (pastel dot + name + item
// count from the summary) deep-linking into /collections/{id}.
//
// No "Home" page title: the brand lives in the sidebar, and the redundant
// heading was removed with the top navigation header. No root paths and no
// enrich-lifecycle pills ever render here (D5 — user surface).

// dotClass — mirrors the sidebar's pastel type dots (same module_id keys).
// Duplicated rather than shared so group 4 can re-home both into the real
// Home/type-badge module without dragging this interim page along.
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

export default function Home(): ReactElement {
  const libraries = useLibraries();

  if (libraries.isLoading) {
    return <LoadingState label="Loading collections…" />;
  }
  if (libraries.error) {
    return (
      <ErrorState error={libraries.error as ApiError} onRetry={libraries.refetch} />
    );
  }

  const libs: LibraryDTO[] = libraries.data?.items ?? [];
  if (libs.length === 0) {
    return <EmptyState message="No collections yet — add one in Admin." />;
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <ul className="flex flex-col divide-y rounded-md border">
        {libs.map((lib) => (
          <li key={lib.id}>
            <Link
              to={`/collections/${lib.id}`}
              className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-accent"
            >
              <span className={dotClass(lib.module_id)} aria-hidden="true" />
              <span className="font-medium">{lib.display_name}</span>
              <HomeCount libraryId={lib.id} />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

// HomeCount — the collection's item count, async like the sidebar's: the row
// is navigable immediately and the count fills in when the summary lands.
function HomeCount(props: { libraryId: number }): ReactElement {
  const summary = useLibrarySummary(props.libraryId);
  if (!summary.data) {
    return <span />;
  }
  return (
    <span className="ml-auto text-xs tabular-nums text-muted-foreground">
      {String(summary.data.items)} items
    </span>
  );
}
