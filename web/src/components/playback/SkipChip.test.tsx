// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import SkipChip from "@/components/playback/SkipChip";
import type { SkipSection } from "@/lib/skipSections";

// watch-flow-polish 3.1 — the chip's two acceptance axes: it renders ONLY
// while the playhead is inside a classified range (intro copy for intro
// ranges, credits copy for credits ranges) and fades after 4 s inside the
// range, returning when a seek lands inside again; and activation reports a
// beat past the range's end — the Player routes that through its standard
// seekTo (asserted here through the recorded onSkip sink).

const RANGES: SkipSection[] = [
  { kind: "intro", start: 0, end: 90 },
  { kind: "credits", start: 4000, end: 4100 },
];

function renderChip(currentTime: number, sections: SkipSection[] = RANGES, onSkip = vi.fn()) {
  const view = render(
    <SkipChip sections={sections} currentTime={currentTime} onSkip={onSkip} />,
  );
  return { ...view, onSkip };
}

function theChip(): HTMLElement {
  return screen.getByTestId("skip-chip");
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("chip_renders_only_inside_classified_range", () => {
  it("renders the intro copy inside an intro range and the credits copy inside a credits range", () => {
    const { rerender } = renderChip(45);
    expect(screen.getByText("Пропустить вступление")).toBeDefined();

    rerender(<SkipChip sections={RANGES} currentTime={4050} onSkip={vi.fn()} />);
    expect(screen.getByText("Пропустить титры")).toBeDefined();
  });

  it("renders no chip outside every classified range (and none without ranges)", () => {
    const { rerender } = renderChip(100); // between the ranges
    expect(screen.queryByTestId("skip-chip")).toBeNull();

    rerender(<SkipChip sections={RANGES} currentTime={5000} onSkip={vi.fn()} />);
    expect(screen.queryByTestId("skip-chip")).toBeNull();

    rerender(<SkipChip sections={[]} currentTime={45} onSkip={vi.fn()} />);
    expect(screen.queryByTestId("skip-chip")).toBeNull();
  });

  it("fades after 4 s inside the range and returns when a seek lands inside again", () => {
    vi.useFakeTimers();
    const { rerender } = renderChip(45);
    expect(theChip().className).not.toContain("opacity-0");

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(theChip().className).toContain("opacity-0");
    expect(theChip().className).toContain("pointer-events-none");

    // A seek out unmounts the chip; a seek back inside returns it, visible,
    // with the fade timer re-armed.
    rerender(<SkipChip sections={RANGES} currentTime={200} onSkip={vi.fn()} />);
    expect(screen.queryByTestId("skip-chip")).toBeNull();

    rerender(<SkipChip sections={RANGES} currentTime={50} onSkip={vi.fn()} />);
    expect(theChip().className).not.toContain("opacity-0");

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(theChip().className).toContain("opacity-0");
  });
});

describe("activation_seeks_past_section_end", () => {
  it("seeks a beat past the intro range's end through the wired sink", () => {
    const { onSkip } = renderChip(45);
    fireEvent.click(theChip());
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledWith(90.5);
  });

  it("seeks a beat past the credits range's end", () => {
    const { onSkip } = renderChip(4050);
    fireEvent.click(theChip());
    expect(onSkip).toHaveBeenCalledWith(4100.5);
  });
});
