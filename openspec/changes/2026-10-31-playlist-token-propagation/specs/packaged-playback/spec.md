# Spec Delta

## ADDED Requirements

### Requirement: Self-authorizing playlists

The token-gated playback surface SHALL serve playlists with every URI they
reference — segment and init-segment URI lines, rendition playlist lines, and
`URI="..."` attributes on tag lines (including `EXT-X-MAP` and
`EXT-X-MEDIA`) — carrying the serving request's validated media token as a
`token` query parameter, so that playback never depends on the client
attaching the media-token cookie (clients may split HLS fetching across HTTP
stacks with no shared cookie jar). URIs that are absolute or already carry a
`token` parameter SHALL be left untouched; the rewrite SHALL be serve-time
only — the published artifact bytes on disk SHALL remain token-free — and the
token requirement on every request SHALL be unchanged (propagation removes
the cookie dependency, not the gate).

#### Scenario: A cookie-less client plays a served playlist end to end

- **WHEN** a playlist is served under a valid media token delivered as a query parameter (no cookie jar), and every URI the playlist references is then requested verbatim — resolved against the playlist's own directory, with no cookie and no other credential
- **THEN** every referenced URI serves its published bytes and playback completes without an authorization failure

#### Scenario: The gate stays for credential-less requests

- **WHEN** a segment or init segment is requested with neither the media-token cookie nor a token parameter
- **THEN** the request is rejected, exactly as before

#### Scenario: The rewrite never reaches the artifacts

- **WHEN** a playlist carrying tokenized URIs is served twice under the same token, and the build directory's playlist file is read back from disk
- **THEN** the two served bodies are identical and the on-disk file carries no token — tokenization happens per response, never in storage
