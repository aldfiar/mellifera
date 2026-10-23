// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef } from "react";
import type { ReactElement } from "react";
import { Link, useNavigate } from "react-router-dom";

import type { ApiError } from "@/lib/api";
import { setDeviceToken } from "@/lib/auth";
import { usePairingWait, useStartPairing } from "@/lib/queries";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// PairingEntry — the unauthenticated device-side entry screen (device-pairing
// D8, Gate 1 amendment). Mounted at the ROOT route only when the SPA holds NO
// stored credential (neither the admin token nor a device token). On mount it
// mints one pairing request (POST /api/v1/pair), shows the returned code
// prominently for the admin to match on the Pairing panel, and polls
// GET /api/v1/pair/{id}/wait (~2.5s) until the admin adjudicates. The
// approved poll carries the device token — its single ride over the wire —
// which is stored and the device navigates to the library main screen.
// No token pasting anywhere. The muted Operator login link keeps /login
// discoverable from this screen — the operator path never depends on
// typing URLs.
export default function PairingEntry(): ReactElement {
  const navigate = useNavigate();
  const {
    mutate: startMutate,
    data: startData,
    error: startError,
    isPending: startPending,
  } = useStartPairing();
  const started = useRef(false);

  // Mint exactly once per mount: StrictMode double-invokes effects in dev,
  // and POST /pair is rate-limited per IP — a duplicate mint would burn the
  // window and orphan a request on the admin panel.
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      startMutate();
    }
  }, [startMutate]);

  const pairingId = startData?.pairing_id ?? "";
  const { data: waitData, error: waitError } = usePairingWait(pairingId);

  // The approved poll carries the device token — store it and enter the app.
  // The ROOT gate (App.tsx) re-evaluates on the navigation and renders the
  // app shell from the stored credential.
  useEffect(() => {
    if (waitData?.status === "approved" && waitData.device_token) {
      setDeviceToken(waitData.device_token);
      navigate("/", { replace: true });
    }
  }, [waitData, navigate]);

  const startErr: ApiError | null =
    startError instanceof Error ? (startError as ApiError) : null;
  const waitErr: ApiError | null =
    waitError instanceof Error ? (waitError as ApiError) : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Pair this device</CardTitle>
          <CardDescription>
            Open the admin panel, choose Pairing, and approve the code shown
            here.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {startPending ? (
            <p className="text-sm text-muted-foreground">
              Requesting a pairing code…
            </p>
          ) : startErr ? (
            <Alert variant="destructive">
              <AlertTitle>{startErr.code}</AlertTitle>
              <AlertDescription>{startErr.message}</AlertDescription>
            </Alert>
          ) : (
            <>
              <p
                data-testid="pairing-code"
                className="font-mono text-4xl font-bold tracking-widest"
              >
                {startData?.code}
              </p>
              <p className="text-xs text-muted-foreground">
                Waiting for approval…
              </p>
              {waitData && waitData.status !== "pending" ? (
                <p className="text-xs text-muted-foreground" data-testid="pairing-status">
                  {waitData.status}
                </p>
              ) : null}
            </>
          )}
          {waitErr ? (
            <Alert variant="destructive">
              <AlertTitle>{waitErr.code}</AlertTitle>
              <AlertDescription>{waitErr.message}</AlertDescription>
            </Alert>
          ) : null}
          <Link
            to="/login"
            data-testid="operator-login"
            className="mt-2 text-xs text-muted-foreground hover:underline"
          >
            Operator login
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
