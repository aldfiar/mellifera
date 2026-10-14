# Shadow e2e evidence — box 6.2 (unprobeable, confirmed by inspection + live run)

Date: 2026-10-13. One live pass against a copied datadir; the production
server on :8080 (mid-playback on an unrelated item during the run) was never
touched — verified by hash after the run.

## Setup

- `sqlite3 data/mellifera.db ".backup …"` → consistent WAL snapshot into
  `/tmp/mellifera-shadow-e2e/data/` (+ `thumbs/`, empty `streams/`).
- New binary (`cmd/mellifera` + freshly built `bin/frame-grabber` carrying the
  box-1.1 seek policy) launched on `MELLIFERA_LISTEN=127.0.0.1:8081` with its
  CWD at the shadow root and absolute `MELLIFERA_*` plugin paths. (The media
  handler opens the document-stored path relative to CWD — the deployment
  convention where one dir holds `data/` and `bin/`; the first attempt ran
  from the repo root and read the live `data/` by that rule. Read-only; no
  live bytes changed at any point.)
- Target: `itm_3_8e64597f89c07366` (ACCA - 13-ku Kansatsu-ka - 01, 345 MB mkv
  on `/media/inrat/anime`), progress 490 s, thumb
  `data/thumbs/f22a497f87638be5/8e64597f89c07366.jpg`.

## Run

| # | Step | Observed |
|---|------|----------|
| 1 | GET `?variant=thumb` | 200, `Cache-Control: private, no-cache`, ETag `61922-…`, sha256 `030e3124…` |
| 2 | GET `/media` (original, Range 0-1023) | 206, `Cache-Control: private, immutable`, `video/x-matroska` |
| 3 | GET `/progress/{id}` | `position_seconds: 490` |
| 4 | PUT `/progress/{id}` `{"position_seconds":555}` | 200; 490 + 65 ≥ the 60 s debounce |
| 5 | Poll thumb | ETag flipped after **1 s** → `147972-…` |
| 6 | sha256 of new bytes | `ee4941a1…` ≠ `030e3124…` — **bytes changed, re-grab confirmed** |
| 7 | GET `/progress/{id}` | still `555`, `updated_at` byte-identical to the PUT response — the re-grab never wrote progress |
| 8 | GET `/media` again | still 206 `private, immutable` — original untouched by the re-grab |
| 9 | PUT `{"position_seconds":560}` (+5 s creep), wait 5 s | ETag unchanged (`147972-…`); exactly one `refreshed stop frame` log line — **debounce held** |

Server log (the single re-grab):

```
2026/10/13 11:52:27 INFO thumb re-grab: refreshed stop frame item=itm_3_8e64597f89c07366 position_seconds=555
```

## Live-safety check (after the run)

`sha256(data/thumbs/f22a497f87638be5/8e64597f89c07366.jpg)` on the LIVE
datadir = `030e3124…` — the pre-run baseline. No user-session disruption.
