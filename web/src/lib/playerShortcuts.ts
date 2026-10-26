// SPDX-License-Identifier: Apache-2.0

// playerShortcuts — the watch view's keyboard map as a PURE key→action table
// (watch-flow-polish 3.4, design D6). No React, no DOM queries: a keydown
// event and an actions object come in; effect calls go out. The watch view
// (ItemDetail) owns the ONE window keydown listener and the actions' bodies
// (the video DOM route + episode navigation). Layer 7 (TV mode) will
// normalize remote media keys onto the SAME table — this module is the
// single normalization point, so transport behavior cannot fork per input
// device.
//
// Bindings (spec "Player keyboard control and legend"):
//   Space  play/pause          ←/→   seek ∓/±10 s
//   ↑/↓    volume step         F     fullscreen
//   N/P    next/prev episode   0-9   seek to the matching tenth
//
// Keystrokes are ignored while a form field (input/textarea/select) or a
// contenteditable element owns focus — the guard reads ONLY event.target.

// SEEK_STEP_SECONDS — the ←/→ playhead step.
export const SEEK_STEP_SECONDS = 10;

// VOLUME_STEP — the ↑/↓ step over the player's volume model: the native
// HTMLMediaElement [0, 1] volume (the <video controls> element owns the
// volume UI; there is no custom control to mirror a step from).
export const VOLUME_STEP = 0.1;

// PlayerShortcutActions — the effects the table's normalized keys map onto.
// The watch view supplies implementations closing over the player's video
// element and the series' episode list; the table never looks at either.
// Unresolvable states (no video mounted, no adjacent episode) are no-ops on
// the implementation side — the table always calls.
export interface PlayerShortcutActions {
  togglePlay(): void;
  /** deltaSeconds: −SEEK_STEP_SECONDS (←) or +SEEK_STEP_SECONDS (→). */
  seekBy(deltaSeconds: number): void;
  /** delta: +VOLUME_STEP (↑) or −VOLUME_STEP (↓), over the native [0, 1] volume. */
  stepVolume(delta: number): void;
  toggleFullscreen(): void;
  /** The series' adjacent episode item; no-op when none resolves (no wrap). */
  nextEpisode(): void;
  prevEpisode(): void;
  /** fraction: digit/10 — a tenth of the media's duration. */
  seekToFraction(fraction: number): void;
}

// ShortcutEvent — the structural subset of KeyboardEvent the table reads.
// The wiring passes the real keydown event; tests pass plain objects.
export interface ShortcutEvent {
  key: string;
  target: EventTarget | null;
}

// isTextEntryTarget — the focus guard: true while the event's target is a
// form field or a contenteditable element (the operator is typing, not
// driving transport). Reads only the target the event carries.
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

// SHORTCUTS — the table: key → the action call that key normalizes to.
// Letter keys answer both cases (Caps Lock is not a transport mode); the
// digit keys 0-9 are folded in programmatically — digit d seeks to the
// d-th tenth (d/10) of the media.
const SHORTCUTS: Record<string, (actions: PlayerShortcutActions) => void> = {
  " ": (a) => a.togglePlay(),
  ArrowLeft: (a) => a.seekBy(-SEEK_STEP_SECONDS),
  ArrowRight: (a) => a.seekBy(SEEK_STEP_SECONDS),
  ArrowUp: (a) => a.stepVolume(VOLUME_STEP),
  ArrowDown: (a) => a.stepVolume(-VOLUME_STEP),
  f: (a) => a.toggleFullscreen(),
  F: (a) => a.toggleFullscreen(),
  n: (a) => a.nextEpisode(),
  N: (a) => a.nextEpisode(),
  p: (a) => a.prevEpisode(),
  P: (a) => a.prevEpisode(),
  ...Object.fromEntries(
    Array.from({ length: 10 }, (_, digit) => [
      String(digit),
      (actions: PlayerShortcutActions): void => {
        actions.seekToFraction(digit / 10);
      },
    ]),
  ),
};

// applyShortcut — normalize ONE keystroke onto its action. Returns whether
// the key was handled; the CALLER drops the browser default (Space's scroll,
// the arrows') when true — the event stays untouched here. Text-entry focus
// and unmapped keys are ignored (false, nothing called).
export function applyShortcut(
  event: ShortcutEvent,
  actions: PlayerShortcutActions,
): boolean {
  if (isTextEntryTarget(event.target)) {
    return false;
  }
  const handler = SHORTCUTS[event.key];
  if (handler === undefined) {
    return false;
  }
  handler(actions);
  return true;
}
