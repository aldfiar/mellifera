# Design: continue-nextup-media

## D-1 The stop frame overwrites the same file; no document write

The thumb fact's VALUE is a deterministic path
(`thumbs/<sha16(series|rel)>/<sha16(rel)>.jpg`), so a re-grab can simply
overwrite the bytes and leave the document untouched. This dodges: a third
document writer beside scan/enrich (namespace discipline), _provenance
churn, and enrich-queue round-trips for an event the queue cannot see (a
playback position). Cost: `grabbed_at` goes stale on re-grab — accepted
(the alternative reopens the document for a cosmetic stamp).

## D-2 OnProgress is an api Deps closure, not a store hook

putProgress stays pure delegation: parse → store.PutProgress →
Deps.OnProgress (nil-safe, mirrors Deps.Scan/Status/Play) → write. The
api package never imports plugin/enrich (INV2). cmd owns the executor:
`context.WithoutCancel` (the request ctx dies with the response; ffmpeg
outlives it) + 60s timeout, one goroutine per accepted re-grab.

## D-3 Debounce = position delta, per item, in the executor

The Player PUTs every PROGRESS_DRIFT_SECONDS of playhead drift (a few
seconds), plus pause/ended/unmount flushes. The executor keeps
`map[itemID]lastGrabbedPos` (+mutex) and accepts a re-grab only when
|newPos − lastPos| ≥ 60s. The final stop position always arrives via an
edge flush; a stop within 60s of the previous grab is visually the same
frame. Map growth is bounded by the number of distinct played items —
dev-scale fine; a real LRU is deferred.

## D-4 Match+Convert direct from cmd, seek override in the query

The executor resolves the loaded plugin via `plugin.Manager.MetadataSource`
("frame-grabber", "default"), calls Match with the STORED document (Match
rebuilds the query from parsed facts — absolute/relative/series paths,
probe duration), injects `seek_seconds` into the returned query fields,
and calls Convert. The plugin is the single ffmpeg exec site for grabs;
the core never grows one. `seek_seconds` is clamped by probe duration
inside Convert (same guard as the default seek), so a bogus position
cannot seek past EOF.

## D-5 Enrich-time default seek: min(300s, 50% duration)

"About 5 first minutes" for anything ≥10 min; shorter files still get a
frame (half their duration, never the tail). Previously min(60s, 10%).
Existing episodes keep their 60s stills until first play (D-1 overwrite)
— accepted dev-stage residue, no mass migration.

## D-6 Cache: per-variant Cache-Control

`variant=thumb` → `private, no-cache` (strong size+mtime ETag makes
revalidation a 304 when unchanged); original/sidecar stay
`private, immutable` (write-once). The SPA's `useItemMedia` fetches on
mount, so a Home visit after playback picks the fresh bytes up naturally;
no client invalidation hook needed.

## D-7 tv seed v2: guarded UPDATE after INSERT OR IGNORE

`INSERT OR IGNORE` never rewrites an existing row, so the frame-grabber
binding for films ships as schema_version 2 + `UPDATE modules SET … WHERE
id='tv' AND schema_version < 2` (idempotent; re-runs no-op). Priority 4
keeps the seeded kinopoisk(2)/tmdb(3) numbering stable. The enrich
derivation is chain-driven: existing film items pick the new binding on
the next drain without a rescan.

## D-8 Next up keys on series records, not episode titles

`episodeFacts`'s `title` requirement predates serials-library: serial
episodes have no title fact, so the old derivation derived nothing. The
rework: progress items → (library, `parsed.series_relative_path`) →
series row (from `useSeries`, shared cache) → started tuple =
max(season, episode) across the series' progress items → next episode =
min (season, episode) strictly greater, from `useSeriesEpisodes(seriesId)`
(one cached fetch per started series). tv-module items (films) never
enter Next up — it is an episode concept; films surface via Continue.
Continue names: serial episodes render `<seriesTitle> · S01E05`
(seriesTitle precedence: title_override → serial-parser title →
dir_name_raw → last path segment, mirroring the collection page);
non-serial keeps `viewTitle`.
