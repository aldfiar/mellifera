// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from "react";

import type { AdminDevice, AdminPairing, ApiError } from "@/lib/api";
import {
  useApprovePairing,
  useDenyPairing,
  useDevices,
  usePairings,
  useRevokeDevice,
} from "@/lib/queries";
import AdminTabs from "@/pages/admin/AdminTabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Pairing — the device-pairing admin surface (/admin/pairing, device-pairing
// 3.2) beside Collections / Sources / Plugins. Two sections, the
// Sources.tsx/Plugins.tsx panel pattern (loading / error / empty states, the
// TanStack Query hooks from queries.ts):
//  (a) PENDING PAIRINGS — one row per still-pending request, the code rendered
//      PROMINENTLY (the admin matches it against the code on the TV screen)
//      with one-tap Approve / Deny;
//  (b) DEVICES — the paired-device registry: device id, approval code, created
//      stamp, and a Revoke action. No device-management UI beyond list +
//      revoke (out of scope).
//
// Every write is an adjudication/revoke mutation (retry:0 — INV-no-mutation-
// retry); success invalidates the section's list INSIDE the hook, so rows
// re-read from the server and never from the write's body. Canonical errors
// surface inline; the operator re-clicks.
export default function Pairing(): ReactElement {
  const pairings = usePairings();
  const devices = useDevices();

  const pairingsErr: ApiError | null =
    pairings.error instanceof Error ? (pairings.error as ApiError) : null;
  const devicesErr: ApiError | null =
    devices.error instanceof Error ? (devices.error as ApiError) : null;

  return (
    <div className="flex flex-col gap-6">
      <AdminTabs />

      <section>
        <h2 className="mb-3 text-base font-semibold">Pending pairings</h2>
        {pairings.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading pairings…</p>
        ) : pairingsErr ? (
          <Alert variant="destructive">
            <AlertTitle>{pairingsErr.code}</AlertTitle>
            <AlertDescription>{pairingsErr.message}</AlertDescription>
          </Alert>
        ) : (
          <PairingsTable pairings={pairings.data?.pairings ?? []} />
        )}
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Devices</h2>
        {devices.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading devices…</p>
        ) : devicesErr ? (
          <Alert variant="destructive">
            <AlertTitle>{devicesErr.code}</AlertTitle>
            <AlertDescription>{devicesErr.message}</AlertDescription>
          </Alert>
        ) : (
          <DevicesTable devices={devices.data?.devices ?? []} />
        )}
      </section>
    </div>
  );
}

// PairingsTable — the pending-review list; empty state names the absence, a
// missing row IS the post-approval feedback.
function PairingsTable(props: { pairings: AdminPairing[] }): ReactElement {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Code</TableHead>
          <TableHead>Requested</TableHead>
          <TableHead className="w-56">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.pairings.length === 0 ? (
          <TableRow>
            <TableCell colSpan={3} className="text-muted-foreground">
              No pending pairing requests
            </TableCell>
          </TableRow>
        ) : (
          props.pairings.map((p) => (
            <PairingRow key={p.pairing_id} pairing={p} />
          ))
        )}
      </TableBody>
    </Table>
  );
}

// PairingRow — one pending request: the code front and center for the
// screen-match, Approve / Deny one tap each. Both writes land through the
// shared hooks (retry:0 + list invalidation there); a canonical failure
// surfaces inline in the row.
function PairingRow(props: { pairing: AdminPairing }): ReactElement {
  const approve = useApprovePairing();
  const deny = useDenyPairing();
  const err: ApiError | null =
    approve.error instanceof Error
      ? (approve.error as ApiError)
      : deny.error instanceof Error
        ? (deny.error as ApiError)
        : null;

  return (
    <TableRow data-pairing-id={props.pairing.pairing_id}>
      <TableCell>
        <span className="font-mono text-lg font-bold tracking-widest">
          {props.pairing.code}
        </span>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {props.pairing.created_at}
      </TableCell>
      <TableCell>
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={approve.isPending || deny.isPending}
            onClick={() => approve.mutate(props.pairing.pairing_id)}
          >
            {approve.isPending ? "Approving…" : "Approve"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={approve.isPending || deny.isPending}
            onClick={() => deny.mutate(props.pairing.pairing_id)}
          >
            {deny.isPending ? "Denying…" : "Deny"}
          </Button>
        </div>
        {err ? (
          <Alert variant="destructive" className="mt-2 py-2">
            <AlertTitle>{err.code}</AlertTitle>
            <AlertDescription>{err.message}</AlertDescription>
          </Alert>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

// DevicesTable — the paired-device registry; empty state for the zero-device
// server.
function DevicesTable(props: { devices: AdminDevice[] }): ReactElement {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Device</TableHead>
          <TableHead>Approval code</TableHead>
          <TableHead>Paired</TableHead>
          <TableHead className="w-32">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.devices.length === 0 ? (
          <TableRow>
            <TableCell colSpan={4} className="text-muted-foreground">
              No paired devices
            </TableCell>
          </TableRow>
        ) : (
          props.devices.map((d) => <DeviceRow key={d.device_id} device={d} />)
        )}
      </TableBody>
    </Table>
  );
}

// DeviceRow — one paired device: identity + approval code + created stamp,
// Revoke as the single action (no device-management UI beyond list + revoke).
function DeviceRow(props: { device: AdminDevice }): ReactElement {
  const revoke = useRevokeDevice();
  const err: ApiError | null =
    revoke.error instanceof Error ? (revoke.error as ApiError) : null;

  return (
    <TableRow data-device-id={props.device.device_id}>
      <TableCell className="font-mono text-xs">
        {props.device.device_id}
      </TableCell>
      <TableCell className="font-mono text-xs">{props.device.code}</TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {props.device.created_at}
      </TableCell>
      <TableCell>
        <Button
          size="sm"
          variant="outline"
          disabled={revoke.isPending}
          onClick={() => revoke.mutate(props.device.device_id)}
        >
          {revoke.isPending ? "Revoking…" : "Revoke"}
        </Button>
        {err ? (
          <Alert variant="destructive" className="mt-2 py-2">
            <AlertTitle>{err.code}</AlertTitle>
            <AlertDescription>{err.message}</AlertDescription>
          </Alert>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
