// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState, type ReactElement } from "react";

import { skipSectionAt, type SkipSection } from "@/lib/skipSections";

// SkipChip — the skip intro/credits affordance (watch-flow-polish 3.1): a
// soft chip over the video's bottom-right corner, rendered ONLY while the
// playhead is inside a classified range (lib/skipSections — the SPA never
// fabricates a skip range), fading away after 4 s inside the range and
// returning when a seek lands inside again. Activation reports the seek
// target — a beat past the range's end — and the Player routes it through
// its existing standard seekTo (no new seek machinery). Color is state:
// intro sky, credits violet — soft pastel, never a pill.

// SKIP_FADE_MS — how long the chip stays fully visible inside the range
// before the opacity transition fades it (still rendered, just inert).
const SKIP_FADE_MS = 4000;

// SKIP_SEEK_PAST_SECONDS — the beat past the range's end activation seeks
// to: clearing the boundary keeps the (end-exclusive) range closed even if
// the player snaps the playhead a frame short.
const SKIP_SEEK_PAST_SECONDS = 0.5;

const CHIP_COPY: Record<SkipSection["kind"], string> = {
  intro: "Пропустить вступление",
  credits: "Пропустить титры",
};

const CHIP_TONE: Record<SkipSection["kind"], string> = {
  intro: "bg-sky-100/95 text-sky-900 hover:bg-sky-200/95",
  credits: "bg-violet-100/95 text-violet-900 hover:bg-violet-200/95",
};

export interface SkipChipProps {
  /** The classified ranges (lib/skipSections) the playhead is matched against. */
  sections: SkipSection[];
  /** The playhead position in seconds (the Player's timeupdate tracking). */
  currentTime: number;
  /** Activation target sink — the Player's standard seekTo. */
  onSkip: (seconds: number) => void;
}

export default function SkipChip(props: SkipChipProps): ReactElement | null {
  const { sections, currentTime, onSkip } = props;
  const active = skipSectionAt(sections, currentTime);
  const [faded, setFaded] = useState(false);

  // The fade timer runs per in-range stay: entering (or re-entering after a
  // seek out and back — `active` flips null → section there) shows the chip
  // and arms the 4 s fade; leaving unmounts it.
  useEffect(() => {
    if (!active) {
      return;
    }
    setFaded(false);
    const timer = window.setTimeout(() => setFaded(true), SKIP_FADE_MS);
    return () => window.clearTimeout(timer);
  }, [active]);

  if (!active) {
    return null;
  }

  return (
    <button
      type="button"
      data-testid="skip-chip"
      onClick={() => onSkip(active.end + SKIP_SEEK_PAST_SECONDS)}
      className={`absolute bottom-4 right-4 z-10 rounded-lg px-4 py-2 text-sm font-medium shadow-lg transition-opacity duration-700 ${
        faded ? "pointer-events-none opacity-0" : "opacity-100"
      } ${CHIP_TONE[active.kind]}`}
    >
      {CHIP_COPY[active.kind]}
    </button>
  );
}
