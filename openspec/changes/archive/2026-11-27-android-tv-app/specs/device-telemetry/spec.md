# Spec Delta

## Purpose

Authenticated server-side ingest of device debug diagnostics — playback traces, capability snapshots, crash reports (reserved) — where every accepted event lands as exactly one bounded structured INFO log line, so an operator can answer "what did that box actually do" without a metrics stack.

## ADDED Requirements

### Requirement: Debug events ingest
The server SHALL accept POST /api/v1/debug-events from any authenticated principal (browse group). The body's `kind` is a closed set — playback-trace, capability-snapshot, fatal, video-error, stalled (`crash` is reserved, not implemented, and is NOT an accepted value) — with per-kind required fields: playback-trace requires item_id, mode (direct|hls), phase="trace" and code; capability-snapshot requires detail carrying the snapshot payload and is not item-scoped (no item_id/mode/phase); fatal, video-error and stalled mirror the playback-events beacon shape (item_id, mode, phase, code, detail). Unknown kind or missing per-kind required fields → 400 bad_request; free-text detail truncated to the beacon bound; query strings are stripped client-side before send (INV4 — no credential or URL material in any event); a per-IP fixed-window limiter on the playback-events pattern answering 429 rate_limited with no log line; and exactly one structured INFO line per accepted event carrying the validated fields plus the user agent — never a token or play URL. The route is client-agnostic.

#### Scenario: One event, one INFO line
- **WHEN** an authenticated device posts a well-formed debug event
- **THEN** the answer is 200 and the log gains exactly one structured INFO line with the event fields and the user agent, no credential material

#### Scenario: Flood is capped silently
- **WHEN** one IP exceeds the window budget
- **THEN** further events answer 429 and log nothing

#### Scenario: Malformed vocabulary rejected
- **WHEN** the body carries an unknown kind value
- **THEN** the answer is 400 bad_request and nothing is logged

#### Scenario: Per-kind required fields enforced
- **WHEN** a playback-trace event arrives without its required item_id
- **THEN** the answer is 400 bad_request and nothing is logged
