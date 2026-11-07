// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from "react";

import type { FacetDTO, FacetKey, FacetSelection } from "@/lib/api";
import { cn } from "@/lib/utils";

// FacetChips — the browse-scale 5.2 facet filter lane for the serial/film
// collection grids: one chip group per served facet key, one chip per counted
// value, SERVED BYTES ONLY — values render verbatim (Cyrillic and machine
// casing intact, never re-cased or transliterated) and the served order
// (count desc, value asc — the browse-side build's law) is never re-sorted.
//
// Wiring is the caller's concern, passed in as `keys`: the serial grid wires
// all three keys onto GET /series (genre/kind/status), the movies grid only
// genre/kind onto GET /items — /items carries no facet-status param (its
// `status` name is pinned to the enrichment-lifecycle filter), so a served
// status facet is simply NOT RENDERED there rather than dead chrome.
//
// Absence laws:
//   - photo libraries never MOUNT this component (Collection's PhotosBody
//     body arm) — a photo library's served facets list is empty anyway, but
//     the structural absence is the grid-shape law;
//   - a facet key no document carries is absent from the served list and so
//     from the chips (honest absence — no empty groups);
//   - undefined facets (query loading, or a failed/unwired 503 read) render
//     NOTHING — the chips are additive chrome, never a blocker or a spinner.
//
// Selection is single-value per key (the server takes one value per param),
// conjunct across keys; active = the `chip-active` color change (the palette's
// primary token — the same selection law as Home's type chips), announced to
// AT through aria-pressed. Toggling is the caller's onToggle — the component
// owns no state.
export function FacetChips(props: {
  facets?: FacetDTO[];
  keys: readonly FacetKey[];
  active: FacetSelection;
  onToggle: (key: keyof FacetSelection, value: string) => void;
}): ReactElement | null {
  // PARAM_OF — the served facet key's query parameter on the listing
  // endpoints: the About block's `genres` fact filters through ?genre= on
  // both /series and /items; kind/status carry their own names.
  const PARAM_OF: Record<string, keyof FacetSelection> = {
    genres: "genre",
    kind: "kind",
    status: "status",
  };
  const wired = props.keys as readonly string[];
  const served = (props.facets ?? []).filter(
    (facet) => wired.includes(facet.key) && facet.values.length > 0,
  );
  if (served.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2">
      {served.map((facet) => {
        const param = PARAM_OF[facet.key];
        return (
          <div
            key={facet.key}
            role="group"
            aria-label={`Filter by ${facet.key}`}
            className="flex flex-wrap items-center gap-1"
          >
            {param === undefined
              ? null
              : facet.values.map((entry) => {
                  const active = props.active[param] === entry.value;
                  return (
                    <button
                      key={entry.value}
                      type="button"
                      className={cn("chip", active && "chip-active")}
                      aria-pressed={active}
                      onClick={() => props.onToggle(param, entry.value)}
                    >
                      {entry.value}
                      <span className="tabular-nums">{String(entry.count)}</span>
                    </button>
                  );
                })}
          </div>
        );
      })}
    </div>
  );
}
