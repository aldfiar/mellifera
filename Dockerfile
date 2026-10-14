# Mellifera — single-binary media server + subprocess plugins.
#
# Multi-stage build:
#   1. web    — build the React SPA (Vite emits into internal/web/dist,
#               the //go:embed target). The OpenAPI spec is NOT regenerated
#               here: internal/web/api/openapi.{json,yaml} are committed
#               artifacts, same as the Go build gate embeds (INV-node-free-gate
#               does not apply to the image — only `npm` runs, never `swag`).
#   2. build  — compile the server + all seven plugin binaries (pure Go,
#               CGO_ENABLED=0, single static binaries).
#   3. runtime — debian:13-slim + the runtime deps (ffmpeg/ffprobe, exiftool,
#               ca-certificates for the shikimori upstream). All soft-fail at
#               serve time, but included so the image is fully capable.
#
# Run:
#   docker build -t mellifera .
#   docker run -d --name mellifera -p 8080:8080 \
#     -v mellifera-data:/app/data \
#     -v /path/to/media:/media:ro \
#     -e MELLIFERA_ADMIN_TOKEN=change-me \
#     mellifera
# Then add a library pointing at the CONTAINER-side path (/media/...).
# MELLIFERA_LISTEN defaults to 0.0.0.0:8080 inside the image (see ENV below).

# --- Stage 1: SPA build (node) -------------------------------------------------
FROM node:24-alpine AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
# vite.config.ts sets build.outDir = ../internal/web/dist (emptyOutDir),
# so this emits the hashed SPA bundle to /src/internal/web/dist.
RUN npm run build

# --- Stage 2: Go build (server + plugins) --------------------------------------
FROM golang:1.25 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd/ cmd/
COPY internal/ internal/
COPY pkg/ pkg/
COPY plugins/ plugins/
COPY proto/ proto/
# the go:embed target — freshly built SPA, replaces the committed dist bytes
COPY --from=web /src/internal/web/dist internal/web/dist
RUN CGO_ENABLED=0 go build -trimpath -o out/mellifera ./cmd/mellifera \
 && CGO_ENABLED=0 go build -trimpath -o out/base-scanner ./plugins/base-scanner \
 && CGO_ENABLED=0 go build -trimpath -o out/serial-scanner ./plugins/serial-scanner \
 && CGO_ENABLED=0 go build -trimpath -o out/tv-parser ./plugins/tv-parser \
 && CGO_ENABLED=0 go build -trimpath -o out/image-enricher ./plugins/image-enricher \
 && CGO_ENABLED=0 go build -trimpath -o out/serial-parser ./plugins/serial-parser \
 && CGO_ENABLED=0 go build -trimpath -o out/frame-grabber ./plugins/frame-grabber \
 && CGO_ENABLED=0 go build -trimpath -o out/shikimori ./plugins/shikimori

# --- Stage 3: runtime -----------------------------------------------------------
FROM debian:13-slim
# ffmpeg/ffprobe: base-scanner video probe, frame-grabber thumbnails, the
# packaged-playback remux lane. exiftool: image-enricher EXIF (Debian package
# libimage-exiftool-perl). ca-certificates: shikimori.io HTTPS fetches.
# All external tools are invoked via os/exec with an explicit argument slice.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg exiftool ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /src/out/mellifera ./mellifera
# plugin subprocesses at the default bin/ paths (MELLIFERA_*_ overrides exist)
COPY --from=build /src/out/ ./bin/

# server state: SQLite DB, thumbnails, packaged-playback artifacts
VOLUME ["/app/data"]
# the server binds 127.0.0.1 by default (dev posture); containers need the
# loop-free bind or the published port never opens
ENV MELLIFERA_LISTEN=0.0.0.0:8080
EXPOSE 8080

# MELLIFERA_ADMIN_TOKEN is the only fail-fast env var — set it at run time.
ENTRYPOINT ["./mellifera"]
