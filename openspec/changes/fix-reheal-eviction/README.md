# fix-reheal-eviction

Lazy re-heal is not playback-aware: evict-on-publish deletes the superseded nonce directory under active players (404 fatal mid-session); play-during-heal serves the known-stale v1 pack
