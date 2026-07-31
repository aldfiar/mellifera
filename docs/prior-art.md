# Mellifera — Prior Art & Lessons Learned

**Status:** Companion to `architecture.md` and `open-questions.md`.
**Purpose:** Record what Mellifera **adopts**, **adapts**, or deliberately **rejects** from existing media servers (Jellyfin, Emby, Kodi, Plex, Navidrome, Audiobookshelf), so design choices are grounded in proven patterns rather than reinvented — and so our differentiators are stated explicitly against the prior art they depart from.

> Rule: every architectural choice should be either *"we adopted X because it's proven"* or *"we rejected X because Y."* Accidental convergence to a known-bad pattern is the failure mode this document prevents.

---

## 1. Adopt outright (proven patterns — reinventing these is a bug)

| From | Pattern | In Mellifera | Status |
|---|---|---|---|
| Kodi (`bookmark`), Jellyfin (`UserData`), Plex (`viewOffset`) | **Playback progress, resume, playcount, "played" flag** | `playback_progress` table (§9.1) + `GET /items/{id}/resume`, `POST /items/{id}/progress` (§5.5). Relational and hot, **not** folded into the JSON document. | **Added (D20)** — the brief expected it (§38); the original §9 control tables had missed it. |
| Kodi / Emby / Jellyfin | **Sidecar local metadata** (`.nfo` / `.xml` beside the file) | A first-party **LocalMetadata `MetadataSource` plugin** (bundled) reading NFO before/alongside TMDB. Fits the plugin model with zero core change. | **Recommended** — users already have NFO files; not yet committed to the bundled set. |
| All | **Directory-structure conventions** (`Movies/Title (Year)/`, `TV/Show/SxxExx/`, anime group/release naming) | Base-scanner `Identify` adopts these as defaults, not opinion. | **To specify** at base-scanner contract / prototype pass. |
| Jellyfin name parsers, Kodi regex, **anitomy** (anime) | **"Clean name" filename parsing** (strip release group, codec, resolution, language) | Base-scanner responsibility; anime gets a dedicated anitomy-style scanner (already a module example). | **To specify** at prototype pass. |
| Kodi / Plex | **Sidecar subtitle + art discovery** during scan (`.srt`/`.ass`/`.vtt`, `poster.jpg`, `fanart.jpg`) | Base-scanner collects; art feeds images, subtitles feed the reserved `SubtitleProvider` capability. | **To specify** at prototype pass. |
| Kodi (public `MyVideos*.db` SQLite schema) | **Proven control-table shapes** (`path`, `files`, `art`, `bookmark`, `streamdetails`) | Cited as provenance for our control spine (`items`, `libraries`, `playback_progress`). Our dynamic-JSON documents diverge deliberately. | Reference only. |

---

## 2. Adapt (their idea, our better version)

| From | Pattern | Mellifera's spin |
|---|---|---|
| Jellyfin **per-field metadata locks** | Lock a field so a re-scan won't overwrite it | We already have this — `sources._user` gets **unconditional** view precedence (§3.1). *And ours is lossless:* the locked-over value is preserved underneath, not destroyed. The parallel validates the design. |
| Kodi `addon.xml`, Jellyfin `plugin.json` | Plugin manifest + min-version compat + deprecation | Our §8.1 `repo-manifest.json` mirrors these; Q12 (`min_core_version` + versioned-FQN coexistence) adopts their hard-won versioning lessons. |
| Plex / Jellyfin **image caching** | Don't hotlink upstream posters (region/offline fragility) | Defaulted to **direct URLs for MVP** with source-fallback; a core **image proxy/cache** is the Phase 2 plan (**Q28**). Region-locked Kinopoisk images are the driver. |
| Plex API (`/Items`, `/Resume`, `/Latest`, `/RecentlyAdded`) | The endpoints clients expect | Informs our minimal API — `/items/{id}/resume` (§5.5) adopted now; `/latest`, `/recently-added` follow when home-screen UX lands. |
| Plex / Jellyfin **"direct stream"** (remux, no re-encode) | Middle tier between direct-play and transcode | Noted as the Phase 2 step before full transcoding (reserved `transcoder` capability, §1.4). |
| Jellyfin/Plex **"library"** | A typed collection root | Our **module** concept generalizes this — modules are config, not code, binding scanner + metadata plugins by capability (§2.4). Strictly more flexible. |

---

## 3. Reject (their pain — our differentiators)

| From | Their problem | Why Mellifera is already safe |
|---|---|---|
| Jellyfin / Emby | 357 typed DTOs; `BaseItemDto` (155 fields); `MediaStream` (67) | **Dynamic JSON documents** — explicit (D2). We do not model the Jellyfin type zoo. |
| Jellyfin / Emby | **In-process plugin loading** — reload instability, AppDomain leaks, a plugin crash taking down the server | **go-plugin subprocess isolation** (Q1) — crash-contained, restartable, cross-language. *A real, stateable differentiator from the Jellyfin/Emby lineage.* |
| Kodi | **Regex-config scrapers** — fragile, user-visible breakage when a site changes | Plugins are **code** (Match/BuildRequest/Convert/Merge), not regex configs — far more robust. Trade-off: less user-editable than Kodi scrapers; accepted. |
| Plex | **Closed/proprietary agents** — metadata sources you cannot extend | **Open plugin contracts** — any gRPC-capable language can write a `MetadataSource` (Q2). |
| Jellyfin | **Bloated query APIs** — `GET /Items` (88 params), `GET /Videos/{id}/stream` (50) | **Minimal API by design** — Mode B is 3 endpoints; playback is 2 (§5.5). |

---

## 4. Where each landed (traceability)

- **Adopted now:** playback progress / resume → architecture §5.5 + §9.1 `playback_progress` (D20).
- **Adapted (already in design):** `sources._user` field-lock (§3.1); repo-manifest versioning (§8.1 / Q12); module-as-library (§2.4).
- **Defaulted / deferred:** image proxy/cache → **Q28** (Phase 2); direct-stream remux + transcoder → Phase 2 reserved capability (§1.4); `/latest` + home-screen endpoints → when that UX lands.
- **To specify at prototype time:** base-scanner directory conventions + clean-name parsing + sidecar subtitle/art + bundled LocalMetadata (NFO) plugin.

---

## 5. Provenance references

- **Kodi** — public `MyVideos*.db` SQLite schema; `addon.xml` scraper spec; `advancedsettings.xml`. Local-first reference for sidecar NFO + bookmark.
- **Jellyfin** (Emby fork) — OpenAPI v12 (294 paths / 346 ops / 357 schemas — the scope calibration used in the brief); plugin manifest; `UserData`.
- **Emby** — the commercial origin of the Jellyfin lineage; same data-model ancestry.
- **Plex** — documented REST API; agent/scanner plugin model; transcoder decision engine; image cache.
- **Navidrome** — Go + SQLite + Subsonic; the proven "embedded SQLite, single binary" pattern cited in §1.2.
- **Audiobookshelf** — Go + SQLite; reference for single-binary media serving.

---

## 6. Open items from this lens

- **Q28** — image handling (direct URLs vs proxy/cache). DEFAULTED to direct URLs for MVP; proxy/cache at Phase 2.
- Bundled **LocalMetadata (NFO)** plugin — recommended, not yet committed to the bundled set.
- **Multi-version / editions** grouping (theatrical vs director's cut, 4K vs 1080p as one item) — a real organizational feature (Plex "versions", Jellyfin); deferred, not yet a numbered question.
