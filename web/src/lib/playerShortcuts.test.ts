// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";

import {
  applyShortcut,
  SEEK_STEP_SECONDS,
  VOLUME_STEP,
  type ShortcutEvent,
} from "@/lib/playerShortcuts";

// The pure table's contracts (watch-flow-polish 3.4): every transport key
// normalizes onto exactly its action, the form-focus guard silences the
// table, and the digit keys seek by tenths. Plain objects stand in for
// KeyboardEvent — the module reads only key + target, so no DOM is needed.

function makeActions() {
  return {
    togglePlay: vi.fn(),
    seekBy: vi.fn(),
    stepVolume: vi.fn(),
    toggleFullscreen: vi.fn(),
    nextEpisode: vi.fn(),
    prevEpisode: vi.fn(),
    seekToFraction: vi.fn(),
  };
}

function keyEvent(
  key: string,
  target: EventTarget | null = null,
): ShortcutEvent {
  return { key, target };
}

// callCount — the total number of action invocations across the whole
// actions object; the table must call EXACTLY one action per keystroke.
function callCount(actions: ReturnType<typeof makeActions>): number {
  return Object.values(actions).reduce(
    (sum, fn) => sum + fn.mock.calls.length,
    0,
  );
}

describe("playerShortcuts — the pure key→action table (watch-flow-polish 3.4)", () => {
  it("maps_every_transport_key", () => {
    // Every binding, asserted on its action's exact call AND on the whole
    // object staying otherwise silent — the table is exact, not prefix- or
    // fallthrough-matched.
    const cases: Array<[string, (actions: ReturnType<typeof makeActions>) => void]> = [
      [" ", (a) => expect(a.togglePlay).toHaveBeenCalledTimes(1)],
      ["ArrowLeft", (a) => expect(a.seekBy).toHaveBeenCalledWith(-SEEK_STEP_SECONDS)],
      ["ArrowRight", (a) => expect(a.seekBy).toHaveBeenCalledWith(SEEK_STEP_SECONDS)],
      ["ArrowUp", (a) => expect(a.stepVolume).toHaveBeenCalledWith(VOLUME_STEP)],
      ["ArrowDown", (a) => expect(a.stepVolume).toHaveBeenCalledWith(-VOLUME_STEP)],
      ["f", (a) => expect(a.toggleFullscreen).toHaveBeenCalledTimes(1)],
      ["F", (a) => expect(a.toggleFullscreen).toHaveBeenCalledTimes(1)],
      ["n", (a) => expect(a.nextEpisode).toHaveBeenCalledTimes(1)],
      ["N", (a) => expect(a.nextEpisode).toHaveBeenCalledTimes(1)],
      ["p", (a) => expect(a.prevEpisode).toHaveBeenCalledTimes(1)],
      ["P", (a) => expect(a.prevEpisode).toHaveBeenCalledTimes(1)],
      // 0-9 seek to the matching tenth — digit d → fraction d/10.
      ["0", (a) => expect(a.seekToFraction).toHaveBeenCalledWith(0)],
      ["1", (a) => expect(a.seekToFraction).toHaveBeenCalledWith(0.1)],
      ["3", (a) => expect(a.seekToFraction).toHaveBeenCalledWith(0.3)],
      ["5", (a) => expect(a.seekToFraction).toHaveBeenCalledWith(0.5)],
      ["9", (a) => expect(a.seekToFraction).toHaveBeenCalledWith(0.9)],
    ];

    for (const [key, assertion] of cases) {
      const actions = makeActions();
      const handled = applyShortcut(keyEvent(key), actions);
      expect(handled).toBe(true);
      assertion(actions);
      expect(callCount(actions)).toBe(1);
    }
  });

  it("ignores_keystrokes_into_form_fields", () => {
    // The guard: input, textarea, select, and contenteditable targets all
    // silence the table — for transport keys AND digits alike. The
    // contenteditable element sits IN the document (isContentEditable is a
    // rendered-tree fact; a detached element always reads false).
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const select = document.createElement("select");
    const editable = document.createElement("div");
    // jsdom never computes isContentEditable (a rendered-tree fact), so the
    // contenteditable host is stamped with the property the guard reads —
    // the test pins the READING, not jsdom's stub.
    Object.defineProperty(editable, "isContentEditable", {
      value: true,
      configurable: true,
    });
    document.body.append(editable);

    for (const target of [input, textarea, select, editable]) {
      for (const key of [" ", "ArrowRight", "ArrowUp", "f", "n", "5"]) {
        const actions = makeActions();
        expect(applyShortcut(keyEvent(key, target), actions)).toBe(false);
        expect(callCount(actions)).toBe(0);
      }
    }

    // Control: the same keys fire with a non-text target, so the silence
    // above is the GUARD's doing, not a broken table.
    const actions = makeActions();
    expect(applyShortcut(keyEvent(" ", document.body), actions)).toBe(true);
    expect(actions.togglePlay).toHaveBeenCalledTimes(1);

    // Unmapped keys are ignored everywhere — no action, not handled.
    const idle = makeActions();
    expect(applyShortcut(keyEvent("x", document.body), idle)).toBe(false);
    expect(callCount(idle)).toBe(0);
    // A null target (no focused element) is not a text entry either.
    expect(applyShortcut(keyEvent(" ", null), makeActions())).toBe(true);
  });
});
