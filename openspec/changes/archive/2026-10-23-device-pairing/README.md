# device-pairing

Pair a TV device to mellifera without pasting the admin token: the device requests a short single-use pairing code, the admin approves it from the web UI, and the device receives a scoped playback-only token (RoleClient). Tokens are revocable; codes are short-TTL and rate-limited.
