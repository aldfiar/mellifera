# Operator Runbook — Image Enrichment (Phase B2)

> Image support adds **one runtime dependency**: `exiftool`. It is invoked by the
> `image-enricher` plugin subprocess via `os/exec` (arg-slice, never a shell) — the
> same posture as `ffmpeg`/`ffprobe`. It is **NOT** a Go module dependency and **NOT**
> required to build Mellifera. Grounded in `plugins/image-enricher/{exiftool,main,
> enricher}.go`, `plugins/base-scanner/image.go`, and `cmd/mellifera/main.go`.
>
> Audience: operator (install/config/deploy) + developer (runtime-dep posture).

## 1. The dependency: `exiftool`

`exiftool` reads EXIF from images. The `image-enricher` plugin runs it per image at
enrichment time:

```
exiftool -j -n -ImageWidth -ImageHeight -FileType -Make -Model \
  -DateTimeOriginal -Orientation -GPSLatitude -GPSLongitude <absPath>
```

- `-j` → JSON output; `-n` → numeric values (GPS as decimals, Orientation as a number,
  dates in EXIF machine form). Tags are explicitly selected to bound output (no
  megabytes of makernotes). Source: `plugins/image-enricher/exiftool.go` (`exiftoolTags`).
- The plugin calls `exec.LookPath("exiftool")` on **every** `Convert` and the command
  is built as an explicit argument slice (`exec.CommandContext(ctx, "exiftool", args…)`)
  — the absolute path is **one argument**, never a concatenated shell string. Source:
  `plugins/image-enricher/exiftool.go` (`runExiftool`); mirrors `plugins/base-scanner/ffprobe.go`.
- Per-file deadline: **30s** (`exiftoolTimeout`).

### Install

| Platform | Command |
|---|---|
| macOS | `brew install exiftool` |
| Debian / Ubuntu | `apt install libimage-exiftool-perl` |
| Fedora / RHEL | `dnf install perl-Image-ExifTool` |
| Arch | `pacman -S perl-image-exiftool` |

Verify: `exiftool -ver` prints a version. The plugin does not pin a minimum version;
any modern release works (the golden e2e was recon-verified against exiftool 13.55).

## 2. Failure mode: `exiftool` missing → SOFT-FAIL (scan always succeeds)

A missing/failing exiftool **never** aborts a scan or a startup. Every exiftool failure
(`LookPath` miss / non-zero exit / 30s timeout / non-JSON / empty result) is a
**per-source SOFT-FAIL** (`plugins/image-enricher/exiftool.go`):

- the source yields an **empty** `image-enricher` namespace + a human-readable warning;
- that empty namespace flows into the B1 queue's **`no_data` terminal** → 30-day
  cooldown (`MELLIFERA_ENRICH_NODATA_COOL`, default 30d) → the item **settles**.

So **without exiftool installed**:

- `POST /scan` still returns **200**;
- image items are still **discovered and persisted** with their stdlib base dimensions
  for **jpeg/png** (see §4 — discovery does not use exiftool);
- `GET /items` lists them; they simply carry no EXIF provenance (`sources.image-enricher`
  absent) and settle via the cooldown path.

This is intentional and matches `ffmpeg`/`ffprobe` for video: install the binary to get
rich metadata; omit it and the library still works, just leaner.

> Note: the plugin is still **mandatory at startup** (`cmd/mellifera/main.go` loads +
> starts `image-enricher` via `fatalOn`). What is optional is the `exiftool` *binary on
> PATH*, not the plugin process. A missing `bin/image-enricher` (the plugin binary) IS a
> startup failure — build it with `make build-plugin` (see §3).

## 3. The `image-enricher` plugin binary

| | |
|---|---|
| Env var | `MELLIFERA_IMAGE_ENRICHER` |
| Default | `bin/image-enricher` |
| Build | `make build-plugin` (builds `bin/base-scanner`, `bin/tv-parser`, **and** `bin/image-enricher` — 3 plugin binaries, pure-Go `CGO_ENABLED=0`) |
| Wired in | `cmd/mellifera/main.go` (loaded + started **before** the server serves; stopped on shutdown after the enrich pool + tv-parser) |
| Capability | `metadata_source` (serves `mellifera.metadata.v1.MetadataSource`); the **second** `metadata_source` plugin after `tv-parser`. Zero new capability types. |
| Cookie pair | `MELLIFERA_MAGIC_COOKIE` / `mellifera-plugin-v1` (matches core + siblings) |

Build all plugin binaries before starting the server:

```
make build-plugin     # produces bin/base-scanner bin/tv-parser bin/image-enricher
```

Override the path only if you place the binary elsewhere:

```
MELLIFERA_IMAGE_ENRICHER=/opt/mellifera/plugins/image-enricher ./mellifera
```

## 4. Supported formats

Discovery (`plugins/base-scanner/image.go`) is **module-type-gated**: the image extension
map is selected **only** when the library's `module_type == "image"` (a union filter is
rejected — it would discover TV cover-art jpgs as junk). The extension map:

| Extension(s) | Discovered | Stdlib base dims at discovery | Full data at enrichment (exiftool) |
|---|---|---|---|
| `.jpg` `.jpeg` | yes | **yes** (`image.DecodeConfig`) | yes |
| `.png` | yes | **yes** | yes |
| `.webp` | yes | **soft-fail** (no stdlib decoder; `golang.org/x/image/webp` is third-party — forbidden by the no-new-dep rule) | **yes** — exiftool supplies width/height/format + EXIF |
| `.heic` `.heif` | yes | **soft-fail** (no stdlib decoder) | **yes** — exiftool reads HEIC natively |
| RAW `.cr2 .nef .arw .dng` | **deferred** (not discovered) | — | exiftool reads RAW natively; adding the extensions to `imageMime` is the only change needed (held back to keep B2's set bounded) |

> Reconciled (reviewer INFO-1): `image/webp` is **not** a stdlib package in Go 1.25.
> webp is discovered and reaches `ready` with full data — the dims just come from exiftool
> at enrichment, not from stdlib at discovery. **Only jpeg/png get stdlib base dims.**

## 5. EXIF fields extracted (the `sources.image-enricher` namespace)

On a successful exiftool run, the namespace always carries `{width, height, format}` for
a decodable image (so a valid image is a clean success, not a spurious `no_data`); the
remaining fields are present only when EXIF carries them (`plugins/image-enricher/enricher.go`,
`mapExif`):

```json
{ "width": 4000, "height": 3000, "format": "jpeg",
  "make": "Apple", "model": "iPhone 15",
  "date_taken": "2024-07-30T14:21:05Z",
  "orientation": 6,
  "gps_lat": 55.7558, "gps_lon": 37.6173 }
```

- `format` is exiftool's `FileType`, lowercased.
- `date_taken` is exiftool's `DateTimeOriginal` (`-n` machine form, e.g.
  `2024:07:30 14:21:05`) normalized to **RFC3339 UTC** when parseable; an unparseable
  value is carried verbatim.
- Non-ASCII strings (e.g. a Cyrillic camera `model`) pass through untouched (exiftool
  emits UTF-8 JSON; strings are not re-encoded).
- An EXIF-less but valid image (e.g. a PNG with no EXIF) still yields `{width, height,
  format}` → clean success.

The plugin writes **only** `document.sources["image-enricher"]`. The core stamps
`_provenance`/`_view`/`_stages` authoritatively (`Merge` never touches them).

## 6. How image items flow through the pipeline (B1 async queue, unchanged)

Image items consume the **same** async queue as TV — no B1 code changed:

```
POST /scan  (module_id = image)
   │  base-scanner walks (image extensions only); probeImage gathers stdlib base info
   │  internal/scan stamps absolute_path into doc.parsed for every item
   │  items persisted  status = "pending"
   └──► HTTP 200 returns (NON-BLOCKING — scan does not wait for enrichment)

       enrich.Queue derives (item, image-enricher) work ──► worker pool drains
            image-enricher.Match  (applies: image ext / module_type==image; carries absolute_path)
            image-enricher.Convert (exiftool on absolute_path → EXIF namespace)
            image-enricher.Merge   (writes sources["image-enricher"])
            core stamps _provenance/_view/_stages
       ──► status = "enriched"  ──settled──►  status = "ready"
```

- **Non-blocking scan**: `POST /scan` returns once items are `pending`; enrichment drains
  in the background. Poll `GET /items?status=ready` until settled.
- **`absolute_path` is the only file-location channel** into the enricher chain
  (`internal/scan` stamps `filepath.Join(root, relative_path)` into `doc["parsed"]` for
  all items, media-type-agnostic — the B1 chain passes an empty Merge document). The
  enricher opens the file via this path.
- **Transient EXIF failures retry** (bounded backoff); a clean-but-empty source reaches
  the `no_data` terminal + cooldown and settles.
- Env knobs are the B1 knobs (`MELLIFERA_ENRICH_WORKERS`, `_MAX_ATTEMPTS`, `_LEASE_TTL`,
  `_BACKOFF`, `_EXHAUSTED_COOL`, `_NODATA_COOL`, `_COOL_CAP`) — see
  [`docs/async-enrichment/api_reference.md`](../async-enrichment/api_reference.md).

## 7. Quick troubleshooting

| Symptom | Cause / fix |
|---|---|
| Scan 200, but image items have no EXIF (`sources.image-enricher` absent) | `exiftool` not on PATH → soft-fail (§2). Install it (`brew install exiftool` / `apt install libimage-exiftool-perl`); re-scan or wait out the 30-day `no_data` cooldown (`MELLIFERA_ENRICH_NODATA_COOL`). |
| Server won't start: "load image-enricher" / binary not found | `bin/image-enricher` missing — run `make build-plugin`, or point `MELLIFERA_IMAGE_ENRICHER` at the binary. |
| webp/heic discovered but no base dims before enrichment | Expected (§4) — stdlib has no decoder; exiftool supplies dims at enrichment. |
| Cyrillic/Unicode filename or camera model garbled | Not a known issue — strings pass through verbatim (UTF-8). File a bug if observed. |

## References

- Plan / contracts / acceptance: `docs/image-enrichment/{implementation_plan,contracts,acceptance}.md`
- Reviewer (PROCEED) + health-check (HEALTHY): `docs/image-enrichment/{reviews,audit}/`
- Module map (authoritative): `docs/ai-architecture.md` §4; build skill: `.claude/skills/mellifera-build/SKILL.md`
- Runtime-deps decision: `docs/open-questions.md` (Q6 ffprobe pattern; Q29 / D21 exiftool)
- Async queue runbook: [`docs/async-enrichment/api_reference.md`](../async-enrichment/api_reference.md)
