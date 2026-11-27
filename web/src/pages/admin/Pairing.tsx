// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { AdminDevice, AdminPairing, AdminUser, ApiError } from "@/lib/api";
import { setDeviceDebug } from "@/lib/api";
import {
  useApprovePairing,
  useBindAdminDeviceUser,
  useDenyPairing,
  useAdminUsers,
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
//  (b) DEVICES — the paired-device registry: device id, approval code, bind
//      posture (l6-accounts 9.4 — the row's user_id: the bound user, or
//      unbound = the legacy see-all viewer), the debug telemetry flag and
//      its toggle (android-tv-app 6.1), created stamp, the bind
//      affordance (a user select; unbind rides null), and a Revoke action.
//
// Every write is an adjudication/revoke mutation (retry:0 — INV-no-mutation-
// retry); success invalidates the section's list INSIDE the hook, so rows
// re-read from the server and never from the write's body. Canonical errors
// surface inline; the operator re-clicks.
export default function Pairing(): ReactElement {
  const pairings = usePairings();
  const devices = useDevices();
  // The bind affordance's user vocabulary — the SAME ["admin-users"] cache
  // entry the Accounts page reads (one fetch; the two surfaces cannot
  // disagree about the user list).
  const users = useAdminUsers();

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
          <DevicesTable
            devices={devices.data?.devices ?? []}
            users={users.data?.users ?? []}
          />
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
// server. The bound-user column rides the served user_id posture (9.3's
// deviceDTO field); the debug column the served deviceDTO.debug flag
// (android-tv-app 6.1).
function DevicesTable(props: {
  devices: AdminDevice[];
  users: AdminUser[];
}): ReactElement {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Device</TableHead>
          <TableHead>Approval code</TableHead>
          <TableHead>Bound user</TableHead>
          <TableHead>Debug</TableHead>
          <TableHead>Paired</TableHead>
          <TableHead className="w-32">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.devices.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="text-muted-foreground">
              No paired devices
            </TableCell>
          </TableRow>
        ) : (
          props.devices.map((d) => (
            <DeviceRow key={d.device_id} device={d} users={props.users} />
          ))
        )}
      </TableBody>
    </Table>
  );
}

// DeviceRow — one paired device: identity + approval code + the BIND
// POSTURE (l6-accounts 9.4): the served user_id renders both states — a
// bound device shows its user, 0 shows the legacy (unbound) viewer — and
// the affordance binds via a user select, unbinds via null (PUT
// /admin/devices/{id}/user; 204; the list invalidates and re-reads).
function DeviceRow(props: { device: AdminDevice; users: AdminUser[] }): ReactElement {
  const revoke = useRevokeDevice();
  const bind = useBindAdminDeviceUser();
  const err: ApiError | null =
    revoke.error instanceof Error
      ? (revoke.error as ApiError)
      : bind.error instanceof Error
        ? (bind.error as ApiError)
        : null;
  const boundUser = props.users.find((u) => u.id === props.device.user_id);

  return (
    <TableRow data-device-id={props.device.device_id}>
      <TableCell className="font-mono text-xs">
        {props.device.device_id}
      </TableCell>
      <TableCell className="font-mono text-xs">{props.device.code}</TableCell>
      <TableCell data-testid={`device-posture-${props.device.device_id}`}>
        <span className="flex items-center gap-2">
          <select
            aria-label={`Bound user for device ${props.device.device_id}`}
            data-testid={`device-bind-select-${props.device.device_id}`}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            value={props.device.user_id === 0 ? "" : String(props.device.user_id)}
            disabled={bind.isPending}
            onChange={(e) => {
              if (e.target.value !== "") {
                bind.mutate({
                  deviceId: props.device.device_id,
                  userId: Number(e.target.value),
                });
              }
            }}
          >
            <option value="">Unbound (legacy viewer)</option>
            {props.users.map((u) => (
              <option key={u.id} value={String(u.id)}>
                {u.username}
              </option>
            ))}
          </select>
          {props.device.user_id !== 0 ? (
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              disabled={bind.isPending}
              onClick={() =>
                bind.mutate({ deviceId: props.device.device_id, userId: null })
              }
            >
              Unbind
            </Button>
          ) : null}
        </span>
        {boundUser ? (
          <span className="text-xs text-muted-foreground">{boundUser.username}</span>
        ) : null}
      </TableCell>
      <TableCell>
        <DebugToggle device={props.device} />
      </TableCell>
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

// DebugToggle — one device's debug telemetry flag and its toggle
// (android-tv-app 6.1, the Sources.tsx GateToggle idiom): the served
// deviceDTO.debug renders as on/off, the button PUTs the flipped boolean as
// the WHOLE body (admin_scoping.go adminDeviceDebug — whole-replacement
// semantics; the device reads the flag back through its own /profile).
// Success invalidates ["admin-devices"] so the state re-reads from the
// server; errors surface inline, retry:0 — no auto-retry.
function DebugToggle(props: { device: AdminDevice }): ReactElement {
  const qc = useQueryClient();
  const debug = useMutation<void, ApiError, boolean>({
    mutationFn: (next: boolean) => setDeviceDebug(props.device.device_id, next),
    retry: 0,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-devices"] });
    },
  });
  const err: ApiError | null =
    debug.error instanceof Error ? (debug.error as ApiError) : null;

  return (
    <div
      className="flex flex-col gap-1"
      data-testid={`device-debug-${props.device.device_id}`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`text-xs ${
            props.device.debug ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          {props.device.debug ? "on" : "off"}
        </span>
        <Button
          size="sm"
          variant="outline"
          aria-label={`Debug for device ${props.device.device_id}`}
          disabled={debug.isPending}
          onClick={() => debug.mutate(!props.device.debug)}
        >
          {props.device.debug ? "Disable" : "Enable"}
        </Button>
      </div>
      {err ? (
        <Alert variant="destructive" className="py-2">
          <AlertTitle>{err.code}</AlertTitle>
          <AlertDescription>{err.message}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
