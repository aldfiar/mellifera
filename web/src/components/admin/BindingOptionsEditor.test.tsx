// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import * as apiModule from "@/lib/api";
import type { PluginAdminBinding } from "@/lib/api";
import { BindingOptionsEditor } from "@/components/admin/BindingOptionsEditor";
import { TOKEN_KEY } from "@/lib/auth";
import { useState } from "react";

// plugin-options-ui 2.2's acceptance floor, asserted at the api seam (the
// queries test idiom — the api module is the only stub; DialogShell, the
// mutation, and the inputs are real): secrets render EMPTY beside their
// verdicts and never pre-fill (the redaction law), the composed body
// preserves untouched keys byte-identical and drops empty secrets
// (whole-replacement semantics, design D3), and a canonical refusal renders
// inline without auto-retry (the Sources GateToggle law, design D2).

function metadataBinding(
  overrides?: Partial<PluginAdminBinding>,
): PluginAdminBinding {
  return {
    module_id: "library",
    kind: "metadata",
    priority: 1,
    enabled: true,
    auth_mode: "token",
    options: {
      language: "ru",
      include_image_types: ["poster", "backdrop"],
      custom_unknown: "keep-me",
    },
    required_secrets: { api_key: true },
    ...overrides,
  };
}

// renderEditor mounts the editor through a stateful harness: the PARENT owns
// the overlay state (design D1 — the consumer's onClose flips `open`, the
// real Plugins wiring of 2.3), so "the dialog closes" is observable as
// dialog REMOVAL. A static-open render would leave the shell mounted with a
// stale history entry — the previous test's deferred history consumption
// would then fire a close-policy call that no real surface ever makes.
function renderEditor(
  client: QueryClient,
  binding: PluginAdminBinding,
  onClose: () => void = () => {},
): ReturnType<typeof render> {
  function Harness() {
    const [open, setOpen] = useState(true);
    return (
      <QueryClientProvider client={client}>
        <BindingOptionsEditor
          moduleId="library"
          pluginId="tmdb"
          binding={binding}
          open={open}
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        />
      </QueryClientProvider>
    );
  }
  return render(<Harness />);
}

function freshClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe("BindingOptionsEditor (plugin-options-ui 2.2)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.setItem(TOKEN_KEY, "tok-opts");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem(TOKEN_KEY);
  });

  it("secrets-render-empty-beside-their-verdicts-and-never-pre-fill", () => {
    renderEditor(freshClient(), metadataBinding());

    // Write-only: a password input, rendered EMPTY — the served options omit
    // secret VALUES (the redaction law), so there is nothing to pre-fill
    // with and the stored value never appears on the way.
    const secret = screen.getByLabelText("api_key") as HTMLInputElement;
    expect(secret.type).toBe("password");
    expect(secret.value).toBe("");
    // The verdict renders beside the input, colored: provided green.
    const verdict = screen.getByText("Задан");
    expect(verdict.className).toContain("text-emerald-600");
    // The plain-words consequence copy — an empty input clears on save.
    expect(
      screen.getByText("Пустое поле при сохранении удалит сохранённое значение."),
    ).toBeDefined();
    // Write-only means writable: typing composes, the value stays local.
    fireEvent.change(secret, { target: { value: "typed" } });
    expect(
      (screen.getByLabelText("api_key") as HTMLInputElement).value,
    ).toBe("typed");
  });

  it("composed-body-preserves-untouched-keys-and-drops-empty-secrets", async () => {
    const putSpy = vi
      .spyOn(apiModule, "putAdminModuleSourceOptions")
      .mockResolvedValue(undefined);
    const onClose = vi.fn();
    const client = freshClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    // ONE fixture instance: the reference-identity assertions below compare
    // against the very object the editor was handed.
    const fixture = metadataBinding({
      required_secrets: { api_key: true, api_key_read: false },
    });
    const served = fixture.options as Record<string, unknown>;
    renderEditor(client, fixture, onClose);

    // The editable words are seeded ONLY from string-valued entries: the
    // recognized key carries its served value; the array-valued key and the
    // vocabulary-unknown key render no input at all.
    const language = screen.getByLabelText("Язык") as HTMLInputElement;
    expect(language.value).toBe("ru");
    expect(screen.queryByLabelText("include_image_types")).toBeNull();
    expect(screen.queryByLabelText("custom_unknown")).toBeNull();

    // Edit the recognized option, fill one secret, leave the other empty.
    fireEvent.change(language, { target: { value: "en-US" } });
    fireEvent.change(screen.getByLabelText("api_key"), {
      target: { value: "sk-new-secret" },
    });
    fireEvent.click(screen.getByText("Сохранить"));

    await waitFor(() => expect(putSpy).toHaveBeenCalledTimes(1));
    const [moduleId, pluginId, body] = putSpy.mock.calls[0];
    expect(moduleId).toBe("library");
    expect(pluginId).toBe("tmdb");
    // The composed body carries exactly: the edited entry as entered, every
    // untouched key byte-identical, plus only the non-empty secret input.
    expect(Object.keys(body).sort()).toEqual([
      "api_key",
      "custom_unknown",
      "include_image_types",
      "language",
    ]);
    expect(body.language).toBe("en-US");
    // Untouched keys byte-identical: the served values pass by reference,
    // never re-serialized (the array-valued and the vocabulary-unknown key
    // alike).
    expect(body.include_image_types).toBe(served.include_image_types);
    expect(body.custom_unknown).toBe(served.custom_unknown);
    expect(body.api_key).toBe("sk-new-secret");
    // The empty secret input composes the key ABSENT — under the endpoint's
    // whole-replacement contract the stored value clears (design D3).
    expect("api_key_read" in body).toBe(false);

    // Success: the aggregate re-reads (never the write's body), then the
    // dialog closes — removal, through the harness's parent-owned state.
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["admin-plugins"],
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("canonical-refusal-renders-inline-without-auto-retry", async () => {
    const putSpy = vi
      .spyOn(apiModule, "putAdminModuleSourceOptions")
      .mockRejectedValue(
        new apiModule.ApiError(400, {
          code: "bad_request",
          message: "plugin is not bound as a metadata source",
          retryable: false,
        }),
      );
    const onClose = vi.fn();
    renderEditor(
      freshClient(),
      metadataBinding({
        options: { language: "ru" },
        required_secrets: { api_key: false },
      }),
      onClose,
    );

    // The not-provided verdict word, colored destructive.
    const verdict = screen.getByText("Не задан");
    expect(verdict.className).toContain("text-destructive");

    fireEvent.change(screen.getByLabelText("api_key"), {
      target: { value: "attempt" },
    });
    fireEvent.click(screen.getByText("Сохранить"));

    // The canonical refusal surfaces inline and the dialog STAYS OPEN for
    // correction — onClose never fired.
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("bad_request");
    expect(alert.textContent).toContain(
      "plugin is not bound as a metadata source",
    );
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(onClose).not.toHaveBeenCalled();

    // No auto-retry: the query-core retryer schedules any retry >= 1 at
    // 1e3 * 2 ** failureCount ms (retryer.js defaultRetryDelay) — after a
    // bounded wait past that window the write ran exactly once.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(putSpy).toHaveBeenCalledTimes(1);
  });
});
