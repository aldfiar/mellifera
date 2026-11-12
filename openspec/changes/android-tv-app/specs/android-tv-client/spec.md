# Spec Delta

## Purpose

The native Android TV client's behavior contract: pair against the shipped device-pairing surface, browse serial content, play any floor the server hands out (hardware HEVC decode, MKV originals) with D-pad and media-key control, and stream debug telemetry only when the two-tier gate opens.

## ADDED Requirements

### Requirement: First-run server address
The app SHALL ask for the server address on first run (default scheme http://, default port 8080, an explicit https honored), persist it, and skip the entry screen while an address is stored.

#### Scenario: Stored address skips entry
- **WHEN** the app launches with a persisted server address
- **THEN** it proceeds straight to pairing/browsing and never shows the address screen

### Requirement: Pairing session
The app SHALL pair by POST /pair, display the returned code, poll the wait endpoint at its own cadence (~2s; the wait is an immediate status read with no server-side limiter) until a terminal status or the 5-minute TTL edge, and store the device token exactly once. It SHALL surface every terminal outcome honestly: denied, expired, the double-approve conflict, approved-but-no-token (server restarted between approve and pickup → re-pair path), and a second poll after pickup (consumed — no token).

#### Scenario: Fresh device pairs
- **WHEN** a fresh app enters the server address, the operator approves the shown code in the SPA, and the next poll delivers the token
- **THEN** the token is stored once and the app is logged in; a later poll in the same pairing session surfaces the consumed state rather than a second token

#### Scenario: Approved but token gone
- **WHEN** the server restarts between approval and pickup so the wait answers approved without a token
- **THEN** the app surfaces the honest state and returns to pairing; no POST /pair fires until the user acts

### Requirement: 401 returns to pairing
On 401 from any authenticated API call the app SHALL wipe the stored device token and return to the pairing screen (covers revocation and any stale credential); it SHALL NOT issue POST /pair automatically.

#### Scenario: Revoked device re-pairs
- **WHEN** the operator deletes the device in the SPA and the app's next API call 401s
- **THEN** the stored token is wiped, the pairing screen shows, and no pairing request fires until the user acts

### Requirement: Browse is serial-first and field-driven
The app SHALL list libraries filtered to serial/tv kinds, render the series grid from the served display_name/artwork/watched fields verbatim (an absent field renders an absent block, never a fabricated one), and list a series' episodes via the series-episodes route. It SHALL refresh the visible data when the player exits so progress and resume rows are current without a manual reload.

#### Scenario: Absent artwork renders absent
- **WHEN** a series row carries no artwork field
- **THEN** its grid card shows no artwork block and fabricates nothing

#### Scenario: Player exit refreshes
- **WHEN** the user backs out of the player after watching an episode
- **THEN** the series page reflects the fresh progress/watched state

### Requirement: Playback flow law
The app SHALL resolve the descriptor then play: direct answers proceed on `queued:false` (the degrade — no waiting, no re-enqueue); hls partial|complete play immediately (a partial pack is already playable); hls none|preparing plays once with retry:false then polls with a 2s→30s backoff until playable or terminal; missing/unsupported descriptors end in a terminal banner with no retry; player-level failure lands in a retry state whose chip replays {retry:true} and surfaces the descriptor's own state_reason vocabulary. Transport/5xx failures during the playback poll keep the same uncapped backoff curve; a player-level error beacons and takes the retry branch. Playback URLs are relative and resolved against the configured server address; tokens ride the query string and are never logged.

#### Scenario: MKV original degrades and plays
- **WHEN** the descriptor answers mode direct, state none, and POST play returns queued:false
- **THEN** the app launches the player on the original URL without enqueuing or waiting

#### Scenario: Preparing HLS polls to playable
- **WHEN** the descriptor answers hls/preparing and the first play returns queued:false
- **THEN** the app polls (2s doubling to 30s) until the descriptor turns partial|complete and then starts playback

#### Scenario: Unsupported ends honestly
- **WHEN** the descriptor answers unsupported
- **THEN** the app shows the terminal banner with no retry affordance

### Requirement: Progress and resume
The app SHALL PUT progress roughly every 10 seconds during playback and flush on pause and exit; a fresh session on the same item SHALL seek to the stored position before rendering frames.

#### Scenario: Resume after restart
- **WHEN** playback stopped at 12:34 and the app relaunches the same episode
- **THEN** the player seeks to the stored position before the first frame renders

### Requirement: Voiceover selection
For single-variant layouts the app SHALL map voiceover index k to player audio track k+1 (0 = embedded audio); for rendition layouts it SHALL use native track selection; a descriptor with no voiceover layout SHALL fail open with no picker.

#### Scenario: k+1 mapping on a translated stream
- **WHEN** the layout is single-variant with 2 voiceovers and the user picks the first
- **THEN** the player activates audio track index 1

#### Scenario: Absent layout fails open
- **WHEN** the descriptor carries no voiceovers/layout
- **THEN** playback starts with default audio and renders no voiceover control

### Requirement: D-pad navigation and media keys
Every screen SHALL set initial focus on entry (a screen without it is a bug); arrows move focus within and across rails, and in the player seek ±10s accelerating on hold and reveal/hide the control layer; Back restores the previous surface (dismiss controls, else pause + exit) — restoration SHALL be pinned by a test. Media keys SHALL control playback through a MediaSession, including while the app is backgrounded.

#### Scenario: Back restores browse
- **WHEN** the user presses Back on a series page reached from the grid
- **THEN** the grid returns with its prior focus position, not a restart

#### Scenario: Initial focus law
- **WHEN** any screen renders
- **THEN** exactly one element holds focus without any d-pad input

### Requirement: Telemetry two-tier gate
Dev builds SHALL stream debug telemetry unconditionally; release builds SHALL stream only while the device's profile.debug flag is set, refetching the profile on every foreground resume so an admin flip lands within one app-switch; NO emitted event SHALL contain a query string (tokens stripped client-side before send).

#### Scenario: Release stays silent until the flip
- **WHEN** a release build runs while profile.debug is unset
- **THEN** no debug event is emitted; after the admin flips the flag and the app resumes to the foreground, events stream

#### Scenario: INV4 on the wire
- **WHEN** the tracer records a playlist load event
- **THEN** the emitted body carries the path only — no query string, no token
