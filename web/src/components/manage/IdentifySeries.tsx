// SPDX-License-Identifier: Apache-2.0
import { useState } from "react";
import type { ReactElement } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  identifySeries,
  searchSource,
  type ApiError,
  type MetadataAbout,
  type ParserBinding,
  type RefreshSourceBinding,
  type SearchCandidate,
  type SearchCandidatesResponse,
  type SeriesIdentifyResult,
} from "@/lib/api";
import { NO_REFRESH_SOURCES } from "@/components/manage/ManageActions";

// SeriesIdentify — the series card's Identify… view (identify-match-override,
// web-ui delta): ONE overlay view with three steps. SEARCH — the input
// pre-filled from the current display name, the current match line for
// orientation (the served metadata identity: kind, year, score from the
// served about block; the honest none-state when the row carries no match),
// the in-flight state as a quiet text line (never a spinner), and the
// canonical inline error with retry disabled (the overlay stays open).
// CANDIDATES — the source's served order rendered verbatim (no client-side
// re-scoring or re-sorting exists here), the optional poster rendering from
// its served URL when present and honestly absent when not, and the source
// picker built from the served refresh_sources bindings when more than one
// is served (defaulting to the first). Zero candidates render the honest
// empty state suggesting the original title or the source id. CONFIRM —
// names the picked title and states plainly that description, genres, and
// facts re-pull from the source while the display name stays; Confirm PUTs
// /series/{id}/identify with the picked {source_id, external_id} (retry:0),
// invalidates the series reads on the 202, and collapses via the
// awaited-mutation idiom — a canonical error renders inline with the overlay
// open. The Esc walk is suppressed while any request is in flight (an
// unmounted view could never render the canonical inline error).

// currentMatchLine — the orientation line's text: the display name joined
// with the about block's served facts (kind; the aired_on year prefix; the
// score verbatim). Every absent fact is omitted — never guessed; a series
// with no served about block yields "" (the caller renders the none-state).
function currentMatchLine(displayTitle: string, about?: MetadataAbout): string {
  if (about === undefined) {
    return "";
  }
  const facts: string[] = [];
  if (about.kind !== undefined) {
    facts.push(about.kind);
  }
  if (about.aired_on !== undefined && /^\d{4}/.test(about.aired_on)) {
    facts.push(about.aired_on.slice(0, 4));
  }
  if (about.score !== undefined) {
    facts.push(String(about.score));
  }
  return facts.length > 0 ? `${displayTitle} · ${facts.join(" · ")}` : displayTitle;
}

export function SeriesIdentify(props: {
  libraryId: number;
  seriesId: string;
  displayTitle: string;
  about?: MetadataAbout;
  sources: RefreshSourceBinding[];
  onCollapse: () => void;
  onBack: () => void;
}): ReactElement {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(props.displayTitle);
  const [sourceId, setSourceId] = useState(props.sources[0]?.id ?? "");
  // step — the overlay's three steps. candidates/confirm carry the picked
  // candidate forward; Back walks the chain down (confirm → candidates →
  // search), the menu-level Esc walk stays the shell's.
  const [step, setStep] = useState<"search" | "candidates" | "confirm">(
    "search",
  );
  const [picked, setPicked] = useState<SearchCandidate | null>(null);

  const search = useMutation<SearchCandidatesResponse, ApiError, void>({
    mutationFn: () => searchSource(sourceId, draft.trim()),
    retry: 0,
  });

  const runSearch = (): void => {
    setPicked(null);
    search
      .mutateAsync()
      .then(() => setStep("candidates"))
      .catch(() => {}); // the canonical error renders inline below
  };

  const identify = useMutation<SeriesIdentifyResult, ApiError, void>({
    mutationFn: () =>
      identifySeries(props.seriesId, {
        source_id: sourceId,
        external_id: picked?.external_id ?? "",
      }),
    retry: 0,
    onSuccess: () => {
      // The 202 changed the series row (anchor + stripped namespace + a
      // pending status): invalidate both series reads — the grid's rows and
      // this series' episode flow. The re-derived facts land when the
      // background run completes (the staleness is stated in the confirm
      // copy, never hidden).
      void qc.invalidateQueries({ queryKey: ["series", props.libraryId] });
      void qc.invalidateQueries({
        queryKey: ["series-episodes", props.seriesId],
      });
    },
  });

  const match = currentMatchLine(props.displayTitle, props.about);

  return (
    <div
      className="flex flex-col gap-2 p-2"
      onKeyDown={(e) => {
        // While a request is in flight the panel's Esc walk is suppressed —
        // an unmounted view could never render the canonical inline error
        // (the rename/refresh views' guard).
        if (e.key === "Escape" && (search.isPending || identify.isPending)) {
          e.stopPropagation();
        }
      }}
    >
      {step === "search" ? (
        <>
          <p data-testid="identify-current-match" className="text-xs">
            {match !== "" ? (
              <>Current match: {match}</>
            ) : (
              <span className="text-muted-foreground">No current match.</span>
            )}
          </p>
          {props.sources.length > 1 ? (
            <select
              aria-label="Identify source"
              className="rounded-md border bg-card px-2 py-1 text-xs"
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
            >
              {props.sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id}
                </option>
              ))}
            </select>
          ) : null}
          <input
            data-testid="identify-search-input"
            aria-label="Search query"
            className="w-full rounded-md border bg-transparent px-2 py-1 text-xs"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim() !== "" && !search.isPending) {
                runSearch();
              }
            }}
          />
          <button
            type="button"
            className="cardact-row"
            disabled={search.isPending || draft.trim() === "" || sourceId === ""}
            onClick={runSearch}
          >
            Search
          </button>
          {props.sources.length === 0 ? (
            <p className="text-xs text-muted-foreground">{NO_REFRESH_SOURCES}</p>
          ) : null}
          {search.isPending ? (
            <p data-testid="identify-searching" role="status" className="text-xs text-muted-foreground">
              Searching…
            </p>
          ) : null}
          {search.error ? (
            <p data-testid="identify-error" role="alert" className="text-xs text-destructive">
              {search.error.code}: {search.error.message}
            </p>
          ) : null}
        </>
      ) : step === "candidates" ? (
        <>
          {(search.data?.candidates ?? []).length === 0 ? (
            <p data-testid="identify-empty" className="text-xs text-muted-foreground">
              No matches. Try the original title or the source id.
            </p>
          ) : (
            <ul className="flex flex-col gap-1" aria-label="Search candidates">
              {(search.data?.candidates ?? []).map((c) => (
                <li key={c.external_id}>
                  <button
                    type="button"
                    data-testid="identify-candidate"
                    className="cardact-row flex w-full items-center justify-between gap-2 text-left"
                    onClick={() => {
                      setPicked(c);
                      setStep("confirm");
                    }}
                  >
                    <span className="flex flex-col">
                      <span className="text-xs font-medium">{c.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {[c.kind, c.year !== undefined ? String(c.year) : null, c.russian_title]
                          .filter((f) => f !== null)
                          .join(" · ")}
                      </span>
                    </span>
                    {c.poster !== undefined ? (
                      <img
                        src={c.poster}
                        alt=""
                        loading="lazy"
                        className="h-12 w-9 rounded object-cover"
                        onError={(e) => {
                          // A dead poster URL hides itself — the candidate
                          // stays usable, never a broken-image state.
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="cardact-row" onClick={() => setStep("search")}>
            Back
          </button>
        </>
      ) : (
        <>
          <p className="text-xs">
            Identify as <span className="font-medium">{picked?.title}</span>?
          </p>
          <p className="text-xs text-muted-foreground">
            Description, genres, and facts re-pull from {sourceId}; the
            background refresh runs after confirm — your display name stays.
          </p>
          <button
            type="button"
            data-testid="identify-confirm"
            className="cardact-row"
            disabled={identify.isPending}
            onClick={() => {
              identify
                .mutateAsync()
                .then(props.onCollapse) // awaited collapse — never an isSuccess effect
                .catch(() => {}); // the canonical error renders inline below
            }}
          >
            Confirm
          </button>
          <button
            type="button"
            className="cardact-row"
            disabled={identify.isPending}
            onClick={() => setStep("candidates")}
          >
            Back
          </button>
          {identify.error ? (
            <p role="alert" className="text-xs text-destructive">
              {identify.error.code}: {identify.error.message}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

// seriesIdentifyGate — the series menu's Identify… row gate (identify-match-
// override): the row exists only when the module block is wired — a present,
// non-empty parser chain (the row-gate scenario) — and the served
// refresh_sources carry the picker's vocabulary (the block present). An
// unwired module returns undefined = the row is ABSENT (the designed empty
// state, never spinners), exactly the item cards' chain gate.
export function seriesIdentifyGate(props: {
  chain?: ParserBinding[];
  refreshSources?: RefreshSourceBinding[];
  libraryId: number;
  seriesId: string;
  displayTitle: string;
  about?: MetadataAbout;
}): ((ctl: { collapse: () => void; back: () => void }) => ReactElement) | undefined {
  if (props.chain === undefined || props.chain.length === 0) {
    return undefined;
  }
  if (props.refreshSources === undefined) {
    return undefined;
  }
  return ({ collapse, back }) => (
    <SeriesIdentify
      libraryId={props.libraryId}
      seriesId={props.seriesId}
      displayTitle={props.displayTitle}
      about={props.about}
      sources={props.refreshSources ?? []}
      onCollapse={collapse}
      onBack={back}
    />
  );
}
