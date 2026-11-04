// SPDX-License-Identifier: Apache-2.0
import { useState, type ReactElement } from "react";

import type { ApiError } from "@/lib/api";
import {
  useAdminUsers,
  useLibraries,
  useVisibilityExplain,
} from "@/lib/queries";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

// ExplainViewer — the visibility-explain surface (l6-accounts 9.4, over the
// 9.3 endpoint): an input pair (user + collection selects) and a result
// card. The query fires ONLY when the operator presses Explain — selection
// changes alone never hit the wire. The unknown-collection case renders the
// server's orphan answer PLAINLY (visible:false with empty granting_groups
// — an unknown library is NOT a 404, the orphan law mirrored server-side).
export default function ExplainViewer(): ReactElement {
  const users = useAdminUsers();
  const libraries = useLibraries();

  const [userId, setUserId] = useState("");
  const [libraryId, setLibraryId] = useState("");
  // The REQUESTED pair — set only by the Explain button; the query's
  // enabled guard keys off it, so edits to the selects never fetch.
  const [requested, setRequested] = useState<{
    userId: number;
    libraryId: number;
  } | null>(null);

  const explain = useVisibilityExplain(requested);
  const err: ApiError | null =
    explain.error instanceof Error ? (explain.error as ApiError) : null;

  return (
    <section>
      <h2 className="mb-3 text-base font-semibold">Visibility explain</h2>
      <div className="mb-4 flex items-end gap-2">
        <span className="flex flex-col gap-1">
          <label htmlFor="explain-user" className="text-sm">
            User
          </label>
          <select
            id="explain-user"
            data-testid="explain-user-select"
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            <option value="">User…</option>
            {(users.data?.users ?? []).map((u) => (
              <option key={u.id} value={String(u.id)}>
                {u.username}
              </option>
            ))}
          </select>
        </span>
        <span className="flex flex-col gap-1">
          <label htmlFor="explain-library" className="text-sm">
            Collection
          </label>
          <select
            id="explain-library"
            data-testid="explain-library-select"
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={libraryId}
            onChange={(e) => setLibraryId(e.target.value)}
          >
            <option value="">Collection…</option>
            {(libraries.data?.items ?? []).map((lib) => (
              <option key={lib.id} value={String(lib.id)}>
                {lib.display_name}
              </option>
            ))}
          </select>
        </span>
        <Button
          data-testid="explain-button"
          disabled={userId === "" || libraryId === ""}
          onClick={() =>
            setRequested({ userId: Number(userId), libraryId: Number(libraryId) })
          }
        >
          Explain
        </Button>
      </div>

      {err ? (
        <Alert variant="destructive">
          <AlertTitle>{err.code}</AlertTitle>
          <AlertDescription>{err.message}</AlertDescription>
        </Alert>
      ) : null}
      {explain.isLoading && requested !== null ? (
        <p className="text-sm text-muted-foreground">Resolving…</p>
      ) : null}
      {explain.data ? <ExplainCard data={explain.data} /> : null}
    </section>
  );
}

// ExplainCard — the answer verbatim: the visibility verdict, the granting
// groups WITH their positions, the count of visible collections, and the
// mute-wins chain mutes. The orphan answer (visible:false, empty grants)
// renders exactly as served — an unknown collection is not an error.
function ExplainCard(props: {
  data: {
    user_id: number;
    library_id: number;
    visible: boolean;
    granting_groups: Array<{ group_id: number; group_name: string; position: number }>;
    visible_library_ids: number[];
    chain_mutes: Record<string, boolean>;
  };
}): ReactElement {
  const d = props.data;
  const mutedSources = Object.entries(d.chain_mutes).filter(
    ([, muted]) => muted === true,
  );
  return (
    <div
      className="rounded-md border p-3 text-sm"
      data-testid="explain-card"
      data-visible={String(d.visible)}
    >
      <p className="mb-2 font-medium">
        {d.visible ? (
          <>
            Visible for user {d.user_id}: YES (collection {d.library_id})
          </>
        ) : (
          <>
            Visible for user {d.user_id}: NO (collection {d.library_id})
          </>
        )}
      </p>
      <p className="mb-1">
        Granting groups:{" "}
        {d.granting_groups.length === 0 ? (
          <span data-testid="explain-empty-grants" className="text-muted-foreground">
            none — no group grants this collection for this user
          </span>
        ) : (
          <span data-testid="explain-grants">
            {d.granting_groups.map((g) => (
              <span key={g.group_id} className="mr-2">
                {g.group_name} (position {g.position})
              </span>
            ))}
          </span>
        )}
      </p>
      <p className="mb-1" data-testid="explain-visible-count">
        Visible collections: {d.visible_library_ids.length}
      </p>
      <p data-testid="explain-mutes">
        {mutedSources.length === 0
          ? "Muted sources: none"
          : `Muted sources: ${mutedSources.map(([id]) => id).join(", ")}`}
      </p>
    </div>
  );
}
