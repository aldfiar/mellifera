// SPDX-License-Identifier: Apache-2.0
import { apiRequest, apiRequestVoid } from "@/lib/api";

// The SPA relay client core (client-relayed-fetch 6.1): the pure,
// framework-free half of the browser relay loop — claim one served
// descriptor, execute it verbatim against the upstream, post the outcome
// back. No React, no queries (the nextup.ts precedent); the only intended
// driver is the relayWorker hook (6.2). Wire vocabulary mirrors the Go json
// tags EXACTLY (INV-verbatim-field-names): internal/store/relayjobs.go
// PlanSpec / RelayResult and internal/api/relay.go relayClaimResponse — the
// claim descriptor projects store.PlanSpec unchanged, its body []byte
// arriving as the base64 string encoding/json emits.

// relayClaimResponse (internal/api/relay.go) — POST /api/v1/relay/claim 200
// body: the server-authored descriptor for ONE claimed job. purpose carries
// the server's "enrich" | "search" vocabulary; the plan executes in order.
// A 204 (nothing claimable) has no body — claimOnce maps it to null.
export interface RelayClaim {
  id: number; // int64
  purpose: string;
  plan: RelayPlanSpec[];
}

// store.PlanSpec — one request inside the claimed plan, fields verbatim
// (the json tags ARE the wire). body is the base64 string form of the served
// []byte (omitempty: absent for bodyless requests); headers is omitempty too.
export interface RelayPlanSpec {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  binary_safe: boolean;
  timeout_seconds: number;
  min_interval_ms: number;
}

// store.RelayResult — the outcome postResult POSTs to
// /api/v1/relay/{id}/result. Optional fields mirror the Go omitempty tags:
// a done outcome carries {http_status, headers?, body?}; a failed one is
// error-only ({error}) — the 4.2 wire rule ("error set, response fields
// absent, for failed").
export interface RelayResult {
  http_status?: number;
  headers?: Record<string, string>;
  // base64 — the ONLY string encoding encoding/json accepts into the Go
  // []byte field; raw text would fail the decode server-side (400).
  body?: string;
  error?: string;
}

// RelayClock — the injectable time seam of executeDescriptor: now() reads
// the wall clock for pacing stamps, delay() suspends between executions.
// Production uses the real clock; tests drive a manual one so min_interval
// pacing is asserted without real waits.
export interface RelayClock {
  now(): number;
  delay(ms: number): Promise<void>;
}

const realClock: RelayClock = {
  now: () => Date.now(),
  delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

// lastRelayExecutionAt — module-level last-execution stamp (epoch ms) behind
// the best-effort min_interval_ms pacing: start-to-start spacing across
// descriptors and jobs served by this module. resetRelayPacing clears it
// (tests; harmless elsewhere).
let lastRelayExecutionAt: number | null = null;

export function resetRelayPacing(): void {
  lastRelayExecutionAt = null;
}

// base64ToBytes / bytesToBase64 — the descriptor body's round trip. btoa/
// atob are the browser primitives; the chunked String.fromCharCode keeps
// large payloads off the argument-count limit. The ArrayBuffer-backed
// Uint8Array is what BodyInit accepts (a SharedArrayBuffer view is not).
function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// RELAY_CLAIM / resultPath — the only /api URLs this module touches (the
// 6.1 allowlist; the descriptor's own served url is the third and last).
const RELAY_CLAIM = "/api/v1/relay/claim";

function resultPath(id: number): string {
  return `/api/v1/relay/${String(id)}/result`;
}

// claimOnce — one authenticated claim poll: POST /api/v1/relay/claim through
// the house wrapper (bearer header, 401 rotation, canonical ApiError — none
// of it re-implemented here). Returns the descriptor, or null when the queue
// had nothing to do. The 204 answer carries an empty body, and the wrapper's
// verbatim 2xx parse is JSON.parse("") — its SyntaxError IS the
// nothing-to-do signal (the served 200 body is writeJSON-valid by
// construction; a truncated 200 would read as an idle poll, and the lease
// hands the job back — accepted). Every failure that matters propagates
// untouched: a 401 has ALREADY cleared the credential and redirected inside
// the wrapper (the hook's stop signal), and other non-2xx answers are the
// canonical ApiError.
export async function claimOnce(): Promise<RelayClaim | null> {
  try {
    return await apiRequest<RelayClaim>(RELAY_CLAIM, { method: "POST" });
  } catch (err) {
    if (err instanceof SyntaxError) {
      return null; // 204 — nothing claimable
    }
    throw err;
  }
}

// transportError — the error-only outcome's message: a definitive timeout
// word when the AbortController fired (the one case a client can name), the
// platform's own message otherwise (network failures surface as TypeError).
// The abort is detected by err.name — DOMException does not extend Error on
// every runtime (jsdom's does not).
function transportError(spec: RelayPlanSpec, err: unknown): string {
  const name =
    typeof err === "object" && err !== null
      ? (err as { name?: unknown }).name
      : undefined;
  if (name === "AbortError") {
    return spec.timeout_seconds > 0
      ? `timeout after ${spec.timeout_seconds}s`
      : "aborted";
  }
  return err instanceof Error ? err.message : String(err);
}

// executeDescriptor — runs the served request VERBATIM: the descriptor's
// method/url/headers go out unmodified (never merged, defaulted, or fixed up
// client-side — the byte-identical posture the server's allowlist pins), the
// base64 body rides as decoded bytes, redirects follow (the fetch default —
// parity with http.DefaultClient). timeout_seconds arms an AbortController —
// only when > 0, exactly the server executor's own rule (fetch.go: 0 means
// unbounded). min_interval_ms paces start-to-start between executions
// best-effort via the module-level stamp and the injectable clock.
//
// NEVER THROWS for upstream/transport outcomes: any HTTP status is a result
// (a non-2xx upstream is still a posted outcome — the transport worked), and
// a transport failure (abort, network, cut mid-body) is an error-only result.
// The caller posts whatever comes back.
export async function executeDescriptor(
  spec: RelayPlanSpec,
  clock: RelayClock = realClock,
): Promise<RelayResult> {
  // Pacing first: wait out the remainder of min_interval_ms since the last
  // execution this module started, then stamp this one's start.
  if (spec.min_interval_ms > 0 && lastRelayExecutionAt !== null) {
    const earliest = lastRelayExecutionAt + spec.min_interval_ms;
    const now = clock.now();
    if (now < earliest) {
      await clock.delay(earliest - now);
    }
  }
  lastRelayExecutionAt = clock.now();

  const controller = new AbortController();
  const timer =
    spec.timeout_seconds > 0
      ? setTimeout(() => controller.abort(), spec.timeout_seconds * 1000)
      : null;
  try {
    const res = await fetch(spec.url, {
      method: spec.method,
      headers: spec.headers,
      body: spec.body !== undefined ? base64ToBytes(spec.body) : undefined,
      signal: controller.signal,
      // redirect stays the fetch default ("follow")
    });

    const out: RelayResult = { http_status: res.status };
    const headers: Record<string, string> = {};
    res.headers.forEach((value, name) => {
      headers[name] = value;
    });
    if (Object.keys(headers).length > 0) {
      out.headers = headers; // omitempty parity — an empty map is absent
    }
    // binary_safe: the payload may be arbitrary bytes — harvest losslessly
    // from the raw buffer. Its absence: expected text — harvest through the
    // UTF-8 decode. BOTH then ride the base64 []byte string the result
    // route's Go decode requires (encoding/json decodes []byte STRICTLY
    // base64 — a raw-text body would 400 the POST; the worktree wire wins
    // over the contract's "raw under its absence" shorthand).
    const bytes = spec.binary_safe
      ? new Uint8Array(await res.arrayBuffer())
      : new TextEncoder().encode(await res.text());
    if (bytes.length > 0) {
      out.body = bytesToBase64(bytes);
    }
    return out;
  } catch (err) {
    return { error: transportError(spec, err) };
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
}

// postResult — POST /api/v1/relay/{id}/result with the outcome. Rides
// apiRequestVoid (the 204 channel: same bearer posture and 401 rotation, no
// body parse — the accepted answer has no body) with the payload
// PRE-stringified and an explicit Content-Type (the putLibrarySource idiom:
// apiRequestVoid does not stringify). JSON.stringify drops the undefined
// optional fields, so a failed outcome lands as exactly {"error": ...}.
// 400/409/413 answers reject with the canonical ApiError — the caller (6.2)
// owns what a refused outcome means (the claim is dead either way; the lease
// hands the job back).
export async function postResult(id: number, result: RelayResult): Promise<void> {
  await apiRequestVoid(resultPath(id), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result),
  });
}
