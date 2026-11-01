// SPDX-License-Identifier: Apache-2.0
import { useEffect } from "react";

import { ApiError } from "@/lib/api";
import { claimOnce, executeDescriptor, postResult } from "@/lib/relay";

// The relay loop's React half (client-relayed-fetch 6.2): the authenticated
// shell mounts useRelayWorker ONCE per session (App.tsx's Shell — the one
// component every authenticated route renders and no unauthenticated route
// does), and the hook drives relay.ts's claim/execute/post core on a timer,
// so every authenticated principal (admin or paired device) serves the queue.
// React Query is not involved: the queue has no cache semantics for the
// client, so this is a plain self-scheduling setTimeout loop — no query
// cache, no React state, no re-renders, and no interception of user-initiated
// fetches (the identify search relay interleave is server-side).

// RELAY_POLL_INTERVAL_MS — the fast cadence: spacing from mount to the first
// scheduled poll and from a settled poll to the next while the session is
// doing relay work (or has not yet proven idle). ~15 s: quick queue pickup
// without a hum.
export const RELAY_POLL_INTERVAL_MS = 15_000;

// RELAY_IDLE_BACKOFF_MS — the idle cadence: once the queue has answered empty
// (204) on RELAY_IDLE_EMPTY_POLLS consecutive polls, the spacing lengthens to
// this and stays there between consecutive empty polls. A real claim resets
// the idle count and the next poll returns to the fast cadence (the web-ui
// delta scenario).
export const RELAY_IDLE_BACKOFF_MS = 45_000;

// RELAY_IDLE_EMPTY_POLLS — consecutive empty (204) polls before the idle
// backoff engages. One empty is noise (the job may land next tick); two in a
// row is the queue being idle.
export const RELAY_IDLE_EMPTY_POLLS = 2;

// useRelayWorker — poll claimOnce immediately at mount, then keep polling on
// the cadence table below (pinned by relayWorker.test.tsx):
//
//   settled poll            next poll
//   ----------------------  -------------------------------------------
//   mount                   immediately, then +RELAY_POLL_INTERVAL_MS
//   claim (a job ran)       +RELAY_POLL_INTERVAL_MS (fast; reset)
//   empty x1                +RELAY_POLL_INTERVAL_MS (still fast)
//   empty x2+               +RELAY_IDLE_BACKOFF_MS (idle backoff)
//   other error             unchanged cadence (log-and-continue)
//   401                     NEVER — the loop stops for the session
//
// The 401 rule: apiRequest's wrapper path has ALREADY cleared the credential
// and rotated the client (handle401) by the time the canonical ApiError lands
// here — the hook's only duty is to stop polling. It never navigates itself
// (the existing credential-clearing path owns the redirect).
// Every other failure is warned once and the loop continues at its current
// cadence — a relay outage must not spam the console or break the app; any
// lease a dead cycle held simply expires server-side and is handed back.
// Unmount clears the pending timer, and a poll still in flight settles into
// the stopped flag and schedules nothing — no stray polls, and no work after
// unmount beyond completing an already-executed step's outcome post (the hook
// keeps no React state, so there is nothing to setState).
export function useRelayWorker(): void {
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let emptyPolls = 0;

    const tick = async (): Promise<void> => {
      try {
        const claim = await claimOnce();
        if (stopped) {
          return; // unmounted (or 401-stopped) mid-poll — schedule nothing
        }
        if (claim === null) {
          emptyPolls += 1;
        } else {
          emptyPolls = 0; // a real claim resets the idle backoff
          for (const spec of claim.plan) {
            if (stopped) {
              return; // the lease hands the never-started job back
            }
            const result = await executeDescriptor(spec);
            // A step that DID execute always posts its outcome, even into a
            // just-unmounted hook: completing the job beats wedging the
            // lease, and the post is one awaited call.
            await postResult(claim.id, result);
          }
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          // The wrapper already cleared the credential and rotated — this
          // session is over; stop polling for good.
          stopped = true;
          return;
        }
        console.warn("[relayWorker] relay cycle failed; continuing", err);
      }
      if (stopped) {
        return;
      }
      timer = setTimeout(
        () => void tick(),
        emptyPolls >= RELAY_IDLE_EMPTY_POLLS
          ? RELAY_IDLE_BACKOFF_MS
          : RELAY_POLL_INTERVAL_MS,
      );
    };

    void tick(); // first poll at mount — the session may have queued work

    return () => {
      stopped = true;
      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }, []);
}
