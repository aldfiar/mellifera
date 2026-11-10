// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from "react";
import type { ReactElement, RefObject } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  putAdminModuleSourceOptions,
  type ApiError,
  type PluginAdminBinding,
} from "@/lib/api";
import { DialogShell } from "@/components/DialogShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// BindingOptionsEditor — the binding options editor (plugin-options-ui 2.2,
// design D1/D3), the Plugins surface's ONE sanctioned write: a DialogShell
// dialog per metadata binding, in the IdentifySeries/PosterOverlay
// manage-overlay pattern (portal, scrim, Esc matrix, focus trap/return; a
// pending mutation suppresses closing so the canonical inline error always
// has a renderer).
//
// The redaction law shapes the form (design D3): secret fields are
// WRITE-ONLY — password inputs never pre-filled (the served options omit
// secret VALUES; presence lives only in the required_secrets verdicts that
// render beside each input, provided green / missing destructive) — and an
// empty input composes the key ABSENT: the endpoint replaces the options
// JSON WHOLE, so saving with an empty input clears the stored value. That
// consequence is stated in plain words beside every secret input; the
// post-save aggregate re-read flips the verdict visibly.
//
// Non-secret options present as editable inputs ONLY where the key is in
// OPTION_WORDS and the served value is a string; non-string values and
// vocabulary-unknown keys pass through the composed body untouched, never
// rendered editable — no generic JSON editor (design non-goal), the SPA
// still interprets no config semantics.
//
// The write posture mirrors the Sources GateToggle law (design D2):
// useMutation retry:0, canonical ApiError surfaced inline (role="alert"),
// success invalidates ["admin-plugins"] so verdicts and badges re-read from
// the server — never from the write's body — then onClose. 404 unknown
// module / 400 unbound-or-malformed / 503 unwired closure leave the dialog
// open for correction; nothing auto-retries.

// OPTION_WORDS — the editor's known-key presentation vocabulary (design D4's
// words law). Ships `language` only — the one key with a live producer
// (registry.go seeds the tmdb bindings' options with it; the tmdb templates
// substitute {language}) — growing only when a plugin actually declares a
// key. Keys outside the map, and non-string values everywhere, never render
// editable: they ride the composed body byte-identical. Exported for tests.
export const OPTION_WORDS: Record<string, string> = {
  language: "Язык",
};

// servedOptions — the binding's served options as a plain record. Options
// travel as raw JSON (json.RawMessage embedded — api.ts PluginAdminBinding),
// so the wire type is `unknown`; the served shape is a JSON object, floored
// to {} — a non-object serve presents nothing editable and composes nothing.
function servedOptions(binding: PluginAdminBinding): Record<string, unknown> {
  const options: unknown = binding.options;
  return options !== null &&
    typeof options === "object" &&
    !Array.isArray(options)
    ? (options as Record<string, unknown>)
    : {};
}

// presentedOptions — the editable words: the vocabulary-known keys whose
// served value is a string, in served order. Everything else (non-string
// values, vocabulary-unknown keys) stays unpresented and rides the composed
// body untouched. Pure; exported for tests.
export function presentedOptions(
  binding: PluginAdminBinding,
): Array<{ key: string; value: string }> {
  return Object.entries(servedOptions(binding))
    .filter(([key, value]) => key in OPTION_WORDS && typeof value === "string")
    .map(([key, value]) => ({ key, value: value as string }));
}

// composeOptions — the composed PUT body (design D3): every served
// NON-SECRET key — presented entries as entered, untouched entries
// byte-identical (the served record's values are carried by reference, never
// re-serialized) — plus only the non-empty secret inputs. An empty secret
// input composes the key ABSENT: under the endpoint's whole-replacement
// contract the stored value clears. Pure; exported for tests.
export function composeOptions(
  binding: PluginAdminBinding,
  edits: Record<string, string>,
  secrets: Record<string, string>,
): Record<string, unknown> {
  const verdicts = binding.required_secrets ?? {};
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(servedOptions(binding))) {
    if (!(key in verdicts)) {
      body[key] = key in edits ? edits[key] : value;
    }
  }
  for (const [name, value] of Object.entries(secrets)) {
    if (value !== "") {
      body[name] = value;
    }
  }
  return body;
}

export function BindingOptionsEditor(props: {
  moduleId: string;
  pluginId: string;
  binding: PluginAdminBinding; // the read model: served options + verdicts
  open: boolean;
  onClose: () => void; // shell close paths AND post-save success
  returnFocusRef?: RefObject<HTMLElement>; // the Edit button
}): ReactElement | null {
  const qc = useQueryClient();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [secrets, setSecrets] = useState<Record<string, string>>({});

  // A fresh form on every open: typed secret inputs never survive a close
  // (the write-only law), and edits re-seed from the binding's served
  // values — the dialog reads the aggregate snapshot it was handed.
  useEffect(() => {
    if (props.open) {
      setEdits({});
      setSecrets({});
    }
  }, [props.open]);

  const save = useMutation<void, ApiError, void>({
    mutationFn: () =>
      putAdminModuleSourceOptions(
        props.moduleId,
        props.pluginId,
        composeOptions(props.binding, edits, secrets),
      ),
    // INV-no-mutation-retry (the Sources GateToggle law, design D2):
    // retry:0 — canonical refusals surface inline and wait for the operator.
    retry: 0,
    onSuccess: () => {
      // The verdicts and badges re-read from the server, never from the
      // write's body (the Sources GateToggle law) — then the dialog closes:
      // the 204 is its own acknowledgement.
      void qc.invalidateQueries({ queryKey: ["admin-plugins"] });
      props.onClose();
    },
  });
  const err: ApiError | null =
    save.error instanceof Error ? (save.error as ApiError) : null;
  const busy = save.isPending;

  const close = (): void => {
    // A pending mutation suppresses closing — an unmounted dialog could
    // never render the canonical inline error (the PosterOverlay law).
    if (!busy) {
      props.onClose();
    }
  };

  const verdicts = Object.entries(props.binding.required_secrets ?? {});
  const presented = presentedOptions(props.binding);

  return (
    <DialogShell
      open={props.open}
      label={`Параметры — ${props.pluginId}`}
      width="wide"
      returnFocusRef={props.returnFocusRef}
      onClose={close}
      onEscape={close}
    >
      <div className="flex flex-col gap-3 p-4">
        <h2 className="text-base font-semibold">
          Параметры — {props.pluginId}
        </h2>

        {verdicts.map(([name, provided]) => (
          <div key={name} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`secret-${name}`} className="font-mono text-xs">
                {name}
              </Label>
              <span
                className={cn(
                  "text-xs font-medium",
                  provided ? "text-emerald-600" : "text-destructive",
                )}
              >
                {provided ? "Задан" : "Не задан"}
              </span>
            </div>
            <Input
              id={`secret-${name}`}
              type="password"
              autoComplete="new-password"
              aria-describedby={`secret-hint-${name}`}
              value={secrets[name] ?? ""}
              disabled={busy}
              onChange={(e) =>
                setSecrets((s) => ({ ...s, [name]: e.target.value }))
              }
            />
            <p
              id={`secret-hint-${name}`}
              className="text-xs text-muted-foreground"
            >
              Пустое поле при сохранении удалит сохранённое значение.
            </p>
          </div>
        ))}

        {presented.map(({ key, value }) => (
          <div key={key} className="flex flex-col gap-1">
            <Label htmlFor={`opt-${key}`}>{OPTION_WORDS[key]}</Label>
            <Input
              id={`opt-${key}`}
              value={edits[key] ?? value}
              disabled={busy}
              onChange={(e) =>
                setEdits((s) => ({ ...s, [key]: e.target.value }))
              }
            />
          </div>
        ))}

        {err ? (
          <p role="alert" className="text-sm text-destructive">
            {err.code}: {err.message}
          </p>
        ) : null}
        {busy ? (
          // The in-flight quiet line — never a spinner.
          <p className="text-xs text-muted-foreground">Сохранение…</p>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={close}
          >
            Отмена
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => save.mutate()}
          >
            Сохранить
          </Button>
        </div>
      </div>
    </DialogShell>
  );
}
