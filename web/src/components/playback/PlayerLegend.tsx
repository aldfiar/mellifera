// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from "react";

// BINDINGS — the legend rows: the key and what it does, verbatim the
// watch-flow-polish 3.4 map that lib/playerShortcuts normalizes (Space
// play/pause · ←/→ ±10 s · ↑/↓ volume · F fullscreen · N/P next/prev
// episode · 0-9 a tenth of the media). Pure presentation — no media-type
// or plugin literals ride here.
const BINDINGS: Array<{ keys: string; does: string }> = [
  { keys: "Space", does: "play / pause" },
  { keys: "←/→", does: "±10 s" },
  { keys: "↑/↓", does: "volume" },
  { keys: "F", does: "fullscreen" },
  { keys: "N/P", does: "next / prev episode" },
  { keys: "0-9", does: "tenth of the media" },
];

// PlayerLegend — the keyboard map row UNDER the player (watch-flow-polish
// 3.4): one compact, muted line of key/descriptor pairs. Desktop-only by
// construction: display none by default, flex under a `@media (pointer:
// fine)` arbitrary Tailwind variant — a coarse-pointer (touch) surface
// never lays the row out. jsdom evaluates no media queries, so the tests
// assert the class MARKERS (the cardact-trigger MANUAL TEST NOTE
// precedent; the visual gate is accepted by inspection).
export default function PlayerLegend(): ReactElement {
  return (
    <p
      data-testid="player-legend"
      className="hidden flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground [@media(pointer:fine)]:flex"
    >
      {BINDINGS.map((binding) => (
        <span key={binding.keys} className="whitespace-nowrap">
          <kbd className="rounded border bg-muted/40 px-1 font-mono text-[0.7rem] font-medium">
            {binding.keys}
          </kbd>{" "}
          {binding.does}
        </span>
      ))}
    </p>
  );
}
