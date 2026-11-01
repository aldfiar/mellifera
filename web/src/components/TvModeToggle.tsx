// SPDX-License-Identifier: Apache-2.0
import { useState } from "react";
import type { ReactElement } from "react";

import { Button } from "@/components/ui/button";
import { applyTvMode, readTvOverride, TV_KEY } from "@/lib/tvmode";
import type { TvOverride } from "@/lib/tvmode";
import { cn } from "@/lib/utils";

// TvModeToggle — the three-state «Режим ТВ» override control (tv-mode group 6,
// design D9): Авто / Вкл / Выкл, rendered in the sidebar's pinned side-foot
// beside ThemeToggle — the display-preferences home, reachable on a TV through
// the focusable menu FAB (D9: the operator is nowhere near an admin surface at
// setup time). The mockup's tri-state panel idiom: three buttons in a row, the
// current selection marked by a COLOR change (the locked idiom), one
// aria-pressed per state.
//
// Contract (spec: The manual «Режим ТВ» override always wins):
//   - selecting writes mellifera.tv ("auto" | "on" | "off") — the value is
//     imported from lib/tvmode (INV-fixed-key: drift impossible by
//     construction), guarded try/catch exactly like ThemeToggle's storeTheme —
//     an unavailable store degrades to session-only behavior, never a crash.
//   - selecting applies the class LIVE through applyTvMode() — THE single
//     class-writer contract (design I1): this component never touches
//     documentElement itself, so the class is never set by two divergent
//     code paths (the boot apply in lib/tvmode.ts is the other caller of the
//     same writer).
//   - the initial selection reads through readTvOverride, which floors an
//     absent/invalid/unreadable stored value to "auto" (the autodetect
//     default) — the control renders what the resolver would actually obey.

// TRI_OPTIONS — the three control states in mockup order, each with its
// stored value (exact, under TV_KEY) and its Russian label.
const TRI_OPTIONS: ReadonlyArray<{ value: TvOverride; label: string }> = [
  { value: "auto", label: "Авто" },
  { value: "on", label: "Вкл" },
  { value: "off", label: "Выкл" },
];

export function TvModeToggle(): ReactElement {
  // override is React state ONLY so the aria-pressed selection re-renders;
  // the DOM effect is applyTvMode's class toggle (kept out of render, the
  // ThemeToggle posture).
  const [override, setOverride] = useState<TvOverride>(() => readTvOverride());

  function onSelect(next: TvOverride): void {
    // Persist first (best-effort): a successful write is what applyTvMode
    // reads back, so store and class never disagree. A throwing store is
    // tolerated — the selection still registers in state and the apply path
    // still runs (session-only degradation, the lib/auth.ts posture).
    try {
      localStorage.setItem(TV_KEY, next);
    } catch {
      // see readTvOverride in lib/tvmode.ts — session-only from here
    }
    // design I1: the single writer applies the class live (before any paint
    // of the new selection); it reads the just-written ruling back from
    // storage, so «Режим ТВ» lands without a reload.
    void applyTvMode();
    setOverride(next);
  }

  return (
    <div role="group" aria-label="Режим ТВ" className="flex items-center gap-1">
      {TRI_OPTIONS.map(({ value, label }) => (
        <Button
          key={value}
          type="button"
          variant="outline"
          size="sm"
          aria-pressed={override === value}
          onClick={() => onSelect(value)}
          title={`Режим ТВ: ${label}`}
          className={cn(
            "h-7 px-2.5 text-xs",
            override === value &&
              "border-primary bg-primary/15 text-primary",
          )}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
