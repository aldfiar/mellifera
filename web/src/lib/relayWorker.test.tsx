// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { ApiError } from "@/lib/api";
import * as relayModule from "@/lib/relay";
import type { RelayClaim, RelayPlanSpec } from "@/lib/relay";
import {
  RELAY_IDLE_BACKOFF_MS,
  RELAY_POLL_INTERVAL_MS,
  useRelayWorker,
} from "@/lib/relayWorker";

// client-relayed-fetch 6.2 — the relay loop's cadence, stop, and cleanup
// vectors over a mocked @/lib/relay (6.1's module is consumed, never edited;
// its network idioms are pinned by relay.test.tsx). Every timer is fake; the
// cadence table asserted here is the one useRelayWorker's doc comment pins.

// spec — a minimal served plan step (fields verbatim RelayPlanSpec)
const spec = (url: string): RelayPlanSpec => ({
  method: "GET",
  url,
  binary_safe: false,
  timeout_seconds: 3,
  min_interval_ms: 0,
});

const CLAIM: RelayClaim = {
  id: 11,
  purpose: "enrich",
  plan: [spec("https://upstream.example.com/a"), spec("https://upstream.example.com/b")],
};

// settle — flush the worker's microtask chain (the mock resolutions) without
// advancing the clock
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

describe("useRelayWorker — the authenticated shell's relay loop", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("poll_interval_backs_off_when_idle", async () => {
    // an empty queue; the reset step below hands back a real claim
    const claimOnce = vi.spyOn(relayModule, "claimOnce").mockResolvedValue(null);
    vi.spyOn(relayModule, "executeDescriptor").mockResolvedValue({ http_status: 200 });
    vi.spyOn(relayModule, "postResult").mockResolvedValue(undefined);

    renderHook(() => useRelayWorker());
    await settle();
    expect(claimOnce).toHaveBeenCalledTimes(1); // the first poll fires at mount

    // poll2 at t=15s: one empty poll keeps the fast cadence
    await vi.advanceTimersByTimeAsync(RELAY_POLL_INTERVAL_MS);
    expect(claimOnce).toHaveBeenCalledTimes(2);

    // poll3 lands only at t=60s: the SECOND consecutive empty stepped the
    // interval to the idle backoff (nothing at t=30s or t=45s)
    await vi.advanceTimersByTimeAsync(RELAY_POLL_INTERVAL_MS);
    expect(claimOnce).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(RELAY_POLL_INTERVAL_MS);
    expect(claimOnce).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(RELAY_POLL_INTERVAL_MS);
    expect(claimOnce).toHaveBeenCalledTimes(3);

    // the backoff holds between consecutive empties: next at t=105s
    await vi.advanceTimersByTimeAsync(RELAY_POLL_INTERVAL_MS);
    expect(claimOnce).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(RELAY_IDLE_BACKOFF_MS - RELAY_POLL_INTERVAL_MS);
    expect(claimOnce).toHaveBeenCalledTimes(4);

    // a real claim resets the cadence: poll5 (at t=150s) runs the claim and
    // poll6 lands at FAST spacing, t=165s
    claimOnce.mockResolvedValueOnce(CLAIM);
    await vi.advanceTimersByTimeAsync(RELAY_IDLE_BACKOFF_MS);
    expect(claimOnce).toHaveBeenCalledTimes(5); // the mock's Once(CLAIM) rode here
    await vi.advanceTimersByTimeAsync(RELAY_POLL_INTERVAL_MS);
    expect(claimOnce).toHaveBeenCalledTimes(6);
  });

  it("stops_on_401", async () => {
    // the canonical ApiError the wrapper's 401 path throws — it has already
    // cleared the credential and rotated by the time it lands here
    const claimOnce = vi
      .spyOn(relayModule, "claimOnce")
      .mockRejectedValue(
        new ApiError(401, { code: "unauthorized", message: "session expired", retryable: false }),
      );

    renderHook(() => useRelayWorker());
    await settle();
    expect(claimOnce).toHaveBeenCalledTimes(1); // the poll that 401'd

    // the loop is stopped for good — no reschedule on any horizon
    await vi.advanceTimersByTimeAsync(
      RELAY_POLL_INTERVAL_MS * 10 + RELAY_IDLE_BACKOFF_MS * 10,
    );
    expect(claimOnce).toHaveBeenCalledTimes(1);
  });

  it("unmount_clears_the_pending_timer", async () => {
    const claimOnce = vi.spyOn(relayModule, "claimOnce").mockResolvedValue(null);

    const { unmount } = renderHook(() => useRelayWorker());
    await settle();
    expect(claimOnce).toHaveBeenCalledTimes(1);

    unmount(); // the next poll is already scheduled at +15s
    await vi.advanceTimersByTimeAsync(RELAY_POLL_INTERVAL_MS * 10);
    expect(claimOnce).toHaveBeenCalledTimes(1); // the timer died with the hook
  });

  it("unmount_midpoll_settles_without_rescheduling", async () => {
    let release: (claim: RelayClaim | null) => void = () => {};
    const claimOnce = vi.spyOn(relayModule, "claimOnce").mockImplementation(
      () =>
        new Promise<RelayClaim | null>((resolve) => {
          release = resolve;
        }),
    );

    const { unmount } = renderHook(() => useRelayWorker());
    await settle();
    expect(claimOnce).toHaveBeenCalledTimes(1); // poll in flight

    unmount();
    release(null); // the poll settles AFTER unmount
    await vi.advanceTimersByTimeAsync(RELAY_POLL_INTERVAL_MS * 10);
    expect(claimOnce).toHaveBeenCalledTimes(1); // no stray reschedule
  });

  it("claim_drives_execute_then_post_in_plan_order", async () => {
    const claimOnce = vi.spyOn(relayModule, "claimOnce").mockResolvedValue(null);
    claimOnce.mockResolvedValueOnce(CLAIM);
    const execute = vi
      .spyOn(relayModule, "executeDescriptor")
      .mockResolvedValueOnce({ http_status: 200 })
      .mockResolvedValueOnce({ error: "boom" });
    const post = vi.spyOn(relayModule, "postResult").mockResolvedValue(undefined);

    renderHook(() => useRelayWorker());
    await settle();

    // the plan executes in order, verbatim, and each outcome posts against
    // the claim id as soon as it exists
    expect(execute.mock.calls.map((call) => call[0])).toEqual(CLAIM.plan);
    expect(post.mock.calls).toEqual([
      [CLAIM.id, { http_status: 200 }],
      [CLAIM.id, { error: "boom" }],
    ]);

    // a claimed job resets the cadence: the next poll is at fast spacing
    await vi.advanceTimersByTimeAsync(RELAY_POLL_INTERVAL_MS);
    expect(claimOnce).toHaveBeenCalledTimes(2);
  });

  it("a_post_refusal_abandons_the_claim_but_keeps_the_loop", async () => {
    const claimOnce = vi.spyOn(relayModule, "claimOnce").mockResolvedValue(null);
    claimOnce.mockResolvedValueOnce(CLAIM);
    const execute = vi
      .spyOn(relayModule, "executeDescriptor")
      .mockResolvedValue({ http_status: 200 });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const post = vi
      .spyOn(relayModule, "postResult")
      .mockRejectedValue(
        new ApiError(413, { code: "payload_too_large", message: "too big", retryable: false }),
      );

    renderHook(() => useRelayWorker());
    await settle();

    // step 1 executed; its refused outcome is the claim's death — step 2
    // never starts (the lease hands the job back), the refusal is warned
    // once, and the loop moved on
    expect(execute.mock.calls.map((call) => call[0])).toEqual([CLAIM.plan[0]]);
    expect(post).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(RELAY_POLL_INTERVAL_MS);
    expect(claimOnce).toHaveBeenCalledTimes(2);
  });

  it("a_non_401_claim_error_logs_and_continues", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const claimOnce = vi.spyOn(relayModule, "claimOnce").mockResolvedValue(null);
    claimOnce
      .mockRejectedValueOnce(
        new ApiError(500, { code: "internal_error", message: "boom", retryable: true }),
      )
      .mockResolvedValue(null);

    renderHook(() => useRelayWorker());
    await settle();
    expect(claimOnce).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1); // logged once — not spammed

    // the outage did not stop the loop: the next poll rides at the fast
    // cadence the error found it on
    await vi.advanceTimersByTimeAsync(RELAY_POLL_INTERVAL_MS);
    expect(claimOnce).toHaveBeenCalledTimes(2);
  });
});
