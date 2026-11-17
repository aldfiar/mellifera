// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState, type ReactElement } from "react";

import { Button } from "@/components/ui/button";

// ApkDownload — the SPA download affordance for the Android TV client APK
// (android-app-delivery "SPA advertises the app"). ONE probe + one renderer
// shared by the three placements:
//
//   - TV-mode banner (`tvGate`): rendered beside the Player's playback-error
//     banner — the moment codec failures bite. Gated on the `tv` class, the
//     settled output of the tvmode boot apply (the injected
//     mellifera-client-ua meta + the detection ladder + the «Режим ТВ»
//     override — lib/tvmode is the single writer, this file only reads).
//   - login footer and settings (the Sidebar foot, beside the «Режим ТВ» /
//     theme toggles) — ungated, always offered.
//
// Probe law (spec): HEAD /apk with the HTTP cache bypassed across the whole
// redirect chain (`cache: "no-store"`), DEFAULT redirect-follow — a manual
// redirect would be opaque, leaving the final URL unreadable for the version
// label. A raw fetch, not the lib/api wrapper: /apk is the unauthenticated
// public pointer, no bearer and no error taxonomy apply. 404 (the APK-less
// build) — and any transport failure — render NOTHING on every placement
// (fail closed). 200 parses the version label from the final URL's filename
// (/mellifera-tv-(.+)\.apk$ over new URL(r.url).pathname — the filename is
// the entire version wire contract); an unparseable filename degrades to the
// button without a label. The Downloader address renders as
// location.origin + "/apk".

// APK_VERSION_RE — the version-label law over the redirect target's
// filename (android-app-delivery "Versioned filename is the wire contract").
const APK_VERSION_RE = /mellifera-tv-(.+)\.apk$/;

// ApkProbe — the probe outcome: not settled yet, or settled with
// availability + the parsed version label (null = present but unparseable →
// the no-label degrade).
type ApkProbe =
  | { ready: false }
  | { ready: true; available: boolean; version: string | null };

// useApkProbe — the ONE probe every placement shares. An unsettled or
// absent probe renders nothing, so each placement's markup stays silent
// until the server answers.
function useApkProbe(): ApkProbe {
  const [probe, setProbe] = useState<ApkProbe>({ ready: false });
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let res: Response;
      try {
        res = await fetch("/apk", { method: "HEAD", cache: "no-store" });
      } catch {
        // Transport failure floors to absent — the 404 posture.
        return;
      }
      if (cancelled) {
        return;
      }
      if (!res.ok) {
        setProbe({ ready: true, available: false, version: null });
        return;
      }
      let version: string | null = null;
      try {
        const match = APK_VERSION_RE.exec(new URL(res.url).pathname);
        if (match) {
          version = match[1];
        }
      } catch {
        // An unparseable final URL degrades to the button without a label.
      }
      setProbe({ ready: true, available: true, version });
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return probe;
}

// ApkOffer — the button row every placement renders: the download link
// (href="/apk" — the short public pointer; the asset is the capability),
// the version label when the filename parsed, and the Downloader address a
// TV launcher app can be pointed at.
function ApkOffer({ version }: { version: string | null }): ReactElement {
  return (
    <div className="flex flex-col items-start gap-1">
      <Button asChild size="sm" variant="outline">
        <a href="/apk" download data-testid="apk-download-link">
          Скачать APK
        </a>
      </Button>
      {version !== null ? (
        <span data-testid="apk-download-version" className="text-muted-foreground">
          версия {version}
        </span>
      ) : null}
      <span data-testid="apk-download-downloader" className="text-xs text-muted-foreground">
        Адрес для Downloader: {location.origin}/apk
      </span>
    </div>
  );
}

// ApkDownload — the affordance mount. The TV gate is read at render, never
// stored: the banner mounts at the error moment, and the boot apply has long
// settled the `tv` class before any consumer mounts (lib/tvmode's apply
// precedes first themed paint).
export default function ApkDownload(props: {
  tvGate?: boolean;
} = {}): ReactElement | null {
  const probe = useApkProbe();
  if (props.tvGate === true && !document.documentElement.classList.contains("tv")) {
    return null;
  }
  if (!probe.ready || !probe.available) {
    return null;
  }
  if (props.tvGate === true) {
    return (
      <aside data-testid="apk-download" className="rounded-lg border bg-card px-4 py-3 text-sm">
        <p className="font-medium">Доступно приложение для Android TV</p>
        <p className="mt-1 text-muted-foreground">
          Лучше воспроизведение: аппаратные кодеки и поддержка MKV
        </p>
        <div className="mt-3">
          <ApkOffer version={probe.version} />
        </div>
      </aside>
    );
  }
  return (
    <div data-testid="apk-download">
      <ApkOffer version={probe.version} />
    </div>
  );
}
