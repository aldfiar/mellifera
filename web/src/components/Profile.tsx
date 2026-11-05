// SPDX-License-Identifier: Apache-2.0
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";

import { getProfile } from "@/lib/api";
import type { ProfileDTO } from "@/lib/api";

// Profile — the identity block (l6-accounts 8.3): the sidebar's pinned foot
// reads the SERVED profile (GET /api/v1/profile, profile.go profile) instead
// of probing an operator endpoint. The served shape carries the caller's own
// facts — kind (admin | user | device), name, role, groups — and the block
// renders exactly those: the name, a two-word role label, the group names.
// The retired D7 probe (GET /admin/status succeeding → "admin") is gone:
// an operator status endpoint is never an identity oracle. The endpoint
// itself stays — only the SPA's identity use of it dies here.
//
// The identity SOURCE is one shared query (["profile"]): this component and
// the sidebar's admin-surface gate (SideNav) read the same cache entry, so
// one request serves both and they can never disagree. staleTime Infinity
// mirrors the retired probe's once-per-session posture; the profile is the
// credential's identity, and a changed identity arrives with a new
// credential after a /login rotation (handle401 clears the page, not a
// refetch).

// PROFILE_QUERY_KEY — the ONE cache key the identity block and the admin
// gate share (INV-shared-identity: one fetch, one answer, both consumers).
export const PROFILE_QUERY_KEY = ["profile"] as const;

// useProfile — the served-identity read. retry:false (a failed identity is
// surfaced, not retried behind the user's back); the 401 case never reaches
// an error state at all — apiRequest's handle401 rotation clears the page.
export function useProfile() {
  return useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: getProfile,
    retry: false,
    staleTime: Infinity,
  });
}

// isAdminProfile — the served-role law for the admin surfaces (SideNav's
// gate): the operator surfaces render when the SERVED principal is an admin
// — the env admin (kind "admin") or an admin-role session (kind "user" with
// role "admin") — and NEVER for a client: user-role sessions, devices,
// loading, and error states all fail closed (hidden). No undefined input is
// admin: an identity that has not arrived grants nothing.
export function isAdminProfile(profile: ProfileDTO | undefined): boolean {
  if (profile === undefined) {
    return false;
  }
  return (
    profile.kind === "admin" ||
    (profile.kind === "user" && profile.role === "admin")
  );
}

// roleLabel — the display vocabulary for the served role literal. Grounded
// in the existing UI copy (the retired probe rendered lowercase
// "admin" / "client") and GLOSSARY's Role entry ("admin reaches operator
// surfaces; a user-role principal routes as a client"): the served "admin"
// literal shows as "admin", every other principal — user-role sessions and
// devices alike — shows as "client". No new words are invented.
export function roleLabel(profile: ProfileDTO | undefined, hasError: boolean): string {
  if (profile === undefined) {
    // Loading: the retired probe's "…" posture — the label never blocks.
    // Error: fail closed to the client label (the probe's own failure
    // semantics), never to admin.
    return hasError ? "client" : "…";
  }
  return profile.role === "admin" ? "admin" : "client";
}

// avatarText — the block's two-letter mark, derived from the served name
// when one is on screen; the pre-identity fallback keeps the old block's
// "OP" mark (loading/error states).
function avatarText(profile: ProfileDTO | undefined): string {
  const name = profile?.name ?? "";
  if (name.length >= 2) {
    return name.slice(0, 2).toUpperCase();
  }
  if (name.length === 1) {
    return name.toUpperCase();
  }
  return "OP";
}

// Profile — the block itself. Loading: the fallback name and the "…" label
// (never a spinner, never layout shift). Error (non-401 — a dead credential
// rotated away before this state can render): the fallback name and the
// client label. Groups render as one line of names when the served principal
// carries any (admin and device principals carry none — the line is absent,
// never an empty stub). prefs is NEVER rendered here: the preference
// document is 8.4's concern (the playback surface), not the identity block.
export default function Profile(): ReactElement {
  const profile = useProfile();
  const p = profile.data;

  return (
    <div className="profile">
      <span className="avatar" aria-hidden="true">
        {avatarText(p)}
      </span>
      <span className="pinfo">
        <b>{p?.name ?? "Operator"}</b>
        <small>{roleLabel(p, profile.isError)}</small>
        {p !== undefined && p.groups.length > 0 ? (
          <small>{p.groups.map((g) => g.name).join(", ")}</small>
        ) : null}
      </span>
    </div>
  );
}
