// SPDX-License-Identifier: Apache-2.0
import { useState, type FormEvent, type ReactElement } from "react";

import type { AdminUser, ApiError } from "@/lib/api";
import {
  useAdoptLegacyUserProgress,
  useAdminUsers,
  useCreateAdminUser,
  useDeleteAdminUser,
  usePatchAdminUser,
  useResetAdminUserPassword,
} from "@/lib/queries";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// UsersPanel — the users axis of the Accounts admin surface (l6-accounts
// 9.4, over the 9.1 endpoints): the hashless registry (the wire never
// carries a password hash — the panel renders display facts only), the
// create form whose FIRST-user response carries the backend's one-way-door
// notice (rendered VERBATIM — the wording is served, never authored
// client-side), the role select (PATCH {role} partial), the disable toggle
// (PATCH {disabled} partial), the password reset (PUT + that user's
// sessions die server-side), the per-user adopt-legacy action (bare 204 —
// the server is idempotent and answers NO counts, none shown), and delete.
//
// THE LAST-USER LAW: delete is DISABLED while one user remains (the
// client-side mirror of the server's 409 last-user guard) — the server
// stays authoritative, a forced race's 409 surfaces inline. The enabled
// confirm copy names the cascade consequence: the user's sessions, progress
// and watched history die with the row.
export default function UsersPanel(): ReactElement {
  const users = useAdminUsers();
  const create = useCreateAdminUser();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  // The one-way-door notice from the most recent first-user create — the
  // backend's exact words, cleared by nothing (an admin surface keeps the
  // fact on screen until the next create).
  const [notice, setNotice] = useState<string | null>(null);

  function onCreate(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    create.mutate(
      { username: username.trim(), password },
      {
        onSuccess: (created) => {
          setNotice(created.notice ?? null);
          setUsername("");
          setPassword("");
        },
      },
    );
  }

  const createErr: ApiError | null =
    create.error instanceof Error ? (create.error as ApiError) : null;
  const listErr: ApiError | null =
    users.error instanceof Error ? (users.error as ApiError) : null;
  const rows = users.data?.users ?? [];
  // The last-user law reads the SERVED list length: one row = no delete.
  const isLastUser = rows.length === 1;

  return (
    <section>
      <h2 className="mb-3 text-base font-semibold">Users</h2>

      <form onSubmit={onCreate} className="mb-4 flex items-start gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="new-user-username" className="text-sm">
            Username
          </label>
          <Input
            id="new-user-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-40"
            autoComplete="off"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="new-user-password" className="text-sm">
            Password
          </label>
          <Input
            id="new-user-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-40"
            autoComplete="new-password"
          />
        </div>
        <Button type="submit" className="mt-6" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create user"}
        </Button>
      </form>
      {notice !== null ? (
        <Alert className="mb-4" data-testid="create-notice">
          <AlertTitle>First user created</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}
      {createErr ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>{createErr.code}</AlertTitle>
          <AlertDescription>{createErr.message}</AlertDescription>
        </Alert>
      ) : null}

      {users.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading users…</p>
      ) : listErr ? (
        <Alert variant="destructive">
          <AlertTitle>{listErr.code}</AlertTitle>
          <AlertDescription>{listErr.message}</AlertDescription>
        </Alert>
      ) : (
        <UsersTable users={rows} isLastUser={isLastUser} />
      )}
    </section>
  );
}

// UsersTable — the hashless registry. The empty state cannot be the
// no-users steady state for long (the first create collapses legacy mode),
// but the zero-users server still renders honestly.
function UsersTable(props: {
  users: AdminUser[];
  isLastUser: boolean;
}): ReactElement {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Username</TableHead>
          <TableHead>Display name</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-96">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.users.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="text-muted-foreground">
              No users yet
            </TableCell>
          </TableRow>
        ) : (
          props.users.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              isLastUser={props.isLastUser}
            />
          ))
        )}
      </TableBody>
    </Table>
  );
}

// UserRow — one user: the role select and disable toggle ride ONE partial
// PATCH hook (each action sends only its field — the pointer decode leaves
// the rest), reset + adopt + delete ride their own 204 verbs. Each action's
// canonical failure surfaces inline in the row.
function UserRow(props: { user: AdminUser; isLastUser: boolean }): ReactElement {
  const patch = usePatchAdminUser();
  const reset = useResetAdminUserPassword();
  const del = useDeleteAdminUser();
  const adopt = useAdoptLegacyUserProgress();

  // The two-step flows: password reset (needs the new password) and delete
  // (the cascade consequence deserves a look before the click).
  const [resetting, setResetting] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const err: ApiError | null =
    patch.error instanceof Error
      ? (patch.error as ApiError)
      : reset.error instanceof Error
        ? (reset.error as ApiError)
        : del.error instanceof Error
          ? (del.error as ApiError)
          : adopt.error instanceof Error
            ? (adopt.error as ApiError)
            : null;

  return (
    <TableRow data-user-id={props.user.id}>
      <TableCell className="font-mono text-xs">{props.user.username}</TableCell>
      <TableCell className="text-sm">{props.user.display_name}</TableCell>
      <TableCell>
        <select
          aria-label={`Role for ${props.user.username}`}
          data-testid={`role-select-${props.user.id}`}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          value={props.user.role}
          disabled={patch.isPending}
          onChange={(e) => {
            if (e.target.value !== props.user.role) {
              patch.mutate({ id: props.user.id, patch: { role: e.target.value } });
            }
          }}
        >
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
      </TableCell>
      <TableCell className="text-sm">
        {props.user.disabled ? "disabled" : "active"}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={patch.isPending}
            onClick={() =>
              patch.mutate({
                id: props.user.id,
                patch: { disabled: !props.user.disabled },
              })
            }
          >
            {props.user.disabled ? "Enable" : "Disable"}
          </Button>
          {resetting ? (
            <span className="flex items-center gap-2">
              <Input
                aria-label={`New password for ${props.user.username}`}
                data-testid={`reset-input-${props.user.id}`}
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-36"
                autoComplete="new-password"
              />
              <Button
                size="sm"
                disabled={reset.isPending || newPassword === ""}
                onClick={() =>
                  reset.mutate(
                    { id: props.user.id, password: newPassword },
                    {
                      onSuccess: () => {
                        setResetting(false);
                        setNewPassword("");
                      },
                    },
                  )
                }
              >
                Confirm
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setResetting(false);
                  setNewPassword("");
                }}
              >
                Cancel
              </Button>
            </span>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setResetting(true)}
            >
              Reset password
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={adopt.isPending}
            title="Merge the legacy (unbound) progress into this user — newer wins; safe to repeat"
            onClick={() => adopt.mutate(props.user.id)}
          >
            {adopt.isPending ? "Adopting…" : "Adopt legacy progress"}
          </Button>
          {confirmingDelete ? (
            <span className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Deleting removes the user&apos;s sessions, progress and watched
                history.
              </span>
              <Button
                size="sm"
                variant="destructive"
                data-testid={`delete-confirm-${props.user.id}`}
                disabled={del.isPending}
                onClick={() =>
                  del.mutate(props.user.id, {
                    onSuccess: () => setConfirmingDelete(false),
                  })
                }
              >
                {del.isPending ? "Deleting…" : "Confirm delete"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmingDelete(false)}
              >
                Cancel
              </Button>
            </span>
          ) : (
            <Button
              size="sm"
              variant="outline"
              data-testid={`delete-button-${props.user.id}`}
              disabled={props.isLastUser || del.isPending}
              title={
                props.isLastUser
                  ? "The last user cannot be deleted (the server refuses with 409)"
                  : undefined
              }
              onClick={() => setConfirmingDelete(true)}
            >
              Delete
            </Button>
          )}
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
