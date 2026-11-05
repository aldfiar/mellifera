// SPDX-License-Identifier: Apache-2.0
import { useState, type FormEvent, type ReactElement } from "react";

import type { AdminGroup, ApiError } from "@/lib/api";
import {
  useAddAdminGroupCollection,
  useAddAdminGroupMember,
  useAdminGroupCollections,
  useAdminGroupMembers,
  useAdminGroups,
  useAdminSources,
  useCreateAdminGroup,
  useDeleteAdminGroup,
  useLibraries,
  usePutAdminGroupDoc,
  useRemoveAdminGroupCollection,
  useRemoveAdminGroupMember,
  useRenameAdminGroup,
} from "@/lib/queries";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// GroupsPanel — the groups axis of the Accounts admin surface (l6-accounts
// 9.4, over the 9.2 endpoints). A Group is the admin-composed scope
// (GLOSSARY): member Collections with display positions say WHAT is visible,
// the per-source mute document says HOW it is enriched, membership says WHO.
// Groups are id-addressed — names are case-preserved display values, so the
// rename never re-keys anything.
//
// MUTE TOGGLES: the source vocabulary is the plugins' ids (the
// metadata_source_prefs vocabulary — GET /admin/sources rows), keyed under
// the served doc's "mutes" key ({"mutes": {plugin_id: true}}). The toggle is
// a READ-MERGE-WRITE of the WHOLE document: spread the SERVED doc, flip the
// one mutes key, PUT the whole — the server never merges and stores the
// bytes verbatim, so every non-mutes operator key must ride along (the 8.4
// whole-replace law).
export default function GroupsPanel(): ReactElement {
  const groups = useAdminGroups();
  const create = useCreateAdminGroup();
  const [name, setName] = useState("");

  function onCreate(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed === "") {
      return;
    }
    create.mutate(trimmed, {
      onSuccess: () => setName(""),
    });
  }

  const createErr: ApiError | null =
    create.error instanceof Error ? (create.error as ApiError) : null;
  const listErr: ApiError | null =
    groups.error instanceof Error ? (groups.error as ApiError) : null;

  return (
    <section>
      <h2 className="mb-3 text-base font-semibold">Groups</h2>

      <form onSubmit={onCreate} className="mb-4 flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="new-group-name" className="text-sm">
            Group name
          </label>
          <Input
            id="new-group-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-48"
          />
        </div>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create group"}
        </Button>
      </form>
      {createErr ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>{createErr.code}</AlertTitle>
          <AlertDescription>{createErr.message}</AlertDescription>
        </Alert>
      ) : null}

      {groups.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading groups…</p>
      ) : listErr ? (
        <Alert variant="destructive">
          <AlertTitle>{listErr.code}</AlertTitle>
          <AlertDescription>{listErr.message}</AlertDescription>
        </Alert>
      ) : (
        <div className="flex flex-col gap-4">
          {(groups.data?.groups ?? []).map((g) => (
            <GroupCard key={g.id} group={g} />
          ))}
          {(groups.data?.groups ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No groups yet</p>
          ) : null}
        </div>
      )}
    </section>
  );
}

// GroupCard — one group: header (name + rename + delete), then the three
// axes — member users, member Collections with positions, per-source mute
// toggles. The rename rides the id address; the delete cascades membership
// and grants server-side.
function GroupCard(props: { group: AdminGroup }): ReactElement {
  const rename = useRenameAdminGroup();
  const del = useDeleteAdminGroup();
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(props.group.name);

  const err: ApiError | null =
    rename.error instanceof Error
      ? (rename.error as ApiError)
      : del.error instanceof Error
        ? (del.error as ApiError)
        : null;

  return (
    <div
      className="rounded-md border p-3"
      data-testid={`group-card-${props.group.id}`}
    >
      <div className="mb-3 flex items-center gap-2">
        {renaming ? (
          <>
            <Input
              aria-label={`New name for ${props.group.name}`}
              data-testid={`rename-input-${props.group.id}`}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="w-48"
            />
            <Button
              size="sm"
              disabled={rename.isPending || draftName.trim() === ""}
              onClick={() =>
                rename.mutate(
                  { id: props.group.id, name: draftName.trim() },
                  { onSuccess: () => setRenaming(false) },
                )
              }
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setRenaming(false);
                setDraftName(props.group.name);
              }}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <span className="text-sm font-semibold" data-testid={`group-name-${props.group.id}`}>
              {props.group.name}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDraftName(props.group.name);
                setRenaming(true);
              }}
            >
              Rename
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={del.isPending}
              onClick={() => del.mutate(props.group.id)}
            >
              {del.isPending ? "Deleting…" : "Delete"}
            </Button>
          </>
        )}
      </div>
      {err ? (
        <Alert variant="destructive" className="mb-3 py-2">
          <AlertTitle>{err.code}</AlertTitle>
          <AlertDescription>{err.message}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 md:grid-cols-3">
        <GroupMembers groupId={props.group.id} />
        <GroupCollections groupId={props.group.id} />
        <GroupMutes group={props.group} />
      </div>
    </div>
  );
}

// GroupMembers — the WHO axis: add by USERNAME (the group is addressed by
// id, the user by name), remove per row.
function GroupMembers(props: { groupId: number }): ReactElement {
  const members = useAdminGroupMembers(props.groupId);
  const add = useAddAdminGroupMember();
  const remove = useRemoveAdminGroupMember();
  const [username, setUsername] = useState("");

  const err: ApiError | null =
    add.error instanceof Error
      ? (add.error as ApiError)
      : remove.error instanceof Error
        ? (remove.error as ApiError)
        : null;

  return (
    <div data-testid={`group-members-${props.groupId}`}>
      <h3 className="mb-2 text-sm font-medium">Member users</h3>
      <ul className="mb-2 text-sm">
        {(members.data?.users ?? []).map((m) => (
          <li key={m.id} className="flex items-center gap-1">
            <span className="font-mono text-xs">{m.username}</span>
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              disabled={remove.isPending}
              aria-label={`Remove ${m.username} from the group`}
              onClick={() =>
                remove.mutate({ groupId: props.groupId, username: m.username })
              }
            >
              Remove
            </Button>
          </li>
        ))}
        {(members.data?.users ?? []).length === 0 ? (
          <li className="text-muted-foreground">No members</li>
        ) : null}
      </ul>
      <span className="flex items-center gap-2">
        <Input
          aria-label={`Username to add to the group`}
          data-testid={`member-add-input-${props.groupId}`}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-32"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={add.isPending || username.trim() === ""}
          onClick={() =>
            add.mutate(
              { groupId: props.groupId, username: username.trim() },
              { onSuccess: () => setUsername("") },
            )
          }
        >
          Add
        </Button>
      </span>
      {err ? (
        <Alert variant="destructive" className="mt-2 py-2">
          <AlertTitle>{err.code}</AlertTitle>
          <AlertDescription>{err.message}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

// GroupCollections — the WHAT axis: the member Collections with their
// display positions, rendered position-ordered AS SERVED (the order law is
// the server's resolution — min-position, tie by group id — the panel never
// re-sorts). The add names the library (select from the served registry)
// plus the position; the D5 orphan law means an unknown id is accepted
// server-side and simply grants nothing live.
function GroupCollections(props: { groupId: number }): ReactElement {
  const collections = useAdminGroupCollections(props.groupId);
  const libraries = useLibraries();
  const add = useAddAdminGroupCollection();
  const remove = useRemoveAdminGroupCollection();
  const [libraryId, setLibraryId] = useState("");
  const [position, setPosition] = useState("0");

  const err: ApiError | null =
    add.error instanceof Error
      ? (add.error as ApiError)
      : remove.error instanceof Error
        ? (remove.error as ApiError)
        : null;

  return (
    <div data-testid={`group-collections-${props.groupId}`}>
      <h3 className="mb-2 text-sm font-medium">Collections</h3>
      <ul className="mb-2 text-sm">
        {(collections.data?.collections ?? []).map((c) => (
          <li key={c.library_id} className="flex items-center gap-1">
            <span className="text-xs">
              collection {c.library_id} — position {c.position}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              disabled={remove.isPending}
              aria-label={`Remove collection ${c.library_id} from the group`}
              onClick={() =>
                remove.mutate({
                  groupId: props.groupId,
                  libraryId: c.library_id,
                })
              }
            >
              Remove
            </Button>
          </li>
        ))}
        {(collections.data?.collections ?? []).length === 0 ? (
          <li className="text-muted-foreground">No collections</li>
        ) : null}
      </ul>
      <span className="flex items-center gap-2">
        <select
          aria-label="Collection to add"
          data-testid={`collection-add-select-${props.groupId}`}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          value={libraryId}
          onChange={(e) => setLibraryId(e.target.value)}
        >
          <option value="">Collection…</option>
          {(libraries.data?.items ?? []).map((lib) => (
            <option key={lib.id} value={String(lib.id)}>
              {lib.display_name}
            </option>
          ))}
        </select>
        <Input
          aria-label="Position"
          data-testid={`collection-add-position-${props.groupId}`}
          type="number"
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          className="w-20"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={
            add.isPending || libraryId === "" || position === ""
          }
          onClick={() =>
            add.mutate(
              {
                groupId: props.groupId,
                libraryId: Number(libraryId),
                position: Number(position),
              },
              { onSuccess: () => setLibraryId("") },
            )
          }
        >
          Add
        </Button>
      </span>
      {err ? (
        <Alert variant="destructive" className="mt-2 py-2">
          <AlertTitle>{err.code}</AlertTitle>
          <AlertDescription>{err.message}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

// GroupMutes — the HOW axis: one toggle per loaded plugin source, read from
// the served doc's "mutes" key. Flipping reads the SERVED document, flips
// the one key, and PUTs the WHOLE object (the server replaces verbatim,
// never merges — operator keys ride along).
function GroupMutes(props: { group: AdminGroup }): ReactElement {
  const sources = useAdminSources();
  const put = usePutAdminGroupDoc();

  const servedDoc: Record<string, unknown> = props.group.doc ?? {};
  const servedMutes = asMutes(servedDoc.mutes);

  const err: ApiError | null =
    put.error instanceof Error ? (put.error as ApiError) : null;

  return (
    <div data-testid={`group-mutes-${props.group.id}`}>
      <h3 className="mb-2 text-sm font-medium">Muted sources</h3>
      <ul className="text-sm">
        {(sources.data?.sources ?? []).map((src) => {
          const muted = servedMutes[src.plugin_id] === true;
          return (
            <li key={src.plugin_id} className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`mute-${props.group.id}-${src.plugin_id}`}
                data-testid={`mute-toggle-${props.group.id}-${src.plugin_id}`}
                checked={muted}
                disabled={put.isPending}
                onChange={() => {
                  // READ-MERGE-WRITE the whole document: the served doc's
                  // other keys survive verbatim, only this mutes key moves.
                  const mutes = { ...servedMutes, [src.plugin_id]: !muted };
                  put.mutate({
                    groupId: props.group.id,
                    doc: { ...servedDoc, mutes },
                  });
                }}
              />
              <label
                htmlFor={`mute-${props.group.id}-${src.plugin_id}`}
                className="text-xs"
              >
                {src.name}
              </label>
            </li>
          );
        })}
        {(sources.data?.sources ?? []).length === 0 ? (
          <li className="text-muted-foreground">No sources loaded</li>
        ) : null}
      </ul>
      {err ? (
        <Alert variant="destructive" className="mt-2 py-2">
          <AlertTitle>{err.code}</AlertTitle>
          <AlertDescription>{err.message}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

// asMutes — the doc's "mutes" payload read as the mute map. A non-object
// payload (the doc is shape-only validated — anything could be stored) reads
// as NO mutes, never a crash: visibility never depends on doc hygiene.
function asMutes(raw: unknown): Record<string, boolean> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    out[k] = v === true;
  }
  return out;
}
