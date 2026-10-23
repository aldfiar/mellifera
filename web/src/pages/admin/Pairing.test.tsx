// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import * as apiModule from "@/lib/api";
import type { AdminDevice, AdminPairing } from "@/lib/api";
import { queryClient } from "@/lib/queries";
import Pairing from "@/pages/admin/Pairing";

// Box 3.2 suite: the Pairing admin surface. Consumer joint:
// Pairing.tsx -> getAdminPairings / approvePairing / denyPairing /
// getAdminDevices / revokeDevice -> Go /api/v1/admin/pairings* and
// /api/v1/admin/devices* (pairing.go). Mock seam idiom (Sources.test.tsx):
// the page-level fetchers are spied at the api.ts export with MUTABLE module
// fixtures — the writes mutate them like the server would, so the rows'
// disappearance comes back through the hooks' ["admin-pairings"] /
// ["admin-devices"] invalidation refetch, never from the write's body.

const PAIRING: AdminPairing = {
  pairing_id: "p1",
  code: "ABCD-2345",
  created_at: "2026-10-23T10:00:00Z",
  expires_at: "2026-10-23T10:05:00Z",
};

const DEVICE: AdminDevice = {
  device_id: "dev1",
  code: "ABCD-2345",
  created_at: "2026-10-23T10:01:00Z",
};

function freshClient(): QueryClient {
  // The pairing hooks invalidate the MODULE-LEVEL queryClient singleton
  // (queries.ts), not a provider-scoped client — so the provider must wrap
  // that same instance for the invalidation to reach the rendered cache
  // (the useCreateLibrary test idiom). Cleared per test so no cache leaks.
  queryClient.clear();
  return queryClient;
}

function renderPairing(client: QueryClient): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={["/admin/pairing"]}>
      <QueryClientProvider client={client}>
        <Pairing />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function row(container: HTMLElement, selector: string): HTMLElement {
  const el = container.querySelector(selector);
  if (!el) {
    throw new Error(`row not rendered: ${selector}`);
  }
  return el as HTMLElement;
}

describe("Pairing — admin surface (device-pairing 3.2)", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("renders the pending code prominently with Approve/Deny taps, and the device registry with Revoke", async () => {
    vi.spyOn(apiModule, "getAdminPairings").mockResolvedValue({
      pairings: [PAIRING],
    });
    vi.spyOn(apiModule, "getAdminDevices").mockResolvedValue({
      devices: [DEVICE],
    });

    const { container } = renderPairing(freshClient());
    await waitFor(() =>
      expect(container.querySelector('tr[data-pairing-id="p1"]')).not.toBeNull(),
    );

    // The code renders prominently in the pending row — the admin matches it
    // against the TV screen.
    const pendingRow = row(container, 'tr[data-pairing-id="p1"]');
    expect(within(pendingRow).getByText("ABCD-2345")).toBeDefined();
    expect(within(pendingRow).getByRole("button", { name: "Approve" })).toBeDefined();
    expect(within(pendingRow).getByRole("button", { name: "Deny" })).toBeDefined();

    await waitFor(() =>
      expect(container.querySelector('tr[data-device-id="dev1"]')).not.toBeNull(),
    );
    const deviceRow = row(container, 'tr[data-device-id="dev1"]');
    expect(within(deviceRow).getByText("dev1")).toBeDefined();
    expect(within(deviceRow).getByRole("button", { name: "Revoke" })).toBeDefined();
  });

  it("approve tap fires the mutation and clears the pending row via the invalidated refetch", async () => {
    let pending: AdminPairing[] = [PAIRING];
    vi.spyOn(apiModule, "getAdminPairings").mockImplementation(async () => ({
      pairings: pending,
    }));
    const approveSpy = vi
      .spyOn(apiModule, "approvePairing")
      .mockImplementation(async (pairingId: string) => {
        pending = pending.filter((p) => p.pairing_id !== pairingId); // the write landed
        return { pairing_id: pairingId, status: "approved" };
      });
    vi.spyOn(apiModule, "getAdminDevices").mockResolvedValue({ devices: [] });

    const { container } = renderPairing(freshClient());
    await waitFor(() =>
      expect(container.querySelector('tr[data-pairing-id="p1"]')).not.toBeNull(),
    );

    fireEvent.click(
      within(row(container, 'tr[data-pairing-id="p1"]')).getByRole("button", {
        name: "Approve",
      }),
    );

    await waitFor(() => expect(approveSpy).toHaveBeenCalledWith("p1"));
    // The row leaves through the server re-read (invalidation), not the body.
    await waitFor(() =>
      expect(container.querySelector('tr[data-pairing-id="p1"]')).toBeNull(),
    );
    expect(screen.getByText("No pending pairing requests")).toBeDefined();
  });

  it("deny tap fires the mutation and clears the pending row", async () => {
    let pending: AdminPairing[] = [PAIRING];
    vi.spyOn(apiModule, "getAdminPairings").mockImplementation(async () => ({
      pairings: pending,
    }));
    const denySpy = vi
      .spyOn(apiModule, "denyPairing")
      .mockImplementation(async (pairingId: string) => {
        pending = pending.filter((p) => p.pairing_id !== pairingId);
      });
    vi.spyOn(apiModule, "getAdminDevices").mockResolvedValue({ devices: [] });

    const { container } = renderPairing(freshClient());
    await waitFor(() =>
      expect(container.querySelector('tr[data-pairing-id="p1"]')).not.toBeNull(),
    );

    fireEvent.click(
      within(row(container, 'tr[data-pairing-id="p1"]')).getByRole("button", {
        name: "Deny",
      }),
    );

    await waitFor(() => expect(denySpy).toHaveBeenCalledWith("p1"));
    await waitFor(() =>
      expect(container.querySelector('tr[data-pairing-id="p1"]')).toBeNull(),
    );
  });

  it("revoke fires the mutation and the device row disappears", async () => {
    let devices: AdminDevice[] = [DEVICE];
    vi.spyOn(apiModule, "getAdminDevices").mockImplementation(async () => ({
      devices,
    }));
    const revokeSpy = vi
      .spyOn(apiModule, "revokeDevice")
      .mockImplementation(async (deviceId: string) => {
        devices = devices.filter((d) => d.device_id !== deviceId);
      });
    vi.spyOn(apiModule, "getAdminPairings").mockResolvedValue({ pairings: [] });

    const { container } = renderPairing(freshClient());
    await waitFor(() =>
      expect(container.querySelector('tr[data-device-id="dev1"]')).not.toBeNull(),
    );

    fireEvent.click(
      within(row(container, 'tr[data-device-id="dev1"]')).getByRole("button", {
        name: "Revoke",
      }),
    );

    await waitFor(() => expect(revokeSpy).toHaveBeenCalledWith("dev1"));
    await waitFor(() =>
      expect(container.querySelector('tr[data-device-id="dev1"]')).toBeNull(),
    );
    expect(screen.getByText("No paired devices")).toBeDefined();
  });

  it("a refused adjudication surfaces the canonical error inline without auto-retry", async () => {
    vi.spyOn(apiModule, "getAdminPairings").mockResolvedValue({
      pairings: [PAIRING],
    });
    const approveSpy = vi.spyOn(apiModule, "approvePairing").mockRejectedValue(
      new apiModule.ApiError(409, {
        code: "conflict",
        message: "pairing request can no longer be approved or denied",
        retryable: false,
      }),
    );
    vi.spyOn(apiModule, "getAdminDevices").mockResolvedValue({ devices: [] });

    const { container } = renderPairing(freshClient());
    await waitFor(() =>
      expect(container.querySelector('tr[data-pairing-id="p1"]')).not.toBeNull(),
    );

    fireEvent.click(
      within(row(container, 'tr[data-pairing-id="p1"]')).getByRole("button", {
        name: "Approve",
      }),
    );

    expect(await screen.findByText("conflict")).toBeDefined();
    expect(
      screen.getByText("pairing request can no longer be approved or denied"),
    ).toBeDefined();
    // Exactly ONE attempt: retry:0, no auto-retry.
    await waitFor(() => expect(approveSpy).toHaveBeenCalledTimes(1));
  });
});
