# Proposal

## Why

2026-10-31 10:01 (after the F2–F4 fixes shipped at 02:12): TV playback died
with the SPA's fatal banner — the request log shows the playlist
`index.m3u8` answered 200 for `okhttp/4.12.0` (the TV's native HTTP stack)
while every `init.mp4` / `seg-*.m4s` answered 401 from the YaBrowser webview
UA, retrying in a loop. The client splits HLS fetching across two HTTP
stacks and *neither* attaches the `media_token` cookie; desktop browsers do,
which is the only reason the cookie-primary design worked anywhere. This is
postmortem F6 ("correctness silently depends on the browser cookie jar")
becoming a field failure.

## What Changes

- `internal/stream`: new unexported `tokenizePlaylist(body, token)` — every
  URI a playlist references (plain URI lines: segments, rendition playlists;
  `URI="..."` attributes on tag lines: `EXT-X-MAP` inits, `EXT-X-MEDIA`
  renditions) gains the requesting token as a `token=` query parameter.
  Absolute URIs and URIs already carrying `token=` are untouched
  (idempotent); CRLF endings preserved; empty token is a byte passthrough.
- `serveArtifact` passes the already-verified request token down and, for
  `.m3u8` responses only, serves the rewritten body (still `no-cache`).
  Segments/init segments/original serve verbatim as before — the gate is
  unchanged, only its credential now travels inside the playlist too.
- Published artifact bytes on disk are untouched (a build outlives any one
  4 h token; the rewrite is per-request).

## Impact

- `internal/stream` (serve path + tests), `internal/itest` roundtrip pins
  the new property end-to-end. No exported symbols added (4/8 budget
  unchanged), no API shape change, no SPA change — `play_url` keeps its
  token query; hls.js resolves relative-with-query URIs natively.
- Spec: ADDED requirement "Self-authorizing playlists" on packaged-playback.
- Docs: postmortem F6 marked shipped.
