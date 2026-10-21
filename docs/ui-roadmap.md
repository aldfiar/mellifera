# Mellifera — UI Improvement Roadmap

Tracked continuation of the UI improvement plan: each layer below is ONE openspec
change. Continue with `/build <change-name>` — the original draft text follows below.

| Layer | Change name | Status |
|---|---|---|
| 0 — media-data convention | `media-data-convention` | IN FLIGHT (feature/media-data-convention) |
| 1.1 — identify + match override | `identify-match-override` | planned |
| 1.2 — episode titles | `episode-titles` | planned (absorbed the episode-title writer from Layer 0) |
| 2 — art proxy + posters | `art-proxy-posters` | planned |
| 2.3 — poster-change overlay | `poster-override-overlay` | planned (may fold into the Layer 2 change) |
| 3 — player polish | `player-watch-polish` | planned (cast UI row lands here) |
| 4 — TMDB (B3) | `tmdb-metadata-source` | planned |
| 5 — search / facets / home | `browse-search-facets` | planned |

GATE 1 amendments to the draft (media-data-convention, 2026-10-21): cast[] is flat
{name, role?, photo_url?}; episode title/summary live in the source's own namespace
on the episode doc; Layer 0 ships projection + request-plan + shikimori cast — NOT
the episode-title writer (moved to 1.2), and no UI info blocks (Layers 2–3).

--------------------------------------------------------------------------------

# Mellifera — UI Improvement Proposal (DRAFT)

Status: draft for review · 2026-10-21 · builds on: display-naming, ui-management,
plugin-admin-surfaces, plugin-title-enrichment + the 2026-10-21 session
(item-page ⋯ menu, Rename series, plugins status colors, About panel).

HTML mockups (open alongside, same dir):
  mockup-identify.html      — Layer 1 (the 3-step Identify flow)
  mockup-posters.html       — Layer 2 (poster grid + episode-flow header)
  mockup-poster-change.html — Layer 2.3 (the poster-change overlay)
  mockup-player.html        — Layer 3 (watch view, skip chip, auto-next, keyboard)
  mockup-search.html        — Layer 5 (⌘K palette)

Conventions every layer obeys (locked):
- Single binary, embedded SPA; the SPA never re-derives names, never resolves
  gates, never holds media-type/plugin literals — everything field-driven from
  served wire shapes.
- Overlay edits (never inline forms on browse surfaces), menu hidden by default,
  color = state (green ok / red fail / gray off), soft pastel, no pills/paths on
  user screens (paths stay on the element page's mono line + admin surfaces).

--------------------------------------------------------------------------------

## Layer 0 — Общая конвенция медиаданных (все источники, не только shikimori)

Shikimori — один из источников. Актёры/роли, описания серий и остальные
«человекочитаемые» данные должны приезжать по ЕДИНОЙ конвенции полей, которую
соблюдает любой metadata_source — как сегодня identity_fields/display_fields
уже являются конвенцией модуля. UI читает поля, никогда не источники.

Поля конвенции (пишутся в sources.<plugin_id>, имена одинаковы для всех):

  Уровень сериала/фильма (de-facto уже пишет shikimori — повышаем до стандарта):
    title{romaji?,russian?} · description · genres[] · score · kind · status ·
    episodes · aired_on · poster · url

  Новые общие поля:
    cast[]{ name, role?, photo_url? }      — люди: актёр/сейю/персонаж;
                                             role — свободный текст («Акари»,
                                             «Ковбой Бибоп — главная роль»)
    на ДОКУМЕНТЕ эпизода:
    title                                  — название серии (1.2)
    description                            — краткое описание серии

Правила:
- Слияние — по группам с целостностью (как уже работает About): группа
  («В ролях», «Серия», synopsis) берётся ЦЕЛИКОМ из первого namespace, где
  она есть; никогда не склеивается из разных источников. Порядок — chain
  модуля (та же машина приоритетов, что у title_sources).
- Провенанс: _provenance по field_path уже печатает источник каждого поля —
  футер показывает, кто что написал.
- Источник не даёт поле → поля нет; UI-блок исчезает. Никогда не фальшивим.

Первые исполнители конвенции: shikimori (+ /characters → cast[], episode
titles/описаний нет upstream — честно), TMDB (B3: cast, episode overviews,
poster — с первого дня по конвенции). Любой будущий источник (Kinopoisk,
TVDB…) подключается без единой правки UI.

--------------------------------------------------------------------------------

## Layer 1 — Fix the match (Identify, the Plex flow)

Mockup: mockup-identify.html (all three steps, states, wire notes).

Pain: shikimori matched the Aria directory to a 1998 OVA ("Проснись, Ария!",
empty description). Refresh re-fetches by the STORED id, so a wrong match is
permanent today. Rename fixed the display name — not the metadata.

### 1.1 Identify overlay with match picking

Entry: ⋯ → "Identify…" (already on item page + cards). The view grows a search
step before the parser-attachment list.

Step 1 — search (pre-filled from the current name):

  ┌ Identify ──────────────────────────────── Esc ┐
  │                                                │
  │  Search                                        │
  │  ┌──────────────────────────────────────────┐ │
  │  │ Aria                                      │ │
  │  └──────────────────────────────────────────┘ │
  │                                                │
  │  [ Search ]                                    │
  │                                                │
  │  Current match                                 │
  │  ● Проснись, Ария! · OVA · 1998 · ★4.65       │
  │    (this is what the library shows now)        │
  └────────────────────────────────────────────────┘

Step 2 — candidates (served by the source, ranked by the plugin):

  ┌ Identify — 5 matches ────────────────────── Esc ┐
  │                                                  │
  │  ┌────┐ Aria                                    │
  │  │ 🖼 │ The Animation · TV · 2005 · 13 ep · ★4.6 │ ← current dir season
  │  └────┘ [ Use this match ]                       │
  │                                                  │
  │  ┌────┐ Aria                                    │
  │  │ 🖼 │ The Natural · TV · 2006 · 26 ep · ★4.5   │
  │  └────┘ [ Use this match ]                       │
  │                                                  │
  │  ┌────┐ Aria the Origination …                   │
  │  └────┘ [ Use this match ]                       │
  │  …                                              │
  └──────────────────────────────────────────────────┘

Step 3 — confirm (what will happen, said plainly):

  ┌ Identify ──────────────────────────────────────┐
  │                                                  │
  │  Aria — The Animation (2005)                    │
  │  Replaces the current match (Проснись, Ария!).  │
  │  Description, genres and facts re-pull from the │
  │  source; your display name stays "Aria".        │
  │                                                  │
  │  [ Replace match ]   [ Back ]                    │
  └──────────────────────────────────────────────────┘

States: searching (quiet line, no spinner), no results ("Ничего не нашлось —
try the original title or the source id"), source down (canonical error inline,
retry:0 — the plugins-page idiom).

Wire (new, additive):
- GET  /api/v1/admin/sources/{id}/search?query=…&kind=…  → candidates[]
  {external_id, title, russian_title?, year, kind, episodes, poster?}
  (api → plugin metadata_source Search passthrough; shikimori already has the
  bounded /animes?search= call internally — expose it as a capability method).
- PUT  /api/v1/series/{id}/identify  {source_id, external_id}
  → stores the identifier override + queues a refresh for that row; the next
    refresh fetches BY ID (the by-id template already exists in the plugin).
- Same PUT on /items/{id}/identify for films (tv module, post-TMDB).

Scoring stays in the plugin (the SPA renders served order verbatim).

### 1.2 Episode titles

shikimori /animes/{id}/episodes carries ru/en titles per episode. On refresh,
write `title` into each episode doc (serial-parser namespace or the source
namespace — decision at spec time). Effect: the "title — not identified" slot
disappears for anime; episode cards show "Название серии" instead of bare
S01E02. No UI work — the surfaces already render the title when present.

--------------------------------------------------------------------------------

## Layer 2 — Poster art (data already on disk)

Mockup: mockup-posters.html (poster grid card + episode-flow header + fallback note).

shikimori stores poster URLs today (sources.shikimori.poster); nothing renders
them. Serve images THROUGH the binary so clients never hotlink:

- GET /api/v1/art/{kind}/{id}?source=… — fetch-once + disk cache under the
  data dir (janitor-friendly), ETag revalidation. Auth like /media.

Layouts:

Series grid card (poster-forward, title under):

  ┌──────────┐
  │          │
  │  poster  │   2:3, rounded-lg, border
  │          │
  │          │
  ├──────────┤
  │ Aria     │   served display_name, truncate
  │ 2005 · ★ │   fact line (year · score), muted
  └──────────┘

Episode-flow header (poster beside the About panel):

  ← All series
  ┌──────┐ Aria
  │ 🖼    │ About
  │ 🖼    │ Действие разворачивается на Аквамarine…  
  └──────┘ [Фэнтези] [Повседневность]  ★4.6 · tv · 13 ep · 2005
  ── episodes ───────────────────────────────────────

Item page: poster as the identity column's lead image when present
(frame-grab thumbnail stays the fallback — already wired via hasFrameGrabberThumb).

No poster anywhere → current text-first cards (honest, no placeholder icons).

### 2.3 Смена постера — the poster overlay (mockup: mockup-poster-change.html)

Entry: ⋯ → «Постер…» on a series or film. One overlay, three sources of
candidates:

  ┌ Постер — Aria ─────────────────────────── Esc ┐
  │ [shikimori] [tmdb] [своё · 2026-10-18] [tvdb] │  ← one card per
  │   Текущий   Сделать…  Сделать…       Сделать…  │    namespace that
  │                                                  │    carries the
  │  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐     │    Layer 0 poster
  │  ┊ Перетащите изображение или выберите файл ┊     │    field + the
  │  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘     │    user upload
  │  Сбросить к источнику                            │
  └──────────────────────────────────────────────────┘

- Candidates: the poster field of EVERY source namespace (convention Layer 0 —
  shikimori, TMDB, any future source render side by side, never hardcoded)
  plus the previously uploaded user image. Selection = color change (locked
  idiom), the current one reads «Текущий».
- Drop zone: drag-drop or file picker, JPG/PNG/WebP ≤ 8 MB, cropped 2:3
  server-side; stored in the art store (the Layer 2 cache — janitor-friendly,
  single binary).
- «Сбросить к источнику» returns to the chain value.
- States: single source → one candidate + drop zone; no posters at all →
  drop zone only with the honest hint; upload in flight → quiet line; wrong
  type/size → inline error, overlay stays open.

Wire (additive, symmetric to the title overrides):
  GET    /api/v1/series/{id}/posters → candidates[] {source: plugin_id|"user", url}
  PUT    /api/v1/series/{id}/poster  {source}          — choose a candidate
  POST   /api/v1/series/{id}/poster  (multipart)       — upload user image
  DELETE /api/v1/series/{id}/poster                    — reset to chain
  (same family on /items/{id}/poster for films)
Display precedence: user poster-override → first poster by chain → no art
(mirrors title_override > composed > floor).

--------------------------------------------------------------------------------

## Layer 3 — Watch-flow polish (pure SPA)

Mockup: mockup-player.html (the watch view — player + info column, skip chip,
auto-next card, keyboard legend).

3.1 Инфо-колонка просмотра — the watch view becomes player left, info right
    (the item page's identity column grows into it). ALL blocks read the
    Layer 0 convention — whichever plugin provides the data renders:
      - episode heading: SxxEyy eyebrow + the EPISODE title (1.2, convention
        field `title` on the episode doc);
      - «Серия» block: the episode's short summary — convention field
        `description` on the episode doc, from ANY source that provides it
        (TMDB episode overviews do; shikimori upstream has none — stated
        honestly). No field → no block;
      - «В ролях» row: convention field `cast[]` {name, role?, photo_url?}
        from any source (shikimori /characters as characters is a candidate
        first provider — a plugin slice; TMDB cast arrives with B3). Absent
        data → row absent;
      - «Об сериале»: the already-shipped series About panel (synopsis,
        genres, facts) as the standing context.
    Field-driven as everywhere: the column renders what namespaces carry,
    never fabricates, never hard-codes a source.

3.2 Skip intro/credits — the player already parses sections (the Intro /
Episode / Credits buttons render today). During playback inside an intro or
credits section:

  ┌────────────────────────────────────┐
  │            (video)                 │
  │                    [ Пропустить ↪ ]│ ← soft chip bottom-right,
  └────────────────────────────────────┘   appears only inside a skip range,
                                            fade after 4s, returns on seek

Copy: «Пропустить вступление» / «Пропустить титры» (concrete, action-first).

3.3 Auto-next — on ended (episodes only):

  ┌────────────────────────────────────┐
  │  Следующая серия                    │
  │  Aria · S01E03 · Название           │
  │  [ Смотреть ]   [ Отмена ]          │
  └────────────────────────────────────┘
  Countdown 10s → autoplay; cancel persists per session. Next-episode pick
  uses the existing pure next-up core (Home), per handoff order.

3.4 Keyboard: Space play/pause · ←/→ ±10s · ↑/↓ volume · F fullscreen ·
N/P next/prev item · 0-9 seek percent. Legend row under the player on desktop,
hidden on touch.

--------------------------------------------------------------------------------

## Layer 4 — Films get a face (B3: TMDB)

TMDB metadata_source plugin (deferred B3) gives films: description, poster,
year, cast — ALL written per the Layer 0 convention (cast[], description,
episode overviews), so UI cost ≈ zero: the About panel and the watch view's
info column are field-driven; cast renders as a new fact row once a namespace
provides it, from TMDB or any other conforming source:

  About
  Криминальная драма о воре, который…) 
  [Драма] [Криминал]
  ★8.9 · film · 1994 · Кевин Спейси, Гэбриел Бирн

Identify (1.1) covers films the moment the source exists (items id space).

AuthContext for the TMDB key + per-library source toggles: existing Sources
admin page, no new surface.

--------------------------------------------------------------------------------

## Layer 5 — Browse scale (when libraries grow)

Mockup: mockup-search.html (the ⌘K palette; the same design language covers 5.2 facets and 5.3 home rows).

5.1 Global search — ⌘K palette, title walk server-side:

  ┌ Поиск ──────────────────────────────── Esc ┐
  │ aria                                       │
  │ ── Сериалы ──────────────────────────────  │
  │ Aria                  Аниме · 2005 · ★4.6  │
  │ Aria the Natural      Аниме · 2006         │
  │ ── Серии ────────────────────────────────  │
  │ Aria · S01E02 «Название»       Библиотека  │
  └────────────────────────────────────────────┘
  GET /api/v1/search?q=… → {series[], items[]} (store LIKE on served names).

5.2 Facets — genre/kind/status chips above grids, driven by the scraped
namespaces (facets computed server-side per library, served as a list; the SPA
renders served values, never derives).

5.3 Home: per-series Continue-watching rows with progress bars (progress data
exists; the Next-up core is pure and tested).

--------------------------------------------------------------------------------

## Sequencing

  Layer 0    Media-data convention (contract)  ← spec'd first; everything reads it
  Layer 1.1  Identify + match override         ← correctness first (wrong data poisons everything)
  Layer 1.2  Episode titles              ← rides the same refresh
  Layer 2    Art proxy + posters         ← biggest visual win, cheap
  Layer 3    Player polish               ← pure SPA, no backend
  Layer 4    TMDB (B3)                   ← opens films
  Layer 5    Search / facets / home      ← last, when libraries justify it

Each layer = one additive openspec change (SPA slice + api/enrich slice +
plugin slice as needed), ≤8 exported symbols per package, table-driven tests
per new symbol, Go gate stays node-free, dist rebuilt per change.

## Open decisions to settle at spec time

- Poster upload (2.3): the api layer takes its first multipart body — settle
  the size/format guard placement (api vs art store) and whether uploaded
  images re-crop on the fly or once at upload time.
- The Layer 0 cast[] shape: flat {name, role?, photo_url?} vs split
  characters[]/actors[] (shikimori has characters+seiyuu PAIRS upstream —
  one entry per character with its voice actor as role may read better for
  anime than two separate lists; TMDB has actor→character pairs — same shape).
  Decide once, all plugins follow.

- Identify override storage: series doc identifiers tier vs a side table
  (deprecate-don't-delete applies to the current id flow either way).
- Episode titles namespace: serial-parser (parse facts) vs shikimori
  (source facts) — affects footer grouping and provenance.
- Art cache lifetime + janitor ownership (ties into the deferred janitor).
- Auto-next countdown default (10s) and whether it respects a per-user flag
  once RoleClient lands.
