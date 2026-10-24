// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  ENDPOINTS,
  isServedArtPath,
  posterCandidates,
  type ApiError,
  type PosterCandidate,
} from "@/lib/api";
import type { ProvenanceEntry } from "@/lib/document";
import {
  useArtworkObjectUrl,
  useItemMedia,
  usePosterCandidates,
  usePosterMutations,
} from "@/lib/queries";
import { DialogShell } from "@/components/DialogShell";
import { PosterFrame } from "@/components/Artwork";
import { cn } from "@/lib/utils";

// PosterOverlay — the poster management overlay (artwork 3.4), in the
// DialogShell idiom: scrim + click-away, focus trap, escape matrix
// (a pending mutation suppresses closing — an unmounted overlay could never
// render the canonical inline error), awaited-mutation collapse — a
// canonical error renders role="alert" inline and the overlay STAYS OPEN.
//
// One candidate card per served candidate: «Текущий» on the active one,
// «Сделать главным» on the rest, the selection reads as color. Staged
// candidates render their served proxy URLs through the authenticated
// channel; UNSTAGED candidates render the raw remote URL hotlinked —
// lazy + onError-hide, the CONTRACTUAL exception to the
// zero-external-requests rule, admin-only by the entry route. The drop
// zone (drag + file picker) carries a client-side pre-check mirroring the
// server guard for fast feedback — the server stays authoritative. Selecting
// a candidate PUTs the selection, then short-polls the candidates read until
// current flips; only then do the display keys invalidate, so browse
// surfaces keep the previous artwork until the flip (no flash).
// «Сбросить к источнику» DELETEs the override (reset to chain, idempotent).
// The provenance footer reads the served document's _provenance.poster.

// FLIP_POLLS / FLIP_DELAY_MS — the short-poll budget. PUT writes the
// override immediately, so the flip usually lands on the first read; the
// loop exists for a read racing the write, not for the acquisition itself.
const FLIP_POLLS = 10;
const FLIP_DELAY_MS = 250;

// The server guard's budget, mirrored client-side for fast feedback
// (art.go IngestBytes is the authoritative verdict).
const MAX_UPLOAD_BYTES = 8 << 20; // 8 MiB
const UPLOAD_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// selectionFor — the candidate → PUT-vocabulary mapping (the served
// contract: a namespace candidate pins "src:<plugin_id>", the thumb
// candidate pins "thumb", the user candidate pins "user:" + the art oid its
// served proxy URL carries). The envelope's current backs the user card
// when its URL carries no parseable oid. Pure; exported for tests.
export function selectionFor(
  candidate: PosterCandidate,
  current: string,
): string {
  if (candidate.source === "thumb") {
    return "thumb";
  }
  if (candidate.source === "user") {
    const oid = candidate.url.split("/").pop() ?? "";
    return /^art_[0-9a-f]{64}$/.test(oid) ? `user:${oid}` : current;
  }
  return `src:${candidate.source}`;
}

// CandidateImage — one candidate's image by its served shape: a staged
// proxy URL rides the authenticated art channel (PosterFrame), the thumb
// candidate rides the existing media channel, and an unstaged raw remote
// URL renders hotlinked — lazy + onError-hide, the IdentifySeries
// precedent (a dead URL hides itself; never a broken-image glyph).
function CandidateImage(props: {
  candidate: PosterCandidate;
  entityId: string;
  name: string;
}): ReactElement {
  const c = props.candidate;
  const staged = c.source !== "thumb" && isServedArtPath(c.url);
  const artSrc = useArtworkObjectUrl(staged ? c.url : null);
  const thumbSrc = useItemMedia(
    c.source === "thumb" ? ENDPOINTS.itemMedia(props.entityId, "thumb") : null,
  );
  const [hotFailed, setHotFailed] = useState(false);
  useEffect(() => {
    setHotFailed(false); // a new URL gets a clean slate
  }, [c.url]);

  if (c.source === "thumb") {
    return (
      <PosterFrame
        src={thumbSrc}
        name={props.name}
        className="w-full rounded-md border object-cover"
      />
    );
  }
  if (staged) {
    return (
      <PosterFrame
        src={artSrc}
        name={props.name}
        className="w-full rounded-md border object-cover"
      />
    );
  }
  if (hotFailed) {
    return (
      <div
        aria-hidden="true"
        className="aspect-[2/3] w-full rounded-md border bg-muted"
      />
    );
  }
  return (
    <img
      src={c.url}
      alt={props.name}
      loading="lazy"
      onError={() => setHotFailed(true)}
      className="aspect-[2/3] w-full rounded-md border object-cover"
    />
  );
}

// CandidateCard — one candidate card: the image, the served source label,
// and the state row («Текущий» / «Сделать главным»); the active card reads
// as color (primary border + ring).
function CandidateCard(props: {
  candidate: PosterCandidate;
  current: string;
  entityId: string;
  name: string;
  busy: boolean;
  onSelect: (selection: string) => void;
}): ReactElement {
  const c = props.candidate;
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-md border p-2",
        c.current
          ? "border-primary ring-1 ring-primary"
          : "border-border",
      )}
      data-current={c.current ? "" : undefined}
    >
      <CandidateImage
        candidate={c}
        entityId={props.entityId}
        name={props.name}
      />
      <div className="flex items-center justify-between gap-2">
        <span
          className="min-w-0 truncate font-mono text-xs text-muted-foreground"
          title={c.source}
        >
          {c.source}
        </span>
        {c.current ? (
          <span className="shrink-0 text-xs font-semibold text-primary">
            Текущий
          </span>
        ) : (
          <button
            type="button"
            className="shrink-0 rounded-md border px-2 py-1 text-xs transition-colors hover:bg-accent disabled:opacity-50"
            disabled={props.busy}
            onClick={() => props.onSelect(selectionFor(c, props.current))}
          >
            Сделать главным
          </button>
        )}
      </div>
    </div>
  );
}

export function PosterOverlay(props: {
  open: boolean;
  kind: "series" | "item";
  entityId: string;
  name: string;
  provenance?: ProvenanceEntry; // the served document's _provenance.poster
  invalidate: readonly unknown[]; // the display reads (the useTitleOverride pattern)
  onClose: () => void;
}): ReactElement {
  const qc = useQueryClient();
  const candidates = usePosterCandidates(props.kind, props.entityId);
  const { put, upload, reset } = usePosterMutations(
    props.kind,
    props.entityId,
  );
  const [error, setError] = useState<ApiError | null>(null);
  const [note, setNote] = useState<string | null>(null); // the client pre-check line
  const fileInputRef = useRef<HTMLInputElement>(null);
  const busy = put.isPending || upload.isPending || reset.isPending;

  const invalidateDisplay = (): void => {
    void qc.invalidateQueries({ queryKey: [...props.invalidate] });
  };

  // select — PUT, then short-poll the candidates read until current flips;
  // only then invalidate the display keys. A failed poll never blocks the
  // write that already landed.
  const select = (selection: string): void => {
    setError(null);
    setNote(null);
    put.mutate(selection, {
      onError: setError,
      onSuccess: async () => {
        for (let attempt = 0; attempt < FLIP_POLLS; attempt += 1) {
          try {
            const data = await qc.fetchQuery({
              queryKey: ["posters", props.kind, props.entityId],
              queryFn: () => posterCandidates(props.kind, props.entityId),
            });
            if (data.current === selection) {
              break;
            }
          } catch {
            break;
          }
          await sleep(FLIP_DELAY_MS);
        }
        invalidateDisplay();
      },
    });
  };

  // pick — the client-side pre-check mirrors the server guard (type + size)
  // for fast feedback; the server stays authoritative — its canonical error
  // is the inline line when it disagrees.
  const pick = (file: File | undefined): void => {
    setError(null);
    setNote(null);
    if (file === undefined) {
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setNote("Файл больше 8 МиБ — выберите изображение поменьше.");
      return;
    }
    if (file.type !== "" && !UPLOAD_TYPES.has(file.type)) {
      setNote("Нужен JPG, PNG или WebP.");
      return;
    }
    upload.mutate(file, {
      onError: setError,
      onSuccess: invalidateDisplay,
    });
  };

  const resetToSource = (): void => {
    setError(null);
    setNote(null);
    reset.mutate(undefined, {
      onError: setError,
      onSuccess: invalidateDisplay,
    });
  };

  const served = candidates.data?.candidates ?? [];
  return (
    <DialogShell
      open={props.open}
      label={`Постер — ${props.name}`}
      width="wide"
      onClose={() => {
        if (!busy) {
          props.onClose();
        }
      }}
      onEscape={() => {
        if (!busy) {
          props.onClose();
        }
      }}
    >
      <div className="flex flex-col gap-3 p-4">
        <h2 className="text-base font-semibold">Постер — {props.name}</h2>

        {candidates.isLoading ? (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        ) : candidates.error ? (
          <p role="alert" className="text-sm text-destructive">
            {(candidates.error as ApiError).code}:{" "}
            {(candidates.error as ApiError).message}
          </p>
        ) : served.length === 0 ? (
          // The honest no-posters state: nothing usable anywhere in the
          // chain — say so, keep the upload path one glance away.
          <p className="text-sm text-muted-foreground">
            Плакатов нет — ни один источник не дал подходящее изображение.
            Загрузите своё ниже.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {served.map((c) => (
              <CandidateCard
                key={`${c.source}:${c.url}`}
                candidate={c}
                current={candidates.data?.current ?? ""}
                entityId={props.entityId}
                name={props.name}
                busy={busy}
                onSelect={select}
              />
            ))}
          </div>
        )}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error.code}: {error.message}
          </p>
        ) : null}
        {note ? (
          <p role="alert" className="text-sm text-destructive">
            {note}
          </p>
        ) : null}
        {upload.isPending ? (
          // The in-flight quiet line — never a spinner.
          <p className="text-xs text-muted-foreground">Загрузка…</p>
        ) : null}

        <div
          className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            pick(e.dataTransfer.files?.[0]);
          }}
        >
          Перетащите изображение сюда или{" "}
          <button
            type="button"
            className="underline underline-offset-2 disabled:opacity-50"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            выберите файл
          </button>{" "}
          (JPG, PNG или WebP — до 8 МиБ; кадр обрежется до 2:3)
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent disabled:opacity-50"
            disabled={busy}
            onClick={resetToSource}
          >
            Сбросить к источнику
          </button>
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
            onClick={props.onClose}
          >
            Закрыть
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          {props.provenance !== undefined
            ? `Источник плаката: ${props.provenance.plugin_id}${
                props.provenance.fetched_at !== undefined
                  ? ` · ${props.provenance.fetched_at}`
                  : ""
              }`
            : "Сведения об источнике плаката отсутствуют."}
        </p>
      </div>
    </DialogShell>
  );
}
