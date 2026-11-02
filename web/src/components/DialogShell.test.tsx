// SPDX-License-Identifier: Apache-2.0
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DialogShell, OVERLAY_HISTORY_KEY } from "@/components/DialogShell";

// The module's first test file — the History-Back mechanics (tv-mode I5):
// push-on-open, popstate runs the consumer's close policy (onEscape-else-
// onClose, the Esc matrix), every other close path consumes the pushed
// entry, and the stack never leaks entries. jsdom implements the session
// history for real — pushState/back/popstate all work; a back() dispatches
// popstate on a timer, so every traversal is followed by flushHistory().
// We avoid user-event (not a dep, like the Sidebar tests) and drive keys via
// fireEvent.

// The base entry each test starts from: replaceState-stamped in beforeEach,
// and the afterEach walk returns to it (jsdom's forward stack keeps consumed
// entries, so history.length alone proves nothing across tests).
const BASE_MARKER = { __shellBase: true };

function baseState(): Record<string, unknown> | null {
  return window.history.state as Record<string, unknown> | null;
}

async function flushHistory(): Promise<void> {
  // Settle a queued history traversal: the shell's deferred consumption is
  // one timer turn, and jsdom completes the back() traversal's popstate two
  // turns after that — three turns settle any pending history movement.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function back(): Promise<void> {
  await act(async () => {
    window.history.back();
  });
  await flushHistory();
}

beforeEach(() => {
  window.history.replaceState(BASE_MARKER, "");
});

afterEach(async () => {
  cleanup();
  // Let the last shell's deferred consumption fire, then walk back to the
  // stamped base entry — at most a few pushes deep.
  await flushHistory();
  for (let i = 0; i < 20; i++) {
    if (baseState()?.__shellBase) {
      break;
    }
    await back();
  }
});

function shellProps(
  overrides: Partial<Parameters<typeof DialogShell>[0]> = {},
): Parameters<typeof DialogShell>[0] & { onClose: ReturnType<typeof vi.fn> } {
  return {
    open: true,
    label: "shell under test",
    onClose: vi.fn(),
    children: <button>action</button>,
    ...overrides,
  } as Parameters<typeof DialogShell>[0] & { onClose: ReturnType<typeof vi.fn> };
}

describe("DialogShell history-Back", () => {
  it("pushes ONE overlay-marked entry on open and consumes it on close", async () => {
    const props = shellProps();
    const { rerender } = render(<DialogShell {...props} />);

    const baseLength = window.history.length;
    const state = baseState();
    expect(baseLength).toBeGreaterThan(0);
    expect(state?.[OVERLAY_HISTORY_KEY]).toBeTruthy();
    expect(props.onClose).not.toHaveBeenCalled();

    // The consumer flips open=false — the shell consumes the entry.
    rerender(<DialogShell {...props} open={false} />);
    await flushHistory();
    expect(baseState()?.__shellBase).toBe(true);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("Back closes through the onEscape policy (the Esc matrix)", async () => {
    const props = shellProps({ onEscape: vi.fn() });
    render(<DialogShell {...props} />);

    await back();

    expect(props.onEscape).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("Back closes through onClose when no onEscape is given", async () => {
    const props = shellProps();
    render(<DialogShell {...props} />);

    await back();

    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("Esc close consumes the entry — a later Back closes nothing twice", async () => {
    const props = shellProps();
    const { rerender } = render(<DialogShell {...props} />);

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(props.onClose).toHaveBeenCalledTimes(1);

    // The consumer's Esc policy flips open=false; the shell consumes the
    // pushed entry with its own back().
    rerender(<DialogShell {...props} open={false} />);
    await flushHistory();
    expect(baseState()?.__shellBase).toBe(true);

    // Back again (the traversal lands past our consumed entry, at the base)
    // must not re-fire any close.
    await back();
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(baseState()?.__shellBase).toBe(true);
  });

  it("unmount cleanup consumes the entry without throwing", async () => {
    const props = shellProps();
    const { unmount } = render(<DialogShell {...props} />);

    expect(() => unmount()).not.toThrow();
    await flushHistory();

    // Consumed — back at the base entry, not popped past it, no close fired.
    expect(baseState()?.__shellBase).toBe(true);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("cleanup after the user's Back consumes nothing — no over-pop", async () => {
    const props = shellProps({ onEscape: vi.fn() });
    const { rerender } = render(<DialogShell {...props} />);

    await back();
    expect(props.onEscape).toHaveBeenCalledTimes(1);

    // The consumer flips open=false after the Back close; the entry was
    // already consumed by that Back, so cleanup must unwind nothing.
    rerender(<DialogShell {...props} open={false} />);
    await flushHistory();

    expect(props.onEscape).toHaveBeenCalledTimes(1);
    expect(baseState()?.__shellBase).toBe(true);
  });

  it("open/close cycles never accumulate stale overlay entries", async () => {
    const props = shellProps();
    const { rerender } = render(<DialogShell {...props} />);
    // Captured AFTER the first render: baseLength already includes the one
    // live push — the invariant is that no cycle ever grows past it.
    const baseLength = window.history.length;

    for (let i = 0; i < 3; i++) {
      rerender(<DialogShell {...props} open={false} />);
      await flushHistory();
      rerender(<DialogShell {...props} open={true} />);
    }

    // Exactly one overlay entry sits on top of the base — each pushState
    // replaced the stale forward entry the previous consumption left.
    expect(window.history.length).toBe(baseLength);
    expect(baseState()?.[OVERLAY_HISTORY_KEY]).toBeTruthy();
  });
});
