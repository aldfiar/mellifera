// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from "react";

// TvDebugOverlay (tv-debug-overlay 1.1) — the on-screen TV diagnostic, gated
// on ?tvdebug=1 in the query string: SPA-only, zero backend, renders null
// without the param so the boot DOM is byte-identical otherwise. It floats
// above every app surface (fixed, top-right, max z-index) and shows LIVE
// what the ladder and the operator actually see on the real device: both
// UAs (the JS-visible navigator.userAgent and the server-observed
// mellifera-client-ua meta), the viewport/screen geometry, touch points,
// the Chromium userAgentData probe, the `tv` class state (MutationObserver
// on <html>'s class attribute), the raw mellifera.tv storage value, and two
// rolling logs — the last 10 keydowns and last 5 pointer moves — so a D-pad
// press on the TV is visible exactly as it arrives.
//
// Styling is inline on the panel: this is a debug tool, not tv-mode visual
// surface, so the .tv-scoped no-bare-px CSS contract has nothing to police.
//
// The client-ua meta is read HERE directly with the same defensive posture
// as tvmode.ts's readServerUserAgent — tvmode's export surface is not
// touched and not grown.

// META_NAME — the shell-injected UA meta (fix-tv-server-ua).
const META_NAME = "mellifera-client-ua";

// TV_STORAGE_KEY — the «Режим ТВ» storage key; the raw value is shown, the
// interpretation stays in tvmode.
const TV_STORAGE_KEY = "mellifera.tv";

// KEY_LOG_LIMIT / POINTER_LOG_LIMIT — the rolling log depths.
const KEY_LOG_LIMIT = 10;
const POINTER_LOG_LIMIT = 5;

// POINTER_EVENT_TYPES — the pointer/mouse events the pointer log records.
const POINTER_EVENT_TYPES = ["pointermove", "pointerdown", "mousemove"] as const;

// KeyEntry — one keydown, exactly the fields a TV remote press carries.
interface KeyEntry {
  key: string;
  code: string;
  keyCode: number;
}

// PointerEntry — one pointer/mouse position sample.
interface PointerEntry {
  type: string;
  clientX: number;
  clientY: number;
}

// UADataLike — the Chromium-only navigator.userAgentData slice this overlay
// reports on (presence + whether the high-entropy probe is callable).
// Absent on Safari/Firefox/jsdom; TS's DOM lib does not type it.
interface UADataLike {
  getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>>;
}

// isTvDebugRequested — the query-param gate: only ?tvdebug=1 mounts the
// panel; every other value (and the absent param) is off.
function isTvDebugRequested(): boolean {
  return new URLSearchParams(window.location.search).get("tvdebug") === "1";
}

// readClientUaMeta — the mellifera-client-ua meta content, floored to
// "(absent)" when the meta is missing, empty, whitespace-only, or the
// document is unusable — tvmode.ts's readServerUserAgent posture, read
// locally so the overlay stays decoupled from tvmode's exports.
function readClientUaMeta(): string {
  try {
    const content = document
      .querySelector(`meta[name="${META_NAME}"]`)
      ?.getAttribute("content");
    return typeof content === "string" && content.trim().length > 0
      ? content.trim()
      : "(absent)";
  } catch {
    return "(absent)";
  }
}

// readTvStorage — the raw mellifera.tv value, guarded like tvmode's
// readTvOverride: an unavailable or throwing store floors to "(unavailable)",
// an absent value to "(absent)". The overlay never interprets the value.
function readTvStorage(): string {
  try {
    return localStorage.getItem(TV_STORAGE_KEY) ?? "(absent)";
  } catch {
    return "(unavailable)";
  }
}

// describeUserAgentData — the userAgentData line: absent, or present with
// the high-entropy probe's callability (the model hint tvmode's upgrade-only
// probe depends on).
function describeUserAgentData(): string {
  const uaData = (navigator as Navigator & { userAgentData?: UADataLike })
    .userAgentData;
  if (!uaData) {
    return "(absent)";
  }
  return typeof uaData.getHighEntropyValues === "function"
    ? "present, getHighEntropyValues callable"
    : "present, getHighEntropyValues missing";
}

// TvDebugOverlay — see the module comment. All listeners and the observer
// arm only when the gate is open; the component renders null otherwise.
export default function TvDebugOverlay() {
  const enabled = isTvDebugRequested();

  const [keyLog, setKeyLog] = useState<KeyEntry[]>([]);
  const [pointerLog, setPointerLog] = useState<PointerEntry[]>([]);
  const [tvClassOn, setTvClassOn] = useState(() =>
    document.documentElement.classList.contains("tv"),
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }
    // Keydown log — window-level, newest first, capped at KEY_LOG_LIMIT.
    const onKeyDown = (event: KeyboardEvent): void => {
      setKeyLog((prev) =>
        [
          { key: event.key, code: event.code, keyCode: event.keyCode },
          ...prev,
        ].slice(0, KEY_LOG_LIMIT),
      );
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    // Pointer log — one handler over the three tracked types, newest first,
    // capped at POINTER_LOG_LIMIT.
    const onPointer = (event: PointerEvent | MouseEvent): void => {
      setPointerLog((prev) =>
        [
          { type: event.type, clientX: event.clientX, clientY: event.clientY },
          ...prev,
        ].slice(0, POINTER_LOG_LIMIT),
      );
    };
    for (const type of POINTER_EVENT_TYPES) {
      window.addEventListener(type, onPointer);
    }
    return () => {
      for (const type of POINTER_EVENT_TYPES) {
        window.removeEventListener(type, onPointer);
      }
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    // The `tv` class line stays LIVE: observe <html>'s class attribute so a
    // toggle that bypasses this component (the boot apply, the «Режим ТВ»
    // control) still flips the line.
    const observer = new MutationObserver(() => {
      setTvClassOn(document.documentElement.classList.contains("tv"));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, [enabled]);

  if (!enabled) {
    return null;
  }

  // Static device snapshot — read at mount; the operator reloads (?tvdebug=1
  // is in the URL) after a change that would alter these.
  const ua = navigator.userAgent;
  const viewport = `viewport: ${window.innerWidth}x${window.innerHeight} dpr=${window.devicePixelRatio}`;
  const screenLine = `screen: ${window.screen.width}x${window.screen.height}`;

  return (
    <div
      style={{
        position: "fixed",
        top: 8,
        right: 8,
        zIndex: 2147483647,
        maxWidth: "40vw",
        padding: 8,
        fontFamily: "monospace",
        fontSize: 12,
        lineHeight: 1.4,
        color: "#e8e8e8",
        background: "rgba(0, 0, 0, 0.75)",
        borderRadius: 4,
        overflowWrap: "break-word",
        pointerEvents: "none",
      }}
    >
      <div style={{ fontWeight: "bold" }}>TV DEBUG</div>
      <div>ua: {ua}</div>
      <div>client-ua meta: {readClientUaMeta()}</div>
      <div>{viewport}</div>
      <div>{screenLine}</div>
      <div>touch points: {navigator.maxTouchPoints ?? 0}</div>
      <div>userAgentData: {describeUserAgentData()}</div>
      <div>tv class: {tvClassOn ? "ON" : "OFF"}</div>
      <div>mellifera.tv: {readTvStorage()}</div>
      <div style={{ marginTop: 4, fontWeight: "bold" }}>
        keys (newest first, last {KEY_LOG_LIMIT}):
      </div>
      {keyLog.map((entry, i) => (
        <div key={`k${i}`}>
          {`key=${entry.key} code=${entry.code} keyCode=${entry.keyCode}`}
        </div>
      ))}
      <div style={{ marginTop: 4, fontWeight: "bold" }}>
        pointer (newest first, last {POINTER_LOG_LIMIT}):
      </div>
      {pointerLog.map((entry, i) => (
        <div key={`p${i}`}>
          {`${entry.type} x=${entry.clientX} y=${entry.clientY}`}
        </div>
      ))}
    </div>
  );
}
