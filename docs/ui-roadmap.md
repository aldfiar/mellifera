| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |# Mellifera — UI Improvement Roadmap
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |Tracked continuation of the UI improvement plan: each layer below is ONE openspec
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |change. Continue with `/build <change-name>` — the original draft text follows below.
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) || Layer | Change name | Status |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) ||---|---|---|
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) ||
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) || 1.1 — identify + match override | `identify-match-override` | planned |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) || 1.2 — episode titles | `episode-titles` | planned (absorbed the episode-title writer from Layer 0) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) || 2 — art proxy + posters | `art-proxy-posters` | planned |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) || 2.3 — poster-change overlay | `poster-override-overlay` | planned (may fold into the Layer 2 change) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) || 3 — player polish | `player-watch-polish` | planned (cast UI row lands here) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) || 4 — TMDB (B3) | `tmdb-metadata-source` | planned |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) || 5 — search / facets / home | `browse-search-facets` | planned |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |GATE 1 amendments to the draft (media-data-convention, 2026-10-21): cast[] is flat
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |{name, role?, photo_url?}; episode title/summary live in the source's own namespace
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |on the episode doc; Layer 0 ships projection + request-plan + shikimori cast — NOT
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |the episode-title writer (moved to 1.2), and no UI info blocks (Layers 2–3).
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |--------------------------------------------------------------------------------
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |# Mellifera — UI Improvement Proposal (DRAFT)
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |Status: draft for review · 2026-10-21 · builds on: display-naming, ui-management,
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |plugin-admin-surfaces, plugin-title-enrichment + the 2026-10-21 session
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |(item-page ⋯ menu, Rename series, plugins status colors, About panel).
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |HTML mockups (open alongside, same dir):
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  mockup-identify.html      — Layer 1 (the 3-step Identify flow)
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  mockup-posters.html       — Layer 2 (poster grid + episode-flow header)
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  mockup-poster-change.html — Layer 2.3 (the poster-change overlay)
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  mockup-player.html        — Layer 3 (watch view, skip chip, auto-next, keyboard)
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  mockup-search.html        — Layer 5 (⌘K palette)
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |Conventions every layer obeys (locked):
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |- Single binary, embedded SPA; the SPA never re-derives names, never resolves
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  gates, never holds media-type/plugin literals — everything field-driven from
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  served wire shapes.
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |- Overlay edits (never inline forms on browse surfaces), menu hidden by default,
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  color = state (green ok / red fail / gray off), soft pastel, no pills/paths on
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  user screens (paths stay on the element page's mono line + admin surfaces).
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |--------------------------------------------------------------------------------
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |## Layer 0 — Общая конвенция медиаданных (все источники, не только shikimori)
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |Shikimori — один из источников. Актёры/роли, описания серий и остальные
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |«человекочитаемые» данные должны приезжать по ЕДИНОЙ конвенции полей, которую
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |соблюдает любой metadata_source — как сегодня identity_fields/display_fields
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |уже являются конвенцией модуля. UI читает поля, никогда не источники.
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |Поля конвенции (пишутся в sources.<plugin_id>, имена одинаковы для всех):
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  Уровень сериала/фильма (de-facto уже пишет shikimori — повышаем до стандарта):
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |    title{romaji?,russian?} · description · genres[] · score · kind · status ·
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |    episodes · aired_on · poster · url
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  Новые общие поля:
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |    cast[]{ name, role?, photo_url? }      — люди: актёр/сейю/персонаж;
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |                                             role — свободный текст («Акари»,
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |                                             «Ковбой Бибоп — главная роль»)
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |    на ДОКУМЕНТЕ эпизода:
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |    title                                  — название серии (1.2)
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |    description                            — краткое описание серии
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |Правила:
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |- Слияние — по группам с целостностью (как уже работает About): группа
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  («В ролях», «Серия», synopsis) берётся ЦЕЛИКОМ из первого namespace, где
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  она есть; никогда не склеивается из разных источников. Порядок — chain
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  модуля (та же машина приоритетов, что у title_sources).
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |- Провенанс: _provenance по field_path уже печатает источник каждого поля —
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  футер показывает, кто что написал.
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |- Источник не даёт поле → поля нет; UI-блок исчезает. Никогда не фальшивим.
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |Первые исполнители конвенции: shikimori (+ /characters → cast[], episode
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |titles/описаний нет upstream — честно), TMDB (B3: cast, episode overviews,
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |poster — с первого дня по конвенции). Любой будущий источник (Kinopoisk,
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |TVDB…) подключается без единой правки UI.
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |--------------------------------------------------------------------------------
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |## Layer 1 — Fix the match (Identify, the Plex flow)
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |Mockup: mockup-identify.html (all three steps, states, wire notes).
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |Pain: shikimori matched the Aria directory to a 1998 OVA ("Проснись, Ария!",
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |empty description). Refresh re-fetches by the STORED id, so a wrong match is
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |permanent today. Rename fixed the display name — not the metadata.
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |### 1.1 Identify overlay with match picking
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |Entry: ⋯ → "Identify…" (already on item page + cards). The view grows a search
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |step before the parser-attachment list.
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |Step 1 — search (pre-filled from the current name):
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  ┌ Identify ──────────────────────────────── Esc ┐
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │                                                │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │  Search                                        │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │  ┌──────────────────────────────────────────┐ │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │  │ Aria                                      │ │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │  └──────────────────────────────────────────┘ │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │                                                │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │  [ Search ]                                    │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │                                                │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │  Current match                                 │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │  ● Проснись, Ария! · OVA · 1998 · ★4.65       │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │    (this is what the library shows now)        │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  └────────────────────────────────────────────────┘
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |Step 2 — candidates (served by the source, ranked by the plugin):
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  ┌ Identify — 5 matches ────────────────────── Esc ┐
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │                                                  │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │  ┌────┐ Aria                                    │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │  │ 🖼 │ The Animation · TV · 2005 · 13 ep · ★4.6 │ ← current dir season
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │  └────┘ [ Use this match ]                       │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │                                                  │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │  ┌────┐ Aria                                    │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │  │ 🖼 │ The Natural · TV · 2006 · 26 ep · ★4.5   │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │  └────┘ [ Use this match ]                       │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │                                                  │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │  ┌────┐ Aria the Origination …                   │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │  └────┘ [ Use this match ]                       │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │  …                                              │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  └──────────────────────────────────────────────────┘
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |Step 3 — confirm (what will happen, said plainly):
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  ┌ Identify ──────────────────────────────────────┐
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │                                                  │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │  Aria — The Animation (2005)                    │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │  Replaces the current match (Проснись, Ария!).  │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │  Description, genres and facts re-pull from the │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │  source; your display name stays "Aria".        │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │                                                  │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │  [ Replace match ]   [ Back ]                    │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  └──────────────────────────────────────────────────┘
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |States: searching (quiet line, no spinner), no results ("Ничего не нашлось —
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |try the original title or the source id"), source down (canonical error inline,
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |retry:0 — the plugins-page idiom).
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |Wire (new, additive):
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |- GET  /api/v1/admin/sources/{id}/search?query=…&kind=…  → candidates[]
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  {external_id, title, russian_title?, year, kind, episodes, poster?}
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  (api → plugin metadata_source Search passthrough; shikimori already has the
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  bounded /animes?search= call internally — expose it as a capability method).
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |- PUT  /api/v1/series/{id}/identify  {source_id, external_id}
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  → stores the identifier override + queues a refresh for that row; the next
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |    refresh fetches BY ID (the by-id template already exists in the plugin).
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |- Same PUT on /items/{id}/identify for films (tv module, post-TMDB).
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |Scoring stays in the plugin (the SPA renders served order verbatim).
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |### 1.2 Episode titles
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |shikimori /animes/{id}/episodes carries ru/en titles per episode. On refresh,
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |write `title` into each episode doc (serial-parser namespace or the source
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |namespace — decision at spec time). Effect: the "title — not identified" slot
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |disappears for anime; episode cards show "Название серии" instead of bare
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |S01E02. No UI work — the surfaces already render the title when present.
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |--------------------------------------------------------------------------------
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |## Layer 2 — Poster art (data already on disk)
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |Mockup: mockup-posters.html (poster grid card + episode-flow header + fallback note).
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |shikimori stores poster URLs today (sources.shikimori.poster); nothing renders
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |them. Serve images THROUGH the binary so clients never hotlink:
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |- GET /api/v1/art/{kind}/{id}?source=… — fetch-once + disk cache under the
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  data dir (janitor-friendly), ETag revalidation. Auth like /media.
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |Layouts:
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |Series grid card (poster-forward, title under):
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  ┌──────────┐
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │          │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │  poster  │   2:3, rounded-lg, border
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │          │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │          │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  ├──────────┤
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │ Aria     │   served display_name, truncate
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │ 2005 · ★ │   fact line (year · score), muted
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  └──────────┘
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |Episode-flow header (poster beside the About panel):
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  ← All series
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  ┌──────┐ Aria
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │ 🖼    │ About
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │ 🖼    │ Действие разворачивается на Аквамarine…  
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  └──────┘ [Фэнтези] [Повседневность]  ★4.6 · tv · 13 ep · 2005
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  ── episodes ───────────────────────────────────────
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |Item page: poster as the identity column's lead image when present
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |(frame-grab thumbnail stays the fallback — already wired via hasFrameGrabberThumb).
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |No poster anywhere → current text-first cards (honest, no placeholder icons).
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |### 2.3 Смена постера — the poster overlay (mockup: mockup-poster-change.html)
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |Entry: ⋯ → «Постер…» on a series or film. One overlay, three sources of
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |candidates:
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  ┌ Постер — Aria ─────────────────────────── Esc ┐
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │ [shikimori] [tmdb] [своё · 2026-10-18] [tvdb] │  ← one card per
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │   Текущий   Сделать…  Сделать…       Сделать…  │    namespace that
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │                                                  │    carries the
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐     │    Layer 0 poster
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │  ┊ Перетащите изображение или выберите файл ┊     │    field + the
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘     │    user upload
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │  Сбросить к источнику                            │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  └──────────────────────────────────────────────────┘
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |- Candidates: the poster field of EVERY source namespace (convention Layer 0 —
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  shikimori, TMDB, any future source render side by side, never hardcoded)
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  plus the previously uploaded user image. Selection = color change (locked
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  idiom), the current one reads «Текущий».
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |- Drop zone: drag-drop or file picker, JPG/PNG/WebP ≤ 8 MB, cropped 2:3
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  server-side; stored in the art store (the Layer 2 cache — janitor-friendly,
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  single binary).
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |- «Сбросить к источнику» returns to the chain value.
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |- States: single source → one candidate + drop zone; no posters at all →
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  drop zone only with the honest hint; upload in flight → quiet line; wrong
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  type/size → inline error, overlay stays open.
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |Wire (additive, symmetric to the title overrides):
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  GET    /api/v1/series/{id}/posters → candidates[] {source: plugin_id|"user", url}
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  PUT    /api/v1/series/{id}/poster  {source}          — choose a candidate
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  POST   /api/v1/series/{id}/poster  (multipart)       — upload user image
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  DELETE /api/v1/series/{id}/poster                    — reset to chain
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  (same family on /items/{id}/poster for films)
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |Display precedence: user poster-override → first poster by chain → no art
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |(mirrors title_override > composed > floor).
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |--------------------------------------------------------------------------------
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |## Layer 3 — Watch-flow polish (pure SPA)
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |Mockup: mockup-player.html (the watch view — player + info column, skip chip,
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |auto-next card, keyboard legend).
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |3.1 Инфо-колонка просмотра — the watch view becomes player left, info right
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |    (the item page's identity column grows into it). ALL blocks read the
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |    Layer 0 convention — whichever plugin provides the data renders:
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |      - episode heading: SxxEyy eyebrow + the EPISODE title (1.2, convention
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |        field `title` on the episode doc);
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |      - «Серия» block: the episode's short summary — convention field
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |        `description` on the episode doc, from ANY source that provides it
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |        (TMDB episode overviews do; shikimori upstream has none — stated
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |        honestly). No field → no block;
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |      - «В ролях» row: convention field `cast[]` {name, role?, photo_url?}
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |        from any source (shikimori /characters as characters is a candidate
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |        first provider — a plugin slice; TMDB cast arrives with B3). Absent
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |        data → row absent;
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |      - «Об сериале»: the already-shipped series About panel (synopsis,
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |        genres, facts) as the standing context.
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |    Field-driven as everywhere: the column renders what namespaces carry,
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |    never fabricates, never hard-codes a source.
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |3.2 Skip intro/credits — the player already parses sections (the Intro /
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |Episode / Credits buttons render today). During playback inside an intro or
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |credits section:
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  ┌────────────────────────────────────┐
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │            (video)                 │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │                    [ Пропустить ↪ ]│ ← soft chip bottom-right,
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  └────────────────────────────────────┘   appears only inside a skip range,
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |                                            fade after 4s, returns on seek
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |Copy: «Пропустить вступление» / «Пропустить титры» (concrete, action-first).
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |3.3 Auto-next — on ended (episodes only):
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  ┌────────────────────────────────────┐
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │  Следующая серия                    │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │  Aria · S01E03 · Название           │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │  [ Смотреть ]   [ Отмена ]          │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  └────────────────────────────────────┘
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  Countdown 10s → autoplay; cancel persists per session. Next-episode pick
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  uses the existing pure next-up core (Home), per handoff order.
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |3.4 Keyboard: Space play/pause · ←/→ ±10s · ↑/↓ volume · F fullscreen ·
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |N/P next/prev item · 0-9 seek percent. Legend row under the player on desktop,
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |hidden on touch.
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |--------------------------------------------------------------------------------
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |## Layer 4 — Films get a face (B3: TMDB)
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |TMDB metadata_source plugin (deferred B3) gives films: description, poster,
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |year, cast — ALL written per the Layer 0 convention (cast[], description,
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |episode overviews), so UI cost ≈ zero: the About panel and the watch view's
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |info column are field-driven; cast renders as a new fact row once a namespace
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |provides it, from TMDB or any other conforming source:
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  About
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  Криминальная драма о воре, который…) 
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  [Драма] [Криминал]
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  ★8.9 · film · 1994 · Кевин Спейси, Гэбриел Бирн
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |Identify (1.1) covers films the moment the source exists (items id space).
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |AuthContext for the TMDB key + per-library source toggles: existing Sources
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |admin page, no new surface.
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |--------------------------------------------------------------------------------
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |## Layer 5 — Browse scale (when libraries grow)
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |Mockup: mockup-search.html (the ⌘K palette; the same design language covers 5.2 facets and 5.3 home rows).
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |5.1 Global search — ⌘K palette, title walk server-side:
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  ┌ Поиск ──────────────────────────────── Esc ┐
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │ aria                                       │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │ ── Сериалы ──────────────────────────────  │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │ Aria                  Аниме · 2005 · ★4.6  │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │ Aria the Natural      Аниме · 2006         │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │ ── Серии ────────────────────────────────  │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  │ Aria · S01E02 «Название»       Библиотека  │
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  └────────────────────────────────────────────┘
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  GET /api/v1/search?q=… → {series[], items[]} (store LIKE on served names).
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |5.2 Facets — genre/kind/status chips above grids, driven by the scraped
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |namespaces (facets computed server-side per library, served as a list; the SPA
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |renders served values, never derives).
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |5.3 Home: per-series Continue-watching rows with progress bars (progress data
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |exists; the Next-up core is pure and tested).
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |--------------------------------------------------------------------------------
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |## Sequencing
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  Layer 0    Media-data convention (contract)  ← spec'd first; everything reads it
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  Layer 1.1  Identify + match override         ← correctness first (wrong data poisons everything)
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  Layer 1.2  Episode titles              ← rides the same refresh
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  Layer 2    Art proxy + posters         ← biggest visual win, cheap
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  Layer 3    Player polish               ← pure SPA, no backend
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  Layer 4    TMDB (B3)                   ← opens films
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  Layer 5    Search / facets / home      ← last, when libraries justify it
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |Each layer = one additive openspec change (SPA slice + api/enrich slice +
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |plugin slice as needed), ≤8 exported symbols per package, table-driven tests
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |per new symbol, Go gate stays node-free, dist rebuilt per change.
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |## Open decisions to settle at spec time
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |- Poster upload (2.3): the api layer takes its first multipart body — settle
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  the size/format guard placement (api vs art store) and whether uploaded
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  images re-crop on the fly or once at upload time.
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |- The Layer 0 cast[] shape: flat {name, role?, photo_url?} vs split
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  characters[]/actors[] (shikimori has characters+seiyuu PAIRS upstream —
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  one entry per character with its voice actor as role may read better for
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  anime than two separate lists; TMDB has actor→character pairs — same shape).
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  Decide once, all plugins follow.
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |- Identify override storage: series doc identifiers tier vs a side table
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  (deprecate-don't-delete applies to the current id flow either way).
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |- Episode titles namespace: serial-parser (parse facts) vs shikimori
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  (source facts) — affects footer grouping and provenance.
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |- Art cache lifetime + janitor ownership (ties into the deferred janitor).
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |- Auto-next countdown default (10s) and whether it respects a per-user flag
| 0 — media-data convention | `media-data-convention` | done (archived 2026-10-22) |  once RoleClient lands.
