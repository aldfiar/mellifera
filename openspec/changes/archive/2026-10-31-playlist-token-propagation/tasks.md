# tasks - playlist-token-propagation

<!-- hand-authored on the fix/playlist-token-propagation branch; wf verbs take over from here -->

## rewrite - self-authorizing playlists

- [x] 1.1 internal/stream: `tokenizePlaylist(body, token)` + `withTokenParam`/`tokenizeURIAttrs` — URI lines and `URI="..."` attrs gain `token=`; absolute/already-tokened/CRLF/empty-token floors (playlist_test table, idempotence per case)
- [x] 1.2 internal/stream: `serveArtifact` serves `.m3u8` bodies through the rewrite with the request's verified token (segments/init/original verbatim; Cache-Control unchanged)

## floors - spec floors and joint pin

- [x] 2.1 internal/stream: `TestPlaylistTokenPropagation` — query- and cookie-served playlists embed the token in every URI; a verbatim lifted segment URI serves 200 with NO cookie (the TV flow); a bare segment still 401s
- [x] 2.2 internal/itest: `TestPlaybackRoundTrip` asserts the served segment URI carries `token=` and fetches it cookie-less; `pbPlaylistURI` uses a URI's own query verbatim (no double append)

## docs

- [x] 3.1 docs/playback-postmortem-2026-10-31.md: 10:01 follow-up timeline entry + F6 marked shipped + hardening item closed
